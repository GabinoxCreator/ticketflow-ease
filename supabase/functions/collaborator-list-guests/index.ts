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
    const { event_id, collaborator_id, session_token } = await req.json();

    if (!event_id || !collaborator_id) {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios ausentes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const sv = await validateCollaboratorSession(supabase, collaborator_id, session_token);
    if (!sv.valid) return sessionErrorResponse(sv, corsHeaders);


    const { data: access } = await supabase
      .from('collaborator_events')
      .select('id')
      .eq('collaborator_id', collaborator_id)
      .eq('event_id', event_id)
      .maybeSingle();

    if (!access) {
      return new Response(JSON.stringify({ error: 'Sem acesso a este evento' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: lists } = await supabase
      .from('guest_lists')
      .select('id, name')
      .eq('event_id', event_id)
      .eq('is_active', true)
      .order('name', { ascending: true });

    const listIds = (lists || []).map((l: any) => l.id);
    const entriesByList: Record<string, any[]> = {};
    listIds.forEach(id => (entriesByList[id] = []));

    if (listIds.length > 0) {
      const { data: entries } = await supabase
        .from('guest_list_entries')
        .select('id, name, status, checked_in_at, created_at, added_by, guest_list_id')
        .in('guest_list_id', listIds)
        .order('name', { ascending: true })
        .limit(10000);
      (entries || []).forEach((e: any) => {
        const arr = entriesByList[e.guest_list_id] || [];
        arr.push({
          id: e.id,
          name: e.name,
          status: e.status,
          checked_in_at: e.checked_in_at,
          created_at: e.created_at,
          added_by: e.added_by,
        });
        entriesByList[e.guest_list_id] = arr;
      });
    }

    const result = (lists || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      entries: entriesByList[l.id] || [],
    }));

    return new Response(JSON.stringify({ lists: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[LIST-GUESTS] error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
