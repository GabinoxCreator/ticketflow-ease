import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticket_code, event_id, collaborator_id, action } = await req.json();
    
    console.log('Ticket validation request:', { ticket_code, event_id, collaborator_id, action });

    if (!ticket_code || !event_id || !collaborator_id) {
      return new Response(
        JSON.stringify({ error: 'Código do ingresso, evento e colaborador são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify collaborator has access to this event
    const { data: access, error: accessError } = await supabase
      .from('collaborator_events')
      .select('id')
      .eq('collaborator_id', collaborator_id)
      .eq('event_id', event_id)
      .maybeSingle();

    if (accessError || !access) {
      console.log('Collaborator does not have access to this event');
      return new Response(
        JSON.stringify({ error: 'Colaborador não tem acesso a este evento' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find ticket by code (can be full code or first 8 chars)
    const searchCode = ticket_code.toLowerCase();
    const { data: tickets, error: ticketError } = await supabase
      .from('tickets')
      .select(`
        *,
        events (
          id,
          title,
          date,
          time,
          venue
        ),
        event_lots (
          id,
          name,
          price
        )
      `)
      .eq('event_id', event_id)
      .or(`ticket_code.eq.${ticket_code},ticket_code.ilike.${searchCode}%`);

    if (ticketError) {
      console.error('Error finding ticket:', ticketError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar ingresso' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ticket = tickets?.find(t => 
      t.ticket_code === ticket_code || 
      t.ticket_code.toLowerCase().startsWith(searchCode)
    );

    if (!ticket) {
      console.log('Ticket not found');
      return new Response(
        JSON.stringify({ 
          error: 'Ingresso não encontrado',
          found: false 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If just checking (not validating)
    if (action === 'check') {
      return new Response(
        JSON.stringify({
          found: true,
          ticket: {
            id: ticket.id,
            ticket_code: ticket.ticket_code,
            holder_name: ticket.holder_name,
            holder_email: ticket.holder_email,
            status: ticket.status,
            validated_at: ticket.validated_at,
            lot_name: ticket.event_lots?.name,
            event_title: ticket.events?.title,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate ticket
    if (action === 'validate') {
      if (ticket.status === 'used') {
        return new Response(
          JSON.stringify({
            found: true,
            error: 'Ingresso já foi utilizado',
            ticket: {
              id: ticket.id,
              ticket_code: ticket.ticket_code,
              holder_name: ticket.holder_name,
              status: ticket.status,
              validated_at: ticket.validated_at,
            },
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (ticket.status === 'cancelled') {
        return new Response(
          JSON.stringify({
            found: true,
            error: 'Ingresso cancelado',
            ticket: {
              id: ticket.id,
              ticket_code: ticket.ticket_code,
              holder_name: ticket.holder_name,
              status: ticket.status,
            },
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Mark ticket as used
      const { error: updateError } = await supabase
        .from('tickets')
        .update({
          status: 'used',
          validated_at: new Date().toISOString(),
        })
        .eq('id', ticket.id);

      if (updateError) {
        console.error('Error updating ticket:', updateError);
        return new Response(
          JSON.stringify({ error: 'Erro ao validar ingresso' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Ticket validated successfully:', ticket.ticket_code);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Ingresso validado com sucesso!',
          ticket: {
            id: ticket.id,
            ticket_code: ticket.ticket_code,
            holder_name: ticket.holder_name,
            holder_email: ticket.holder_email,
            status: 'used',
            validated_at: new Date().toISOString(),
            lot_name: ticket.event_lots?.name,
            event_title: ticket.events?.title,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação inválida' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in collaborator-validate-ticket:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
