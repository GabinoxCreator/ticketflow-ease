import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, username, password, eventIds } = await req.json();
    
    console.log('Creating collaborator:', username);

    if (!name || !username || !password) {
      return new Response(
        JSON.stringify({ error: 'Nome, username e senha são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate password strength
    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Senha deve ter pelo menos 6 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password);
    
    // Create collaborator
    const { data: collaborator, error } = await supabase
      .from('collaborators')
      .insert({
        name,
        username,
        password_hash: passwordHash,
        producer_id: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating collaborator:', error);
      if (error.code === '23505') {
        return new Response(
          JSON.stringify({ error: 'Já existe um colaborador com este username' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw error;
    }

    // Assign events to collaborator
    if (eventIds && eventIds.length > 0) {
      const { error: eventsError } = await supabase
        .from('collaborator_events')
        .insert(
          eventIds.map((eventId: string) => ({
            collaborator_id: collaborator.id,
            event_id: eventId,
          }))
        );

      if (eventsError) {
        console.error('Error assigning events:', eventsError);
      }
    }

    console.log('Collaborator created successfully:', collaborator.id);

    return new Response(
      JSON.stringify({ success: true, collaborator }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in create-collaborator:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
