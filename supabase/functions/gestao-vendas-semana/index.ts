// Edge: gestao-vendas-semana
// Ponte READ-ONLY para a aba da Nina, na gestão (OS-329, 28/10/2026): quanto o site
// vendeu por dia, somando TODOS os eventos, para o comparativo de anúncio e venda,
// semana contra semana. Só faz SELECT — NUNCA escreve nada neste projeto.
//
// Por que não é um `list=` a mais na `gestao-sales-export`: aquela ponte só soma por
// evento ou por produtor, e há evento sem produtor (493 pedidos pagos em 28/10). E o
// arquivo dela estava sendo mexido por outra ordem no mesmo dia. Esta é ADITIVA:
// arquivo novo, nenhum outro tocado.
//
// Autenticação: a mesma da `gestao-sales-export` (header x-service-token com o secret
// GESTAO_SERVICE_TOKEN, compartilhado só entre este projeto e a gestão). Quem chama é o
// servidor da gestão, nunca um navegador. A checagem do token é a PRIMEIRA coisa.
//
// Não sai nome, CPF, e-mail nem telefone: só contagem e soma por dia.
//
// GET ?from=AAAA-MM-DD&to=AAAA-MM-DD  (dias de Brasília, inclusivos, no máximo 120 dias)
//   -> { from, to, dias: [{ dia, pedidos, bruto, taxa, pedidos_portaria, bruto_portaria,
//        pedidos_maquininha, bruto_maquininha, cortesias, pedidos_outros, bruto_outros }],
//        lidos_ate, generated_at }
//
// "Pedido pago" é `orders.status = 'paid'`, a mesma régua da `gestao-sales-export` (neste
// projeto a verdade financeira mora em `status`). Cada ORIGEM (`sale_origin`) vai na sua
// conta, porque "pago" não quer dizer "vendido online": em 12 a 18/10 eram 95 pagos e só
// 18 online (75 cortesias de R$ 0,00 e 2 da maquininha; achado da revisão 1 da OS-329).
//   - `pedidos/bruto/taxa`: venda ONLINE no site (`online` ou sem origem);
//   - portaria (`manual`): o dinheiro nunca passou pelo site;
//   - maquininha (`smartpos`): venda no evento, pela POS;
//   - cortesia (`courtesy`): ingresso dado, só a contagem;
//   - outros: qualquer origem nova que aparecer, para não sumir nem entrar como online.
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
const MAX_DIAS = 120;

// Dia de Brasília: uma compra das 22h é UTC do dia seguinte. Offset fixo -03:00 (sem
// horário de verão), o mesmo da `gestao-sales-export`.
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const brtDay = (iso: string) => new Date(new Date(iso).getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
const ehDia = (v: string | null): v is string =>
  !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const somaDias = (dia: string, n: number) => {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expected = Deno.env.get("GESTAO_SERVICE_TOKEN");
  if (!expected) return fail("auth", "service_token_not_configured", 503);
  if (req.headers.get("x-service-token") !== expected) return fail("auth", "unauthorized", 401);

  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!ehDia(from) || !ehDia(to)) return fail("input", "from e to precisam ser AAAA-MM-DD", 400);
    if (from > to) return fail("input", "from é depois de to", 400);
    const dias: string[] = [];
    for (let d = from; d <= to; d = somaDias(d, 1)) {
      dias.push(d);
      if (dias.length > MAX_DIAS) return fail("input", `no máximo ${MAX_DIAS} dias por vez`, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Janela em UTC que cobre os dias de Brasília pedidos: de 00h00 de `from` a 23h59 de
    // `to`, horário de Brasília.
    const desdeUtc = new Date(Date.parse(`${from}T00:00:00Z`) + BRT_OFFSET_MS).toISOString();
    const ateUtc = new Date(Date.parse(`${somaDias(to, 1)}T00:00:00Z`) + BRT_OFFSET_MS).toISOString();

    type Linha = { created_at: string; total_amount: number | null; service_fee_amount: number | null; sale_origin: string | null };
    const pagos: Linha[] = [];
    // Página de 1000 (limite padrão do PostgREST). Se as 50 páginas encherem, a soma
    // estaria cortada: a ponte recusa em vez de devolver um número menor que o real.
    let cheio = true;
    for (let page = 0; page < 50; page++) {
      const { data, error } = await admin
        .from("orders")
        .select("created_at, total_amount, service_fee_amount, sale_origin")
        .eq("status", "paid")
        .gte("created_at", desdeUtc)
        .lt("created_at", ateUtc)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(page * 1000, page * 1000 + 999);
      if (error) return fail("orders", error.message, 500);
      pagos.push(...((data ?? []) as Linha[]));
      if (!data || data.length < 1000) { cheio = false; break; }
    }
    if (cheio) return fail("orders", "mais de 50 mil pedidos na janela: peça menos dias", 413);

    type Soma = {
      pedidos: number; bruto: number; taxa: number; pedidos_portaria: number; bruto_portaria: number;
      pedidos_maquininha: number; bruto_maquininha: number; cortesias: number; pedidos_outros: number; bruto_outros: number;
    };
    const vazio = (): Soma => ({
      pedidos: 0, bruto: 0, taxa: 0, pedidos_portaria: 0, bruto_portaria: 0,
      pedidos_maquininha: 0, bruto_maquininha: 0, cortesias: 0, pedidos_outros: 0, bruto_outros: 0,
    });
    const porDia = new Map(dias.map((d) => [d, vazio()]));
    for (const o of pagos) {
      const s = porDia.get(brtDay(o.created_at));
      if (!s) continue;
      const v = Number(o.total_amount ?? 0);
      const origem = o.sale_origin || "online";
      if (origem === "online") {
        s.pedidos += 1;
        s.bruto += v;
        s.taxa += Number(o.service_fee_amount ?? 0);
      } else if (origem === "manual") {
        s.pedidos_portaria += 1;
        s.bruto_portaria += v;
      } else if (origem === "smartpos") {
        s.pedidos_maquininha += 1;
        s.bruto_maquininha += v;
      } else if (origem === "courtesy") {
        s.cortesias += 1;
      } else {
        s.pedidos_outros += 1;
        s.bruto_outros += v;
      }
    }

    const agora = new Date();
    return json({
      from,
      to,
      dias: dias.map((dia) => {
        const s = porDia.get(dia)!;
        return {
          dia,
          pedidos: s.pedidos,
          bruto: round2(s.bruto),
          taxa: round2(s.taxa),
          pedidos_portaria: s.pedidos_portaria,
          bruto_portaria: round2(s.bruto_portaria),
          pedidos_maquininha: s.pedidos_maquininha,
          bruto_maquininha: round2(s.bruto_maquininha),
          cortesias: s.cortesias,
          pedidos_outros: s.pedidos_outros,
          bruto_outros: round2(s.bruto_outros),
        };
      }),
      // Até quando a leitura vale: o dia de hoje (Brasília) ainda está vendendo.
      lidos_ate: agora.toISOString(),
      generated_at: agora.toISOString(),
    });
  } catch (e) {
    console.error("[GESTAO-VENDAS-SEMANA]", e instanceof Error ? e.message : e);
    return fail("internal", e instanceof Error ? e.message : "erro desconhecido", 500);
  }
});
