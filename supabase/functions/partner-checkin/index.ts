// Edge: partner-checkin
// API server-to-server para um sistema parceiro VALIDAR e REGISTRAR check-in de
// ingresso pelo QR (ticket_code cru). Modelo: collaborator-validate-ticket (mesma
// transição atômica valid->used).
// Nunca DELETE, nunca edição direta de status fora da transição atômica.
//
// SEGURANÇA: x-api-key (secret em env) + janela de check-in do evento DO TICKET.
// NÃO há escopo por evento — decisão de produto, paridade com a facial-checkin: o
// ticket_code já identifica o ingresso e o evento dele, e a janela é o que impede
// check-in em evento que não está acontecendo. `event_id` no body é opcional e
// serve só pra estreitar a busca.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---------- 2. Auth: x-api-key vs secret em env (fail-closed) ----------
    const secret = Deno.env.get("PARTNER_CHECKIN_SECRET");
    if (!secret) {
      // Secret não configurado no ambiente → fail-closed, não é erro do parceiro.
      return json({ error: "service_unavailable" }, 503);
    }
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey || apiKey !== secret) {
      return json({ error: "unauthorized" }, 401);
    }

    // ---------- 4. Input ----------
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_body" }, 400);
    }
    const ticket_code = body?.ticket_code;
    const dry_run = body?.dry_run === true;

    if (typeof ticket_code !== "string" || ticket_code.trim().length === 0) {
      return json({ error: "invalid_request", message: "ticket_code é obrigatório" }, 400);
    }

    // event_id é OPCIONAL: só estreita a busca. Quando vem, precisa ser UUID válido
    // (mandar lixo é erro do parceiro, não uma busca global silenciosa).
    let event_id: string | null = null;
    if (body?.event_id !== undefined && body?.event_id !== null && body?.event_id !== "") {
      if (typeof body.event_id !== "string" || !UUID_RE.test(body.event_id)) {
        return json({ error: "invalid_request", message: "event_id inválido" }, 400);
      }
      event_id = body.event_id;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---------- 5. Lookup (service-role) ----------
    const selectExpr = `*, event_lots(id,name,price), seat:event_seats(label, seat_type_name)`;

    // Match exato primeiro. Sem event_id a busca é global — o ticket_code é único
    // o bastante pra identificar o ingresso (e o limit 2 + length === 1 abaixo
    // garante que ambiguidade nunca vira check-in no ticket errado).
    let exactQuery = supabase
      .from("tickets")
      .select(selectExpr)
      .eq("ticket_code", ticket_code)
      .limit(2);
    if (event_id) exactQuery = exactQuery.eq("event_id", event_id);

    const { data: exactRows, error: exactErr } = await exactQuery;

    if (exactErr) {
      console.error("[PARTNER-CHECKIN] lookup exact error", exactErr);
      return json({ error: "internal_error" }, 503);
    }

    let ticket: any = exactRows && exactRows.length === 1 ? exactRows[0] : null;

    // Sem match exato e código >= 8 chars → busca por prefixo (ilike 'code%'), limit 2.
    if (!ticket && (!exactRows || exactRows.length === 0) && ticket_code.length >= 8) {
      const prefix = ticket_code.replace(/[%_]/g, "").toLowerCase();
      let prefixQuery = supabase
        .from("tickets")
        .select(selectExpr)
        .ilike("ticket_code", `${prefix}%`)
        .limit(2);
      if (event_id) prefixQuery = prefixQuery.eq("event_id", event_id);

      const { data: prefixRows, error: prefixErr } = await prefixQuery;
      if (prefixErr) {
        console.error("[PARTNER-CHECKIN] lookup prefix error", prefixErr);
        return json({ error: "internal_error" }, 503);
      }
      // Só aceita quando o prefixo identifica UM único ticket.
      if (prefixRows && prefixRows.length === 1) {
        ticket = prefixRows[0];
      }
    }

    if (!ticket) {
      return json({
        result: "not_found",
        checked_in: false,
        message: event_id ? "Ingresso não encontrado neste evento" : "Ingresso não encontrado",
      });
    }

    // Daqui pra frente o evento é sempre o DO TICKET — não o do body, que pode nem
    // ter vindo. É ele que manda na janela de check-in e nos logs.
    const ticketEventId: string = ticket.event_id;

    const shortCode = String(ticket.ticket_code).slice(0, 8).toUpperCase();
    const ticketType = ticket.event_lots?.name ?? null;
    const seatLabel = ticket.seat?.label ?? ticket.seat_label ?? null;
    const seatTypeName = ticket.seat?.seat_type_name ?? null;

    const ticketView = (statusOverride?: string, validatedAt?: string | null) => ({
      short_code: shortCode,
      holder_name: ticket.holder_name,
      ticket_type: ticketType,
      seat_label: seatLabel,
      seat_type_name: seatTypeName,
      status: statusOverride ?? ticket.status,
      validated_at: validatedAt !== undefined ? validatedAt : ticket.validated_at,
    });

    // ---------- 6. Janela de check-in (fail-closed) ----------
    const { data: windowRows, error: windowError } = await supabase
      .rpc("is_event_checkin_open", { _event_id: ticketEventId });
    const win = Array.isArray(windowRows) ? windowRows[0] : windowRows;
    if (windowError || !win) {
      console.error("[PARTNER-CHECKIN] checkin window unavailable", { event_id: ticketEventId, error: windowError });
      return json({ error: "checkin_window_unavailable" }, 503);
    }
    if (!win.is_open) {
      // Log da tentativa fora de janela (não bloqueia por erro de log).
      await supabase.from("checkin_logs").insert({
        ticket_id: ticket.id,
        event_id: ticketEventId,
        action: "checkin_blocked_window",
        source: "partner_api",
      });
      const message = win.reason === "before_window"
        ? "Check-in ainda não liberado para este evento."
        : win.reason === "after_window"
          ? "Janela de check-in encerrada."
          : "Check-in indisponível.";
      return json({
        result: "outside_checkin_window",
        checked_in: false,
        window: { starts_at: win.starts_at, ends_at: win.ends_at },
        message,
        ticket: ticketView(),
      });
    }

    // ---------- 7. Estados não-promovíveis ----------
    if (ticket.status === "cancelled") {
      return json({
        result: "cancelled",
        checked_in: false,
        message: "Ingresso cancelado",
        ...(dry_run ? { dry_run: true } : {}),
        ticket: ticketView(),
      });
    }
    if (ticket.status === "pending") {
      return json({
        result: "payment_pending",
        checked_in: false,
        message: "Ingresso com pagamento pendente",
        ...(dry_run ? { dry_run: true } : {}),
        ticket: ticketView(),
      });
    }

    // ---------- 8. dry_run: para aqui sem gravar ----------
    if (dry_run) {
      // Neste ponto status é 'valid' (used/outros já saíram acima ou caem no ramo
      // de promoção). Reporta o result que teria, sem efeito colateral.
      if (ticket.status === "valid") {
        return json({
          result: "valid",
          checked_in: false,
          dry_run: true,
          message: "Ingresso válido (dry-run, nada foi gravado)",
          ticket: ticketView(),
        });
      }
      if (ticket.status === "used") {
        return json({
          result: "already_used",
          checked_in: false,
          dry_run: true,
          message: "Ingresso já foi utilizado",
          ticket: ticketView(),
        });
      }
      return json({
        result: "invalid_status",
        checked_in: false,
        dry_run: true,
        message: "Status do ingresso inválido",
        ticket: ticketView(),
      });
    }

    // ---------- 9. Promoção atômica valid -> used ----------
    const validatedAt = new Date().toISOString();
    const { data: updated } = await supabase
      .from("tickets")
      .update({ status: "used", validated_at: validatedAt })
      .eq("id", ticket.id)
      .eq("status", "valid")
      .select()
      .maybeSingle();

    if (!updated) {
      // Reler o estado atual (concorrência ou já usado antes).
      const { data: fresh } = await supabase
        .from("tickets")
        .select("status, validated_at")
        .eq("id", ticket.id)
        .maybeSingle();
      if (fresh?.status === "used") {
        return json({
          result: "already_used",
          checked_in: false,
          message: "Ingresso já foi utilizado",
          ticket: ticketView("used", fresh.validated_at),
        });
      }
      if (fresh?.status === "cancelled") {
        return json({
          result: "cancelled",
          checked_in: false,
          message: "Ingresso cancelado",
          ticket: ticketView("cancelled", fresh?.validated_at ?? null),
        });
      }
      if (fresh?.status === "pending") {
        return json({
          result: "payment_pending",
          checked_in: false,
          message: "Ingresso com pagamento pendente",
          ticket: ticketView("pending", fresh?.validated_at ?? null),
        });
      }
      return json({
        result: "invalid_status",
        checked_in: false,
        message: "Status do ingresso inválido",
        ticket: ticketView(fresh?.status, fresh?.validated_at ?? null),
      });
    }

    // Sucesso — registra o log (best-effort; não reverte o check-in por erro de log).
    await supabase.from("checkin_logs").insert({
      ticket_id: ticket.id,
      event_id: ticketEventId,
      operator_id: null,
      collaborator_id: null,
      action: "checkin",
      source: "partner_api",
    });

    return json({
      result: "valid",
      checked_in: true,
      message: "Check-in realizado com sucesso",
      ticket: {
        short_code: shortCode,
        holder_name: ticket.holder_name,
        ticket_type: ticketType,
        seat_label: seatLabel,
        seat_type_name: seatTypeName,
        validated_at: validatedAt,
      },
    });
  } catch (error) {
    // 10. Falha de infra nunca vira 200.
    console.error("[PARTNER-CHECKIN] error:", error);
    return json({ error: "internal_error" }, 503);
  }
});
