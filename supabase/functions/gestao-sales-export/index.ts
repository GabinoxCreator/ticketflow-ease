// Edge: gestao-sales-export
// Ponte READ-ONLY para o sistema interno de gestão (festpag-admin-hub) montar o
// fechamento do produtor. Só faz SELECT — NUNCA escreve nada neste projeto.
//
// Gêmea da função de mesmo nome no totemst. Mesma autenticação, mesmo formato de erro,
// mesmo espírito: a gestão lê venda pura e aplica por cima as condições comerciais do
// contrato DELA. Este endpoint não tem opinião financeira própria.
//
// Autenticação: header x-service-token com o secret GESTAO_SERVICE_TOKEN, compartilhado
// só entre este projeto e a gestão. Não usa sessão de usuário — quem chama é o servidor
// da gestão, não um navegador. A checagem do token é a PRIMEIRA coisa que acontece.
//
// "Pedido pago" aqui é `orders.status = 'paid'` — neste projeto a verdade financeira mora
// em `status` (diferente do totem, onde mora em `payment_status`). Não unifiquei os dois:
// são bancos separados, com histórico próprio, e forçar um vocabulário comum quebraria
// telas que já rodam em produção dos dois lados.
//
// ⚠️ Esta função é ADITIVA: nenhum arquivo existente foi tocado para criá-la.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-service-token",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const fail = (stage: string, error: string, status: number) =>
  json({ success: false, stage, error }, status);

const round2 = (n: number) => Math.round(n * 100) / 100;

// Agrupamento por dia no horário de Brasília: uma compra das 22h é UTC do dia seguinte,
// e o relatório mostraria a venda no dia errado. Offset fixo -03:00 (sem horário de verão).
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const brtDay = (iso: string) => new Date(new Date(iso).getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);

// Como o cliente pagou.
//
// Neste projeto o método vive em DOIS campos: `payment_method` guarda o caminho
// ("card", "pix", "manual") e, quando é venda de portaria, o meio real fica em
// `manual_payment_method`. Ler só o primeiro joga toda a venda manual num balaio de
// "Outros" — foi o que aconteceu no primeiro teste: 62% do faturamento da Oktoberfest
// caiu em "Outros" só porque "card" não estava mapeado.
type Method = "pix" | "cartao" | "credito" | "debito" | "dinheiro" | "cortesia" | "outros";
function normalizeMethod(raw: unknown, manual?: unknown): Method {
  const v = String(raw ?? "").toLowerCase().trim();
  // Venda manual: o que vale é o meio informado por quem registrou na portaria.
  if (v.includes("manual")) {
    const m = String(manual ?? "").toLowerCase().trim();
    if (m.includes("pix")) return "pix";
    if (m.includes("cred")) return "credito";
    if (m.includes("deb")) return "debito";
    if (m.includes("dinheiro") || m.includes("cash") || m.includes("especie")) return "dinheiro";
    if (m.includes("cortesia") || m.includes("free")) return "cortesia";
    return "outros";
  }
  if (!v) return "outros";
  if (v.includes("pix")) return "pix";
  if (v.includes("cred")) return "credito";
  if (v.includes("deb")) return "debito";
  // "card" do Mercado Pago não distingue crédito de débito na hora do pedido.
  if (v.includes("card") || v.includes("cart")) return "cartao";
  if (v.includes("dinheiro") || v.includes("cash") || v.includes("especie") || v.includes("money")) return "dinheiro";
  if (v.includes("cortesia") || v.includes("courtesy") || v.includes("free")) return "cortesia";
  return "outros";
}
const METHOD_LABEL: Record<Method, string> = {
  pix: "PIX", cartao: "Cartão", credito: "Crédito", debito: "Débito",
  dinheiro: "Dinheiro", cortesia: "Cortesia", outros: "Outros",
};

// --- Reembolsos (OS-111) ---------------------------------------------------------------
// Consultas separadas e junção aqui, em vez de embed do PostgREST: a tabela `tickets`
// tem mais de um caminho até `orders`/`events`, e um embed ambíguo quebra calado.
const STATUS_REEMBOLSO = ["solicitado", "aprovado", "pago", "recusado", "desistido"];
const ORDEM_STATUS: Record<string, number> = { solicitado: 1, aprovado: 2 };

