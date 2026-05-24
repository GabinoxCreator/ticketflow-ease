import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { compareSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function validateSession(supabase: any, collaboratorId: string, sessionToken: string) {
  if (!sessionToken) return { valid: false, error: 'Token de sessão não fornecido' };
  const { data: session } = await supabase
    .from('collaborator_sessions')
    .select('session_token_hash, expires_at')
    .eq('collaborator_id', collaboratorId)
    .single();
  if (!session) return { valid: false, error: 'Sessão não encontrada' };
  if (new Date(session.expires_at) < new Date()) return { valid: false, error: 'Sessão expirada' };
  try {
    if (!compareSync(sessionToken, session.session_token_hash)) {
      return { valid: false, error: 'Token inválido' };
    }
  } catch {
    return { valid: false, error: 'Erro ao verificar sessão' };
  }
  return { valid: true };
}

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

    const sv = await validateSession(supabase, collaborator_id, session_token);
    if (!sv.valid) {
      return new Response(JSON.stringify({ error: sv.error, session_expired: true }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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

    // Tickets
    const { data: tickets } = await supabase
      .from('tickets')
      .select('status')
      .eq('event_id', event_id)
      .in('status', ['valid', 'used']);

    const ticketCheckins = tickets?.filter((t: any) => t.status === 'used').length || 0;
    const ticketPending = tickets?.filter((t: any) => t.status === 'valid').length || 0;
    const ticketsTotal = tickets?.length || 0;

    // Guest lists
    const { data: lists } = await supabase
      .from('guest_lists')
      .select('id')
      .eq('event_id', event_id)
      .eq('is_active', true);

    const listIds = (lists || []).map((l: any) => l.id);
    let guestCheckins = 0;
    let guestPending = 0;
    if (listIds.length > 0) {
      const { data: entries } = await supabase
        .from('guest_list_entries')
        .select('status')
        .in('guest_list_id', listIds);
      (entries || []).forEach((e: any) => {
        if (e.status === 'checked_in') guestCheckins++;
        else if (e.status === 'pending') guestPending++;
      });
    }

    const checkins = ticketCheckins + guestCheckins;
    const pending = ticketPending + guestPending;
    const total = ticketsTotal + guestCheckins + guestPending;

    return new Response(JSON.stringify({ checkins, pending, total }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[EVENT-STATS] error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
