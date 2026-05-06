import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendOrderConfirmationEmailSafe } from "../_shared/orderConfirmationEmail.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-MERCADOPAGO-PAYMENT] ${step}${detailsStr}`);
};

async function confirmInventoryForOrder(supabaseClient: any, targetOrderId: string) {
  // Get pending tickets grouped by lot
  const { data: tickets } = await supabaseClient
    .from('tickets')
    .select('lot_id')
    .eq('order_id', targetOrderId)
    .eq('status', 'pending');

  if (!tickets || tickets.length === 0) {
    logStep('No pending tickets to confirm', { targetOrderId });
    return;
  }

  const grouped = new Map<string, number>();
  for (const t of tickets) {
    grouped.set(t.lot_id, (grouped.get(t.lot_id) || 0) + 1);
  }

  for (const [lotId, qty] of grouped.entries()) {
    const { data: ok, error: rpcErr } = await supabaseClient
      .rpc('confirm_lot_sale', { _lot_id: lotId, _qty: qty });
    if (rpcErr || !ok) {
      logStep('confirm_lot_sale failed during polling — possible race', { lotId, qty, rpcErr });
    }
  }
}

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

    const { paymentId, orderId } = await req.json();
    if (!paymentId && !orderId) throw new Error('paymentId or orderId is required');

    let mpStatus = '';
    let mpPaymentId = paymentId;

    if (paymentId) {
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${mercadopagoToken}` },
      });
      if (!mpResponse.ok) throw new Error('Erro ao consultar pagamento');
      const payment = await mpResponse.json();
      mpStatus = payment.status;
      logStep('Payment status checked', { paymentId, status: mpStatus });
    } else if (orderId) {
      const mpResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/search?external_reference=${orderId}&sort=date_created&criteria=desc`,
        { headers: { 'Authorization': `Bearer ${mercadopagoToken}` } }
      );
      if (!mpResponse.ok) throw new Error('Erro ao consultar pagamento');
      const searchResult = await mpResponse.json();
      if (searchResult.results && searchResult.results.length > 0) {
        const payment = searchResult.results[0];
        mpStatus = payment.status;
        mpPaymentId = payment.id;
        logStep('Payment found by orderId', { orderId, paymentId: mpPaymentId, status: mpStatus });
      } else {
        logStep('No payment found for orderId', { orderId });
        return new Response(
          JSON.stringify({ status: 'pending', paid: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const isPaid = mpStatus === 'approved';

    if (isPaid) {
      const targetOrderId = orderId || null;

      if (targetOrderId) {
        // Idempotent transition: only the first call sees status='pending'
        const { data: updatedOrder } = await supabaseClient
          .from('orders')
          .update({ status: 'paid', expires_at: null })
          .eq('id', targetOrderId)
          .eq('status', 'pending')
          .select('coupon_id')
          .maybeSingle();

        if (updatedOrder) {
          // First time we observed paid — confirm inventory
          await confirmInventoryForOrder(supabaseClient, targetOrderId);

          await supabaseClient
            .from('tickets')
            .update({ status: 'valid' })
            .eq('order_id', targetOrderId)
            .eq('status', 'pending');

          if (updatedOrder.coupon_id) {
            const { data: c } = await supabaseClient
              .from('event_coupons')
              .select('uses_count')
              .eq('id', updatedOrder.coupon_id)
              .maybeSingle();
            if (c) {
              await supabaseClient
                .from('event_coupons')
                .update({ uses_count: (c.uses_count || 0) + 1 })
                .eq('id', updatedOrder.coupon_id);
            }
          }

          logStep('Order/tickets/inventory confirmed', { orderId: targetOrderId });

          // Post-payment confirmation email — awaited but never throws.
          try {
            const emailResult = await sendOrderConfirmationEmailSafe(supabaseClient, {
              orderId: targetOrderId,
              source: 'polling',
            });
            logStep('order_email_result', emailResult);
          } catch (e) {
            logStep('order_email_unexpected', { e: String(e) });
          }
        } else {
          logStep('Order already processed (idempotent skip)', { orderId: targetOrderId });
        }
      } else {
        // Find by payment id
        const { data: orders } = await supabaseClient
          .from('orders')
          .select('id')
          .like('payment_method', `%${mpPaymentId}%`)
          .eq('status', 'pending');
        if (orders && orders.length > 0) {
          for (const o of orders) {
            const { data: upd } = await supabaseClient
              .from('orders')
              .update({ status: 'paid', expires_at: null })
              .eq('id', o.id).eq('status', 'pending')
              .select('id').maybeSingle();
            if (upd) {
              await confirmInventoryForOrder(supabaseClient, o.id);
              await supabaseClient.from('tickets')
                .update({ status: 'valid' })
                .eq('order_id', o.id).eq('status', 'pending');
              try {
                const emailResult = await sendOrderConfirmationEmailSafe(supabaseClient, {
                  orderId: o.id,
                  source: 'polling',
                });
                logStep('order_email_result', emailResult);
              } catch (e) {
                logStep('order_email_unexpected', { e: String(e) });
              }
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ status: mpStatus, paid: isPaid, paymentId: mpPaymentId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    logStep('ERROR', { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
