import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { applyOrderApproved } from "../_shared/applyOrderApproved.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SYSTEM_ACTOR = '95628c4a-8040-44ed-83c5-d6a5b8793926';

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-MERCADOPAGO-PAYMENT] ${step}${detailsStr}`);
};

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    logStep('Function started');

    const mercadopagoToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!mercadopagoToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN is not set');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Optional auth — when present we validate ownership
    let authedUserId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: claimsData } = await userClient.auth.getClaims(token);
      authedUserId = claimsData?.claims?.sub ?? null;
    }

    const { paymentId, orderId } = await req.json();
    if (!paymentId || !orderId) {
      return json({ error: 'paymentId and orderId are required', paid: false, autoritative: false }, 400);
    }

    // Load order locally
    const { data: order, error: orderErr } = await supabaseClient
      .from('orders')
      .select('id, status, total_amount, user_id, mp_payment_id')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return json({ error: 'order_not_found', paid: false, autoritative: false }, 404);
    }

    // Fetch payment from MP
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${mercadopagoToken}` },
    });
    if (!mpResponse.ok) {
      return json({ error: 'mp_api_error', paid: false, autoritative: false }, 502);
    }
    const payment = await mpResponse.json();
    const mpStatus: string = payment.status;
    const mpExternalRef: string | null = payment.external_reference || null;
    const mpAmountCents = Math.round(Number(payment.transaction_amount ?? 0) * 100);
    const orderAmountCents = Math.round(Number(order.total_amount ?? 0) * 100);

    logStep('payment fetched', { paymentId, mpStatus, mpExternalRef, mpAmountCents, orderAmountCents });

    // Cross-validation #1: external_reference must match
    if (mpExternalRef !== orderId) {
      logStep('external_reference mismatch', { mpExternalRef, orderId });
      try {
        await supabaseClient.from('audit_logs').insert({
          actor_id: SYSTEM_ACTOR,
          action: 'check_payment_external_ref_mismatch',
          target_type: 'order',
          target_id: orderId,
          metadata: { mp_payment_id: String(paymentId), mp_external_reference: mpExternalRef },
        });
      } catch (_) {}
      return json({
        status: mpStatus, paid: false, autoritative: false,
        message: 'payment_does_not_belong_to_order',
      }, 200);
    }

    // Cross-validation #2: amount must match
    if (mpAmountCents !== orderAmountCents) {
      logStep('amount mismatch', { mpAmountCents, orderAmountCents });
      try {
        await supabaseClient.from('audit_logs').insert({
          actor_id: SYSTEM_ACTOR,
          action: 'check_payment_amount_mismatch',
          target_type: 'order',
          target_id: orderId,
          metadata: {
            mp_payment_id: String(paymentId),
            mp_amount_cents: mpAmountCents,
            order_amount_cents: orderAmountCents,
          },
        });
      } catch (_) {}
      return json({
        status: mpStatus, paid: false, autoritative: false,
        message: 'amount_mismatch',
      }, 200);
    }

    // MESA detection: tickets atrelados a event_seats têm event_seat_id setado.
    // Mesa NÃO entra no caminho autoritativo de polling — promoção é só webhook.
    // Detecção por event_seats.order_id é alternativa, mas vira false após release;
    // event_seat_id em tickets é imutável (defensivo).
    const { count: seatTicketCount } = await supabaseClient
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .not('event_seat_id', 'is', null);
    const isMesa = (seatTicketCount ?? 0) > 0;

    // Determine authoritative ability: requires JWT of order owner.
    // MESA nunca é authoritative aqui — webhook único caminho.
    const isAuthoritative =
      !isMesa &&
      mpStatus === 'approved' &&
      order.user_id != null &&
      authedUserId != null &&
      authedUserId === order.user_id;

    if (mpStatus === 'approved' && isAuthoritative) {
      try {
        const result = await applyOrderApproved(supabaseClient, {
          orderId,
          mpPaymentId: String(paymentId),
          source: 'polling',
        });
        return json({
          status: mpStatus,
          paid: true,
          autoritative: true,
          paymentId,
          reconciliation: result,
        });
      } catch (e: any) {
        logStep('applyOrderApproved error', { e: String(e) });
        return json({
          status: mpStatus, paid: false, autoritative: false,
          error: 'reconciliation_failed',
        }, 500);
      }
    }

    // Non-authoritative (inclui MESA): apenas reflete o estado local.
    // Webhook é a fonte da verdade. Front continua em "finalizando" até paid.
    const { data: refreshed } = await supabaseClient
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .maybeSingle();
    const localStatus = refreshed?.status ?? order.status;

    return json({
      status: mpStatus,
      paid: localStatus === 'paid',
      autoritative: false,
      paymentId,
      message: mpStatus === 'approved' ? 'awaiting_webhook' : 'mp_status_reported',
      orderStatus: localStatus,
      isMesa,
    });
  } catch (error: any) {
    logStep('ERROR', { message: error.message });
    return json({ error: error.message, paid: false, autoritative: false }, 500);
  }
});
