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
    const { collaborator_id, session_token } = await req.json();

    if (!collaborator_id) {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios ausentes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const sv = await validateCollaboratorSession(supabase, collaborator_id, session_token);
    if (!sv.valid) return sessionErrorResponse(sv, corsHeaders);

    // Eventos atribuídos a ESTE colaborador (nunca de outro).
    const { data: links, error: linksError } = await supabase
      .from('collaborator_events')
      .select('event_id')
      .eq('collaborator_id', collaborator_id);

    if (linksError) {
      console.error('[LIST-EVENTS] collaborator_events error:', linksError);
      return new Response(JSON.stringify({ error: 'Erro ao listar eventos' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const eventIds = Array.from(
      new Set((links || []).map((l: any) => l.event_id).filter(Boolean))
    );

    if (eventIds.length === 0) {
      return new Response(JSON.stringify({ events: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, title, date, time, venue, city, image_url, status')
      .in('id', eventIds)
      .eq('status', 'published')
      .order('date', { ascending: true });

    if (eventsError) {
      console.error('[LIST-EVENTS] events error:', eventsError);
      return new Response(JSON.stringify({ error: 'Erro ao listar eventos' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ events: events || [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[LIST-EVENTS] error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
