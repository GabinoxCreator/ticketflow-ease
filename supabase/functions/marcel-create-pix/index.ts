// marcel-create-pix — cria o pedido e a cobrança PIX na API do Marcel.
//
// Gêmea da create-mercadopago-pix: mesma disciplina de preço server-side, mesma
// reserva de estoque, mesma captura da venda. O que muda é o provedor.
//
// ⚠️ ESTA FUNÇÃO NÃO APROVA NADA. Ela cria a cobrança e devolve o código para o
// cliente pagar. Quem libera a venda é a `marcel-check-pix`, e só quando a API
// devolver status "3" — a própria documentação do Marcel destaca isso como a
// armadilha nº 1: `aprovado:true` aqui significa "cobrança criada", não "paga".
//
// PIX NÃO TEM TAXA DE PROCESSAMENTO (decisão do Gabriel, 17/08): o cliente paga
// o ingresso + a taxa administrativa, e nada mais. O custo do cartão só entra no
// crédito.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { validateCPF, unformatCPF } from "../_shared/cpf.ts";
import { getTicketLimitForEvent, countTicketsForCpf } from "../_shared/event-ticket-limits.ts";
import { captureSaleTerms } from "../_shared/captureSaleTerms.ts";
import { criarPix, telefoneParaMarcel, MarcelIndisponivel } from "../_shared/marcel.ts";
import { resolverPreco, reservarEstoque, devolverEstoque, CarrinhoInvalido, temPassePermanente } from "../_shared/carrinhoMarcel.ts";
import { conflitosDeCpfPorDia, mensagemDoConflito } from "../_shared/umCpfPorDia.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// A cobrança do Marcel expira em 1h. Seguro o pedido por menos para o estoque
// voltar antes: ingresso preso é venda perdida.
const PIX_EXPIRATION_MINUTES = 30;

