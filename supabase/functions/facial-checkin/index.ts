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
//
// OS-401 (07/11/2026, Balé da Bruna):
//   • o CPF do ALUNO também acha o ingresso: no evento com lista de alunos a
//     família sabe o CPF da criança (foi o que digitou para comprar), e o
//     pedido fica ligado a ela em `alunos_pedidos`. Vale o mesmo cuidado do
//     comprador: só ingresso SEM titular (o que foi passado a um convidado
//     entra pelo CPF do convidado);
//   • com `mapa: true` no corpo (só o nosso totem pede), o sucesso leva o mapa
//     do lugar (`_shared/mapaDoCheckin.ts`): a poltrona, as da família e as
//     posições do mapa do evento. Sem `mapa`, a resposta é a de sempre;
//   • sessões do MESMO dia (Balé, 18h30 e 20h30): só a sessão da vez entra
//     (`_shared/sessaoDaPorta.ts`, decisão do Gabriel "Pelo horário, sozinho").
//     Fora da vez volta `fora_da_janela`, como sempre, com `sessao` e `mensagem`.
//     Evento fora de lista ou sozinho no dia: nada muda.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unformatCPF, validateCPF } from "../_shared/cpf.ts";
import { maskCpf } from "../_shared/pii.ts";
import { mapaDoCheckin } from "../_shared/mapaDoCheckin.ts";
import { fraseDaSessao, type PortaDaSessao, portasDasSessoes } from "../_shared/sessaoDaPorta.ts";
import {
  ehErroDeReembolso,
  ingressosEmReembolso,
  MENSAGEM_REEMBOLSO_EM_ANALISE,
} from "../_shared/reembolsoEmAnalise.ts";

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
// 'reembolso_em_analise' (02/10/2026): o CPF só tem ingresso com pedido de
// reembolso esperando a casa; vem com `mensagem` em português para a tela.
type Motivo = "sem_ingresso" | "ja_utilizado" | "fora_da_janela" | "reembolso_em_analise";
const semIngresso = (motivo: Motivo, extra: Record<string, unknown> = {}) =>
  json({ tem_ingresso: false, motivo, ...extra });

