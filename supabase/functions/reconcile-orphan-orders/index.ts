import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { applyOrderApproved } from "../_shared/applyOrderApproved.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BLOCK1_DEPLOY = '2026-05-05T14:12:48Z';
const SYSTEM_USER_ID = '95628c4a-8040-44ed-83c5-d6a5b8793926';
const BATCH_SIZE = 200;

const log = (step: string, data?: any) =>
  console.log(`[RECONCILE] ${step}${data ? ' ' + JSON.stringify(data) : ''}`);

interface OrderRow {
  id: string;
  created_at: string;
  expires_at: string | null;
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // dry_run contract: SAFE BY DEFAULT.
  // Only executes mutations when an explicit `dry_run=false` is passed
  // (via querystring OR JSON body). Any other input → dry-run.
  const url = new URL(req.url);
  let dryRunSignal: string | null = url.searchParams.get('dry_run');
  if (dryRunSignal === null && (req.method === 'POST' || req.method === 'PUT')) {
    try {
      const cloned = req.clone();
      const body = await cloned.json().catch(() => null);
      if (body && typeof body.dry_run !== 'undefined') {
        dryRunSignal = String(body.dry_run);
      }
    } catch (_) { /* ignore */ }
  }
  const dryRun = dryRunSignal !== 'false';
  log('mode', { dryRun, dryRunSignal });
  const stats = {
    scanned: 0,
    approved_recovered: 0,
    expired_released: 0,
    rejected_marked_failed: 0,
    still_in_process: 0,
    inventory_corrections: 0,
    paid_tickets_reconciled: 0,
    errors: 0,
    items: [] as any[],
  };

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const userId = claimsData.claims.sub;
    const { data: roles } = await supabase
      .from('user_roles').select('role').eq('user_id', userId);
    if (!roles?.some((r: any) => r.role === 'admin')) {
      return new Response(JSON.stringify({ error: 'Admin required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Audit who triggered this run and in what mode (esp. real execution)
    await supabase.from('audit_logs').insert({
      actor_id: userId,
      action: dryRun ? 'admin_reconcile_dry_run_started' : 'admin_reconcile_real_run_started',
      target_type: 'system',
      target_id: SYSTEM_USER_ID,
      metadata: { dryRun, source: 'reconcile-orphan-orders' },
    });

    const mpToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!mpToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN missing');

    // Sweep A: Historical paid orders with leftover pending tickets.
    // Helper is idempotent — only fixes tickets, no inventory/coupon mutation.
    {
      const { data: paidWithPending } = await supabase
        .from('orders')
        .select('id, mp_payment_id, tickets!inner(id)')
        .eq('status', 'paid')
        .eq('tickets.status', 'pending')
        .limit(BATCH_SIZE);
      const seen = new Set<string>();
      for (const o of (paidWithPending || []) as any[]) {
        if (seen.has(o.id)) continue;
        seen.add(o.id);
        try {
          if (!dryRun) {
            const r = await applyOrderApproved(supabase, {
              orderId: o.id,
              mpPaymentId: o.mp_payment_id ?? '',
              source: 'reconcile-orphan-orders[paid_pending_tickets]',
            });
            if ((r.tickets_fixed ?? 0) > 0) stats.paid_tickets_reconciled += r.tickets_fixed!;
          } else {
            stats.paid_tickets_reconciled++;
          }
          stats.items.push({ order_id: o.id, action: 'reconcile_paid_pending_tickets' });
        } catch (e: any) {
          stats.errors++;
          log('PAID_RECONCILE_ERROR', { orderId: o.id, error: e?.message });
        }
      }
    }

    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: candidates, error } = await supabase
      .from('orders')
      .select('id, created_at, expires_at, mp_payment_id, payment_method, coupon_id')
      .eq('status', 'pending')
      .or(`created_at.lt.${cutoff},expires_at.is.null`)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;

    for (const order of (candidates || []) as OrderRow[]) {
      stats.scanned++;
      const item: any = { order_id: order.id, created_at: order.created_at };
      try {
        const paymentId = extractMpPaymentId(order);
        item.mp_payment_id = paymentId;
        const isLegacy = new Date(order.created_at) < new Date(BLOCK1_DEPLOY);
        item.legacy = isLegacy;

        let mpStatus: string | null = null;
        if (paymentId) {
          const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${mpToken}` },
          });
          if (mpRes.ok) mpStatus = (await mpRes.json()).status;
          else if (mpRes.status === 404) mpStatus = 'not_found';
          else { stats.errors++; item.error = `mp_api_${mpRes.status}`; stats.items.push(item); continue; }
        } else {
          mpStatus = 'no_payment_id';
        }
        item.mp_status = mpStatus;

        if (mpStatus === 'approved') {
          item.action = 'recover_to_paid';
          if (!dryRun) {
            const result = await applyOrderApproved(supabase, {
              orderId: order.id,
              mpPaymentId: paymentId!,
              source: isLegacy ? 'reconcile-orphan-orders[legacy]' : 'reconcile-orphan-orders',
            });
            item.helper_result = result;
          }
          stats.approved_recovered++;
        } else if (mpStatus === 'in_process' || mpStatus === 'pending') {
          item.action = 'extend_expiry_30min';
          if (!dryRun) {
            const newExpires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
            await supabase.from('orders').update({ expires_at: newExpires })
              .eq('id', order.id).eq('status', 'pending');
          }
          stats.still_in_process++;
        } else if (mpStatus === 'rejected' || mpStatus === 'cancelled') {
          item.action = 'mark_failed';
          const counts = await ticketCountsByLot(supabase, order.id);
          item.lots = Object.fromEntries(counts);
          if (!dryRun) {
            const { data: changed } = await supabase.from('orders')
              .update({ status: 'failed', mp_payment_id: paymentId, expires_at: new Date().toISOString() })
              .eq('id', order.id).eq('status', 'pending')
              .select('id').maybeSingle();
            if (changed) {
              await supabase.from('tickets').update({ status: 'cancelled' })
                .eq('order_id', order.id).eq('status', 'pending');
              // Correção legacy: pré-Bloco 1 incrementou sold_quantity sem reserva → decrementar
              if (isLegacy) {
                for (const [lotId, qty] of counts) {
                  const { data: ok } = await supabase.rpc('decrement_sold_quantity_legacy',
                    { _lot_id: lotId, _qty: qty });
                  if (ok) {
                    stats.inventory_corrections++;
                    await supabase.from('audit_logs').insert({
                      actor_id: SYSTEM_USER_ID,
                      action: 'orphan_inventory_correction',
                      target_type: 'order',
                      target_id: order.id,
                      metadata: { lot_id: lotId, qty, reason: 'pre_block1_orphan_rejected_by_mp' },
                    });
                  }
                }
              } else {
                // Pós-Bloco 1: liberar reserva
                for (const [lotId, qty] of counts) {
                  await supabase.rpc('release_lot_quantity', { _lot_id: lotId, _qty: qty });
                }
              }
            }
          }
          stats.rejected_marked_failed++;
        } else {
          // not_found, no_payment_id, refunded antigo, etc → expired
          item.action = 'mark_expired';
          const counts = await ticketCountsByLot(supabase, order.id);
          item.lots = Object.fromEntries(counts);
          if (!dryRun) {
            const { data: changed } = await supabase.from('orders')
              .update({ status: 'expired' })
              .eq('id', order.id).eq('status', 'pending')
              .select('id').maybeSingle();
            if (changed) {
              await supabase.from('tickets').update({ status: 'cancelled' })
                .eq('order_id', order.id).eq('status', 'pending');
              if (isLegacy) {
                for (const [lotId, qty] of counts) {
                  const { data: ok } = await supabase.rpc('decrement_sold_quantity_legacy',
                    { _lot_id: lotId, _qty: qty });
                  if (ok) {
                    stats.inventory_corrections++;
                    await supabase.from('audit_logs').insert({
                      actor_id: SYSTEM_USER_ID,
                      action: 'orphan_inventory_correction',
                      target_type: 'order',
                      target_id: order.id,
                      metadata: { lot_id: lotId, qty, reason: `pre_block1_orphan_${mpStatus}` },
                    });
                  }
                }
              } else {
                for (const [lotId, qty] of counts) {
                  await supabase.rpc('release_lot_quantity', { _lot_id: lotId, _qty: qty });
                }
              }
            }
          }
          stats.expired_released++;
        }
        stats.items.push(item);
      } catch (e: any) {
        stats.errors++;
        item.error = e?.message;
        stats.items.push(item);
        log('ITEM_ERROR', { orderId: order.id, error: e?.message });
      }
    }

    console.log('[RECONCILE-RUN]', JSON.stringify({ dryRun, ...stats, items: undefined }));

    return new Response(JSON.stringify({ ok: true, dryRun, ...stats }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (e: any) {
    log('FATAL', { error: e?.message });
    return new Response(JSON.stringify({ ok: false, error: e?.message, stats }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
