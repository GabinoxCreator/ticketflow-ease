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
import { criarPix, MarcelIndisponivel } from "../_shared/marcel.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// A cobrança do Marcel expira em 1h. Seguro o pedido por menos para o estoque
// voltar antes: ingresso preso é venda perdida.
const PIX_EXPIRATION_MINUTES = 30;
const DEFAULT_FEE_PERCENT = 10;

const log = (step: string, d?: unknown) =>
  console.log(`[MARCEL-CREATE-PIX] ${step}${d ? ` - ${JSON.stringify(d)}` : ''}`);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function resolveFee(client: any, eventId: string) {
  const { data } = await client
    .from('event_fee_overrides')
    .select('fee_percent, fee_fixed')
    .eq('event_id', eventId)
    .eq('payment_method', 'pix')
    .maybeSingle();
  return {
    percent: data ? Number(data.fee_percent) : DEFAULT_FEE_PERCENT,
    fixed: data ? Number(data.fee_fixed) : 0,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  let orderId: string | null = null;

  try {
    const body = await req.json();
    const { eventId, items, customerName, customerEmail, customerPhone, customerCpf } = body;

    if (!eventId || !Array.isArray(items) || items.length === 0) {
      return json({ error: 'Dados incompletos' }, 400);
    }

    const cleanCPF = unformatCPF(customerCpf);
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

    // PREÇO VEM DO BANCO. Nunca do cliente — é a trava contra manipulação.
    const lotIds = items.map((i: any) => i.lotId);
    const { data: lots, error: lotsError } = await admin
      .from('event_lots')
      .select('id, name, price, is_active, sales_start_type, start_date, starts_after_lot_id, modo_taxa')
      .in('id', lotIds)
      .eq('event_id', eventId);
    if (lotsError || !lots) throw new Error('Erro ao buscar lotes');

    let totalAmount = 0;
    // Base da taxa: só as linhas de lote 'cliente_paga'. Lote 'absorve' sai da
    // base, e é assim que o promocional do rodeio sai redondo para o comprador.
    let feeBase = 0;
    const lineItems: Array<{ lotId: string; lotName: string; quantity: number; price: number }> = [];

    for (const item of items) {
      const lot = lots.find((l: any) => l.id === item.lotId);
      if (!lot) return json({ error: 'Lote inválido' }, 400);
      if (!lot.is_active) return json({ error: `Lote "${lot.name}" não está à venda` }, 400);
      const qty = Math.max(1, Math.trunc(Number(item.quantity) || 1));
      const lineTotal = Number(lot.price) * qty;
      totalAmount += lineTotal;
      if (lot.modo_taxa !== 'absorve') feeBase += lineTotal;
      lineItems.push({ lotId: lot.id, lotName: lot.name, quantity: qty, price: Number(lot.price) });
    }

    // Trava "1 ingresso por CPF" nos eventos que a exigem, ANTES de reservar.
    const ticketLimit = getTicketLimitForEvent(eventId);
    if (ticketLimit) {
      const jaTem = await countTicketsForCpf(admin, eventId, cleanCPF);
      const pedindo = lineItems.reduce((s, i) => s + i.quantity, 0);
      if (jaTem + pedindo > ticketLimit) {
        return json({ error: `Limite de ${ticketLimit} ingresso(s) por CPF neste evento.` }, 400);
      }
    }

    const fee = await resolveFee(admin, eventId);
    const serviceFee = Math.max(0, Math.round((feeBase * fee.percent / 100 + fee.fixed) * 100) / 100);
    // PIX: sem taxa de processamento. Um arredondamento só, no fim.
    const finalAmount = Math.max(0.01, Math.round((totalAmount + serviceFee) * 100) / 100);

    const expiresAtIso = new Date(Date.now() + PIX_EXPIRATION_MINUTES * 60_000).toISOString();

    const { data: order, error: orderError } = await admin
      .from('orders')
      .insert({
        event_id: eventId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone || null,
        total_amount: finalAmount,
        discount_amount: 0,
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
        modoTaxa: (lots.find((l: any) => l.id === i.lotId)?.modo_taxa) ?? 'cliente_paga',
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
        email: customerEmail, phone: (customerPhone || '').replace(/\D/g, '') || undefined,
      },
    });

    if (!prov?.transactionId || !prov?.pixCode) {
      log('Marcel não devolveu cobrança', { erro: prov?.error, msg: prov?.message });
      // Sem cobrança não há o que pagar: devolve o estoque em vez de deixar
      // ingresso preso num pedido que nunca vai ser pago.
      await admin.from('orders').update({ status: 'failed' }).eq('id', order.id);
      return json({ error: 'Não foi possível gerar o PIX. Tente novamente.' }, 502);
    }

    await admin.from('orders')
      .update({ provider_transaction_id: String(prov.transactionId) })
      .eq('id', order.id);

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