type TicketRow = {
  id: string;
  event_id: string;
  order_id: string;
  event_seat_id: string | null;
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
    // Duas chaves aceitas (09/09/2026): a do Marcel, de sempre, e a do NOSSO
    // totem de check-in (TOTEM_CHECKIN_KEY, opcional). Chaves separadas para
    // uma poder ser trocada ou revogada sem derrubar a outra. Sem NENHUMA
    // configurada: recusa TUDO. Nunca degradar pra endpoint aberto.
    const chaves = [Deno.env.get("MARCEL_CHECKIN_KEY"), Deno.env.get("TOTEM_CHECKIN_KEY")]
      .filter((k): k is string => Boolean(k));
    if (chaves.length === 0) {
      console.error("[FACIAL-CHECKIN] nenhuma chave de check-in configurada — recusando");
      return json({ error: "service_unavailable" }, 500);
    }
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey || !chaves.includes(apiKey)) {
      return json({ error: "unauthorized" }, 401);
    }

    // ---------- 2. Input ----------
    let body: { cpf?: unknown; event_id?: unknown; source?: unknown; mapa?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_body" }, 400);
    }

    // De onde veio o check-in, para o checkin_logs contar a história certa:
    // 'facial' (o padrão de sempre, o terminal do Marcel) ou o que o nosso
    // totem mandar ('festpag_totem_facial', 'festpag_totem_cpf'). Só letras e
    // sublinhado — quem chama tem a chave, mas log não é lugar de texto livre.
    const source = typeof body?.source === "string" && /^[a-z_]{1,32}$/.test(body.source)
      ? body.source
      : "facial";

    // OS-401: o mapa do lugar só vai para quem pede (o nosso totem).
    const querMapa = body?.mapa === true;

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
    // O dono do ingresso é o TITULAR (`tickets.holder_cpf`) quando ele está gravado: o
    // ingresso do acompanhante (OS-357) e o transferido e aceito. Sem titular, vale quem
    // comprou (`orders.customer_cpf`). Antes só se olhava quem comprou, e o ingresso
    // passado a outra pessoa queimava com o rosto de quem comprou e barrava o titular.
    // Os dois CPFs são gravados só com dígitos, então o match é exato.
    // !inner: só ingresso de pedido PAGO conta. 'valid' e 'used' vêm juntos pra
    // distinguir "nunca teve" de "já entrou".
    const SELECT_INGRESSO = "id, event_id, order_id, event_seat_id, status, holder_name, created_at, events(id,title), orders!inner(customer_cpf,status)";
    let porTitular = supabase
      .from("tickets")
      .select(SELECT_INGRESSO)
      .in("status", ["valid", "used"])
      .eq("holder_cpf", cpfDigits)
      .eq("orders.status", "paid");
    let porComprador = supabase
      .from("tickets")
      .select(SELECT_INGRESSO)
      .in("status", ["valid", "used"])
      .is("holder_cpf", null) // nenhum ingresso tem titular vazio (conferido 31/10)
      .eq("orders.customer_cpf", cpfDigits)
      .eq("orders.status", "paid");
    if (eventId) {
      porTitular = porTitular.eq("event_id", eventId);
      porComprador = porComprador.eq("event_id", eventId);
    }

    // OS-401: o CPF do aluno (lista de alunos, Balé). Os pedidos ligados à
    // criança em `alunos_pedidos`; só ingresso sem titular, como o do comprador.
    const porAluno = (async () => {
      const { data: alunos, error: e1 } = await supabase
        .from("alunos_lista")
        .select("id")
        .eq("cpf", cpfDigits)
        .is("anonimizado_em", null)
        .limit(20);
      if (e1) return { data: null, error: e1 };
      const ids = (alunos ?? []).map((a: { id: string }) => a.id);
      if (ids.length === 0) return { data: [], error: null };
      const { data: ligados, error: e2 } = await supabase
        .from("alunos_pedidos")
        .select("order_id")
        .in("aluno_id", ids)
        .limit(200);
      if (e2) return { data: null, error: e2 };
      const pedidos = Array.from(new Set((ligados ?? []).map((l: { order_id: string }) => l.order_id)));
      if (pedidos.length === 0) return { data: [], error: null };
      let q = supabase
        .from("tickets")
        .select(SELECT_INGRESSO)
        .in("status", ["valid", "used"])
        .in("order_id", pedidos)
        .is("holder_cpf", null)
        .eq("orders.status", "paid");
      if (eventId) q = q.eq("event_id", eventId);
      return await q;
    })();

    const [rTitular, rComprador, rAluno] = await Promise.all([porTitular, porComprador, porAluno]);
    const ticketsErr = rTitular.error ?? rComprador.error ?? rAluno.error;
    if (ticketsErr) {
      console.error("[FACIAL-CHECKIN] lookup error", { cpf: cpfLog, event_id: eventId, error: ticketsErr });
      return json({ error: "internal_error" }, 503);
    }

    // Junta sem repetir (o mesmo ingresso pode ter titular = comprador) e mantém a ordem
    // de antes: o mais antigo primeiro.
    const porId = new Map<string, TicketRow>();
    for (const t of [...(rTitular.data ?? []), ...(rComprador.data ?? []), ...(rAluno.data ?? [])] as unknown as TicketRow[]) {
      porId.set(t.id, t);
    }
    const tickets = Array.from(porId.values())
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
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

    // OS-401: sessões do mesmo dia: a sessão fora da vez sai do conjunto aberto.
    // Erro na leitura = janela indisponível (fail-closed, como acima).
    let portaFechada: PortaDaSessao | null = null;
    if (openEventIds.size > 0) {
      const portas = await portasDasSessoes(supabase, Array.from(openEventIds), "FACIAL-CHECKIN");
      if (portas === "erro") return json({ error: "checkin_window_unavailable" }, 503);
      for (const [evId, porta] of portas) {
        if (!porta.aberta) {
          openEventIds.delete(evId);
          portaFechada ??= porta;
        }
      }
    }

    if (openEventIds.size === 0) {
      console.log("[FACIAL-CHECKIN] fora da janela", { cpf: cpfLog, event_id: eventId });
      // Mesmo log de tentativa bloqueada que o colaborador e o parceiro gravam.
      const blocked = tickets[0];
      await supabase.from("checkin_logs").insert({
        ticket_id: blocked.id,
        event_id: blocked.event_id,
        action: "checkin_blocked_window",
        source,
      });
      return semIngresso(
        "fora_da_janela",
        portaFechada ? { sessao: portaFechada, mensagem: fraseDaSessao(portaFechada) } : {},
      );
    }

    // ---------- 5. Escolha do ingresso (o mais antigo) ----------
    // Ingresso com reembolso em análise é pulado: o banco recusa a queima dele, e
    // escolhê-lo prenderia os outros ingressos do mesmo CPF (a família que pediu
    // reembolso de um só). OS-113.
    const inWindow = tickets.filter((t) => openEventIds.has(t.event_id));
    const validTodos = inWindow.filter((t) => t.status === "valid"); // já vem por created_at asc
    const emReembolso = await ingressosEmReembolso(
      supabase,
      validTodos.map((t) => t.id),
      "FACIAL-CHECKIN",
    );
    const valid = validTodos.filter((t) => !emReembolso.has(t.id));
    if (valid.length === 0 && emReembolso.size > 0) {
      console.log("[FACIAL-CHECKIN] só ingresso em reembolso", { cpf: cpfLog, event_id: eventId });
      return semIngresso("reembolso_em_analise", { mensagem: MENSAGEM_REEMBOLSO_EM_ANALISE });
    }
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

    if (ehErroDeReembolso(updateErr)) {
      // O pedido de reembolso nasceu entre a escolha e a queima.
      console.log("[FACIAL-CHECKIN] barrado pelo reembolso", { cpf: cpfLog, ticket_id: ticket.id });
      return semIngresso("reembolso_em_analise", { mensagem: MENSAGEM_REEMBOLSO_EM_ANALISE });
    }
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
      source,
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

    // OS-401: o mapa do lugar (só para quem pediu, e só ingresso com poltrona).
    // A família: os outros ingressos deste CPF neste evento e os das mesmas
    // compras (inclusive os passados a convidados: sentam juntos). Nunca lança.
    let mapa = null;
    if (querMapa && ticket.event_seat_id) {
      const doEvento = tickets.filter((t) => t.event_id === ticket.event_id);
      const pedidos = Array.from(new Set(doEvento.map((t) => t.order_id).filter(Boolean)));
      let daCompra: { event_seat_id: string | null }[] = [];
      if (pedidos.length > 0) {
        const { data: irmaos, error: irmaosErr } = await supabase
          .from("tickets")
          .select("event_seat_id")
          .in("order_id", pedidos)
          .eq("event_id", ticket.event_id)
          .neq("status", "cancelled")
          .limit(100);
        if (irmaosErr) console.error("[FACIAL-CHECKIN] mapa: família não leu (segue sem ela)", irmaosErr);
        daCompra = irmaos ?? [];
      }
      mapa = await mapaDoCheckin(
        supabase,
        ticket.event_id,
        ticket.event_seat_id,
        [...doEvento.map((t) => t.event_seat_id), ...daCompra.map((t) => t.event_seat_id)],
        "FACIAL-CHECKIN",
      );
    }

    return json({
      tem_ingresso: true,
      ticket_id: ticket.id,
      evento: { id: ticket.event_id, nome: ticket.events?.title ?? null },
      holder_name: ticket.holder_name,
      checked_in_at: checkedInAt,
      tickets_restantes: restantes,
      ...(querMapa ? { mapa } : {}),
    });
  } catch (error) {
    console.error("[FACIAL-CHECKIN] error:", error);
    return json({ error: "internal_error" }, 500);
  }
});
