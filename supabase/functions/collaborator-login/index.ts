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
    const { username, password, producer_username } = await req.json();
    
    console.log('Login attempt for collaborator:', username);

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: 'Username e senha são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find collaborator by username
    const { data: collaborator, error: findError } = await supabase
      .from('collaborators')
      .select('*')
      .eq('username', username)
      .eq('is_active', true)
      .maybeSingle();

    if (findError) {
      console.error('Error finding collaborator:', findError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar colaborador' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!collaborator) {
      console.log('Collaborator not found or inactive');
      return new Response(
        JSON.stringify({ error: 'Usuário ou senha inválidos' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Simple password check (in production, use bcrypt)
    // For now, we store password as plain text hash (base64 encoded)
    const expectedHash = btoa(password);
    if (collaborator.password_hash !== expectedHash) {
      console.log('Invalid password');
      return new Response(
        JSON.stringify({ error: 'Usuário ou senha inválidos' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get events assigned to this collaborator
    const { data: collaboratorEvents, error: eventsError } = await supabase
      .from('collaborator_events')
      .select(`
        event_id,
        events (
          id,
          title,
          date,
          time,
          venue,
          city,
          state,
          image_url,
          status
        )
      `)
      .eq('collaborator_id', collaborator.id);

    if (eventsError) {
      console.error('Error fetching collaborator events:', eventsError);
    }

    // Create a simple session token (in production, use JWT)
    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    console.log('Login successful for collaborator:', collaborator.name);

    return new Response(
      JSON.stringify({
        success: true,
        collaborator: {
          id: collaborator.id,
          name: collaborator.name,
          username: collaborator.username,
          producer_id: collaborator.producer_id,
        },
        events: collaboratorEvents?.map(ce => ce.events).filter(Boolean) || [],
        session: {
          token: sessionToken,
          expires_at: expiresAt,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in collaborator-login:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
