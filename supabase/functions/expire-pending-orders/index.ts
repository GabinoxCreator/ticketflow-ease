// redeploy 2026-07-07 — force redeploy
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { applyOrderApproved } from "../_shared/applyOrderApproved.ts";
import { checkMarcelPixPaid } from "../_shared/marcelPix.ts";
import { conferirPagamentoMercadoPago, conferirIdSoDestePedido, recusarPromocao } from "../_shared/conferePagamento.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 50;
const EXTENSION_MIN = 30;
const MAX_TOTAL_LIFETIME_MIN = 180; // 3h hard cap for in_process
const SYSTEM_USER_ID = '95628c4a-8040-44ed-83c5-d6a5b8793926';

const log = (step: string, data?: any) =>
  console.log(`[EXPIRE] ${step}${data ? ' ' + JSON.stringify(data) : ''}`);

interface OrderRow {
  id: string;
  created_at: string;
  expires_at: string;
  mp_payment_id: string | null;
  provider_transaction_id: string | null;
  total_amount: number | string | null;
}

async function ticketCountsByLot(supabase: any, orderId: string) {
  const { data: tickets } = await supabase
    .from('tickets').select('lot_id').eq('order_id', orderId);
  const counts = new Map<string, number>();
  for (const t of tickets || []) counts.set(t.lot_id, (counts.get(t.lot_id) || 0) + 1);
  return counts;
}

