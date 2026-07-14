// redeploy 2026-07-14 — force redeploy
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { applyOrderApproved } from "../_shared/applyOrderApproved.ts";
import { validateCPF, unformatCPF } from "../_shared/cpf.ts";
import { getTicketLimitForEvent, countTicketsForCpf } from "../_shared/event-ticket-limits.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-meli-session-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CartItem { lotId: string; quantity: number; }

interface CardPaymentRequest {
  eventId: string;
  items: CartItem[];
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerCPF: string;
  card: { holder: string; number: string; expiration: string; cvv: string };
  couponId?: string;
  deviceId?: string;
  installments?: number;
}


const CARD_EXPIRATION_MINUTES = 20;
const DEFAULT_FEE_PERCENT = 10;

// Custo do parcelamento embutido "por dentro" (gross-up) para cartão via Marcel.
// custo total por faixa = MDR da faixa + antecipação. Fonte: tabela de taxas do Marcel.
// 1x não entra: sem gross-up.
const PARCELAMENTO_CUSTO: Record<number, number> = {
  2: 0.0579, 3: 0.0673, 4: 0.0768, 5: 0.0862, 6: 0.0957,
  7: 0.1101, 8: 0.1196, 9: 0.1290, 10: 0.1385, 11: 0.1479, 12: 0.1574,
};

