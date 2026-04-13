import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { compareSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to validate collaborator session
async function validateCollaboratorSession(
  supabase: any,
  collaboratorId: string,
  sessionToken: string
): Promise<{ valid: boolean; error?: string }> {
  if (!sessionToken) {
    return { valid: false, error: 'Token de sessão não fornecido' };
  }

  // Get session from database
  const { data: session, error: sessionError } = await supabase
    .from('collaborator_sessions')
    .select('session_token_hash, expires_at')
    .eq('collaborator_id', collaboratorId)
    .single();

  if (sessionError || !session) {
    console.log('Session not found for collaborator:', collaboratorId);
    return { valid: false, error: 'Sessão não encontrada. Faça login novamente.' };
  }

  // Check if session is expired
  if (new Date(session.expires_at) < new Date()) {
    console.log('Session expired for collaborator:', collaboratorId);
    return { valid: false, error: 'Sessão expirada. Faça login novamente.' };
  }

  // Verify token hash
  try {
    const isValidToken = compareSync(sessionToken, session.session_token_hash);
    if (!isValidToken) {
      console.log('Invalid session token for collaborator:', collaboratorId);
      return { valid: false, error: 'Token de sessão inválido. Faça login novamente.' };
    }
  } catch {
    console.log('Error verifying session token');
    return { valid: false, error: 'Erro ao verificar sessão' };
  }

  return { valid: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticket_code, event_id, collaborator_id, session_token, action, source } = await req.json();
    
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

    // SECURITY: Validate session token FIRST
    const sessionValidation = await validateCollaboratorSession(supabase, collaborator_id, session_token);
    if (!sessionValidation.valid) {
      return new Response(
        JSON.stringify({ error: sessionValidation.error, session_expired: true }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

      if (ticket.status === 'pending') {
        return new Response(
          JSON.stringify({
            found: true,
            error: 'Ingresso com pagamento pendente',
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

      // Log check-in
      await supabase
        .from('checkin_logs')
        .insert({
          ticket_id: ticket.id,
          event_id: event_id,
          collaborator_id: collaborator_id,
          source: source || 'manual',
          action: 'checkin',
        });

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
