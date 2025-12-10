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
    const { id, name, username, password, is_active } = await req.json();
    
    console.log('Updating collaborator:', id);

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'ID do colaborador é obrigatório' }),
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

    // Verify the collaborator belongs to this producer
    const { data: existingCollab, error: checkError } = await supabase
      .from('collaborators')
      .select('producer_id')
      .eq('id', id)
      .single();

    if (checkError || !existingCollab) {
      return new Response(
        JSON.stringify({ error: 'Colaborador não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (existingCollab.producer_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado a atualizar este colaborador' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (username !== undefined) updateData.username = username;
    if (is_active !== undefined) updateData.is_active = is_active;
    
    // Hash new password if provided
    if (password !== undefined && password.length > 0) {
      if (password.length < 6) {
        return new Response(
          JSON.stringify({ error: 'Senha deve ter pelo menos 6 caracteres' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      updateData.password_hash = await bcrypt.hash(password);
    }

    const { data: collaborator, error } = await supabase
      .from('collaborators')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating collaborator:', error);
      throw error;
    }

    console.log('Collaborator updated successfully:', id);

    return new Response(
      JSON.stringify({ success: true, collaborator }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in update-collaborator:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
