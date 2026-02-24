import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CartItem {
  lotId: string;
  quantity: number;
}

interface CheckoutRequest {
  eventId: string;
  cartItems?: CartItem[];
  items?: CartItem[];
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  customerCPF?: string;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-MERCADOPAGO-PREFERENCE] ${step}${detailsStr}`);
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

    const requestBody: CheckoutRequest = await req.json();
    const { eventId, customerEmail, customerName, customerPhone, customerCPF } = requestBody;
    const cartItems = requestBody.cartItems || requestBody.items;

    if (!eventId || !cartItems || cartItems.length === 0) {
      throw new Error('Event ID and cart items are required');
    }

    // Get event details
    const { data: event, error: eventError } = await supabaseClient
      .from('events')
      .select('id, title, status')
      .eq('id', eventId)
      .single();

    if (eventError || !event) throw new Error('Evento não encontrado');
    if (event.status !== 'published') throw new Error('Evento não está disponível para vendas');

    // Get lot details
    const lotIds = cartItems.map(item => item.lotId);
    const { data: lots, error: lotsError } = await supabaseClient
      .from('event_lots')
      .select('id, name, price, sold_quantity, total_quantity, is_active')
      .in('id', lotIds)
      .eq('event_id', eventId);

    if (lotsError || !lots) throw new Error('Erro ao buscar lotes');

    // Validate and build items
    let totalAmount = 0;
    const mpItems: any[] = [];
    const itemDetails: Array<{ lotId: string; quantity: number; price: number }> = [];

    for (const cartItem of cartItems) {
      const lot = lots.find(l => l.id === cartItem.lotId);
      if (!lot) throw new Error(`Lote não encontrado: ${cartItem.lotId}`);
      if (!lot.is_active) throw new Error(`Lote "${lot.name}" não está mais disponível`);

      const available = lot.total_quantity - lot.sold_quantity;
      if (cartItem.quantity > available) {
        throw new Error(`Quantidade insuficiente para "${lot.name}"`);
      }

      totalAmount += lot.price * cartItem.quantity;
      itemDetails.push({ lotId: lot.id, quantity: cartItem.quantity, price: lot.price });

      mpItems.push({
        title: `${event.title} - ${lot.name}`,
        quantity: cartItem.quantity,
        unit_price: lot.price,
        currency_id: 'BRL',
      });
    }

    logStep('Items validated', { totalAmount, itemsCount: mpItems.length });

    // Get user ID if authenticated
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: userData } = await supabaseClient.auth.getUser(token);
      userId = userData.user?.id || null;
    }

    // Create order
    const { data: order, error: orderError } = await supabaseClient
      .from('orders')
      .insert({
        event_id: eventId,
        user_id: userId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone || null,
        total_amount: totalAmount,
        status: 'pending',
        payment_method: 'card',
      })
      .select()
      .single();

    if (orderError || !order) throw new Error('Erro ao criar pedido');

    logStep('Order created', { orderId: order.id });

    // Create tickets with pending status
    const ticketsToCreate = itemDetails.flatMap(item =>
      Array.from({ length: item.quantity }, () => ({
        event_id: eventId,
        order_id: order.id,
        lot_id: item.lotId,
        holder_name: customerName,
        holder_email: customerEmail,
        holder_phone: customerPhone || null,
        user_id: userId,
        status: 'pending',
      }))
    );

    const { error: ticketsError } = await supabaseClient
      .from('tickets')
      .insert(ticketsToCreate);

    if (ticketsError) {
      await supabaseClient.from('orders').delete().eq('id', order.id);
      throw new Error('Erro ao reservar ingressos');
    }

    // Update sold_quantity
    for (const item of itemDetails) {
      const lot = lots.find(l => l.id === item.lotId)!;
      await supabaseClient
        .from('event_lots')
        .update({ sold_quantity: lot.sold_quantity + item.quantity })
        .eq('id', item.lotId);
    }

    // Create Mercado Pago Preference
    const origin = req.headers.get('origin') || 'https://ticketflow-ease.lovable.app';

    const preferenceBody = {
      items: mpItems,
      payer: {
        email: customerEmail,
        name: customerName,
      },
      back_urls: {
        success: `${origin}/checkout/sucesso?order_id=${order.id}`,
        failure: `${origin}/evento/${eventId}`,
        pending: `${origin}/checkout/sucesso?order_id=${order.id}&status=pending`,
      },
      auto_return: 'approved',
      external_reference: order.id,
      payment_methods: {
        excluded_payment_types: [
          { id: 'ticket' }, // exclude boleto
        ],
      },
    };

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mercadopagoToken}`,
      },
      body: JSON.stringify(preferenceBody),
    });

    if (!mpResponse.ok) {
      const mpError = await mpResponse.json();
      logStep('Mercado Pago error', mpError);
      // Rollback
      await supabaseClient.from('tickets').delete().eq('order_id', order.id);
      await supabaseClient.from('orders').delete().eq('id', order.id);
      throw new Error('Erro ao criar sessão de pagamento');
    }

    const preference = await mpResponse.json();
    logStep('Preference created', { preferenceId: preference.id });

    // Update order with preference ID
    await supabaseClient
      .from('orders')
      .update({ payment_method: `card:${preference.id}` })
      .eq('id', order.id);

    return new Response(
      JSON.stringify({
        url: preference.init_point,
        preferenceId: preference.id,
        orderId: order.id,
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