async function resolveFee(client: any, eventId: string, method: 'pix' | 'card') {
  const { data } = await client
    .from('event_fee_overrides')
    .select('fee_percent, fee_fixed')
    .eq('event_id', eventId)
    .eq('payment_method', method)
    .maybeSingle();
  return {
    percent: data ? Number(data.fee_percent) : DEFAULT_FEE_PERCENT,
    fixed: data ? Number(data.fee_fixed) : 0,
  };
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CONFRA-PROCESS-CARD] ${step}${detailsStr}`);
};

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const reservedSoFar: Array<{ lotId: string; quantity: number }> = [];
  let supabaseClient: any = null;

  try {
    logStep('Function started');

    // Auth required
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claimsData?.claims?.sub) return json({ error: 'Unauthorized' }, 401);
    const userId: string = claimsData.claims.sub;

    supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const body = await req.json() as CardPaymentRequest;
    const { eventId, items, customerName, customerEmail, customerPhone, customerCPF,
            card, couponId } = body;

    // Parcelas: default 1, inteiro entre 1 e 12. Nada além disso vem do front —
    // preço segue vindo do banco; installments só escolhe a faixa de gross-up.
    const installments = body.installments ?? 1;
    if (!Number.isInteger(installments) || installments < 1 || installments > 12) {
      return json({
        error: 'invalid_installments',
        message: 'Número de parcelas inválido. Escolha entre 1 e 12.',
      }, 400);
    }

    logStep('Request received', { eventId, itemsCount: items?.length, customerEmail, userId, installments });


    // CPF gate BEFORE any reservation
    const cleanCPF = unformatCPF(customerCPF);
    if (!validateCPF(cleanCPF)) {
      return json({ error: 'invalid_cpf', message: 'CPF inválido. Verifique e tente novamente.' }, 400);
    }

    if (!eventId || !Array.isArray(items) || items.length === 0 ||
        !card || !card.number || !card.expiration || !card.cvv) {
      return json({ error: 'invalid_request' }, 400);
    }

    // Validate event
    const { data: event, error: eventError } = await supabaseClient
      .from('events').select('id, title, status').eq('id', eventId).single();
    if (eventError || !event) throw new Error('Evento não encontrado');
    if (event.status !== 'published') throw new Error('Evento não está disponível para vendas');

    // Validate lots / prices
    const lotIds = items.map(i => i.lotId);
    const { data: lots, error: lotsError } = await supabaseClient
      .from('event_lots')
      .select('id, name, price, is_active')
      .in('id', lotIds)
      .eq('event_id', eventId);
    if (lotsError || !lots) throw new Error('Erro ao buscar lotes');

    let totalAmount = 0;
    const lineItems: Array<{ lotId: string; lotName: string; quantity: number; price: number }> = [];

    for (const item of items) {
      const lot = lots.find((l: any) => l.id === item.lotId);
      if (!lot) throw new Error(`Lote não encontrado: ${item.lotId}`);
      if (!lot.is_active) throw new Error(`Lote "${lot.name}" não está mais disponível`);
      totalAmount += Number(lot.price) * item.quantity;
      lineItems.push({ lotId: lot.id, lotName: lot.name, quantity: item.quantity, price: Number(lot.price) });
    }

    // Trava "1 ingresso por CPF" — só p/ eventos com limite. ANTES de reservar/criar order.
    // Usa supabaseClient (service-role) para a contagem ignorar RLS.
    const ticketLimit = getTicketLimitForEvent(eventId);
    if (ticketLimit !== null) {
      const requestedQty = lineItems.reduce((sum, i) => sum + i.quantity, 0);
      const alreadyHas = await countTicketsForCpf(supabaseClient, eventId, cleanCPF);
      if (alreadyHas + requestedQty > ticketLimit) {
        logStep('CPF ticket limit reached', { eventId, alreadyHas, requestedQty, ticketLimit });
        return json({
          error: ticketLimit === 1
            ? 'Este evento permite apenas 1 ingresso por CPF. Este CPF já possui um ingresso.'
            : `Este evento permite apenas ${ticketLimit} ingressos por CPF. Este CPF já atingiu o limite.`,
          errorCode: 'ticket_limit_reached',
        }, 200);
      }
    }

    // Atomic reservation
    for (const item of lineItems) {
      const { data: reserved, error: rpcErr } = await supabaseClient
        .rpc('reserve_lot_quantity', { _lot_id: item.lotId, _qty: item.quantity });
      if (rpcErr) {
        logStep('Reserve RPC error', { rpcErr });
        throw new Error('Erro ao reservar ingressos');
      }
      if (!reserved) throw new Error(`Quantidade insuficiente para ${item.lotName}`);
      reservedSoFar.push({ lotId: item.lotId, quantity: item.quantity });
    }
    logStep('All lots reserved', { count: reservedSoFar.length });

    // Coupon
    let discountAmount = 0;
    let appliedCouponId: string | null = null;
    if (couponId) {
      const { data: coupon } = await supabaseClient
        .from('event_coupons')
        .select('id, discount_type, discount_value, max_uses, uses_count, valid_until, is_active')
        .eq('id', couponId).eq('event_id', eventId).maybeSingle();
      if (coupon && coupon.is_active &&
          (!coupon.valid_until || new Date(coupon.valid_until).getTime() > Date.now()) &&
          (coupon.max_uses == null || coupon.uses_count < coupon.max_uses)) {
        discountAmount = coupon.discount_type === 'percent'
          ? (totalAmount * Number(coupon.discount_value)) / 100
          : Math.min(Number(coupon.discount_value), totalAmount);
        appliedCouponId = coupon.id;
      }
    }
    const fee = await resolveFee(supabaseClient, eventId, 'card');
    const serviceFee = Math.max(0, Math.round((totalAmount * fee.percent / 100 + fee.fixed) * 100) / 100);
    let finalAmount = Math.max(0.01, totalAmount - discountAmount + serviceFee);

    // Parcelamento "por dentro" (gross-up) sobre o finalAmount já calculado.
    // 2x–12x: repassa o custo do parcelamento ao cliente. 1x fica inalterado.
    if (installments >= 2) {
      finalAmount = Math.round(finalAmount / (1 - PARCELAMENTO_CUSTO[installments]) * 100) / 100;
    }

    const expiresAtIso = new Date(Date.now() + CARD_EXPIRATION_MINUTES * 60 * 1000).toISOString();

    // Create order pending
    const { data: order, error: orderError } = await supabaseClient
      .from('orders')
      .insert({
        event_id: eventId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone || null,
        total_amount: finalAmount,
        discount_amount: discountAmount,
        service_fee_amount: serviceFee,
        coupon_id: appliedCouponId,
        payment_method: 'card',
        status: 'pending',
        user_id: userId,
        customer_cpf: cleanCPF,
        expires_at: expiresAtIso,
      })
      .select().single();

    if (orderError || !order) {
      logStep('Order creation failed', { orderError });
      throw new Error('Erro ao criar pedido');
    }
    logStep('Order created', { orderId: order.id });

    // Create pending tickets
    const ticketsToCreate = lineItems.flatMap(item =>
      Array.from({ length: item.quantity }, () => ({
        event_id: eventId,
        order_id: order.id,
        lot_id: item.lotId,
        holder_name: customerName,
        holder_email: customerEmail,
        holder_phone: customerPhone || null,
        user_id: userId,
        status: 'pending',
      }))
    );

    const { error: ticketsError } = await supabaseClient.from('tickets').insert(ticketsToCreate);
    if (ticketsError) {
      logStep('Tickets creation failed', { ticketsError });
      await supabaseClient.from('orders').delete().eq('id', order.id);
      throw new Error('Erro ao reservar ingressos');
    }

    const marcelBase = Deno.env.get('MARCEL_PIX_BASE');
    if (!marcelBase) throw new Error('MARCEL_PIX_BASE is not set');

    const provResp = await fetch(`${marcelBase}/credit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Number(finalAmount.toFixed(2)),
        parcelas: installments,
        description: `${event.title} - ${lineItems.map(i => `${i.lotName} x${i.quantity}`).join(', ')}`,
        purchaseId: order.id,
        card: {
          holder: card.holder,
          number: card.number,
          expiration: card.expiration,
          cvv: card.cvv,
        },
        customer: {
          name: customerName,
          cpf: cleanCPF,
          email: customerEmail,
        },
      }),
    });
    const prov = await provResp.json();
    logStep('Marcel credit response', { aprovado: prov?.aprovado, transactionId: prov?.transactionId });

    if (prov?.aprovado === true && prov?.transactionId) {
      await supabaseClient
        .from('orders')
        .update({
          provider_transaction_id: String(prov.transactionId),
          provider_authorization_code: prov.authorizationCode || null,
        })
        .eq('id', order.id);

      try {
        await applyOrderApproved(supabaseClient, {
          orderId: order.id,
          mpPaymentId: String(prov.transactionId),
          source: 'confra-card',
        });
      } catch (e: any) {
        logStep('applyOrderApproved error', { e: String(e) });
      }

      reservedSoFar.length = 0;
      return json({ status: 'approved', orderId: order.id });
    } else {
      logStep('Card rejected by Marcel', { message: prov?.message });
      for (const item of lineItems) {
        try {
          await supabaseClient.rpc('release_lot_quantity', { _lot_id: item.lotId, _qty: item.quantity });
        } catch (e) { logStep('Release on rejection failed', { e }); }
      }
      reservedSoFar.length = 0;
      await supabaseClient.from('tickets').update({ status: 'cancelled' }).eq('order_id', order.id).eq('status', 'pending');
      await supabaseClient
        .from('orders')
        .update({ status: 'failed', expires_at: new Date().toISOString() })
        .eq('id', order.id);
      return json({ error: 'Pagamento não aprovado', status: 'rejected', orderId: order.id });
    }
  } catch (error: any) {
    logStep('ERROR', { message: error.message });

    if (supabaseClient && reservedSoFar.length > 0) {
      for (const r of reservedSoFar) {
        try {
          await supabaseClient.rpc('release_lot_quantity', { _lot_id: r.lotId, _qty: r.quantity });
        } catch (e) { logStep('Failed to release reservation', { lotId: r.lotId, e }); }
      }
    }

    return json({ error: error.message }, 500);
  }
});
