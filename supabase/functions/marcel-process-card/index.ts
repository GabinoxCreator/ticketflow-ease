// marcel-process-card — cobrança no crédito pela API do Marcel.
//
// Dois modos:
//   · `quote: true`  → só cota: devolve o subtotal e as opções de parcelamento
//                      com a taxa de processamento já calculada. Nada é criado.
//   · sem `quote`    → cobra de verdade.
//
// A COTAÇÃO NÃO É LUXO: a documentação do Marcel é explícita que parcela abaixo
// de R$5 faz a API recusar a VENDA INTEIRA — não cair para menos vezes. Montar
// a lista de parcelas na tela por conta própria é entregar ao cliente uma opção
// que vai ser negada depois de ele já ter digitado o cartão.
//
// A taxa de processamento sai da tabela versionada no banco (`opcoes_parcelamento`),
// nunca de constante no código. Foi o defeito da rota antiga: mudar juro virava
// deploy.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { validateCPF, unformatCPF } from "../_shared/cpf.ts";
import { getTicketLimitForEvent, countTicketsForCpf } from "../_shared/event-ticket-limits.ts";
import { captureSaleTerms } from "../_shared/captureSaleTerms.ts";
import { applyOrderApproved } from "../_shared/applyOrderApproved.ts";
import { resolverPreco, produtorAbsorve, reservarEstoque, devolverEstoque, CarrinhoInvalido } from "../_shared/carrinhoMarcel.ts";
import { cobrarCredito, MarcelIndisponivel } from "../_shared/marcel.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CARD_EXPIRATION_MINUTES = 20;
const MAX_PARCELAS = 10;   // teto da API do Marcel