const log = (step: string, d?: unknown) =>
  console.log(`[MARCEL-CREATE-PIX] ${step}${d ? ` - ${JSON.stringify(d)}` : ''}`);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  let orderId: string | null = null;
  let reservado: { lotId: string; quantity: number }[] = [];

  try {
    const body = await req.json();
    const { eventId, items, customerName, customerEmail, customerPhone } = body;

    if (!eventId || !Array.isArray(items) || items.length === 0) {
      return json({ error: 'Dados incompletos' }, 400);
    }

    // O checkout manda `customerCPF` (maiúsculo) há muito tempo; aceito as duas
    // grafias para não depender de mexer no modal em produção — e porque um
    // campo que chega com nome ligeiramente diferente vira CPF vazio silencioso.
    const cleanCPF = unformatCPF(body.customerCPF ?? body.customerCpf);
    if (!validateCPF(cleanCPF)) return json({ error: 'CPF inválido' }, 400);

    // Quem é o comprador: o token, não o corpo da requisição.
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
      .from('events').select('id, title, status').eq('id', eventId).maybeSingle();
    if (!event) return json({ error: 'Evento não encontrado' }, 404);

    // PREÇO VEM DO BANCO, pela mesma função que o cartão usa. Manter a conta
    // duplicada aqui foi o que deixou esta edge sem tratar cupom na 1ª versão:
    // o cliente via o desconto na tela e era cobrado o valor cheio.
    const preco = await resolverPreco(admin, eventId, items, 'pix', body.couponId);
    const lineItems = preco.linhas;

    // Trava "1 ingresso por CPF" nos eventos que a exigem, ANTES de reservar.
    const ticketLimit = getTicketLimitForEvent(eventId);
    if (ticketLimit) {
      const jaTem = await countTicketsForCpf(admin, eventId, cleanCPF);
      const pedindo = lineItems.reduce((s, i) => s + i.quantity, 0);
      if (jaTem + pedindo > ticketLimit) {
        return json({ error: `Limite de ${ticketLimit} ingresso(s) por CPF neste evento.` }, 400);
      }
    }

    // Passe permanente exige aceite explícito (§4b do framework do Rodeio):
    // ao ser usado, o passe trava no CPF de quem entrou e não pode mais ser
    // transferido. Quem compra para a família precisa saber ANTES, não na
    // portaria. A tela mostra o aviso; aqui a regra é cumprida.
    if (temPassePermanente(lineItems) && body.passeAceito !== true) {
      return json({ error: 'Para comprar o passe permanente, é preciso aceitar as condições de uso.' }, 400);
    }

    // 1 ingresso por CPF em cada NOITE (trava anti-cambista do rodeio). Fica
    // ANTES de reservar: barrar depois de prender estoque daria ao cambista o
    // poder de esgotar o lote só tentando. Em evento sem noites cadastradas
    // isto não devolve nada e a venda segue igual a hoje.
    const conflitos = await conflitosDeCpfPorDia(admin, eventId, cleanCPF, lineItems);
    if (conflitos.length > 0) {
      log('Barrado por 1 CPF/dia', { conflitos });
      return json({ error: mensagemDoConflito(conflitos) }, 409);
    }

    // PIX: sem taxa de processamento (decisão do Gabriel, 17/08). O subtotal já
    // é face − desconto + taxa administrativa.
    const serviceFee = preco.taxaAdministrativa;
    const finalAmount = preco.subtotal;

    // RESERVA ANTES DE CRIAR O PEDIDO. Sem isto dois compradores levam o mesmo
    // último ingresso — e é com o lote acabando que mais gente compra junto.
    reservado = await reservarEstoque(admin, lineItems);

    const expiresAtIso = new Date(Date.now() + PIX_EXPIRATION_MINUTES * 60_000).toISOString();

    const { data: order, error: orderError } = await admin
      .from('orders')
      .insert({
        event_id: eventId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone || null,
        total_amount: finalAmount,
        discount_amount: preco.desconto,
        coupon_id: preco.cupomId,
        service_fee_amount: serviceFee,
        payment_method: 'pix',
        status: 'pending',
        user_id: userId,
        customer_cpf: cleanCPF,
        expires_at: expiresAtIso,
      })
      .select().single();

    if (orderError || !order) {
      log('Falha ao criar pedido', { orderError });
      throw new Error('Erro ao criar pedido');
    }
    orderId = order.id;
    log('Pedido criado', { orderId });

    const ticketsToCreate = lineItems.flatMap((item) =>
      Array.from({ length: item.quantity }, () => ({
        event_id: eventId, order_id: order.id, lot_id: item.lotId,
        holder_name: customerName, holder_email: customerEmail,
        holder_phone: customerPhone || null, user_id: userId, status: 'pending',
      })),
    );
    const { error: ticketsError } = await admin.from('tickets').insert(ticketsToCreate);
    if (ticketsError) {
      log('Falha ao criar tickets', { ticketsError });
      await admin.from('orders').delete().eq('id', order.id);
      throw new Error('Erro ao reservar ingressos');
    }

    // O que o sistema jogava fora. PIX não tem parcela nem bandeira, mas grava
    // igual (installments=1): se só o cartão gravasse, a conferência de
    // completude acusaria buraco para sempre num evento onde PIX é maioria.
    await captureSaleTerms(admin, order.id,
      lineItems.map((i) => ({
        lotId: i.lotId, lotName: i.lotName, unitFace: i.price, quantity: i.quantity,
        // O modo vem da própria linha resolvida — antes eu buscava numa lista de
        // lotes que o refactor tirou daqui, e isso quebraria a função.
        modoTaxa: i.modoTaxa,
      })),
      { installments: 1, brandRaw: null, provider: 'marcel', method: 'pix' });

    // purchaseId = id do pedido. É por ele que o /reconcile acha a venda depois
    // de uma queda de rede — sem isso, pedido em dúvida fica em dúvida para sempre.
    const prov = await criarPix({
      amount: finalAmount,
      description: `${event.title}`.slice(0, 120),
      purchaseId: order.id,
      customer: {
        name: customerName, cpf: cleanCPF,
        email: customerEmail,
        // Sem o código do país: com 13 dígitos a API RECUSA a cobrança.
        phone: telefoneParaMarcel(customerPhone),
      },
    });

    if (!prov?.transactionId || !prov?.pixCode) {
      log('Marcel não devolveu cobrança', { erro: prov?.error, msg: prov?.message });
      // Sem cobrança não há o que pagar: devolve o estoque e mata os tickets,
      // em vez de deixar ingresso preso num pedido que nunca será pago.
      await devolverEstoque(admin, reservado);
      reservado = [];
      await admin.from('tickets').update({ status: 'cancelled' })
        .eq('order_id', order.id).eq('status', 'pending');
      await admin.from('orders').update({ status: 'failed' }).eq('id', order.id);
      return json({ error: 'Não foi possível gerar o PIX. Tente novamente.' }, 502);
    }

    // Grava o id da transação E o código do PIX. Os dois importam:
    //  · sem o id, a varredura não sabe o que perguntar ao provedor;
    //  · sem o código, o cliente que trocar de aparelho ou limpar o navegador
    //    perde o QR de um pedido que já reservou ingresso dele — o rascunho
    //    local não atravessa dispositivo. A rota antiga (confra-create-pix) já
    //    gravava `provider_pix_code`; esta tinha deixado de gravar (18/08).
    const { error: updErr } = await admin.from('orders')
      .update({
        provider_transaction_id: String(prov.transactionId),
        provider_pix_code: prov.pixCode,
      })
      .eq('id', order.id);

    if (updErr) {
      // O cliente vai receber o código e pode pagar. Se o id não ficou gravado,
      // o pedido some do radar da varredura — por isso isto NÃO pode passar em
      // silêncio. A varredura ainda consegue achar a venda pelo purchaseId (o
      // próprio id do pedido), que é justamente por isso que ele vai em toda
      // cobrança; o log aqui é o que permite descobrir que isso aconteceu.
      log('FALHA AO GRAVAR O ID DA TRANSAÇÃO — pedido depende do purchaseId', {
        orderId: order.id, transactionId: prov.transactionId, erro: updErr.message,
      });
    }

    log('PIX criado', { orderId: order.id, transactionId: prov.transactionId });

    return json({
      orderId: order.id,
      pixCode: prov.pixCode,
      // NÃO devolvo "aprovado": o front não pode nem cogitar liberar aqui.
      expiresAt: expiresAtIso,
      amount: finalAmount,
      serviceFee,
    }, 201);

  } catch (e) {
    // Devolve o que ainda estiver reservado. Já foi zerado nas saídas tratadas,
    // então não há risco de devolver duas vezes e inflar o estoque.
    await devolverEstoque(admin, reservado);

    // Carrinho inválido (lote de outro evento, lote inativo, sem estoque) é erro
    // do pedido, não falha do sistema — devolve a mensagem que explica o motivo.
    if (e instanceof CarrinhoInvalido) {
      if (orderId) await admin.from('orders').update({ status: 'failed' }).eq('id', orderId);
      return json({ error: e.message }, e.status);
    }
    if (e instanceof MarcelIndisponivel) {
      log('Integração não configurada', { msg: e.message });
      if (orderId) await admin.from('orders').update({ status: 'failed' }).eq('id', orderId);
      return json({ error: 'Pagamento indisponível no momento.' }, 503);
    }
    log('Erro', { msg: e instanceof Error ? e.message : String(e) });
    if (orderId) await admin.from('orders').update({ status: 'failed' }).eq('id', orderId);
    return json({ error: e instanceof Error ? e.message : 'Erro ao processar' }, 500);
  }
});
