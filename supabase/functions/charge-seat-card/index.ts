// redeploy 2026-07-07 — force redeploy
// Cartão checkout para MESA (event_seats).
// Caminho único de promoção: SOMENTE webhook promove order→paid e seats→sold.
// Esta edge NUNCA chama applyOrderApproved, mesmo em approved.
//
// 3 saídas do MP:
//  - approved   → persiste mp_payment_id/status_detail. Responde
//                 'approved_pending_confirmation'. Webhook promove.
//  - in_process | pending | in_review → persiste e responde 'in_process'.
//  - rejected   → release_seats_for_order + tickets cancelled + orders failed.
//
// Exceções ambíguas pós-POST (timeout/parse): NÃO solta nada. 502. Webhook resolve.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { validateCPF, unformatCPF } from "../_shared/cpf.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-meli-session-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface SeatInput { seatId: string; addons?: number }
interface CardSeatRequest {
  eventId: string;
  holdToken: string;
  seats: SeatInput[];
  customerName: string;
  customerEmail: string;
  customerCPF: string;
  customerPhone?: string;
  cardToken: string;
  paymentMethodId: string;
  issuerId?: string;
  installments: number;
  deviceId?: string;
}

const CARD_WINDOW = '00:20:00';
const DEFAULT_FEE_PERCENT = 10;

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHARGE-SEAT-CARD] ${step}${detailsStr}`);
};

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

function mapSeatOrderError(message: string): { code: string; kind: 'honest' | 'manipulation' | 'unknown'; httpStatus: number } {
  const m = (message || '').toLowerCase();
  if (m.includes('hold_expired')) return { code: 'hold_expired', kind: 'honest', httpStatus: 409 };
  if (m.includes('seat_not_held')) return { code: 'seat_not_held', kind: 'honest', httpStatus: 409 };
  if (m.includes('seat_not_found')) return { code: 'seat_not_found', kind: 'honest', httpStatus: 409 };
  if (m.includes('addons_exceed_max')) return { code: 'addons_exceed_max', kind: 'manipulation', httpStatus: 422 };
  if (m.includes('seat_not_yours')) return { code: 'seat_not_yours', kind: 'manipulation', httpStatus: 422 };
  if (m.includes('invalid_hold_token')) return { code: 'invalid_hold_token', kind: 'manipulation', httpStatus: 422 };
  if (m.includes('order_already_in_progress')) return { code: 'order_already_in_progress', kind: 'manipulation', httpStatus: 422 };
  return { code: 'create_seat_order_failed', kind: 'unknown', httpStatus: 500 };
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

    const body = await req.json() as CardSeatRequest;
    const {
      eventId, holdToken, seats,
      customerName, customerEmail, customerCPF, customerPhone,
      cardToken, paymentMethodId, issuerId, installments, deviceId,
    } = body;

    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      null;

    if (!eventId || !holdToken || !Array.isArray(seats) || seats.length === 0 || !cardToken || !paymentMethodId || !installments) {
      return json({ error: 'invalid_request' }, 400);
    }

    const cleanCPF = unformatCPF(customerCPF);
    if (!validateCPF(cleanCPF)) {
      return json({ error: 'invalid_cpf', message: 'CPF inválido.' }, 400);
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, status')
      .eq('id', eventId)
      .single();
    if (eventError || !event) return json({ error: 'event_not_found' }, 404);
    if (event.status !== 'published') return json({ error: 'event_not_available' }, 409);

    const { data: feeRow } = await supabase.rpc('get_event_fee', { _event_id: eventId, _method: 'card' });
    const feePercent = feeRow?.[0]?.fee_percent != null ? Number(feeRow[0].fee_percent) : DEFAULT_FEE_PERCENT;
    const feeFixed = feeRow?.[0]?.fee_fixed != null ? Number(feeRow[0].fee_fixed) : 0;

    // --- TRY #1: RPC ---
    let orderId: string;
    let amount: number;
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
        _payment_method: 'card',
        _window: CARD_WINDOW,
      });

      if (rpcErr) {
        const mapped = mapSeatOrderError(rpcErr.message || '');
        logStep('create_seat_order failed', { code: mapped.code, kind: mapped.kind, raw: rpcErr.message });
        if (mapped.kind === 'manipulation' || mapped.kind === 'unknown') {
          return json({ error: 'payment_failed', message: 'Não foi possível processar. Tente novamente.' }, mapped.httpStatus);
        }
        return json({ error: mapped.code }, mapped.httpStatus);
      }

      orderId = rpcData.order_id;
      amount = Number(rpcData.total);
      logStep('Seat order created', { orderId, amount });
    } catch (e: any) {
      const mapped = mapSeatOrderError(e?.message || '');
      logStep('create_seat_order exception', { code: mapped.code, raw: e?.message });
      if (mapped.kind === 'manipulation' || mapped.kind === 'unknown') {
        return json({ error: 'payment_failed', message: 'Não foi possível processar. Tente novamente.' }, mapped.httpStatus);
      }
      return json({ error: mapped.code }, mapped.httpStatus);
    }

    // Lê hold_expires_at autoritativo (estendido pra janela do cartão)
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
      token: cardToken,
      description: `${event.title} - Mesa (${seats.length} ${seats.length === 1 ? 'mesa' : 'mesas'})`,
      installments,
      payment_method_id: paymentMethodId,
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
    if (issuerId) mpBody.issuer_id = parseInt(issuerId);

    const mpHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mercadopagoToken}`,
      'X-Idempotency-Key': `card-${orderId}`,
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
      // Ambíguo: NÃO solta. Webhook resolve.
      logStep('MP POST network exception', { msg: e?.message });
      return json({ error: 'payment_provider_unreachable', orderId }, 502);
    }

    let mpPayment: any;
    try {
      mpPayment = await mpResponse.json();
    } catch (e: any) {
      logStep('MP response parse error', { msg: e?.message });
      return json({ error: 'payment_provider_unreachable', orderId }, 502);
    }

    logStep('MP payment response', { status: mpPayment.status, statusDetail: mpPayment.status_detail, id: mpPayment.id });

    if (mpPayment.status === 'approved') {
      // Persiste, NÃO promove. Webhook é o caminho único.
      await supabase.from('orders').update({
        mp_payment_id: String(mpPayment.id),
        mp_status_detail: mpPayment.status_detail || null,
      }).eq('id', orderId);
      return json({ status: 'approved_pending_confirmation', orderId, paymentId: mpPayment.id, holdExpiresAt });
    }

    if (mpPayment.status === 'in_process' || mpPayment.status === 'pending' || mpPayment.status === 'in_review') {
      await supabase.from('orders').update({
        mp_payment_id: String(mpPayment.id),
        mp_status_detail: mpPayment.status_detail || null,
      }).eq('id', orderId);
      return json({ status: 'in_process', orderId, paymentId: mpPayment.id, holdExpiresAt });
    }

    if (mpPayment.status === 'rejected') {
      logStep('Payment rejected — releasing seats', { orderId, statusDetail: mpPayment.status_detail });
      try {
        await supabase.from('orders').update({
          status: 'failed',
          mp_payment_id: mpPayment.id ? String(mpPayment.id) : null,
          mp_status_detail: mpPayment.status_detail || null,
          expires_at: new Date().toISOString(),
        }).eq('id', orderId);
        await supabase.from('tickets').update({ status: 'cancelled' }).eq('order_id', orderId).eq('status', 'pending');
        await supabase.rpc('release_seats_for_order', { _order_id: orderId });
      } catch (relErr: any) {
        logStep('release after rejected failed', { msg: relErr?.message });
      }
      return json({
        status: 'rejected',
        errorCode: mpPayment.status_detail || 'unknown',
        orderId,
        holdExpiresAt,
      });
    }

    // Status desconhecido: persistir e esperar webhook. Não soltar.
    logStep('Unknown MP status — awaiting webhook', { mpStatus: mpPayment.status });
    await supabase.from('orders').update({
      mp_payment_id: mpPayment.id ? String(mpPayment.id) : null,
      mp_status_detail: mpPayment.status_detail || null,
    }).eq('id', orderId);
    return json({ status: 'in_process', orderId, paymentId: mpPayment.id || null, holdExpiresAt });
  } catch (error: any) {
    console.error('[CHARGE-SEAT-CARD] UNHANDLED', error);
    return json({ error: 'payment_failed', message: 'Não foi possível processar. Tente novamente.' }, 500);
  }
});
