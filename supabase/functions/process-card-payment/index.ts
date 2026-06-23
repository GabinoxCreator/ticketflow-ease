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
  cardToken: string;
  paymentMethodId: string;
  issuerId: string;
  installments: number;
  couponId?: string;
  deviceId?: string;
}


const CARD_EXPIRATION_MINUTES = 20;
const DEFAULT_FEE_PERCENT = 10;

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
  console.log(`[PROCESS-CARD-PAYMENT] ${step}${detailsStr}`);
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

    const mercadopagoToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!mercadopagoToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN is not set');

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
            cardToken, paymentMethodId, issuerId, installments, couponId, deviceId } = body;

    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      null;

    logStep('Request received', { eventId, itemsCount: items?.length, customerEmail, paymentMethodId, userId, hasDeviceId: !!deviceId, hasIp: !!clientIp });


    // CPF gate BEFORE any reservation
    const cleanCPF = unformatCPF(customerCPF);
    if (!validateCPF(cleanCPF)) {
      return json({ error: 'invalid_cpf', message: 'CPF inválido. Verifique e tente novamente.' }, 400);
    }

    if (!eventId || !Array.isArray(items) || items.length === 0 || !cardToken) {
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
    const finalAmount = Math.max(0.01, totalAmount - discountAmount + serviceFee);

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

    // Split name and phone for MP antifraud
    const nameParts = (customerName || '').trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || 'Cliente';
    const lastName = nameParts.slice(1).join(' ') || firstName;

    const phoneDigits = (customerPhone || '').replace(/\D/g, '');
    const localDigits = phoneDigits.length >= 12 && phoneDigits.startsWith('55')
      ? phoneDigits.slice(2)
      : phoneDigits;
    const areaCode = localDigits.length >= 10 ? localDigits.slice(0, 2) : '';
    const phoneNumber = localDigits.length >= 10 ? localDigits.slice(2) : '';
    const phoneObj = (areaCode && phoneNumber) ? { area_code: areaCode, number: phoneNumber } : null;

    // Process card via MP
    const mpBody: any = {
      transaction_amount: Number(finalAmount.toFixed(2)),
      token: cardToken,
      description: `${event.title} - ${lineItems.map(i => `${i.lotName} x${i.quantity}`).join(', ')}`,
      installments,
      payment_method_id: paymentMethodId,
      statement_descriptor: 'FESTPAG',
      notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mercadopago-webhook`,
      external_reference: order.id,
      payer: {
        email: customerEmail,
        first_name: firstName,
        last_name: lastName,
        identification: { type: 'CPF', number: cleanCPF },
        ...(phoneObj ? { phone: phoneObj } : {}),
      },
      additional_info: {
        ip_address: clientIp,
        items: lineItems.map(i => ({
          id: i.lotId,
          title: i.lotName,
          description: `${event.title} - ${i.lotName}`,
          category_id: 'tickets',
          quantity: i.quantity,
          unit_price: Number(i.price.toFixed(2)),
        })),
        payer: {
          first_name: firstName,
          last_name: lastName,
          registration_date: new Date().toISOString(),
          ...(phoneObj ? { phone: phoneObj } : {}),
        },
      },
    };
    if (issuerId) mpBody.issuer_id = parseInt(issuerId);

    const mpHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mercadopagoToken}`,
      'X-Idempotency-Key': `card-${order.id}`,
    };
    if (deviceId) mpHeaders['X-meli-session-id'] = deviceId;

    logStep('MP request enriched', {
      hasDeviceId: !!deviceId,
      hasIp: !!clientIp,
      hasPhone: !!phoneObj,
      hasNotificationUrl: true,
    });

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: mpHeaders,
      body: JSON.stringify(mpBody),
    });
    const mpPayment = await mpResponse.json();
    logStep('MP payment response', { status: mpPayment.status, statusDetail: mpPayment.status_detail, id: mpPayment.id });


    if (mpPayment.status === 'approved') {
      // Persist mp_payment_id BEFORE reconciliation so RPC can find it
      await supabaseClient
        .from('orders')
        .update({ mp_payment_id: String(mpPayment.id), mp_status_detail: mpPayment.status_detail || null })
        .eq('id', order.id);


      // Centralised, transactional reconciliation
      let reconciled = false;
      try {
        await applyOrderApproved(supabaseClient, {
          orderId: order.id,
          mpPaymentId: String(mpPayment.id),
          source: 'card_inline',
        });
        reconciled = true;
      } catch (e: any) {
        logStep('applyOrderApproved error', { e: String(e) });
        // Do not claim "approved" to the client; webhook/polling will reconcile.
      }

      reservedSoFar.length = 0;

      if (reconciled) {
        return json({ status: 'approved', orderId: order.id, paymentId: mpPayment.id });
      }
      // Approved at MP but local reconciliation pending — treat as in_process for UX safety
      return json({ status: 'in_process', orderId: order.id, paymentId: mpPayment.id, reconciliation: 'pending' });
    } else if (mpPayment.status === 'in_process' || mpPayment.status === 'pending') {
      await supabaseClient
        .from('orders')
        .update({ mp_payment_id: String(mpPayment.id), mp_status_detail: mpPayment.status_detail || null })
        .eq('id', order.id);


      reservedSoFar.length = 0;

      return json({ status: 'in_process', orderId: order.id, paymentId: mpPayment.id });
    } else {
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
          mp_payment_id: mpPayment.id ? String(mpPayment.id) : null,
          mp_status_detail: mpPayment.status_detail || null,
          expires_at: new Date().toISOString(),
        })

        .eq('id', order.id);

      return json({
        error: 'Pagamento não aprovado',
        errorCode: mpPayment.status_detail || 'unknown',
        status: 'rejected',
        orderId: order.id,
      });
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
