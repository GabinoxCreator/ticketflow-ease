import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-MERCADOPAGO-PAYMENT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    if (!paymentId && !orderId) {
      throw new Error('paymentId or orderId is required');
    }

    let mpStatus = '';
    let mpPaymentId = paymentId;

    if (paymentId) {
      // Check directly via payment ID
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${mercadopagoToken}`,
        },
      });

      if (!mpResponse.ok) {
        throw new Error('Erro ao consultar pagamento');
      }

      const payment = await mpResponse.json();
      mpStatus = payment.status;
      logStep('Payment status checked', { paymentId, status: mpStatus });
    } else if (orderId) {
      // Search payment by external_reference (order ID)
      const mpResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/search?external_reference=${orderId}&sort=date_created&criteria=desc`,
        {
          headers: {
            'Authorization': `Bearer ${mercadopagoToken}`,
          },
        }
      );

      if (!mpResponse.ok) {
        throw new Error('Erro ao consultar pagamento');
      }

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

    // If paid, update order and tickets
    if (isPaid) {
      const targetOrderId = orderId || null;

      if (targetOrderId) {
        // Update order status
        const { data: updatedOrder } = await supabaseClient
          .from('orders')
          .update({ status: 'paid' })
          .eq('id', targetOrderId)
          .eq('status', 'pending')
          .select('coupon_id')
          .maybeSingle();

        // Update tickets to valid
        await supabaseClient
          .from('tickets')
          .update({ status: 'valid' })
          .eq('order_id', targetOrderId)
          .eq('status', 'pending');

        // Increment coupon uses
        if (updatedOrder?.coupon_id) {
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

        logStep('Order and tickets updated to paid/valid', { orderId: targetOrderId });
      } else {
        // Find order by payment method containing payment ID
        const { data: orders } = await supabaseClient
          .from('orders')
          .select('id')
          .like('payment_method', `%${mpPaymentId}%`)
          .eq('status', 'pending');

        if (orders && orders.length > 0) {
          for (const o of orders) {
            await supabaseClient.from('orders').update({ status: 'paid' }).eq('id', o.id);
            await supabaseClient.from('tickets').update({ status: 'valid' }).eq('order_id', o.id).eq('status', 'pending');
          }
          logStep('Orders updated via payment ID lookup');
        }
      }
    }

    return new Response(
      JSON.stringify({
        status: mpStatus,
        paid: isPaid,
        paymentId: mpPaymentId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    logStep('ERROR', { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
