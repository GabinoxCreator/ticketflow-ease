// Edge: facial-checkin
// API server-to-server que o sistema de check-in facial (Marcel) chama na portaria:
// dado um CPF reconhecido, consulta o ingresso e QUEIMA um por chamada.
//
// Modelo: collaborator-validate-ticket / partner-checkin. A queima é EXATAMENTE a
// mesma mecânica dos dois — UPDATE atômico status 'valid' -> 'used' + validated_at,
// guardado por .eq('status','valid'), e log em checkin_logs. Não existe segundo
// caminho de queima de ingresso: nunca DELETE, nunca UPDATE de status fora dessa
// transição, nunca RPC própria.
//
// Auth: verify_jwt=false (quem chama é servidor externo, sem sessão Supabase), em
// troca exige x-api-key == MARCEL_CHECKIN_KEY. Sem o secret no ambiente, recusa
// tudo (fail-closed) — endpoint de portaria jamais fica aberto.
//
// LGPD: o CPF entra no corpo mas NUNCA sai no log (ver maskCpf).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unformatCPF, validateCPF } from "../_shared/cpf.ts";
import { maskCpf } from "../_shared/pii.ts";

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

// Motivos devolvidos quando não há ingresso pra queimar (contrato com o Marcel).
type Motivo = "sem_ingresso" | "ja_utilizado" | "fora_da_janela";
const semIngresso = (motivo: Motivo, extra: Record<string, unknown> = {}) =>
  json({ tem_ingresso: false, motivo, ...extra });

