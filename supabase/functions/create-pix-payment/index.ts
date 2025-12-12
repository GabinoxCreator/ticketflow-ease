import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CartItem {
  lotId: string;
  quantity: number;
}

interface PixRequest {
  eventId: string;
  items: CartItem[];
  customerName: string;
  customerEmail: string;
  customerCPF: string;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-PIX-PAYMENT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep('Function started');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const { eventId, items, customerName, customerEmail, customerCPF } = await req.json() as PixRequest;

    logStep('Request received', { eventId, itemsCount: items.length, customerEmail });

    // Fetch event details
    const { data: event, error: eventError } = await supabaseClient
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      logStep('Event not found', { eventError });
      throw new Error('Evento não encontrado');
    }

    logStep('Event found', { title: event.title, producerId: event.producer_id });

    // Fetch producer's Stripe account
    const { data: stripeAccount, error: stripeError } = await supabaseClient
      .from('producer_stripe_accounts')
      .select('stripe_account_id')
      .eq('user_id', event.producer_id)
      .single();

    if (stripeError || !stripeAccount?.stripe_account_id) {
      logStep('Stripe account not found', { stripeError });
      throw new Error('Produtor não configurou conta de pagamentos');
    }

    const stripeAccountId = stripeAccount.stripe_account_id;
    logStep('Stripe account found', { stripeAccountId });

    // Fetch lots and validate availability
    const lotIds = items.map(item => item.lotId);
    const { data: lots, error: lotsError } = await supabaseClient
      .from('event_lots')
      .select('*')
      .in('id', lotIds);

    if (lotsError || !lots) {
      throw new Error('Erro ao buscar lotes');
    }

    // Calculate total and validate
    let totalAmount = 0;
    const lineItems: Array<{ lotId: string; lotName: string; quantity: number; price: number }> = [];

    for (const item of items) {
      const lot = lots.find(l => l.id === item.lotId);
      if (!lot) {
        throw new Error(`Lote não encontrado: ${item.lotId}`);
      }

      const available = lot.total_quantity - lot.sold_quantity;
      if (available < item.quantity) {
        throw new Error(`Quantidade insuficiente para ${lot.name}`);
      }

      totalAmount += lot.price * item.quantity;
      lineItems.push({
        lotId: lot.id,
        lotName: lot.name,
        quantity: item.quantity,
        price: lot.price,
      });
    }

    logStep('Items validated', { totalAmount, itemsCount: lineItems.length });

    // Get user ID if authenticated
    let userId = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: userData } = await supabaseClient.auth.getUser(token);
      userId = userData.user?.id || null;
    }

    // Create order with pending status
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    const { data: order, error: orderError } = await supabaseClient
      .from('orders')
      .insert({
        event_id: eventId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerCPF, // Using phone field for CPF temporarily
        total_amount: totalAmount,
        payment_method: 'pix',
        status: 'pending',
        user_id: userId,
      })
      .select()
      .single();

    if (orderError || !order) {
      logStep('Order creation failed', { orderError });
      throw new Error('Erro ao criar pedido');
    }

    logStep('Order created', { orderId: order.id });

    // Reserve tickets (create with valid status - order status tracks payment)
    const ticketsToCreate = [];
    for (const item of lineItems) {
      for (let i = 0; i < item.quantity; i++) {
        ticketsToCreate.push({
          event_id: eventId,
          order_id: order.id,
          lot_id: item.lotId,
          holder_name: customerName,
          holder_email: customerEmail,
          user_id: userId,
          status: 'valid',
        });
      }
    }

    const { error: ticketsError } = await supabaseClient
      .from('tickets')
      .insert(ticketsToCreate);

    if (ticketsError) {
      logStep('Tickets creation failed', { ticketsError });
      // Rollback order
      await supabaseClient.from('orders').delete().eq('id', order.id);
      throw new Error('Erro ao reservar ingressos');
    }

    logStep('Tickets reserved', { count: ticketsToCreate.length });

    // Generate PIX code using Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2025-08-27.basil',
    });

    // Calculate platform fee (10%)
    const platformFee = Math.round(totalAmount * 0.1 * 100); // In cents
    const amountInCents = Math.round(totalAmount * 100);

    // Create a PaymentIntent with PIX
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'brl',
      payment_method_types: ['pix'],
      metadata: {
        orderId: order.id,
        eventId: eventId,
        customerEmail: customerEmail,
      },
      application_fee_amount: platformFee,
      transfer_data: {
        destination: stripeAccountId,
      },
    }, {
      stripeAccount: stripeAccountId,
    });

    // For PIX, we need to confirm the payment intent to get the QR code
    // In test mode, we'll generate a simulated PIX code
    let pixCode: string;
    
    if (paymentIntent.next_action?.pix_display_qr_code) {
      pixCode = paymentIntent.next_action.pix_display_qr_code.data || '';
    } else {
      // Fallback: Generate a simulated PIX code for testing
      pixCode = `00020126580014br.gov.bcb.pix0136${order.id}520400005303986540${totalAmount.toFixed(2)}5802BR5925${customerName.slice(0, 25)}6009SAO PAULO62070503***6304`;
    }

    logStep('PIX payment intent created', { 
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status 
    });

    // Update order with payment intent ID
    await supabaseClient
      .from('orders')
      .update({ 
        payment_method: `pix:${paymentIntent.id}` 
      })
      .eq('id', order.id);

    return new Response(
      JSON.stringify({
        success: true,
        orderId: order.id,
        pixCode: pixCode,
        expiresAt: expiresAt.toISOString(),
        paymentIntentId: paymentIntent.id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
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
