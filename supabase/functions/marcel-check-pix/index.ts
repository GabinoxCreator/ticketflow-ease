// marcel-check-pix — a ÚNICA coisa que aprova um pedido pago por PIX na rota do
// Marcel. É o equivalente ao `mercadopago-webhook`, com uma diferença de peso:
//
//   ⚠️ A API do Marcel NÃO TEM WEBHOOK. Ninguém nos avisa que o cliente pagou.
//   Quem descobre somos nós, consultando. Isso inverte a responsabilidade: no
//   Mercado Pago o provedor empurra e nós validamos; aqui nós puxamos, e se
//   ninguém puxar, o pedido pago fica pendente para sempre.
//
// POR ISSO ESTA FUNÇÃO TEM QUE SER SEGURA DE CHAMAR À VONTADE:
//   · o front consulta a cada 3–5s enquanto o cliente tem o QR na tela;
//   · a promoção passa por `apply_order_approved`, que é idempotente e RECUSA
//     promover pedido sem tickets — chamar dez vezes aprova uma vez só;
//   · pedido em estado terminal não é reprocessado.
//
// Só `status === "3"` libera venda. `aprovado:true` sozinho não basta: a doc é
// explícita que a decisão é pelo status, e 5/6/7 são cancelado/estornado/erro.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { applyOrderApproved } from "../_shared/applyOrderApproved.ts";
import { consultarPix, reconciliar, PAGO, MarcelIndisponivel } from "../_shared/marcel.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const log = (step: string, d?: unknown) =>
  console.log(`[MARCEL-CHECK-PIX] ${step}${d ? ` - ${JSON.stringify(d)}` : ''}`);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { orderId } = await req.json().catch(() => ({}));
    if (!orderId) return json({ error: 'orderId obrigatório' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: order } = await admin
      .from('orders')
      .select('id, status, provider_transaction_id, payment_method')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) return json({ error: 'Pedido não encontrado' }, 404);

    // Já pago: responde na hora, sem bater na API. O front pergunta muito.
    if (order.status === 'paid') {
      return json({ pago: true, status: PAGO, jaEstavaPago: true });
    }
    // Terminal: não reprocessa. Reabrir pedido cancelado por consulta seria
    // ressuscitar venda que alguém encerrou de propósito.
    if (['cancelled', 'expired', 'failed', 'refunded'].includes(order.status)) {
      return json({ pago: false, status: null, encerrado: true, situacao: order.status });
    }

    let resp;
    if (order.provider_transaction_id) {
      resp = await consultarPix(order.provider_transaction_id);
    } else {
      // Sem o id da transação (queda no meio da criação), ainda dá para achar a
      // venda pelo purchaseId — que é justamente o id do pedido. É para isso que
      // ele vai em toda cobrança.
      log('Sem transaction_id, reconciliando pelo pedido', { orderId });
      resp = await reconciliar(order.id);
    }

    const status = String(resp?.status ?? '');
    log('Resposta da API', { orderId, status, aprovado: resp?.aprovado });

    if (status !== PAGO) {
      // 1 = pendente (siga consultando). 5/6/7 = cancelado/estornado/erro.
      // NÃO marco o pedido como falho aqui: a expiração tem rotina própria, e
      // um erro momentâneo da API não pode matar uma venda que talvez seja paga
      // um minuto depois.
      return json({ pago: false, status: status || null });
    }

    // Pago. A promoção passa pela RPC transacional de sempre — nunca um
    // UPDATE status='paid' na mão, que promoveria pedido sem ticket.
    // O wrapper é o certo aqui (e não a RPC crua) porque a confirmação por
    // e-mail DEVE sair nesta venda; ele já é fail-soft quanto ao envio.
    let resultado;
    try {
      resultado = await applyOrderApproved(admin, {
        orderId: order.id,
        // O campo é do tempo do Mercado Pago, mas guarda o id da transação do
        // provedor — aqui, o do Marcel.
        mpPaymentId: String(order.provider_transaction_id ?? order.id),
        source: 'marcel-check-pix',
      });
    } catch (err) {
      // Dinheiro entrou e a promoção falhou: é o caso que NUNCA pode passar em
      // silêncio. O wrapper já auditou; devolvo erro para o front insistir.
      log('apply_order_approved falhou', { orderId, msg: err instanceof Error ? err.message : String(err) });
      return json({ pago: true, status, promovido: false, erro: 'falha_ao_promover' }, 500);
    }

    // `mismatch` = a RPC recusou promover (pedido sem tickets, ou já terminal).
    // Ela audita sozinha; aqui a resposta precisa ser honesta com o front.
    if (resultado.mismatch) {
      log('Promoção recusada pela RPC', { orderId, resultado });
      return json({ pago: true, status, promovido: false, erro: 'pedido_inconsistente' }, 409);
    }

    log('Pedido aprovado', { orderId, primeira: resultado.first_transition });
    return json({
      pago: true, status, promovido: true,
      // Chamar de novo devolve first_transition=false: é a idempotência à mostra.
      primeiraVez: resultado.first_transition,
    });

  } catch (e) {
    if (e instanceof MarcelIndisponivel) {
      return json({ pago: false, erro: 'pagamento_indisponivel' }, 503);
    }
    // Timeout/rede: NÃO é "não pago". Devolvo indefinido de propósito, para o
    // front continuar consultando em vez de concluir que a venda falhou.
    log('Erro na consulta', { msg: e instanceof Error ? e.message : String(e) });
    return json({ pago: false, indefinido: true }, 503);
  }
});