const log = (step: string, d?: unknown) =>
  console.log(`[MARCEL-CARD] ${step}${d ? ` - ${JSON.stringify(d)}` : ''}`);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface OpcaoParcela {
  parcelas: number;
  total_cents: number;
  parcela_cents: number;
  taxa_pct: number;
  acrescimo_cents: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  let orderId: string | null = null;
  // Estoque já tirado da prateleira. Tem que voltar em TODA saída que não vira
  // venda — inclusive nas exceções lá do fim.
  let reservado: { lotId: string; quantity: number }[] = [];

  try {
    const body = await req.json();
    const { eventId, items, quote, installments, card, cartaoId, couponId,
            customerName, customerEmail, customerPhone } = body;

    if (!eventId) return json({ error: 'Evento obrigatório' }, 400);

    const preco = await resolverPreco(admin, eventId, items, 'card', couponId);
    const absorve = produtorAbsorve(preco.linhas);

    // Opções vindas da tabela versionada. `absorve` decide quem paga o custo:
    // no lote promocional do rodeio o comprador paga a face redonda e o custo
    // sai do repasse.
    const { data: opcoes, error: opcErr } = await admin.rpc('opcoes_parcelamento', {
      _face_cents: Math.round(preco.subtotal * 100),
      _absorve: absorve,
      _max_parcelas: MAX_PARCELAS,
    });
    if (opcErr) {
      log('Falha ao montar parcelas', { opcErr });
      return json({ error: 'Não foi possível calcular o parcelamento.' }, 500);
    }
    const lista = (opcoes ?? []) as OpcaoParcela[];

    // ---- Modo cotação: nada é criado ----------------------------------------
    if (quote) {
      return json({
        subtotal: preco.subtotal,
        totalFace: preco.totalFace,
        taxaAdministrativa: preco.taxaAdministrativa,
        desconto: preco.desconto,
        produtorAbsorve: absorve,
        // `options` no formato que a tela de cartão já consome hoje (installments
        // / total / perInstallment). Mantido em inglês de propósito: mudar o nome
        // exigiria mexer no componente do checkout, e o que não pode acontecer é
        // a tela receber um formato que não entende e cair no fallback de "só 1x"
        // — o cliente perderia o parcelamento sem ninguém perceber.
        options: lista.map((o) => ({
          installments: o.parcelas,
          total: o.total_cents / 100,
          perInstallment: o.parcela_cents / 100,
          // Extras nossos: a tela pode exibir a taxa em linha separada, como o
          // mercado faz ("taxa de processamento").
          processingFee: o.acrescimo_cents / 100,
          ratePct: Number(o.taxa_pct),
        })),
        // Mesma lista em português, para telas novas.
        opcoes: lista.map((o) => ({
          parcelas: o.parcelas,
          total: o.total_cents / 100,
          valorParcela: o.parcela_cents / 100,
          taxaProcessamento: o.acrescimo_cents / 100,
          taxaPct: Number(o.taxa_pct),
        })),
      });
    }

    // ---- Cobrança de verdade ------------------------------------------------
    // O checkout manda `customerCPF` (maiúsculo) há muito tempo; aceito as duas
    // grafias. Um campo que chega com nome ligeiramente diferente viraria CPF
    // vazio em silêncio, e a venda cairia num "CPF inválido" sem explicação.
    const cleanCPF = unformatCPF(body.customerCPF ?? body.customerCpf);
    if (!validateCPF(cleanCPF)) return json({ error: 'CPF inválido' }, 400);
    if (!card && !cartaoId) return json({ error: 'Dados do cartão obrigatórios' }, 400);

    const n = Math.trunc(Number(installments) || 1);
    const escolhida = lista.find((o) => o.parcelas === n);
    if (!escolhida) {
      // Ou passou do teto, ou a parcela cairia abaixo de R$5. Devolvo as opções
      // válidas para a tela se corrigir sem o cliente digitar tudo de novo.
      return json({
        error: 'parcelamento_indisponivel',
        message: `Não é possível parcelar em ${n}x neste valor.`,
        opcoes: lista.map((o) => ({ parcelas: o.parcelas, total: o.total_cents / 100 })),
      }, 400);
    }

    const valorCobrado = escolhida.total_cents / 100;

    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data } = await userClient.auth.getUser();
      userId = data?.user?.id ?? null;
    }

    const { data: event } = await admin
      .from('events').select('id, title').eq('id', eventId).maybeSingle();
    if (!event) return json({ error: 'Evento não encontrado' }, 404);

    const ticketLimit = getTicketLimitForEvent(eventId);
    if (ticketLimit) {
      const jaTem = await countTicketsForCpf(admin, eventId, cleanCPF);
      const pedindo = preco.linhas.reduce((s, i) => s + i.quantity, 0);
      if (jaTem + pedindo > ticketLimit) {
        return json({ error: `Limite de ${ticketLimit} ingresso(s) por CPF neste evento.` }, 400);
      }
    }

    // RESERVA ANTES DE CRIAR O PEDIDO. Sem isto, dois compradores levam o mesmo
    // último ingresso — e é justamente com o lote acabando que mais gente
    // compra ao mesmo tempo.
    reservado = await reservarEstoque(admin, preco.linhas);

    const { data: order, error: orderError } = await admin
      .from('orders')
      .insert({
        event_id: eventId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone || null,
        total_amount: valorCobrado,
        discount_amount: preco.desconto,
        coupon_id: preco.cupomId,
        service_fee_amount: preco.taxaAdministrativa,
        payment_method: 'card',
        status: 'pending',
        user_id: userId,
        customer_cpf: cleanCPF,
        expires_at: new Date(Date.now() + CARD_EXPIRATION_MINUTES * 60_000).toISOString(),
      })
      .select().single();

    if (orderError || !order) throw new Error('Erro ao criar pedido');
    orderId = order.id;

    const ticketsToCreate = preco.linhas.flatMap((item) =>
      Array.from({ length: item.quantity }, () => ({
        event_id: eventId, order_id: order.id, lot_id: item.lotId,
        holder_name: customerName, holder_email: customerEmail,
        holder_phone: customerPhone || null, user_id: userId, status: 'pending',
      })),
    );
    const { error: ticketsError } = await admin.from('tickets').insert(ticketsToCreate);
    if (ticketsError) {
      await admin.from('orders').delete().eq('id', order.id);
      throw new Error('Erro ao reservar ingressos');
    }
    // A partir daqui o pedido existe e é dele o estoque: quem devolve, se a
    // cobrança não passar, é o tratamento de recusa. O catch geral não deve
    // devolver de novo — daí o `reservado = []` em cada saída tratada.

    log('Cobrando', { orderId: order.id, parcelas: n, valor: valorCobrado });

    let prov;
    try {
      prov = await cobrarCredito({
        amount: valorCobrado,
        parcelas: n,
        description: `${event.title}`.slice(0, 120),
        // purchaseId = id do pedido. Sem ele o /reconcile não acha a venda, e
        // pedido em dúvida fica em dúvida para sempre.
        purchaseId: order.id,
        card, cartaoId,
        customer: { name: customerName, cpf: cleanCPF, email: customerEmail },
      });
    } catch (err) {
      // ⚠️ Timeout ou 500 NÃO é recusa: a cobrança PODE ter passado. Refazer às
      // cegas cobra o cliente duas vezes. Deixo o pedido PENDENTE de propósito e
      // devolvo "indefinido" — quem resolve é a reconciliação pelo purchaseId,
      // nunca uma segunda tentativa automática.
      log('Falha de comunicação — pedido fica pendente para reconciliar', {
        orderId: order.id, msg: err instanceof Error ? err.message : String(err),
      });
      return json({
        indefinido: true,
        orderId: order.id,
        error: 'nao_confirmado',
        message: 'Não conseguimos confirmar o pagamento. Não tente de novo — vamos verificar e avisar.',
      }, 202);
    }

    // Recusa chega com HTTP 200: a decisão é pelo campo `aprovado`, sempre.
    if (!prov?.aprovado) {
      log('Recusado', { orderId: order.id, msg: prov?.message, error: prov?.error });
      // Devolve o ingresso para a prateleira e mata os tickets. Sem isto, cada
      // cartão recusado come uma unidade do estoque para sempre — e cartão
      // recusado é rotina, não exceção.
      await devolverEstoque(admin, reservado);
      reservado = [];
      await admin.from('tickets').update({ status: 'cancelled' })
        .eq('order_id', order.id).eq('status', 'pending');
      await admin.from('orders').update({ status: 'failed' }).eq('id', order.id);
      return json({
        aprovado: false,
        status: 'rejected',
        orderId: order.id,
        // A tela mostra `error` como mensagem, então ele precisa ser texto
        // legível — não um código técnico que o comprador não entende.
        error: prov?.message ?? 'Pagamento recusado. Tente outro cartão.',
        message: prov?.message ?? 'Pagamento recusado. Tente outro cartão.',
        ...(prov?.opcoes ? { opcoes: prov.opcoes } : {}),
      }, 200);
    }

    await admin.from('orders')
      .update({ provider_transaction_id: String(prov.transactionId ?? '') })
      .eq('id', order.id);

    // Grava o que o sistema jogava fora: face por lote, parcelas e bandeira.
    // A bandeira não vem nesta resposta — fica null, que é honesto: melhor o
    // motor de repasse saber que não sabe do que chutar a faixa mais barata.
    await captureSaleTerms(admin, order.id,
      preco.linhas.map((i) => ({
        lotId: i.lotId, lotName: i.lotName, unitFace: i.price,
        quantity: i.quantity, modoTaxa: i.modoTaxa,
      })),
      { installments: n, brandRaw: null, provider: 'marcel', method: 'card' });

    const resultado = await applyOrderApproved(admin, {
      orderId: order.id,
      mpPaymentId: String(prov.transactionId ?? order.id),
      source: 'marcel-process-card',
    });

    if (resultado.mismatch) {
      log('Pago mas promoção recusada', { orderId: order.id, resultado });
      return json({ aprovado: true, orderId: order.id, promovido: false, erro: 'pedido_inconsistente' }, 409);
    }

    log('Aprovado', { orderId: order.id, autorizacao: prov.authorizationCode });
    return json({
      aprovado: true,
      // `status:'approved'` é o campo que a TELA lê para liberar. Sem ele, o
      // checkout cai no ramo de erro mesmo com o pagamento aprovado — o cliente
      // pagaria, veria "não aprovado" e tentaria de novo, pagando duas vezes.
      // Pego em auditoria lendo o componente contra a resposta da função.
      status: 'approved',
      orderId: order.id,
      parcelas: n,
      total: valorCobrado,
      authorizationCode: prov.authorizationCode ?? null,
    });

  } catch (e) {
    // Qualquer saída por exceção devolve o que ainda estiver reservado. O
    // `reservado` já foi zerado nas saídas que trataram a devolução, então não
    // há risco de devolver duas vezes e inflar o estoque.
    await devolverEstoque(admin, reservado);

    if (e instanceof CarrinhoInvalido) return json({ error: e.message }, e.status);
    if (e instanceof MarcelIndisponivel) {
      if (orderId) await admin.from('orders').update({ status: 'failed' }).eq('id', orderId);
      return json({ error: 'Pagamento indisponível no momento.' }, 503);
    }
    log('Erro', { msg: e instanceof Error ? e.message : String(e) });
    if (orderId) await admin.from('orders').update({ status: 'failed' }).eq('id', orderId);
    return json({ error: e instanceof Error ? e.message : 'Erro ao processar' }, 500);
  }
});
