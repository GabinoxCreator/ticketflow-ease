import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { compareSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function validateCollaboratorSession(
  supabase: any,
  collaboratorId: string,
  sessionToken: string
): Promise<{ valid: boolean; error?: string }> {
  if (!sessionToken) return { valid: false, error: 'Token de sessão não fornecido' };

  const { data: session, error: sessionError } = await supabase
    .from('collaborator_sessions')
    .select('session_token_hash, expires_at')
    .eq('collaborator_id', collaboratorId)
    .single();

  if (sessionError || !session) return { valid: false, error: 'Sessão não encontrada. Faça login novamente.' };
  if (new Date(session.expires_at) < new Date()) return { valid: false, error: 'Sessão expirada. Faça login novamente.' };

  try {
    if (!compareSync(sessionToken, session.session_token_hash)) {
      return { valid: false, error: 'Token de sessão inválido. Faça login novamente.' };
    }
  } catch {
    return { valid: false, error: 'Erro ao verificar sessão' };
  }

  return { valid: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, event_id, collaborator_id, session_token } = await req.json();

    if (!query || !event_id || !collaborator_id) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros obrigatórios: query, event_id, collaborator_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const sessionValidation = await validateCollaboratorSession(supabase, collaborator_id, session_token);
    if (!sessionValidation.valid) {
      return new Response(
        JSON.stringify({ error: sessionValidation.error, session_expired: true }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify collaborator access
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

    const searchTerm = `%${query.toLowerCase()}%`;

    const { data: tickets, error } = await supabase
      .from('tickets')
      .select(`
        id,
        ticket_code,
        holder_name,
        holder_email,
        holder_phone,
        status,
        validated_at,
        event_lots ( name )
      `)
      .eq('event_id', event_id)
      .or(`holder_name.ilike.${searchTerm},holder_email.ilike.${searchTerm},holder_phone.ilike.${searchTerm}`)
      .limit(20);

    if (error) {
      console.error('Search error:', error);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar ingressos' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const formatted = (tickets || []).map((t: any) => ({
      id: t.id,
      ticket_code: t.ticket_code,
      holder_name: t.holder_name,
      holder_email: t.holder_email,
      holder_phone: t.holder_phone,
      status: t.status,
      validated_at: t.validated_at,
      lot_name: t.event_lots?.name,
    }));

    return new Response(
      JSON.stringify({ tickets: formatted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in collaborator-search-tickets:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