type TicketRow = {
  id: string;
  event_id: string;
  status: string;
  holder_name: string;
  created_at: string;
  events: { id: string; title: string } | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    // ---------- 1. Auth: x-api-key vs secret em env (fail-closed) ----------
    const secret = Deno.env.get("MARCEL_CHECKIN_KEY");
    if (!secret) {
      // Secret não configurado: recusa TUDO. Nunca degradar pra endpoint aberto.
      console.error("[FACIAL-CHECKIN] MARCEL_CHECKIN_KEY ausente — recusando");
      return json({ error: "service_unavailable" }, 500);
    }
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey || apiKey !== secret) {
      return json({ error: "unauthorized" }, 401);
    }

    // ---------- 2. Input ----------
    let body: { cpf?: unknown; event_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_body" }, 400);
    }

    const cpfDigits = unformatCPF(typeof body?.cpf === "string" ? body.cpf : "");
    if (!validateCPF(cpfDigits)) {
      return json({ error: "invalid_request", message: "cpf inválido" }, 400);
    }
    const cpfLog = maskCpf(cpfDigits); // única forma do CPF que pode ir pro log

    const eventIdRaw = body?.event_id;
    let eventId: string | null = null;
    if (eventIdRaw !== undefined && eventIdRaw !== null && eventIdRaw !== "") {
      if (typeof eventIdRaw !== "string" || !UUID_RE.test(eventIdRaw)) {
        return json({ error: "invalid_request", message: "event_id inválido" }, 400);
      }
      eventId = eventIdRaw;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---------- 3. Ingressos do CPF ----------
    // customer_cpf é gravado só com dígitos em todos os caminhos de venda
    // (create-mercadopago-pix, process-card-payment, collaborator-reserve-order…),
    // então o match é exato — mesmo critério do _shared/event-ticket-limits.
    // !inner: só ingresso de pedido PAGO conta. 'valid' e 'used' vêm juntos pra
    // distinguir "nunca teve" de "já entrou".
    let query = supabase
      .from("tickets")
      .select("id, event_id, status, holder_name, created_at, events(id,title), orders!inner(customer_cpf,status)")
      .in("status", ["valid", "used"])
      .eq("orders.customer_cpf", cpfDigits)
      .eq("orders.status", "paid")
      .order("created_at", { ascending: true });
    if (eventId) query = query.eq("event_id", eventId);

    const { data: rows, error: ticketsErr } = await query;
    if (ticketsErr) {
      console.error("[FACIAL-CHECKIN] lookup error", { cpf: cpfLog, event_id: eventId, error: ticketsErr });
      return json({ error: "internal_error" }, 503);
    }

    const tickets = (rows ?? []) as unknown as TicketRow[];
    if (tickets.length === 0) {
      console.log("[FACIAL-CHECKIN] sem ingresso", { cpf: cpfLog, event_id: eventId });
      return semIngresso("sem_ingresso");
    }

    // ---------- 4. Janela de check-in (fail-closed) ----------
    // Com event_id: só ele. Sem event_id: os eventos em que a pessoa tem ingresso —
    // e só valem os que estão com a janela ABERTA agora (é o que define "hoje").
    const candidateEventIds = eventId
      ? [eventId]
      : Array.from(new Set(tickets.map((t) => t.event_id)));

    const openEventIds = new Set<string>();
    for (const evId of candidateEventIds) {
      const { data: windowRows, error: windowError } = await supabase
        .rpc("is_event_checkin_open", { _event_id: evId });
      const win = Array.isArray(windowRows) ? windowRows[0] : windowRows;
      if (windowError || !win) {
        // Fail-closed: janela indisponível NUNCA vira liberação silenciosa.
        console.error("[FACIAL-CHECKIN] checkin window unavailable", { event_id: evId, error: windowError });
        return json({ error: "checkin_window_unavailable" }, 503);
      }
      if (win.is_open) openEventIds.add(evId);
    }

    if (openEventIds.size === 0) {
      console.log("[FACIAL-CHECKIN] fora da janela", { cpf: cpfLog, event_id: eventId });
      // Mesmo log de tentativa bloqueada que o colaborador e o parceiro gravam.
      const blocked = tickets[0];
      await supabase.from("checkin_logs").insert({
        ticket_id: blocked.id,
        event_id: blocked.event_id,
        action: "checkin_blocked_window",
        source: "facial",
      });
      return semIngresso("fora_da_janela");
    }

    // ---------- 5. Escolha do ingresso (o mais antigo) ----------
    const inWindow = tickets.filter((t) => openEventIds.has(t.event_id));
    const valid = inWindow.filter((t) => t.status === "valid"); // já vem por created_at asc
    if (valid.length === 0) {
      const jaUsou = inWindow.some((t) => t.status === "used");
      console.log("[FACIAL-CHECKIN] sem ingresso disponível", {
        cpf: cpfLog,
        event_id: eventId,
        motivo: jaUsou ? "ja_utilizado" : "sem_ingresso",
      });
      return semIngresso(jaUsou ? "ja_utilizado" : "sem_ingresso");
    }

    const ticket = valid[0];

    // ---------- 6. Queima atômica valid -> used ----------
    // Idêntico ao collaborator-validate-ticket: o guard .eq('status','valid') é o
    // que garante uma queima só. 0 linhas = alguém marcou primeiro (portaria dupla,
    // clique repetido) -> 'ja_utilizado', nunca queima outro ingresso no lugar.
    const checkedInAt = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabase
      .from("tickets")
      .update({ status: "used", validated_at: checkedInAt })
      .eq("id", ticket.id)
      .eq("status", "valid")
      .select("id")
      .maybeSingle();

    if (updateErr) {
      console.error("[FACIAL-CHECKIN] update error", { cpf: cpfLog, ticket_id: ticket.id, error: updateErr });
      return json({ error: "internal_error" }, 503);
    }
    if (!updated) {
      console.log("[FACIAL-CHECKIN] corrida na queima", { cpf: cpfLog, ticket_id: ticket.id });
      return semIngresso("ja_utilizado");
    }

    // Log do check-in (best-effort: falha aqui não desfaz a queima já efetivada).
    const { error: logErr } = await supabase.from("checkin_logs").insert({
      ticket_id: ticket.id,
      event_id: ticket.event_id,
      action: "checkin",
      source: "facial",
    });
    if (logErr) console.error("[FACIAL-CHECKIN] checkin_logs falhou (ignorado)", logErr);

    // Restantes do MESMO CPF no MESMO evento (o que ainda dá pra queimar em novas
    // chamadas — ex.: pessoa comprou 3 ingressos e está entrando com a família).
    const restantes = valid.filter((t) => t.event_id === ticket.event_id && t.id !== ticket.id).length;

    console.log("[FACIAL-CHECKIN] check-in ok", {
      cpf: cpfLog,
      ticket_id: ticket.id,
      event_id: ticket.event_id,
      tickets_restantes: restantes,
    });

    return json({
      tem_ingresso: true,
      ticket_id: ticket.id,
      evento: { id: ticket.event_id, nome: ticket.events?.title ?? null },
      holder_name: ticket.holder_name,
      checked_in_at: checkedInAt,
      tickets_restantes: restantes,
    });
  } catch (error) {
    console.error("[FACIAL-CHECKIN] error:", error);
    return json({ error: "internal_error" }, 500);
  }
});
