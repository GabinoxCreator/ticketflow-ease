import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendOrderConfirmationEmailSafe } from "../_shared/orderConfirmationEmail.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CartItem { lotId: string; quantity: number; }

interface CardPaymentRequest {
  eventId: string;
  items: CartItem[];
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerCPF: string;
  cardToken: string;
  paymentMethodId: string;
  issuerId: string;
  installments: number;
  couponId?: string;
}

const CARD_EXPIRATION_MINUTES = 20;

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[PROCESS-CARD-PAYMENT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const reservedSoFar: Array<{ lotId: string; quantity: number }> = [];
  let supabaseClient: any = null;

  try {
    logStep('Function started');

    const mercadopagoToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!mercadopagoToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN is not set');

    supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const body = await req.json() as CardPaymentRequest;
    const { eventId, items, customerName, customerEmail, customerPhone, customerCPF,
            cardToken, paymentMethodId, issuerId, installments, couponId } = body;

    logStep('Request received', { eventId, itemsCount: items.length, customerEmail, paymentMethodId });

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
    const finalAmount = Math.max(0.01, totalAmount - discountAmount);

    // Auth (optional)
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: userData } = await supabaseClient.auth.getUser(token);
      userId = userData.user?.id || null;
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
        coupon_id: appliedCouponId,
        payment_method: 'card',
        status: 'pending',
        user_id: userId,
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

    // Process card via MP
    const mpBody: any = {
      transaction_amount: finalAmount,
      token: cardToken,
      description: `${event.title} - ${lineItems.map(i => `${i.lotName} x${i.quantity}`).join(', ')}`,
      installments,
      payment_method_id: paymentMethodId,
      payer: { email: customerEmail, identification: { type: 'CPF', number: customerCPF } },
      external_reference: order.id,
    };
    if (issuerId) mpBody.issuer_id = parseInt(issuerId);

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mercadopagoToken}`,
        'X-Idempotency-Key': `card-${order.id}`,
      },
      body: JSON.stringify(mpBody),
    });
    const mpPayment = await mpResponse.json();
    logStep('MP payment response', { status: mpPayment.status, statusDetail: mpPayment.status_detail, id: mpPayment.id });

    if (mpPayment.status === 'approved') {
      // Confirm sale atomically per lot
      let allConfirmed = true;
      for (const item of lineItems) {
        const { data: ok, error: confErr } = await supabaseClient
          .rpc('confirm_lot_sale', { _lot_id: item.lotId, _qty: item.quantity });
        if (confErr || !ok) {
          allConfirmed = false;
          logStep('confirm_lot_sale FAILED — possible double-confirm or missing reservation', { lotId: item.lotId, qty: item.quantity, confErr });
        }
      }

      // Mark order paid + tickets valid (idempotent)
      await supabaseClient
        .from('orders')
        .update({
          status: 'paid',
          payment_method: `card:${mpPayment.id}`,
          mp_payment_id: String(mpPayment.id),
          expires_at: null,
        })
        .eq('id', order.id);
      await supabaseClient
        .from('tickets')
        .update({ status: 'valid' })
        .eq('order_id', order.id);

      // Reservations are now consumed by confirm_lot_sale
      reservedSoFar.length = 0;

      // Coupon increment
      if (appliedCouponId) {
        const { data: c } = await supabaseClient
          .from('event_coupons').select('uses_count').eq('id', appliedCouponId).maybeSingle();
        if (c) {
          await supabaseClient.from('event_coupons')
            .update({ uses_count: (c.uses_count || 0) + 1 })
            .eq('id', appliedCouponId);
        }
      }

      if (!allConfirmed) {
        logStep('Order paid but inventory mismatch detected — manual review needed', { orderId: order.id });
      }

      // Post-payment confirmation email — awaited but never throws.
      try {
        const emailResult = await sendOrderConfirmationEmailSafe(supabaseClient, {
          orderId: order.id,
          source: 'card_inline',
        });
        logStep('order_email_result', emailResult);
      } catch (e) {
        // Defensive: helper should never throw, but never let email break payment.
        logStep('order_email_unexpected', { e: String(e) });
      }

      return new Response(
        JSON.stringify({ status: 'approved', orderId: order.id, paymentId: mpPayment.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    } else if (mpPayment.status === 'in_process' || mpPayment.status === 'pending') {
      // Payment in review
      await supabaseClient
        .from('orders')
        .update({
          payment_method: `card:${mpPayment.id}`,
          mp_payment_id: String(mpPayment.id),
        })
        .eq('id', order.id);

      // Don't release — order remains pending with reservation alive
      reservedSoFar.length = 0;

      return new Response(
        JSON.stringify({ status: 'in_process', orderId: order.id, paymentId: mpPayment.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    } else {
      // Rejected — release stock, mark order as failed (preserve traceability), delete tickets
      logStep('Payment rejected', { statusDetail: mpPayment.status_detail });

      for (const item of lineItems) {
        try {
          await supabaseClient.rpc('release_lot_quantity', { _lot_id: item.lotId, _qty: item.quantity });
        } catch (e) { logStep('Release on rejection failed', { e }); }
      }
      reservedSoFar.length = 0;

      await supabaseClient.from('tickets').update({ status: 'cancelled' }).eq('order_id', order.id).eq('status', 'pending');
      await supabaseClient
        .from('orders')
        .update({
          status: 'failed',
          payment_method: `card:${mpPayment.id || 'unknown'}`,
          mp_payment_id: mpPayment.id ? String(mpPayment.id) : null,
          expires_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      return new Response(
        JSON.stringify({
          error: 'Pagamento não aprovado',
          errorCode: mpPayment.status_detail || 'unknown',
          status: 'rejected',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
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

    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