// deno-lint-ignore no-explicit-any
async function listarReembolsos(admin: any, status: string | null) {
  // "abertos" = o que ainda pede ação da casa: analisar ou pagar.
  let q = admin.from("reembolsos").select("*").order("solicitado_em", { ascending: true });
  if (status === "abertos") q = q.in("status", ["solicitado", "aprovado"]);
  else if (status && STATUS_REEMBOLSO.includes(status)) q = q.eq("status", status);
  const { data: reembolsos, error } = await q;
  if (error) throw new Error(`reembolsos: ${error.message}`);
  const rs = (reembolsos ?? []) as Record<string, any>[];
  if (rs.length === 0) return { reembolsos: [], generated_at: new Date().toISOString() };

  const uniq = (xs: unknown[]) => [...new Set(xs.filter(Boolean))] as string[];
  const orderIds = uniq(rs.map((r) => r.order_id));
  const eventIds = uniq(rs.map((r) => r.event_id));
  const reembolsoIds = rs.map((r) => r.id as string);

  const [ordersR, eventsR, itensR, ticketsDoPedidoR, payoutsR] = await Promise.all([
    admin.from("orders")
      .select("id, customer_name, customer_cpf, customer_email, customer_phone, payment_method, provider_transaction_id, mp_payment_id, total_amount, created_at")
      .in("id", orderIds),
    admin.from("events").select("id, title, date, time").in("id", eventIds),
    admin.from("reembolso_ingressos").select("reembolso_id, ticket_id, valor_ingresso, valor_taxa").in("reembolso_id", reembolsoIds),
    admin.from("tickets").select("id, order_id, status").in("order_id", orderIds),
    admin.from("payouts").select("event_id, net_amount, status").in("event_id", eventIds).in("status", ["paid", "requested"]),
  ]);
  for (const [nome, r] of [["orders", ordersR], ["events", eventsR], ["reembolso_ingressos", itensR], ["tickets", ticketsDoPedidoR], ["payouts", payoutsR]] as const) {
    if (r.error) throw new Error(`${nome}: ${r.error.message}`);
  }

  const itens = (itensR.data ?? []) as Record<string, any>[];
  const ticketIds = uniq(itens.map((i) => i.ticket_id));
  const { data: tickets, error: tErr } = ticketIds.length
    ? await admin.from("tickets").select("id, ticket_code, holder_name, status, lot_id, event_seat_id").in("id", ticketIds)
    : { data: [], error: null };
  if (tErr) throw new Error(`tickets: ${tErr.message}`);
  const lotIds = uniq((tickets ?? []).map((t: any) => t.lot_id));
  const seatIds = uniq((tickets ?? []).map((t: any) => t.event_seat_id));
  const [lotsR, seatsR] = await Promise.all([
    lotIds.length ? admin.from("event_lots").select("id, name").in("id", lotIds) : { data: [] },
    seatIds.length ? admin.from("event_seats").select("id, label").in("id", seatIds) : { data: [] },
  ]);

  // Saldo do produtor por evento, a mesma conta da tela do site: a base de repasse
  // menos os repasses pagos e os pedidos abertos. Negativo = o produtor já recebeu.
  const saldo = new Map<string, number>();
  await Promise.all(eventIds.map(async (eid) => {
    const { data: base, error: bErr } = await admin.rpc("base_de_repasse", { _event_id: eid });
    if (bErr) throw new Error(`base_de_repasse: ${bErr.message}`);
    const saiu = (payoutsR.data ?? []).filter((p: any) => p.event_id === eid)
      .reduce((s: number, p: any) => s + Number(p.net_amount ?? 0), 0);
    saldo.set(eid, round2(Number(base ?? 0) - saiu));
  }));

  const porId = <T extends { id: string }>(xs: T[] | null) => new Map((xs ?? []).map((x) => [x.id, x]));
  const orders = porId(ordersR.data as any[]);
  const events = porId(eventsR.data as any[]);
  const ticketMap = porId(tickets as any[]);
  const lots = porId(lotsR.data as any[]);
  const seats = porId(seatsR.data as any[]);

  const lista = rs.map((r) => {
    const o = orders.get(r.order_id) ?? {};
    const e = events.get(r.event_id) ?? {};
    const ingressos = itens.filter((i) => i.reembolso_id === r.id).map((i) => {
      const t = ticketMap.get(i.ticket_id) ?? {};
      return {
        ticket_id: i.ticket_id,
        codigo: String(t.ticket_code ?? "").slice(0, 8).toUpperCase(),
        titular: t.holder_name ?? null,
        nome: lots.get(t.lot_id)?.name ?? seats.get(t.event_seat_id)?.label ?? "Ingresso",
        status: t.status ?? null,
        valor_ingresso: Number(i.valor_ingresso ?? 0),
        valor_taxa: Number(i.valor_taxa ?? 0),
      };
    }).sort((a, b) => a.codigo.localeCompare(b.codigo));
    return {
      id: r.id, numero: r.numero, status: r.status, order_id: r.order_id, event_id: r.event_id,
      comprador: o.customer_name ?? null, comprador_cpf: o.customer_cpf ?? null,
      comprador_email: o.customer_email ?? null, comprador_telefone: o.customer_phone ?? null,
      evento: e.title ?? null, data_do_evento: e.date ?? null, hora_do_evento: e.time ?? null,
      forma: r.forma, chave_pix: r.chave_pix, tipo_chave_pix: r.tipo_chave_pix,
      payment_method: o.payment_method ?? null, provider_transaction_id: o.provider_transaction_id ?? null,
      mp_payment_id: o.mp_payment_id ?? null, total_pago: Number(o.total_amount ?? 0), comprado_em: o.created_at ?? null,
      valor_ingressos: Number(r.valor_ingressos), valor_taxa: Number(r.valor_taxa), devolve_taxa: r.devolve_taxa,
      valor_a_devolver: Number(r.valor_a_devolver), regra: r.regra, motivo: r.motivo,
      solicitado_em: r.solicitado_em, decidido_em: r.decidido_em, motivo_recusa: r.motivo_recusa,
      modo_cancelamento: r.modo_cancelamento, pago_em: r.pago_em, observacao_pagamento: r.observacao_pagamento,
      // Quem deu a baixa pela gestão (OS-112). Vazio quando a baixa foi dada no painel do site.
      pago_por_gestao: r.pago_por_gestao ?? null, baixa_no_site: r.status === "pago" && !r.pago_por_gestao,
      tem_comprovante: Boolean(r.comprovante_path),
      ingressos,
      ingressos_do_pedido: (ticketsDoPedidoR.data ?? []).filter((t: any) => t.order_id === r.order_id && t.status !== "pending").length,
      saldo_do_produtor: saldo.get(r.event_id) ?? null,
    };
  });

  // Comprovante: link temporário (10 min) para o João conferir a baixa sem conta no
  // cofre do site. Ler o arquivo não muda nada lá.
  await Promise.all(lista.map(async (l, i) => {
    const path = rs.find((r) => r.id === l.id)?.comprovante_path;
    if (!path) return;
    const { data } = await admin.storage.from("payout-proofs").createSignedUrl(path, 600);
    (lista[i] as any).comprovante_url = data?.signedUrl ?? null;
  }));

  lista.sort((a, b) =>
    (ORDEM_STATUS[a.status] ?? 3) - (ORDEM_STATUS[b.status] ?? 3) ||
    String(a.solicitado_em).localeCompare(String(b.solicitado_em)));
  return { reembolsos: lista, generated_at: new Date().toISOString() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expected = Deno.env.get("GESTAO_SERVICE_TOKEN");
  if (!expected) return fail("auth", "service_token_not_configured", 503);
  if (req.headers.get("x-service-token") !== expected) return fail("auth", "unauthorized", 401);

  try {
    const url = new URL(req.url);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Fila de reembolsos (OS-111): o financeiro da gestão vê o que o João tem para pagar.
    // Mesmos campos de `admin_reembolsos_listar`, que não serve aqui porque exige um
    // admin logado (auth.uid()) e quem chama é o servidor da gestão. Daqui só sai
    // leitura: a baixa pela gestão entra pela porta separada `gestao-reembolso-baixa` (OS-112).
    if (url.searchParams.get("list") === "reembolsos") {
      return json(await listarReembolsos(admin, url.searchParams.get("status")));
    }

    // Leads da landing (/lp), OS-151: o CRM da gestão traz quem preencheu o formulário.
    // Só leitura, como o resto desta ponte: quem decide o que vira lead lá é a gestão, e
    // nada aqui é marcado como "enviado". `since` (data ISO) é o ponto de partida; sem ele
    // vem tudo o que ainda existe (o site apaga lead com mais de 12 meses, LGPD).
    if (url.searchParams.get("list") === "landing_leads") {
      const since = url.searchParams.get("since");
      if (since && Number.isNaN(Date.parse(since))) return fail("input", "since precisa ser uma data ISO", 400);
      let q = admin
        .from("landing_leads")
        .select("id, nome, cidade, tipo_evento, telefone, created_at")
        .order("created_at", { ascending: true })
        .limit(1000);
      if (since) q = q.gte("created_at", since);
      const { data, error } = await q;
      if (error) return fail("landing_leads", error.message, 500);
      return json({ leads: data ?? [], generated_at: new Date().toISOString() });
    }

    // Catálogo: a gestão usa para casar a empresa dela com o produtor daqui.
    if (url.searchParams.get("list") === "producers") {
      const { data } = await admin
        .from("producer_profiles")
        .select("id, brand_name, legal_name, document, status, platform_fee_percent")
        .order("brand_name");
      return json({ producers: data ?? [] });
    }
    // Eventos de um produtor — para escolher qual fechar.
    if (url.searchParams.get("list") === "events") {
      const producerId = url.searchParams.get("producer_id");
      if (!producerId) return fail("input", "producer_id é obrigatório para listar eventos", 400);
      const { data } = await admin
        .from("events")
        .select("id, title, date, end_date, city, status")
        .eq("producer_profile_id", producerId)
        .order("date", { ascending: false });
      return json({ events: data ?? [] });
    }

    const producerId = url.searchParams.get("producer_id");
    const eventId = url.searchParams.get("event_id");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!eventId && !(producerId && from && to)) {
      return fail("input", "informe event_id, ou producer_id + from + to", 400);
    }

    // Quais eventos entram no recorte.
    let eventIds: string[] = [];
    let eventos: { id: string; title: string; date: string | null; city: string | null }[] = [];
    if (eventId) {
      const { data: ev } = await admin
        .from("events").select("id, title, date, city, producer_profile_id").eq("id", eventId).maybeSingle();
      if (!ev) return fail("event", "event_not_found", 404);
      eventIds = [ev.id];
      eventos = [{ id: ev.id, title: ev.title, date: ev.date, city: ev.city }];
    } else {
      const { data: evs } = await admin
        .from("events").select("id, title, date, city").eq("producer_profile_id", producerId!);
      eventos = (evs ?? []) as typeof eventos;
      eventIds = eventos.map((e) => e.id);
      if (eventIds.length === 0) return json({ producer_id: producerId, events: [], totals: { orders: 0, gross: 0 } });
    }

    // Produtor + taxa configurada (referência: a gestão manda no cálculo do contrato dela).
    const { data: produtor } = producerId || eventId
      ? await admin.from("producer_profiles")
          .select("id, brand_name, legal_name, document, platform_fee_percent")
          .eq("id", producerId ?? (await admin.from("events").select("producer_profile_id").eq("id", eventId!).maybeSingle()).data?.producer_profile_id)
          .maybeSingle()
      : { data: null };

    // Pedidos. Página de 1000 para não bater no limite padrão do PostgREST.
    type OrderRow = {
      id: string; event_id: string; created_at: string; total_amount: number | null;
      service_fee_amount: number | null; discount_amount: number | null;
      status: string | null; payment_method: string | null; manual_payment_method: string | null;
      sale_origin: string | null; customer_name: string | null; mp_payment_id: string | null;
    };
    const orders: OrderRow[] = [];
    for (let page = 0; page < 50; page++) {
      let q = admin
        .from("orders")
        .select("id, event_id, created_at, total_amount, service_fee_amount, discount_amount, status, payment_method, manual_payment_method, sale_origin, customer_name, mp_payment_id")
        .in("event_id", eventIds)
        .order("created_at", { ascending: true })
        .range(page * 1000, page * 1000 + 999);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      const { data, error } = await q;
      if (error) return fail("orders", error.message, 500);
      orders.push(...((data ?? []) as OrderRow[]));
      if (!data || data.length < 1000) break;
    }
    const pagos = orders.filter((o) => o.status === "paid");

    // Agregações.
    const byMethod = new Map<Method, { count: number; gross: number }>();
    const byDay = new Map<string, { count: number; gross: number }>();
    const byOrigin = new Map<string, { count: number; gross: number }>();
    let gross = 0, fees = 0, discounts = 0;
    // ⚠️ A DISTINÇÃO QUE MUDA O REPASSE (18/08, apontada pelo Gabriel).
    //
    // Venda MANUAL é a da portaria: o produtor recebeu o dinheiro na mão (espécie, PIX
    // dele, maquininha dele). Esse dinheiro NUNCA passou pela FestPag — então não há o
    // que repassar dele, e a taxa de conveniência normalmente nem é aplicada.
    //
    // Sem separar, o fechamento soma a venda de portaria no "líquido a repassar" e o
    // financeiro paga dinheiro que o produtor já tem no bolso. No Oktoberfest isso seriam
    // R$ 3.000 pagos a mais.
    let grossOnline = 0, grossManual = 0, ordersOnline = 0, ordersManual = 0;
    // Taxa cobrada em venda manual: quando acontece, a FestPag tem a RECEBER do produtor
    // (não a descontar do repasse — o dinheiro nunca esteve com ela).
    let feesOnManual = 0;

    for (const o of pagos) {
      const v = Number(o.total_amount ?? 0);
      const fee = Number(o.service_fee_amount ?? 0);
      const ehManual = (o.sale_origin || "online") === "manual";
      gross += v;
      fees += fee;
      discounts += Number(o.discount_amount ?? 0);
      if (ehManual) { grossManual += v; ordersManual += 1; feesOnManual += fee; }
      else { grossOnline += v; ordersOnline += 1; }

      const m = normalizeMethod(o.payment_method, o.manual_payment_method);
      const mb = byMethod.get(m) ?? { count: 0, gross: 0 };
      byMethod.set(m, { count: mb.count + 1, gross: mb.gross + v });

      const d = brtDay(o.created_at);
      const db = byDay.get(d) ?? { count: 0, gross: 0 };
      byDay.set(d, { count: db.count + 1, gross: db.gross + v });

      const org = o.sale_origin || "online";
      const ob = byOrigin.get(org) ?? { count: 0, gross: 0 };
      byOrigin.set(org, { count: ob.count + 1, gross: ob.gross + v });
    }

    // Ingressos emitidos: a contagem que o produtor confere contra a portaria.
    const { count: ingressos } = await admin
      .from("tickets").select("id", { count: "exact", head: true }).in("event_id", eventIds);

    const pct = (v: number) => (gross > 0 ? round2((v / gross) * 100) : 0);

    return json({
      producer: produtor
        ? { id: produtor.id, name: produtor.brand_name, legal_name: produtor.legal_name,
            document: produtor.document, platform_fee_percent: produtor.platform_fee_percent }
        : null,
      events: eventos,
      period: { from, to },
      totals: {
        orders: pagos.length,
        gross: round2(gross),
        // A taxa de conveniência JÁ está dentro do bruto: é o que o comprador pagou a
        // mais. Separada aqui para a gestão saber o que é do produtor e o que é nosso.
        service_fees: round2(fees),
        discounts: round2(discounts),

        // --- O que separa "faturou" de "temos para repassar" ---
        gross_online: round2(grossOnline),
        gross_manual: round2(grossManual),
        orders_online: ordersOnline,
        orders_manual: ordersManual,
        // O que a FestPag de fato custodiou: só a venda online passou pelo nosso caixa.
        custodied: round2(grossOnline),
        // O que sai para o produtor. NÃO usar `gross` aqui: somaria a venda de portaria,
        // que ele já recebeu na mão.
        net_to_transfer: round2(grossOnline - (fees - feesOnManual)),
        // Taxa cobrada sobre venda manual: a FestPag tem a receber, não a descontar.
        fees_on_manual: round2(feesOnManual),

        // Mantido por compatibilidade com quem já lia este campo. ⚠️ NÃO é base de
        // repasse — inclui a venda manual. Use `net_to_transfer`.
        net_to_producer: round2(gross - fees),
        average_ticket: pagos.length > 0 ? round2(gross / pagos.length) : 0,
        tickets_issued: ingressos ?? 0,
        orders_in_window: orders.length,
        orders_not_paid: orders.length - pagos.length,
      },
      by_method: [...byMethod.entries()].map(([key, v]) => ({
        key, label: METHOD_LABEL[key], orders: v.count, gross: round2(v.gross), percent: pct(v.gross),
      })).sort((a, b) => b.gross - a.gross),
      by_day: [...byDay.entries()].map(([day, v]) => ({
        day, orders: v.count, gross: round2(v.gross), percent: pct(v.gross),
      })).sort((a, b) => a.day.localeCompare(b.day)),
      by_origin: [...byOrigin.entries()].map(([key, v]) => ({
        key, orders: v.count, gross: round2(v.gross), percent: pct(v.gross),
      })).sort((a, b) => b.gross - a.gross),
      orders: url.searchParams.get("list") === "1"
        ? pagos.map((o) => ({
            id: o.id,
            at: o.created_at,
            customer: o.customer_name,
            method: METHOD_LABEL[normalizeMethod(o.payment_method, o.manual_payment_method)],
            method_key: normalizeMethod(o.payment_method, o.manual_payment_method),
            origin: o.sale_origin || "online",
            total: round2(Number(o.total_amount ?? 0)),
            service_fee: round2(Number(o.service_fee_amount ?? 0)),
            provider_ref: o.mp_payment_id,
          }))
        : [],
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[GESTAO-SALES-EXPORT]", e instanceof Error ? e.message : e);
    return fail("internal", e instanceof Error ? e.message : "erro desconhecido", 500);
  }
});
