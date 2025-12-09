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
    const { entry_id, event_id, collaborator_id } = await req.json();
    
    console.log('Guest entry validation request:', { entry_id, event_id, collaborator_id });

    if (!entry_id || !event_id || !collaborator_id) {
      return new Response(
        JSON.stringify({ error: 'ID da entrada, evento e colaborador são obrigatórios' }),
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

    // Get the guest list entry and verify it belongs to this event
    const { data: entry, error: entryError } = await supabase
      .from('guest_list_entries')
      .select(`
        *,
        guest_lists!inner (
          id,
          name,
          event_id
        )
      `)
      .eq('id', entry_id)
      .single();

    if (entryError || !entry) {
      console.error('Entry not found:', entryError);
      return new Response(
        JSON.stringify({ error: 'Entrada não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify entry belongs to this event
    if (entry.guest_lists.event_id !== event_id) {
      return new Response(
        JSON.stringify({ error: 'Esta entrada não pertence a este evento' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already checked in
    if (entry.status === 'checked_in') {
      return new Response(
        JSON.stringify({
          error: 'Convidado já fez check-in',
          entry: {
            id: entry.id,
            name: entry.name,
            status: entry.status,
            checked_in_at: entry.checked_in_at,
            list_name: entry.guest_lists.name,
          },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark as checked in
    const { error: updateError } = await supabase
      .from('guest_list_entries')
      .update({
        status: 'checked_in',
        checked_in_at: new Date().toISOString(),
      })
      .eq('id', entry_id);

    if (updateError) {
      console.error('Error updating entry:', updateError);
      return new Response(
        JSON.stringify({ error: 'Erro ao realizar check-in' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Guest entry checked in successfully:', entry.name);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Check-in realizado com sucesso!',
        entry: {
          id: entry.id,
          name: entry.name,
          status: 'checked_in',
          checked_in_at: new Date().toISOString(),
          list_name: entry.guest_lists.name,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in collaborator-validate-guest-entry:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
