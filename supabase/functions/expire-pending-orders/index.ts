import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 50;
const EXTENSION_MIN = 30;
const MAX_TOTAL_LIFETIME_MIN = 180; // 3h
const SYSTEM_USER_ID = '95628c4a-8040-44ed-83c5-d6a5b8793926'; // primary admin

const log = (step: string, data?: any) =>
  console.log(`[EXPIRE] ${step}${data ? ' ' + JSON.stringify(data) : ''}`);

interface OrderRow {
  id: string;
  created_at: string;
  expires_at: string;
  mp_payment_id: string | null;
  payment_method: string | null;
  coupon_id: string | null;
}

function extractMpPaymentId(o: OrderRow): string | null {
  if (o.mp_payment_id) return o.mp_payment_id;
  if (o.payment_method) {
    const m = o.payment_method.match(/(?:pix|card):(\d+)/);
    if (m) return m[1];
  }
  return null;
}

async function ticketCountsByLot(supabase: any, orderId: string) {
  const { data: tickets } = await supabase
    .from('tickets').select('lot_id').eq('order_id', orderId);
  const counts = new Map<string, number>();
  for (const t of tickets || []) counts.set(t.lot_id, (counts.get(t.lot_id) || 0) + 1);
  return counts;
}

async function applyApproved(supabase: any, order: OrderRow, paymentId: string) {
  const { data: changed } = await supabase
    .from('orders')
    .update({ status: 'paid', mp_payment_id: paymentId, expires_at: null })
    .eq('id', order.id).eq('status', 'pending')
    .select('id, coupon_id').maybeSingle();
  if (!changed) return false;

  const counts = await ticketCountsByLot(supabase, order.id);
  for (const [lotId, qty] of counts) {
    const { data: ok, error } = await supabase.rpc('confirm_lot_sale', { _lot_id: lotId, _qty: qty });
    if (error || !ok) log('confirm_lot_sale FAILED on recovery', { orderId: order.id, lotId, qty, error });
  }
  await supabase.from('tickets').update({ status: 'valid' })
    .eq('order_id', order.id).eq('status', 'pending');

  if (changed.coupon_id) {
    const { data: c } = await supabase.from('event_coupons')
      .select('uses_count').eq('id', changed.coupon_id).maybeSingle();
    if (c) await supabase.from('event_coupons')
      .update({ uses_count: (c.uses_count || 0) + 1 }).eq('id', changed.coupon_id);
  }
  return true;
}

async function applyExpired(supabase: any, order: OrderRow) {
  const { data: changed } = await supabase
    .from('orders')
    .update({ status: 'expired' })
    .eq('id', order.id).eq('status', 'pending')
    .select('id').maybeSingle();
  if (!changed) return false;

  const counts = await ticketCountsByLot(supabase, order.id);
  for (const [lotId, qty] of counts) {
    await supabase.rpc('release_lot_quantity', { _lot_id: lotId, _qty: qty });
  }
  await supabase.from('tickets').update({ status: 'cancelled' })
    .eq('order_id', order.id).eq('status', 'pending');
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Auth: shared secret for cron / manual ops (no JWT required)
  const cronSecret = Deno.env.get('CRON_SECRET');
  const provided = req.headers.get('x-cron-secret') ?? req.headers.get('X-Cron-Secret');
  if (!cronSecret || provided !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const stats = { scanned: 0, recovered: 0, expired: 0, extended: 0, skipped: 0, errors: 0 };
  const startedAt = new Date().toISOString();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );
    const mpToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');

    const { data: candidates, error } = await supabase
      .from('orders')
      .select('id, created_at, expires_at, mp_payment_id, payment_method, coupon_id')
      .eq('status', 'pending')
      .not('expires_at', 'is', null)
      .lt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;

    for (const order of (candidates || []) as OrderRow[]) {
      stats.scanned++;
      try {
        const paymentId = extractMpPaymentId(order);
        const ageMin = (Date.now() - new Date(order.created_at).getTime()) / 60000;

        // Confirmação dupla no MP
        if (paymentId && mpToken) {
          const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${mpToken}` },
          });
          if (mpRes.ok) {
            const payment = await mpRes.json();
            const mpStatus = payment.status;

            if (mpStatus === 'approved') {
              const ok = await applyApproved(supabase, order, paymentId);
              if (ok) { stats.recovered++; log('recovered', { orderId: order.id, paymentId }); }
              else { stats.skipped++; }
              continue;
            }
            if (mpStatus === 'in_process' || mpStatus === 'pending') {
              if (ageMin >= MAX_TOTAL_LIFETIME_MIN) {
                await supabase.from('audit_logs').insert({
                  actor_id: SYSTEM_USER_ID,
                  action: 'order_in_process_timeout',
                  target_type: 'order',
                  target_id: order.id,
                  metadata: { ageMin: Math.round(ageMin), mp_payment_id: paymentId },
                });
                stats.skipped++;
                log('IN_PROCESS_TIMEOUT', { orderId: order.id, ageMin: Math.round(ageMin) });
                continue;
              }
              const cap = new Date(order.created_at).getTime() + MAX_TOTAL_LIFETIME_MIN * 60000;
              const newExpires = new Date(Math.min(Date.now() + EXTENSION_MIN * 60000, cap)).toISOString();
              await supabase.from('orders').update({ expires_at: newExpires })
                .eq('id', order.id).eq('status', 'pending');
              stats.extended++;
              continue;
            }
            // rejected / cancelled / refunded → cai no expired abaixo
          } else {
            // MP API erro transitório → pula nesta rodada
            stats.skipped++;
            log('mp_api_error_skip', { orderId: order.id, status: mpRes.status });
            continue;
          }
        }

        const ok = await applyExpired(supabase, order);
        if (ok) stats.expired++; else stats.skipped++;
      } catch (e: any) {
        stats.errors++;
        log('ITEM_ERROR', { orderId: order.id, error: e?.message });
      }
    }

    console.log('[EXPIRE-RUN]', JSON.stringify({ ts: startedAt, ...stats }));

    return new Response(JSON.stringify({ ok: true, stats }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (e: any) {
    log('FATAL', { error: e?.message });
    return new Response(JSON.stringify({ ok: false, error: e?.message, stats }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
