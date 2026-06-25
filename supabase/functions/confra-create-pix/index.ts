import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { validateCPF, unformatCPF } from "../_shared/cpf.ts";
import { getTicketLimitForEvent, countTicketsForCpf } from "../_shared/event-ticket-limits.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-meli-session-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
  deviceId?: string;
}

const PIX_EXPIRATION_MINUTES = 30;
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
  console.log(`[CONFRA-CREATE-PIX] ${step}${detailsStr}`);
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

    // Auth required (verify_jwt=true at platform level + in-code claims check)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const token = authHeader.replace('Bearer ', '');

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      logStep('Auth failed', { userErr: userErr?.message });
      return json({ error: 'Unauthorized' }, 401);
    }
    const userId: string = userData.user.id;

    supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const { eventId, items, customerName, customerEmail, customerCPF, customerPhone, couponId, deviceId } = await req.json() as PixRequest;

    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      null;

    logStep('Request received', { eventId, itemsCount: items?.length, customerEmail, userId, hasDeviceId: !!deviceId, hasIp: !!clientIp });

    // CPF gate BEFORE any reservation
    const cleanCPF = unformatCPF(customerCPF);
    if (!validateCPF(cleanCPF)) {
      return json({ error: 'invalid_cpf', message: 'CPF inválido. Verifique e tente novamente.' }, 400);
    }

    if (!eventId || !Array.isArray(items) || items.length === 0) {
      return json({ error: 'invalid_request' }, 400);
    }

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
    const fee = await resolveFee(supabaseClient, eventId, 'pix');
    const serviceFee = Math.max(0, Math.round((totalAmount * fee.percent / 100 + fee.fixed) * 100) / 100);
    const finalAmount = Math.max(0.01, totalAmount - discountAmount + serviceFee);

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
        service_fee_amount: serviceFee,
        coupon_id: appliedCouponId,
        payment_method: 'pix',
        status: 'pending',
        user_id: userId,
        customer_cpf: cleanCPF,
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

    // ===== Chamada ao provedor (Marcel) — PIX =====
    const marcelBase = Deno.env.get('MARCEL_PIX_BASE');
    if (!marcelBase) throw new Error('MARCEL_PIX_BASE is not set');

    const provResp = await fetch(`${marcelBase}/pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Number(finalAmount.toFixed(2)),
        description: `${event.title} - ${lineItems.map(i => `${i.lotName} x${i.quantity}`).join(', ')}`,
        purchaseId: order.id,
        customer: {
          name: customerName,
          cpf: cleanCPF,
          phone: customerPhone || undefined,
          email: customerEmail,
        },
      }),
    });

    if (!provResp.ok) {
      logStep('Marcel PIX error', { httpStatus: provResp.status });
      await supabaseClient.from('tickets').delete().eq('order_id', order.id);
      await supabaseClient.from('orders').delete().eq('id', order.id);
      throw new Error('Erro ao criar pagamento PIX');
    }

    const prov = await provResp.json();
    if (!prov?.transactionId || !prov?.pixCode) {
      logStep('Marcel PIX invalid response', { prov });
      await supabaseClient.from('tickets').delete().eq('order_id', order.id);
      await supabaseClient.from('orders').delete().eq('id', order.id);
      throw new Error('Erro ao criar pagamento PIX');
    }
    logStep('Marcel PIX created', { transactionId: prov.transactionId });

    await supabaseClient
      .from('orders')
      .update({
        provider_transaction_id: String(prov.transactionId),
        provider_pix_code: prov.pixCode,
      })
      .eq('id', order.id);

    reservedSoFar.length = 0;

    return json({
      success: true,
      orderId: order.id,
      pixCode: prov.pixCode,
      expiresAt: expiresAtIso,
      amount: finalAmount,
      serviceFeeAmount: serviceFee,
    });
  } catch (error: any) {
    logStep('ERROR', { message: error.message });

    if (supabaseClient && reservedSoFar.length > 0) {
      for (const r of reservedSoFar) {
        try {
          await supabaseClient.rpc('release_lot_quantity', { _lot_id: r.lotId, _qty: r.quantity });
        } catch (e) {
          logStep('Failed to release reservation', { lotId: r.lotId, e });
        }
      }
    }

    return json({ error: error.message }, 500);
  }
});
