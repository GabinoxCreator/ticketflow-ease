import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
};

const log = (step: string, data?: any) => {
  console.log(`[MP-WEBHOOK] ${step}${data ? ' ' + JSON.stringify(data) : ''}`);
};

async function verifyMpSignature(
  sigHeader: string | null,
  requestId: string | null,
  dataId: string | null,
  secret: string,
): Promise<boolean> {
  if (!sigHeader || !requestId || !dataId) return false;
  // Header format: "ts=1234567890,v1=abc..."
  const parts = Object.fromEntries(
    sigHeader.split(',').map((p) => {
      const [k, v] = p.split('=');
      return [k.trim(), v?.trim()];
    }),
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const computed = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return computed === v1;
}

async function findOrder(supabase: any, externalRef: string | null, paymentId: string) {
  // 1. external_reference
  if (externalRef) {
    const { data } = await supabase
      .from('orders')
      .select('id, status, coupon_id, event_id, total_amount, customer_email')
      .eq('id', externalRef)
      .maybeSingle();
    if (data) return data;
  }
  // 2. mp_payment_id column
  const { data: byCol } = await supabase
    .from('orders')
    .select('id, status, coupon_id, event_id, total_amount, customer_email')
    .eq('mp_payment_id', paymentId)
    .maybeSingle();
  if (byCol) return byCol;

  // 3. legacy fallback
  const { data: byText } = await supabase
    .from('orders')
    .select('id, status, coupon_id, event_id, total_amount, customer_email')
    .ilike('payment_method', `%${paymentId}%`)
    .maybeSingle();
  return byText || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const secret = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET');
    const allowUnsigned = Deno.env.get('MP_WEBHOOK_ALLOW_UNSIGNED') === 'true';
    const mpToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');

    if (!mpToken) {
      log('missing MERCADOPAGO_ACCESS_TOKEN');
      return new Response('config error', { status: 500 });
    }

    // Parse payload (body OR query)
    let body: any = null;
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : null;
    } catch { /* ignore */ }

    const type = body?.type || body?.action?.split('.')?.[0] || url.searchParams.get('type');
    const dataId =
      body?.data?.id?.toString() ||
      url.searchParams.get('data.id') ||
      url.searchParams.get('id');

    const xSig = req.headers.get('x-signature');
    const xReqId = req.headers.get('x-request-id');

    // Signature gate
    if (secret) {
      const valid = await verifyMpSignature(xSig, xReqId, dataId, secret);
      if (!valid) {
        log('invalid signature', { xReqId, dataId });
        return new Response('invalid signature', { status: 401 });
      }
    } else if (!allowUnsigned) {
      log('signature required but no secret configured');
      return new Response('signature required', { status: 401 });
    } else {
      log('unsigned webhook accepted (dev bypass)', { dataId });
    }

    // Only handle payment events
    if (type !== 'payment' || !dataId) {
      log('ignored event', { type, dataId });
      return new Response('ignored', { status: 200, headers: corsHeaders });
    }

    // Fetch payment from MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    if (!mpRes.ok) {
      log('MP fetch failed', { status: mpRes.status });
      return new Response('mp api error', { status: 502 });
    }
    const payment = await mpRes.json();
    const mpStatus: string = payment.status;
    const externalRef: string | null = payment.external_reference || null;
    const paymentId = String(payment.id);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    // Locate order
    const order = await findOrder(supabase, externalRef, paymentId);

    // Idempotency insert
    const { error: dedupeErr } = await supabase.from('mp_webhook_events').insert({
      mp_payment_id: paymentId,
      mp_status: mpStatus,
      request_id: xReqId,
      order_id: order?.id ?? null,
      payload: payment,
      outcome: 'pending',
    });

    if (dedupeErr) {
      // 23505 unique_violation = already processed
      if ((dedupeErr as any).code === '23505') {
        log('dedupe — already processed', { paymentId, mpStatus });
        return new Response('duplicate', { status: 200, headers: corsHeaders });
      }
      log('dedupe insert error', { dedupeErr });
      return new Response('db error', { status: 500 });
    }

    if (!order) {
      log('order not found', { externalRef, paymentId });
      await supabase
        .from('mp_webhook_events')
        .update({ outcome: 'order_not_found' })
        .eq('mp_payment_id', paymentId)
        .eq('mp_status', mpStatus);
      return new Response('order not found', { status: 200, headers: corsHeaders });
    }

    let outcome: 'applied' | 'noop' | 'ignored' = 'noop';

    if (mpStatus === 'approved') {
      // Atomic transition: pending -> paid
      const { data: changed, error: updErr } = await supabase
        .from('orders')
        .update({
          status: 'paid',
          mp_payment_id: paymentId,
          expires_at: null,
        })
        .eq('id', order.id)
        .eq('status', 'pending')
        .select('id, coupon_id')
        .maybeSingle();

      if (updErr) {
        log('order update error', { updErr });
        return new Response('db error', { status: 500 });
      }

      if (changed) {
        // Confirm inventory per ticket
        const { data: tickets } = await supabase
          .from('tickets')
          .select('lot_id')
          .eq('order_id', order.id);

        const counts = new Map<string, number>();
        for (const t of tickets || []) {
          counts.set(t.lot_id, (counts.get(t.lot_id) || 0) + 1);
        }
        for (const [lotId, qty] of counts) {
          const { data: ok, error: confErr } = await supabase
            .rpc('confirm_lot_sale', { _lot_id: lotId, _qty: qty });
          if (confErr || !ok) {
            log('confirm_lot_sale FAILED', { lotId, qty, confErr });
          }
        }

        await supabase
          .from('tickets')
          .update({ status: 'valid' })
          .eq('order_id', order.id)
          .eq('status', 'pending');

        // Coupon increment
        if (changed.coupon_id) {
          const { data: c } = await supabase
            .from('event_coupons')
            .select('uses_count')
            .eq('id', changed.coupon_id)
            .maybeSingle();
          if (c) {
            await supabase
              .from('event_coupons')
              .update({ uses_count: (c.uses_count || 0) + 1 })
              .eq('id', changed.coupon_id);
          }
        }

        outcome = 'applied';
        log('approved applied', { orderId: order.id, paymentId });
      } else {
        log('approved no-op (already paid or other)', { orderId: order.id });
      }
    } else if (mpStatus === 'rejected' || mpStatus === 'cancelled') {
      const { data: changed } = await supabase
        .from('orders')
        .update({
          status: 'failed',
          mp_payment_id: paymentId,
          expires_at: new Date().toISOString(),
        })
        .eq('id', order.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();

      if (changed) {
        // Release reservations
        const { data: tickets } = await supabase
          .from('tickets')
          .select('lot_id')
          .eq('order_id', order.id);
        const counts = new Map<string, number>();
        for (const t of tickets || []) counts.set(t.lot_id, (counts.get(t.lot_id) || 0) + 1);
        for (const [lotId, qty] of counts) {
          await supabase.rpc('release_lot_quantity', { _lot_id: lotId, _qty: qty });
        }
        await supabase.from('tickets').update({ status: 'cancelled' }).eq('order_id', order.id).eq('status', 'pending');
        outcome = 'applied';
        log('rejected applied', { orderId: order.id });
      }
    } else if (mpStatus === 'refunded' || mpStatus === 'charged_back') {
      const newStatus = mpStatus === 'refunded' ? 'refunded' : 'charged_back';
      const { data: changed } = await supabase
        .from('orders')
        .update({ status: newStatus, mp_payment_id: paymentId })
        .eq('id', order.id)
        .eq('status', 'paid')
        .select('id, total_amount, customer_email, event_id')
        .maybeSingle();

      if (changed) {
        console.log('[MP-WEBHOOK]', JSON.stringify({
          event: mpStatus,
          order_id: changed.id,
          event_id: changed.event_id,
          customer_email: changed.customer_email,
          amount: changed.total_amount,
          mp_payment_id: paymentId,
          action_required: 'manual_inventory_review',
        }));
        outcome = 'applied';
      }
    } else {
      log('status ignored', { mpStatus });
      outcome = 'ignored';
    }

    await supabase
      .from('mp_webhook_events')
      .update({ outcome })
      .eq('mp_payment_id', paymentId)
      .eq('mp_status', mpStatus);

    return new Response(JSON.stringify({ ok: true, outcome }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    log('UNHANDLED ERROR', { message: err?.message, stack: err?.stack });
    return new Response('internal error', { status: 500 });
  }
});
