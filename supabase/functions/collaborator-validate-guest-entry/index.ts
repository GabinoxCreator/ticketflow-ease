import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateCollaboratorSession, sessionErrorResponse } from "../_shared/collaboratorSession.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { entry_id, event_id, collaborator_id, session_token, source } = await req.json();

    if (!entry_id || !event_id || !collaborator_id) {
      return new Response(
        JSON.stringify({ error: 'ID da entrada, evento e colaborador são obrigatórios' }),
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

    const { data: entry, error: entryError } = await supabase
      .from('guest_list_entries')
      .select(`*, guest_lists!inner(id, name, event_id)`)
      .eq('id', entry_id)
      .single();

    if (entryError || !entry) {
      return new Response(
        JSON.stringify({ error: 'Entrada não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (entry.guest_lists.event_id !== event_id) {
      return new Response(
        JSON.stringify({ error: 'Esta entrada não pertence a este evento' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
        guest_entry_id: entry.id,
        event_id,
        collaborator_id,
        source: source || 'lista',
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
          reason: win.reason,
          starts_at: win.starts_at,
          ends_at: win.ends_at,
          message,
          error: message,
          entry: {
            id: entry.id,
            name: entry.name,
            status: entry.status,
            list_name: entry.guest_lists.name,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Atomic update
    const checkedAt = new Date().toISOString();
    const { data: updated } = await supabase
      .from('guest_list_entries')
      .update({ status: 'checked_in', checked_in_at: checkedAt })
      .eq('id', entry_id)
      .eq('status', 'pending')
      .select()
      .maybeSingle();

    if (!updated) {
      const { data: fresh } = await supabase
        .from('guest_list_entries')
        .select('status, checked_in_at')
        .eq('id', entry_id)
        .maybeSingle();
      return new Response(
        JSON.stringify({
          error: 'Convidado já fez check-in',
          entry: {
            id: entry.id,
            name: entry.name,
            status: fresh?.status ?? entry.status,
            checked_in_at: fresh?.checked_in_at ?? entry.checked_in_at,
            list_name: entry.guest_lists.name,
          },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await supabase.from('checkin_logs').insert({
      guest_entry_id: entry.id,
      event_id,
      collaborator_id,
      source: source || 'lista',
      action: 'checkin',
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Check-in realizado com sucesso!',
        entry: {
          id: entry.id,
          name: entry.name,
          status: 'checked_in',
          checked_in_at: checkedAt,
          list_name: entry.guest_lists.name,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[VALIDATE-GUEST] error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
