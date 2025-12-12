import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CartItem {
  lotId: string;
  quantity: number;
}

interface OrderRequest {
  eventId: string;
  cartItems: CartItem[];
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  userId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { eventId, cartItems, customerName, customerEmail, customerPhone, userId }: OrderRequest = await req.json();

    // Validate required fields
    if (!eventId || !cartItems || cartItems.length === 0 || !customerName || !customerEmail) {
      return new Response(
        JSON.stringify({ error: 'Dados incompletos. Evento, itens, nome e email são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      return new Response(
        JSON.stringify({ error: 'Email inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate name length
    if (customerName.trim().length < 3 || customerName.trim().length > 100) {
      return new Response(
        JSON.stringify({ error: 'Nome deve ter entre 3 e 100 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Creating PIX order for event ${eventId}`);

    // Verify event exists and is published
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, status')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      console.log('Event not found:', eventId);
      return new Response(
        JSON.stringify({ error: 'Evento não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (event.status !== 'published') {
      console.log('Event not published:', eventId);
      return new Response(
        JSON.stringify({ error: 'Evento não está disponível para vendas' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get lots and validate availability
    const lotIds = cartItems.map(item => item.lotId);
    const { data: lots, error: lotsError } = await supabase
      .from('event_lots')
      .select('id, name, price, total_quantity, sold_quantity, is_active')
      .in('id', lotIds)
      .eq('event_id', eventId);

    if (lotsError || !lots || lots.length === 0) {
      console.log('Lots not found');
      return new Response(
        JSON.stringify({ error: 'Lotes não encontrados' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate each item
    let totalAmount = 0;
    const itemsWithLots: { lot: typeof lots[0]; quantity: number }[] = [];

    for (const item of cartItems) {
      const lot = lots.find(l => l.id === item.lotId);
      
      if (!lot) {
        return new Response(
          JSON.stringify({ error: `Lote não encontrado: ${item.lotId}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!lot.is_active) {
        return new Response(
          JSON.stringify({ error: `Lote "${lot.name}" não está mais disponível` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const available = lot.total_quantity - lot.sold_quantity;
      if (item.quantity > available) {
        return new Response(
          JSON.stringify({ error: `Quantidade insuficiente para "${lot.name}". Disponível: ${available}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (item.quantity < 1 || item.quantity > 10) {
        return new Response(
          JSON.stringify({ error: 'Quantidade deve ser entre 1 e 10 por lote' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      totalAmount += lot.price * item.quantity;
      itemsWithLots.push({ lot, quantity: item.quantity });
    }

    console.log(`Order total: ${totalAmount}`);

    // Create order with pending status
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        event_id: eventId,
        user_id: userId || null,
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim().toLowerCase(),
        customer_phone: customerPhone?.trim() || null,
        total_amount: totalAmount,
        status: 'pending',
        payment_method: 'pix',
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      return new Response(
        JSON.stringify({ error: 'Erro ao criar pedido' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Order created: ${order.id}`);

    // Create tickets with PENDING status (not valid until payment confirmed)
    const ticketsToCreate = itemsWithLots.flatMap(item =>
      Array.from({ length: item.quantity }, () => ({
        order_id: order.id,
        event_id: eventId,
        lot_id: item.lot.id,
        user_id: userId || null,
        holder_name: customerName.trim(),
        holder_email: customerEmail.trim().toLowerCase(),
        holder_phone: customerPhone?.trim() || null,
        status: 'pending', // IMPORTANT: Tickets are pending until payment confirmed
      }))
    );

    const { error: ticketsError } = await supabase
      .from('tickets')
      .insert(ticketsToCreate);

    if (ticketsError) {
      console.error('Error creating tickets:', ticketsError);
      // Rollback order
      await supabase.from('orders').delete().eq('id', order.id);
      return new Response(
        JSON.stringify({ error: 'Erro ao criar ingressos' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update sold_quantity for each lot (reserve tickets)
    for (const item of itemsWithLots) {
      const { error: updateError } = await supabase
        .from('event_lots')
        .update({ sold_quantity: item.lot.sold_quantity + item.quantity })
        .eq('id', item.lot.id);

      if (updateError) {
        console.error('Error updating lot quantity:', updateError);
        // Note: We continue even if this fails, as tickets are already created
      }
    }

    console.log(`PIX order completed: ${order.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        order: {
          id: order.id,
          total_amount: totalAmount,
          status: 'pending',
        },
        message: 'Pedido criado. Complete o pagamento via PIX para ativar seus ingressos.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in create-pix-order:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
