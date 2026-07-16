import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateCollaboratorSession, sessionErrorResponse } from "../_shared/collaboratorSession.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retirada de abadá: valida a entrega SEM consumir o ingresso. NÃO mexe em
// tickets.status nem validated_at, e NÃO checa a janela de check-in (a retirada
// acontece dias antes do evento). Só grava abada_redeemed_at/by (uma vez, atômico).
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticket_code, event_id, collaborator_id, session_token, source } = await req.json();

    if (!ticket_code || !event_id || !collaborator_id) {
      return new Response(
        JSON.stringify({ error: 'Código do ingresso, evento e colaborador são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1) Sessão do colaborador (token hash server-side)
    const sessionValidation = await validateCollaboratorSession(supabase, collaborator_id, session_token);
    if (!sessionValidation.valid) return sessionErrorResponse(sessionValidation, corsHeaders);

    // 2) Evento existe e tem retirada de abadá habilitada
    const { data: event } = await supabase
      .from('events')
      .select('id, title, abada_enabled')
      .eq('id', event_id)
      .maybeSingle();

    if (!event) {
      return new Response(
        JSON.stringify({ error: 'Evento não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!event.abada_enabled) {
      return new Response(
        JSON.stringify({ error: 'Retirada de abadá não habilitada para este evento' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3) Colaborador vinculado ao evento (mesmo check da validate-ticket)
    const { data: access } = await supabase
      .from('collaborator_events')
      .select('id')
      .eq('collaborator_id', collaborator_id)
      .eq('event_id', event_id)
      .maybeSingle();

    if (!access) {
      return new Response(
        JSON.stringify({ error: 'Colaborador não tem acesso a este evento' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4) Ticket por ticket_code (exato ou prefixo), no evento
    const searchCode = ticket_code.toLowerCase();
    const { data: tickets } = await supabase
      .from('tickets')
      .select(`*, events(id,title,date,time,venue), event_lots(id,name,price), seat:event_seats(label, seat_type_name)`)
      .eq('event_id', event_id)
      .or(`ticket_code.eq.${ticket_code},ticket_code.ilike.${searchCode}%`);

    const ticket = tickets?.find((t: any) =>
      t.ticket_code === ticket_code ||
      t.ticket_code.toLowerCase().startsWith(searchCode)
    );

    if (!ticket) {
      return new Response(
        JSON.stringify({ error: 'Ingresso não encontrado', found: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseTicket = {
      id: ticket.id,
      ticket_code: ticket.ticket_code,
      holder_name: ticket.holder_name,
      status: ticket.status,
      lot_name: ticket.event_lots?.name,
      event_title: ticket.events?.title,
      seat_label: ticket.seat?.label ?? ticket.seat_label ?? null,
      seat_type_name: ticket.seat?.seat_type_name ?? null,
    };

    // 5) Só ingresso 'valid' retira abadá. Demais status → recusa específica.
    if (ticket.status !== 'valid') {
      const message =
        ticket.status === 'pending' ? 'Ingresso com pagamento pendente' :
        ticket.status === 'cancelled' ? 'Ingresso cancelado' :
        ticket.status === 'used' ? 'Ingresso já foi utilizado na portaria' :
        'Status do ingresso inválido para retirada';
      return new Response(
        JSON.stringify({ found: true, error: message, ticket: baseTicket }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6) Retirada atômica: só grava se ainda não foi retirado. NÃO toca status/validated_at.
    const redeemedAt = new Date().toISOString();
    const { data: updated } = await supabase
      .from('tickets')
      .update({ abada_redeemed_at: redeemedAt, abada_redeemed_by: collaborator_id })
      .eq('id', ticket.id)
      .is('abada_redeemed_at', null)
      .select('id, abada_redeemed_at')
      .maybeSingle();

    if (!updated) {
      // 0 linhas → já retirado. Não é erro: resposta de negócio (modal amarelo).
      const { data: fresh } = await supabase
        .from('tickets')
        .select('abada_redeemed_at')
        .eq('id', ticket.id)
        .maybeSingle();
      return new Response(
        JSON.stringify({
          already_redeemed: true,
          found: true,
          message: 'Abadá já foi retirado.',
          holder_name: ticket.holder_name,
          abada_redeemed_at: fresh?.abada_redeemed_at ?? null,
          ticket: baseTicket,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7) Sucesso: log de retirada (NÃO é check-in). action = 'abada_pickup'.
    await supabase.from('checkin_logs').insert({
      ticket_id: ticket.id,
      event_id,
      collaborator_id,
      source: source || 'manual',
      action: 'abada_pickup',
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Abadá retirado com sucesso!',
        holder_name: ticket.holder_name,
        abada_redeemed_at: redeemedAt,
        ticket: { ...baseTicket, abada_redeemed_at: redeemedAt },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[REDEEM-ABADA] error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
