// redeploy 2026-07-07 — force redeploy
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { applyOrderApproved } from "../_shared/applyOrderApproved.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CONFRA-RECONCILE-PIX] ${step}${d}`);
};

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const marcelBase = Deno.env.get('MARCEL_PIX_BASE');
    if (!marcelBase) throw new Error('MARCEL_PIX_BASE is not set');

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Janela: pedidos PIX pending de eventos marcel, criados nas últimas 6h,
    // que tenham transactionId do Marcel. Limite de 50 por execução.
    const sinceIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    const { data: marcelEvents, error: evErr } = await admin
      .from('events')
      .select('id')
      .eq('payment_provider', 'marcel');

    if (evErr) throw new Error('Erro ao buscar eventos marcel');
    const marcelEventIds = (marcelEvents || []).map((e: any) => e.id);
    if (marcelEventIds.length === 0) {
      return json({ ok: true, checked: 0, confirmed: 0, note: 'no marcel events' });
    }

    const { data: orders, error: ordErr } = await admin
      .from('orders')
      .select('id, provider_transaction_id')
      .in('event_id', marcelEventIds)
      .eq('payment_method', 'pix')
      .eq('status', 'pending')
      .not('provider_transaction_id', 'is', null)
      .gte('created_at', sinceIso)
      .limit(50);

    if (ordErr) throw new Error('Erro ao buscar pedidos pendentes');
    const pending = orders || [];
    logStep('pending found', { count: pending.length });

    let confirmed = 0;
    for (const order of pending) {
      try {
        const resp = await fetch(`${marcelBase}/checkpix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactionId: Number(order.provider_transaction_id) }),
        });
        if (!resp.ok) continue;
        const data = await resp.json();
        const isPaid = data?.aprovado === true || data?.status === 3;
        if (!isPaid) continue;

        await applyOrderApproved(admin, {
          orderId: order.id,
          mpPaymentId: String(order.provider_transaction_id),
          source: 'confra-reconcile-pix',
        });
        confirmed++;
        logStep('order confirmed', { orderId: order.id });
      } catch (e) {
        logStep('order check failed', { orderId: order.id, e: String(e) });
      }
    }

    return json({ ok: true, checked: pending.length, confirmed });
  } catch (err: any) {
    logStep('ERROR', { message: err?.message });
    return json({ error: err?.message }, 500);
  }
});
