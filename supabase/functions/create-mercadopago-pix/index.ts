import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CartItem { lotId: string; quantity: number; }
interface PixRequest {
  eventId: string;
  items: CartItem[];
  customerName: string;
  customerEmail: string;
  customerCPF: string;
  customerPhone?: string;
  couponId?: string;
}

const PIX_EXPIRATION_MINUTES = 30;

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-MERCADOPAGO-PIX] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Track reservations made so we can release them on any failure path.
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

    const { eventId, items, customerName, customerEmail, customerCPF, customerPhone, couponId } = await req.json() as PixRequest;
    logStep('Request received', { eventId, itemsCount: items.length, customerEmail });

    // Validate event
    const { data: event, error: eventError } = await supabaseClient
      .from('events')
      .select('id, title, status')
      .eq('id', eventId)
      .single();

    if (eventError || !event) throw new Error('Evento não encontrado');
    if (event.status !== 'published') throw new Error('Evento não está disponível para vendas');

    // Validate lots and prices
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

    // ATOMIC RESERVATION — must succeed for all items
    for (const item of lineItems) {
      const { data: reserved, error: rpcErr } = await supabaseClient
        .rpc('reserve_lot_quantity', { _lot_id: item.lotId, _qty: item.quantity });
      if (rpcErr) {
        logStep('Reserve RPC error', { rpcErr });
        throw new Error('Erro ao reservar ingressos');
      }
      if (!reserved) {
        throw new Error(`Quantidade insuficiente para ${item.lotName}`);
      }
      reservedSoFar.push({ lotId: item.lotId, quantity: item.quantity });
    }
    logStep('All lots reserved', { count: reservedSoFar.length });

    // Apply coupon
    let discountAmount = 0;
    let appliedCouponId: string | null = null;
    if (couponId) {
      const { data: coupon } = await supabaseClient
        .from('event_coupons')
        .select('id, discount_type, discount_value, max_uses, uses_count, valid_until, is_active, event_id')
        .eq('id', couponId)
        .eq('event_id', eventId)
        .maybeSingle();
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

    const expiresAtIso = new Date(Date.now() + PIX_EXPIRATION_MINUTES * 60 * 1000).toISOString();

    // Create order
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
        payment_method: 'pix',
        status: 'pending',
        user_id: userId,
        expires_at: expiresAtIso,
      })
      .select()
      .single();

    if (orderError || !order) {
      logStep('Order creation failed', { orderError });
      throw new Error('Erro ao criar pedido');
    }
    logStep('Order created', { orderId: order.id });

    // Create tickets pending
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

    // Clean CPF
    const cleanCPF = customerCPF.replace(/\D/g, '');

    // Create PIX at MP
    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mercadopagoToken}`,
        'X-Idempotency-Key': order.id,
      },
      body: JSON.stringify({
        transaction_amount: finalAmount,
        description: `${event.title} - ${lineItems.map(i => `${i.lotName} x${i.quantity}`).join(', ')}`,
        payment_method_id: 'pix',
        payer: {
          email: customerEmail,
          first_name: customerName.split(' ')[0],
          last_name: customerName.split(' ').slice(1).join(' ') || customerName.split(' ')[0],
          identification: { type: 'CPF', number: cleanCPF },
        },
        external_reference: order.id,
      }),
    });

    if (!mpResponse.ok) {
      const mpError = await mpResponse.json();
      logStep('Mercado Pago error', mpError);
      await supabaseClient.from('tickets').delete().eq('order_id', order.id);
      await supabaseClient.from('orders').delete().eq('id', order.id);
      throw new Error(mpError.message || 'Erro ao criar pagamento PIX');
    }

    const mpPayment = await mpResponse.json();
    logStep('Mercado Pago payment created', { paymentId: mpPayment.id, status: mpPayment.status });

    const pixInfo = mpPayment.point_of_interaction?.transaction_data;

    await supabaseClient
      .from('orders')
      .update({
        payment_method: `pix:${mpPayment.id}`,
        mp_payment_id: String(mpPayment.id),
      })
      .eq('id', order.id);

    const expiresAt = pixInfo?.expiration_date || expiresAtIso;

    // Success — DO NOT release reservations (they will be confirmed on payment).
    reservedSoFar.length = 0;

    return new Response(
      JSON.stringify({
        success: true,
        orderId: order.id,
        pixCode: pixInfo?.qr_code || '',
        qrCodeBase64: pixInfo?.qr_code_base64 || '',
        expiresAt,
        paymentId: mpPayment.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    logStep('ERROR', { message: error.message });

    // Release any reservations made before the failure
    if (supabaseClient && reservedSoFar.length > 0) {
      for (const r of reservedSoFar) {
        try {
          await supabaseClient.rpc('release_lot_quantity', { _lot_id: r.lotId, _qty: r.quantity });
        } catch (e) {
          logStep('Failed to release reservation', { lotId: r.lotId, e });
        }
      }
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