async function applyExpired(supabase: any, order: OrderRow) {
  // STEP 1 — Mark order expired FIRST (guarded). If webhook already promoted to
  // paid in the same minute, this update matches 0 rows and we return without
  // touching seats. Inverting this order reopens double-book under load.
  const { data: changed } = await supabase
    .from('orders')
    .update({ status: 'expired' })
    .eq('id', order.id).eq('status', 'pending')
    .select('id').maybeSingle();
  if (!changed) return false;

  // STEP 2 — Only after the order is confirmed expired do we release inventory.
  // Mesa: release seats tied to this order (idempotent; no-op for ticket orders).
  await supabase
    .from('event_seats')
    .update({
      status: 'available',
      held_by_user_id: null,
      hold_token: null,
      hold_expires_at: null,
      order_id: null,
    })
    .eq('order_id', order.id)
    .eq('status', 'held');

  // Ingresso: release lot quantities (skips mesa tickets where lot_id is null).
  const counts = await ticketCountsByLot(supabase, order.id);
  for (const [lotId, qty] of counts) {
    if (!lotId) continue;
    await supabase.rpc('release_lot_quantity', { _lot_id: lotId, _qty: qty });
  }
  await supabase.from('tickets').update({ status: 'cancelled' })
    .eq('order_id', order.id).eq('status', 'pending');
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Two authorized paths:
  //  1) Cron: shared secret via X-Cron-Secret header (vault-validated)
  //  2) Admin manual: Bearer JWT with admin role
  const provided = req.headers.get('x-cron-secret') ?? req.headers.get('X-Cron-Secret');
  const authHeader = req.headers.get('Authorization');
  let authorized = false;
  let invocationSource: 'cron' | 'admin_manual' = 'cron';
  let adminUserId: string | null = null;

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  if (provided) {
    try {
      const { data: vaultSecret } = await adminClient.rpc('get_cron_secret');
      if (vaultSecret && provided === vaultSecret) {
        authorized = true;
        invocationSource = 'cron';
      }
    } catch (_) { /* ignore */ }
  }

  if (!authorized && authHeader?.startsWith('Bearer ')) {
    try {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } },
      );
      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData } = await userClient.auth.getClaims(token);
      const userId = claimsData?.claims?.sub;
      if (userId) {
        const { data: roles } = await adminClient
          .from('user_roles').select('role').eq('user_id', userId);
        if (roles?.some((r: any) => r.role === 'admin')) {
          authorized = true;
          invocationSource = 'admin_manual';
          adminUserId = userId;
        }
      }
    } catch (_) { /* ignore */ }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const stats = { scanned: 0, recovered: 0, marcel_recovered: 0, expired: 0, extended: 0, in_process_timeout: 0, skipped: 0, errors: 0, refused: 0 };
  const startedAt = new Date().toISOString();

  try {
    const supabase = adminClient;
    const mpToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    const marcelBase = Deno.env.get('MARCEL_PIX_BASE');

    if (invocationSource === 'admin_manual' && adminUserId) {
      await supabase.from('audit_logs').insert({
        actor_id: adminUserId,
        action: 'admin_manual_expire_run_started',
        target_type: 'system',
        target_id: SYSTEM_USER_ID,
        metadata: { source: 'expire-pending-orders' },
      });
    }

    const { data: candidates, error } = await supabase
      .from('orders')
      .select('id, created_at, expires_at, mp_payment_id, provider_transaction_id, total_amount')
      .eq('status', 'pending')
      // OS-265: pedido com bandeira de análise (pago no provedor, recusado na
      // conferência) fica pendente até alguém decidir. Sem este filtro ele
      // ficaria para sempre na frente da fila (os 50 mais antigos) e, com 50
      // presos, a expiração parava para todo mundo.
      .is('review_status', null)
      .not('expires_at', 'is', null)
      .lt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;

    for (const order of (candidates || []) as OrderRow[]) {
      stats.scanned++;
      try {
        const paymentId = order.mp_payment_id;
        const ageMin = (Date.now() - new Date(order.created_at).getTime()) / 60000;

        // Confirmação dupla com MP antes de expirar
        if (paymentId && mpToken) {
          const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${mpToken}` },
          });
          if (mpRes.ok) {
            const payment = await mpRes.json();
            const mpStatus = payment.status;

            // OS-265: aprovado só promove se o pagamento é DESTE pedido
            // (external_reference) e do MESMO valor, como o webhook e a
            // check-mercadopago-payment. Senão este pedido não foi pago por
            // esse id: recusa, audita e segue como pedido sem pagamento.
            const conferencia = mpStatus === 'approved'
              ? conferirPagamentoMercadoPago(order, payment)
              : null;
            if (conferencia && !conferencia.ok) {
              stats.refused++;
              log('promotion_refused', { orderId: order.id, paymentId, motivo: conferencia.motivo });
              // Valor diferente: o pagamento é deste pedido, alguém pagou e não
              // leva; vai para análise (bandeira). Pagamento de outro pedido
              // (o próprio Mercado Pago diz): este não foi pago por ele; só
              // registra e avisa. Nos dois casos o pedido expira no prazo, como
              // pedido sem pagamento, e sai da fila (não volta a ser recusado).
              const bandeira = conferencia.motivo === 'valor_diferente';
              if (!order.provider_transaction_id) {
                const ok = await applyExpired(supabase, order);
                if (ok) stats.expired++; else stats.skipped++;
                await recusarPromocao(supabase, {
                  orderId: order.id, situacao: ok ? 'expired' : 'pending', valor: order.total_amount,
                  source: 'expire-pending-orders', paymentId, recusa: conferencia, bandeira,
                });
                continue;
              }
              // Tem também id do Marcel (não acontece hoje): registra e segue
              // para a conferência do Marcel abaixo.
              await recusarPromocao(supabase, {
                orderId: order.id, situacao: 'pending', valor: order.total_amount,
                source: 'expire-pending-orders', paymentId, recusa: conferencia, bandeira,
              });
            } else if (mpStatus === 'approved') {
              const result = await applyOrderApproved(supabase, {
                orderId: order.id,
                mpPaymentId: paymentId,
                source: 'expire-pending-orders',
              });
              if (result.first_transition || (result.tickets_fixed ?? 0) > 0) {
                stats.recovered++;
                log('recovered', { orderId: order.id, paymentId, result });
              } else {
                stats.skipped++;
              }
              continue;
            }

            if (mpStatus === 'in_process' || mpStatus === 'pending') {
              if (ageMin >= MAX_TOTAL_LIFETIME_MIN) {
                // Timeout cap reached: log and force expire (release inventory)
                await supabase.from('audit_logs').insert({
                  actor_id: SYSTEM_USER_ID,
                  action: 'order_in_process_timeout',
                  target_type: 'order',
                  target_id: order.id,
                  metadata: { ageMin: Math.round(ageMin), mp_payment_id: paymentId, mp_status: mpStatus },
                });
                const ok = await applyExpired(supabase, order);
                if (ok) stats.in_process_timeout++; else stats.skipped++;
                log('IN_PROCESS_TIMEOUT_EXPIRED', { orderId: order.id, ageMin: Math.round(ageMin) });
                continue;
              }
              // Within cap: extend window, do not release
              const cap = new Date(order.created_at).getTime() + MAX_TOTAL_LIFETIME_MIN * 60000;
              const newExpires = new Date(Math.min(Date.now() + EXTENSION_MIN * 60000, cap)).toISOString();
              await supabase.from('orders').update({ expires_at: newExpires })
                .eq('id', order.id).eq('status', 'pending');
              stats.extended++;
              continue;
            }
            // rejected / cancelled / refunded (ou aprovado de outro pedido / outro
            // valor, recusado acima) → falls through to expired below
          } else {
            // Erro transitório do MP → não toca neste pedido nesta rodada
            stats.skipped++;
            log('mp_api_error_skip', { orderId: order.id, status: mpRes.status });
            continue;
          }
        }

        // Rota Marcel (confra-*): id do pagamento vive em provider_transaction_id
        // (não em mp_payment_id), então o bloco MP acima pulou este pedido.
        // Confirmar no Marcel ANTES de expirar — senão pedido pago vira expired.
        if (order.provider_transaction_id) {
          // Env ausente num deploy NÃO pode voltar a matar pedido pago → pular.
          if (!marcelBase) {
            stats.skipped++;
            log('marcel_base_missing_skip', { orderId: order.id });
            continue;
          }
          const marcel = await checkMarcelPixPaid(marcelBase, order.provider_transaction_id);
          if (!marcel.ok) {
            // Provedor indisponível/timeout → não expira nesta rodada.
            stats.skipped++;
            log('marcel_provider_error_skip', { orderId: order.id });
            continue;
          }
          if (marcel.paid) {
            // OS-265: o Marcel não diz de quem é o pagamento nem o valor; o que
            // se confere é que este id não está gravado em outro pedido (um
            // pagamento libera um pedido só). Recusado: NÃO expira (o provedor
            // diz que está pago) e vai para análise humana (bandeira + aviso, uma
            // vez só). Com a bandeira, ele sai da fila desta rotina.
            const conferencia = await conferirIdSoDestePedido(supabase, order.id, String(order.provider_transaction_id));
            if (!conferencia.ok) {
              if (conferencia.motivo === 'conferencia_indisponivel') {
                stats.skipped++;
              } else {
                stats.refused++;
                await recusarPromocao(supabase, {
                  orderId: order.id, situacao: 'pending', valor: order.total_amount,
                  source: 'expire-pending-orders[marcel]', paymentId: String(order.provider_transaction_id),
                  recusa: conferencia, bandeira: true,
                });
              }
              log('marcel_promotion_refused', { orderId: order.id, motivo: conferencia.motivo });
              continue;
            }
            await applyOrderApproved(supabase, {
              orderId: order.id,
              mpPaymentId: String(order.provider_transaction_id),
              source: 'expire-pending-orders[marcel]',
            });
            stats.marcel_recovered++;
            log('marcel_recovered', { orderId: order.id });
            continue;
          }
          // marcel.paid === false → segue pro applyExpired abaixo (não pago mesmo).
        }

        const ok = await applyExpired(supabase, order);
        if (ok) stats.expired++; else stats.skipped++;
      } catch (e: any) {
        stats.errors++;
        log('ITEM_ERROR', { orderId: order.id, error: e?.message });
      }
    }

    console.log('[EXPIRE-RUN]', JSON.stringify({ ts: startedAt, source: invocationSource, ...stats }));

    return new Response(JSON.stringify({ ok: true, source: invocationSource, stats }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (e: any) {
    log('FATAL', { error: e?.message });
    return new Response(JSON.stringify({ ok: false, error: e?.message, stats }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
