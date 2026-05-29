import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateCollaboratorSession, sessionErrorResponse } from "../_shared/collaboratorSession.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticket_code, event_id, collaborator_id, session_token, action, source } = await req.json();

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

    const sessionValidation = await validateCollaboratorSession(supabase, collaborator_id, session_token);
    if (!sessionValidation.valid) return sessionErrorResponse(sessionValidation, corsHeaders);


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
            seat_label: ticket.seat?.label ?? ticket.seat_label ?? null,
            seat_type_name: ticket.seat?.seat_type_name ?? null,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'validate') {
      // Check window — fail closed if RPC fails or returns nothing
      const { data: windowRows, error: windowError } = await supabase
        .rpc('is_event_checkin_open', { _event_id: event_id });
      const win = Array.isArray(windowRows) ? windowRows[0] : windowRows;
      if (windowError || !win) {
        console.error('[CHECKIN-WINDOW] unavailable', { event_id, collaborator_id, error: windowError });
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Não foi possível validar a janela de check-in. Tente novamente.',
            reason: 'checkin_window_unavailable',
          }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!win.is_open) {
        await supabase.from('checkin_logs').insert({
          ticket_id: ticket.id,
          event_id,
          collaborator_id,
          source: source || 'manual',
          action: 'checkin_blocked_window',
        });
        const message = win.reason === 'before_window'
          ? 'Check-in ainda não liberado para este evento.'
          : win.reason === 'after_window'
            ? 'Janela de check-in encerrada.'
            : 'Check-in indisponível.';
        return new Response(
          JSON.stringify({
            ok: false,
            found: true,
            reason: win.reason,
            starts_at: win.starts_at,
            ends_at: win.ends_at,
            message,
            error: message,
            ticket: {
              id: ticket.id,
              ticket_code: ticket.ticket_code,
              holder_name: ticket.holder_name,
              status: ticket.status,
            },
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (ticket.status === 'cancelled' || ticket.status === 'pending') {
        return new Response(
          JSON.stringify({
            found: true,
            error: ticket.status === 'cancelled' ? 'Ingresso cancelado' : 'Ingresso com pagamento pendente',
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

      // Atomic update: only succeeds if status is still 'valid'
      const validatedAt = new Date().toISOString();
      const { data: updated } = await supabase
        .from('tickets')
        .update({ status: 'used', validated_at: validatedAt })
        .eq('id', ticket.id)
        .eq('status', 'valid')
        .select()
        .maybeSingle();

      if (!updated) {
        // Re-read to determine current state
        const { data: fresh } = await supabase
          .from('tickets')
          .select('status, validated_at')
          .eq('id', ticket.id)
          .maybeSingle();
        const isUsed = fresh?.status === 'used';
        return new Response(
          JSON.stringify({
            found: true,
            error: isUsed ? 'Ingresso já foi utilizado' : 'Status do ingresso inválido',
            ticket: {
              id: ticket.id,
              ticket_code: ticket.ticket_code,
              holder_name: ticket.holder_name,
              status: fresh?.status ?? ticket.status,
              validated_at: fresh?.validated_at,
            },
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabase.from('checkin_logs').insert({
        ticket_id: ticket.id,
        event_id,
        collaborator_id,
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
            validated_at: validatedAt,
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
    console.error('[VALIDATE-TICKET] error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
