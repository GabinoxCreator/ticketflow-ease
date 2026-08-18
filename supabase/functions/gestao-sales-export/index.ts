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

// Como o cliente pagou. `payment_method` deste projeto tem valores livres vindos do
// Mercado Pago e da venda manual — normalizar aqui evita a gestão ver "pix", "PIX" e
// "account_money" como três coisas diferentes.
type Method = "pix" | "credito" | "debito" | "dinheiro" | "cortesia" | "outros";
function normalizeMethod(raw: unknown): Method {
  const v = String(raw ?? "").toLowerCase().trim();
  if (!v) return "outros";
  if (v.includes("pix")) return "pix";
  if (v.includes("cred")) return "credito";
  if (v.includes("deb")) return "debito";
  if (v.includes("dinheiro") || v.includes("cash") || v.includes("especie") || v.includes("money")) return "dinheiro";
  if (v.includes("cortesia") || v.includes("courtesy") || v.includes("free")) return "cortesia";
  return "outros";
}
const METHOD_LABEL: Record<Method, string> = {
  pix: "PIX", credito: "Crédito", debito: "Débito",
  dinheiro: "Dinheiro", cortesia: "Cortesia", outros: "Outros",
};

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
      status: string | null; payment_method: string | null; sale_origin: string | null;
      customer_name: string | null; mp_payment_id: string | null;
    };
    const orders: OrderRow[] = [];
    for (let page = 0; page < 50; page++) {
      let q = admin
        .from("orders")
        .select("id, event_id, created_at, total_amount, service_fee_amount, discount_amount, status, payment_method, sale_origin, customer_name, mp_payment_id")
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

    for (const o of pagos) {
      const v = Number(o.total_amount ?? 0);
      gross += v;
      fees += Number(o.service_fee_amount ?? 0);
      discounts += Number(o.discount_amount ?? 0);

      const m = normalizeMethod(o.payment_method);
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
            method: METHOD_LABEL[normalizeMethod(o.payment_method)],
            method_key: normalizeMethod(o.payment_method),
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
