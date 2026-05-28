// PIX checkout para MESA (event_seats).
// Caminho único de promoção: SOMENTE o webhook promove order pending→paid e
// seats held→sold (apply_order_approved). Esta edge nunca chama applyOrderApproved.
//
// 3 saídas:
//  - RPC create_seat_order falha → 4xx, sem release (order não existe).
//  - MP POST !ok (veredito explícito) → release_seats_for_order + tickets cancelled
//    + orders failed + 4xx.
//  - MP POST ok com PIX → persiste mp_payment_id/status_detail e responde.
//  - Exceção ambígua pós-POST (timeout/parse) → NÃO solta nada; 502; webhook resolve.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { validateCPF, unformatCPF } from "../_shared/cpf.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-meli-session-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface SeatInput { seatId: string; addons?: number }
interface PixSeatRequest {
  eventId: string;
  holdToken: string;
  seats: SeatInput[];
  customerName: string;
  customerEmail: string;
  customerCPF: string;
  customerPhone?: string;
  deviceId?: string;
}

const PIX_WINDOW = '00:15:00';
const DEFAULT_FEE_PERCENT = 10;

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-SEAT-PIX] ${step}${detailsStr}`);
};

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

// Mapeia códigos do create_seat_order para resposta HTTP.
// honest = erro que usuário comum vê (toast claro).
// manipulation = erro só atingível por payload manipulado → resposta genérica + log.
function mapSeatOrderError(message: string): { code: string; kind: 'honest' | 'manipulation' | 'already_in_progress' | 'unknown'; httpStatus: number } {
  const m = (message || '').toLowerCase();
  if (m.includes('hold_expired')) return { code: 'hold_expired', kind: 'honest', httpStatus: 409 };
  if (m.includes('seat_not_held')) return { code: 'seat_not_held', kind: 'honest', httpStatus: 409 };
  if (m.includes('seat_not_found')) return { code: 'seat_not_found', kind: 'honest', httpStatus: 409 };
  if (m.includes('addons_exceed_max')) return { code: 'addons_exceed_max', kind: 'manipulation', httpStatus: 422 };
  if (m.includes('seat_not_yours')) return { code: 'seat_not_yours', kind: 'manipulation', httpStatus: 422 };
  if (m.includes('invalid_hold_token')) return { code: 'invalid_hold_token', kind: 'manipulation', httpStatus: 422 };
  if (m.includes('order_already_in_progress')) return { code: 'order_already_in_progress', kind: 'already_in_progress', httpStatus: 200 };
  return { code: 'create_seat_order_failed', kind: 'unknown', httpStatus: 500 };
}

async function findExistingSeatOrder(supabase: any, eventId: string, userId: string, holdToken: string) {
  const { data: seatRows, error: seatError } = await supabase
    .from('event_seats')
    .select('order_id, hold_expires_at')
    .eq('event_id', eventId)
    .eq('held_by_user_id', userId)
    .eq('hold_token', holdToken)
    .eq('status', 'held')
    .not('order_id', 'is', null);

  if (seatError || !seatRows?.length) return null;

  const orderIds = [...new Set(seatRows.map((row: any) => row.order_id).filter(Boolean))];
  if (orderIds.length !== 1) return null;

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, total_amount, service_fee_amount, mp_payment_id, expires_at, status, payment_method')
    .eq('id', orderIds[0])
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .eq('payment_method', 'pix')
    .maybeSingle();

  if (orderError || !order) return null;

  return {
    orderId: order.id,
    amount: Number(order.total_amount || 0),
    serviceFee: Number(order.service_fee_amount || 0),
    paymentId: order.mp_payment_id ? String(order.mp_payment_id) : null,
    holdExpiresAt: seatRows.map((row: any) => row.hold_expires_at).filter(Boolean).sort().pop() || order.expires_at || null,
  };
}

async function fetchExistingPixPayment(mercadopagoToken: string, paymentId: string) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${mercadopagoToken}` },
  });
  if (!response.ok) return null;
  return await response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    logStep('Function started');

    const mercadopagoToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!mercadopagoToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN is not set');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const body = await req.json() as PixSeatRequest;
    const { eventId, holdToken, seats, customerName, customerEmail, customerCPF, customerPhone, deviceId } = body;

    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      null;

    if (!eventId || !holdToken || !Array.isArray(seats) || seats.length === 0) {
      return json({ error: 'invalid_request' }, 400);
    }

    const cleanCPF = unformatCPF(customerCPF);
    if (!validateCPF(cleanCPF)) {
      return json({ error: 'invalid_cpf', message: 'CPF inválido. Verifique e tente novamente.' }, 400);
    }

    // Event sanity
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, status')
      .eq('id', eventId)
      .single();
    if (eventError || !event) return json({ error: 'event_not_found' }, 404);
    if (event.status !== 'published') return json({ error: 'event_not_available' }, 409);

    // Fee (fonte única)
    const { data: feeRow } = await supabase.rpc('get_event_fee', { _event_id: eventId, _method: 'pix' });
    const feePercent = feeRow?.[0]?.fee_percent != null ? Number(feeRow[0].fee_percent) : DEFAULT_FEE_PERCENT;
    const feeFixed = feeRow?.[0]?.fee_fixed != null ? Number(feeRow[0].fee_fixed) : 0;

    // --- TRY #1: RPC create_seat_order ---
    // Falha aqui = sem order. NÃO chamar release (não há nada criado).
    let orderId: string;
    let amount: number;
    let serviceFee: number;
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('create_seat_order', {
        _event_id: eventId,
        _user_id: userId,
        _hold_token: holdToken,
        _seats: seats.map(s => ({ seat_id: s.seatId, addons: Math.max(0, Number(s.addons || 0)) })),
        _fee_percent: feePercent,
        _fee_fixed: feeFixed,
        _customer_name: customerName,
        _customer_email: customerEmail,
        _customer_cpf: cleanCPF,
        _customer_phone: customerPhone || null,
        _payment_method: 'pix',
        _window: PIX_WINDOW,
      });

      if (rpcErr) {
        const mapped = mapSeatOrderError(rpcErr.message || '');
        logStep('create_seat_order failed', { code: mapped.code, kind: mapped.kind, raw: rpcErr.message });
        if (mapped.kind === 'already_in_progress') {
          const existing = await findExistingSeatOrder(supabase, eventId, userId, holdToken);
          if (existing?.paymentId) {
            const existingPayment = await fetchExistingPixPayment(mercadopagoToken, existing.paymentId).catch(() => null);
            const pixInfo = existingPayment?.point_of_interaction?.transaction_data;
            if (pixInfo?.qr_code) {
              return json({
                success: true,
                resumed: true,
                orderId: existing.orderId,
                pixCode: pixInfo.qr_code,
                qrCodeBase64: pixInfo.qr_code_base64 || '',
                expiresAt: pixInfo.expiration_date || existing.holdExpiresAt,
                holdExpiresAt: existing.holdExpiresAt,
                paymentId: existing.paymentId,
                amount: existing.amount,
                serviceFeeAmount: existing.serviceFee,
              });
            }
            return json({
              error: 'payment_already_started',
              orderId: existing.orderId,
              paymentId: existing.paymentId,
              holdExpiresAt: existing.holdExpiresAt,
              amount: existing.amount,
              serviceFeeAmount: existing.serviceFee,
            });
          }
          return json({ error: 'payment_already_started', orderId: existing?.orderId ?? null, holdExpiresAt: existing?.holdExpiresAt ?? null });
        }
        if (mapped.kind === 'manipulation' || mapped.kind === 'unknown') {
          return json({ error: 'payment_failed', message: 'Não foi possível processar. Tente novamente.' });
        }
        return json({ error: mapped.code });
      }

      orderId = rpcData.order_id;
      amount = Number(rpcData.total);
      serviceFee = Number(rpcData.service_fee);
      logStep('Seat order created', { orderId, amount, serviceFee });
    } catch (e: any) {
      const mapped = mapSeatOrderError(e?.message || '');
      logStep('create_seat_order exception', { code: mapped.code, raw: e?.message });
      if (mapped.kind === 'already_in_progress') {
        const existing = await findExistingSeatOrder(supabase, eventId, userId, holdToken);
        if (existing?.paymentId) {
          const existingPayment = await fetchExistingPixPayment(mercadopagoToken, existing.paymentId).catch(() => null);
          const pixInfo = existingPayment?.point_of_interaction?.transaction_data;
          if (pixInfo?.qr_code) {
            return json({
              success: true,
              resumed: true,
              orderId: existing.orderId,
              pixCode: pixInfo.qr_code,
              qrCodeBase64: pixInfo.qr_code_base64 || '',
              expiresAt: pixInfo.expiration_date || existing.holdExpiresAt,
              holdExpiresAt: existing.holdExpiresAt,
              paymentId: existing.paymentId,
              amount: existing.amount,
              serviceFeeAmount: existing.serviceFee,
            });
          }
          return json({
            error: 'payment_already_started',
            orderId: existing.orderId,
            paymentId: existing.paymentId,
            holdExpiresAt: existing.holdExpiresAt,
            amount: existing.amount,
            serviceFeeAmount: existing.serviceFee,
          });
        }
        return json({ error: 'payment_already_started', orderId: existing?.orderId ?? null, holdExpiresAt: existing?.holdExpiresAt ?? null });
      }
      if (mapped.kind === 'manipulation' || mapped.kind === 'unknown') {
        return json({ error: 'payment_failed', message: 'Não foi possível processar. Tente novamente.' });
      }
      return json({ error: mapped.code });
    }

    // Lê hold_expires_at autoritativo (estendido pra janela do método)
    let holdExpiresAt: string | null = null;
    try {
      const { data: seatRows } = await supabase
        .from('event_seats')
        .select('hold_expires_at')
        .eq('order_id', orderId);
      if (seatRows && seatRows.length) {
        const max = seatRows
          .map((r: any) => r.hold_expires_at)
          .filter(Boolean)
          .sort()
          .pop();
        holdExpiresAt = max ?? null;
      }
    } catch (e: any) {
      logStep('hold_expires_at read failed (non-fatal)', { msg: e?.message });
    }


    // --- TRY #2: MP POST ---
    // Antifraude
    const nameParts = (customerName || '').trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || 'Cliente';
    const lastName = nameParts.slice(1).join(' ') || firstName;
    const phoneDigits = (customerPhone || '').replace(/\D/g, '');
    const localDigits = phoneDigits.length >= 12 && phoneDigits.startsWith('55') ? phoneDigits.slice(2) : phoneDigits;
    const areaCode = localDigits.length >= 10 ? localDigits.slice(0, 2) : '';
    const phoneNumber = localDigits.length >= 10 ? localDigits.slice(2) : '';
    const phoneObj = (areaCode && phoneNumber) ? { area_code: areaCode, number: phoneNumber } : null;

    const mpBody: any = {
      transaction_amount: Number(amount.toFixed(2)),
      description: `${event.title} - Mesa (${seats.length} ${seats.length === 1 ? 'mesa' : 'mesas'})`,
      payment_method_id: 'pix',
      statement_descriptor: 'FESTPAG',
      notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mercadopago-webhook`,
      external_reference: orderId,
      payer: {
        email: customerEmail,
        first_name: firstName,
        last_name: lastName,
        identification: { type: 'CPF', number: cleanCPF },
        ...(phoneObj ? { phone: phoneObj } : {}),
      },
      additional_info: {
        ip_address: clientIp,
        items: [{
          id: orderId,
          title: `${event.title} - Mesa`,
          description: `Reserva de mesa para ${event.title}`,
          category_id: 'tickets',
          quantity: 1,
          unit_price: Number(amount.toFixed(2)),
        }],
        payer: {
          first_name: firstName,
          last_name: lastName,
          registration_date: new Date().toISOString(),
          ...(phoneObj ? { phone: phoneObj } : {}),
        },
      },
    };

    const mpHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mercadopagoToken}`,
      'X-Idempotency-Key': orderId,
    };
    if (deviceId) mpHeaders['X-meli-session-id'] = deviceId;

    let mpResponse: Response;
    try {
      mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: mpHeaders,
        body: JSON.stringify(mpBody),
      });
    } catch (e: any) {
      // Exceção AMBÍGUA pós-POST: pagamento pode ter sido criado mesmo sem resposta.
      // NÃO solta seat — sweeper/webhook resolve quando vier o veredito.
      logStep('MP POST network exception', { msg: e?.message });
      return json({ error: 'payment_provider_unreachable', orderId });
    }

    if (!mpResponse.ok) {
      // Veredito explícito de falha pré-pagamento: pode soltar.
      let mpError: any = {};
      try { mpError = await mpResponse.json(); } catch (_) {}
      logStep('MP POST !ok — releasing', { status: mpResponse.status, statusDetail: mpError.status_detail });

      try {
        await supabase.from('orders').update({
          status: 'failed',
          mp_status_detail: mpError.status_detail || mpError.message || 'pix_create_failed',
          expires_at: new Date().toISOString(),
        }).eq('id', orderId);
        await supabase.from('tickets').update({ status: 'cancelled' }).eq('order_id', orderId).eq('status', 'pending');
        await supabase.rpc('release_seats_for_order', { _order_id: orderId });
      } catch (relErr: any) {
        logStep('release after MP !ok failed', { msg: relErr?.message });
      }

      return json({ error: 'payment_failed', message: 'Não foi possível processar. Tente novamente.', errorCode: mpError.status_detail || 'unknown' });
    }

    let mpPayment: any;
    try {
      mpPayment = await mpResponse.json();
    } catch (e: any) {
      // Parse ambíguo. NÃO solta seat.
      logStep('MP response parse error', { msg: e?.message });
      return json({ error: 'payment_provider_unreachable', orderId });
    }

    const pixInfo = mpPayment.point_of_interaction?.transaction_data;
    logStep('MP payment created', { paymentId: mpPayment.id, status: mpPayment.status });

    await supabase
      .from('orders')
      .update({
        mp_payment_id: String(mpPayment.id),
        mp_status_detail: mpPayment.status_detail || null,
      })
      .eq('id', orderId);

    return json({
      success: true,
      orderId,
      pixCode: pixInfo?.qr_code || '',
      qrCodeBase64: pixInfo?.qr_code_base64 || '',
      expiresAt: pixInfo?.expiration_date || holdExpiresAt,
      holdExpiresAt,
      paymentId: mpPayment.id,
      amount,
      serviceFeeAmount: serviceFee,
    });
  } catch (error: any) {
    // Catch externo: erro pré-RPC (validação, auth, etc.). Nenhum side effect criado.
    console.error('[CREATE-SEAT-PIX] UNHANDLED', error);
    return json({ error: 'payment_failed', message: 'Não foi possível processar. Tente novamente.' });
  }
});
