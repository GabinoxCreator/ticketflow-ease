// create-collaborator: o produtor cria o login da portaria (colaborador) e o liga aos
// eventos dele.
//
// OS-268 (21/10/2026, varredura OS-262, achado E1): antes bastava estar logado, sem
// papel de produtor, e o vínculo era gravado com a chave de serviço para os eventIds
// do corpo SEM conferir de quem era o evento. Qualquer conta virava portaria de
// qualquer evento: lista de ingressos com o QR, e-mail e telefone, queimar ingresso,
// faturamento ao vivo. Agora:
//  - só produtor ou a casa (admin) cria colaborador;
//  - cada evento tem de ser do produtor (dono do evento ou membro ativo da produtora
//    do evento); a casa liga a qualquer evento (os 2 vínculos cruzados de hoje são
//    dela, "Apresentação FestPag");
//  - a conferência é feita ANTES de gravar qualquer coisa, e se o vínculo falhar o
//    colaborador é desfeito (antes ficava um login sem evento, em silêncio);
//  - o nome de login vai em minúsculas e sem espaço nas pontas, e é único no site
//    inteiro (migration 20261021170000).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hashSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, username: rawUsername, password, eventIds: rawEventIds } = await req.json();
    const username = typeof rawUsername === 'string' ? rawUsername.trim().toLowerCase() : '';

    console.log('Creating collaborator:', username);

    if (!name || !username || !password) {
      return json({ error: 'Nome, username e senha são obrigatórios' }, 400);
    }

    // A lista de eventos é conferida antes da senha de propósito: a conferência depois
    // do deploy manda senha curta + lista inválida, que a versão nova recusa pela lista
    // e a antiga pela senha, sem gravar nada em nenhuma das duas.
    if (rawEventIds != null && !Array.isArray(rawEventIds)) {
      return json({ error: 'Lista de eventos inválida' }, 400);
    }
    const eventIds: string[] = Array.from(new Set((rawEventIds ?? []).map((v: unknown) => String(v))));
    if (eventIds.some((id) => !UUID_RE.test(id))) {
      return json({ error: 'Lista de eventos inválida' }, 400);
    }

    // Validate password strength
    if (typeof password !== 'string' || password.length < 6) {
      return json({ error: 'Senha deve ter pelo menos 6 caracteres' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Não autorizado' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return json({ error: 'Usuário não autenticado' }, 401);
    }

    // 1) Papel: só produtor ou a casa (admin). Erro ao ler os papéis = recusa.
    const { data: papeis, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    if (rolesError) {
      console.error('Error reading roles:', rolesError);
      return json({ error: 'Erro interno do servidor' }, 500);
    }
    const roles = new Set((papeis ?? []).map((r: { role: string }) => r.role));
    const isAdmin = roles.has('admin');
    if (!isAdmin && !roles.has('produtor')) {
      console.warn('create-collaborator recusado: sem papel de produtor', user.id);
      return json({ error: 'Não autorizado a criar colaborador' }, 403);
    }

    // 2) Eventos: todos têm de existir e, fora a casa, ser do produtor (dono do evento
    //    ou membro ativo da produtora do evento). Confere tudo ANTES de gravar.
    if (eventIds.length > 0) {
      const { data: eventos, error: evError } = await supabase
        .from('events')
        .select('id, producer_id, producer_profile_id')
        .in('id', eventIds);
      if (evError) {
        console.error('Error reading events:', evError);
        return json({ error: 'Erro interno do servidor' }, 500);
      }
      if ((eventos ?? []).length !== eventIds.length) {
        return json({ error: 'Evento não encontrado' }, 404);
      }

      if (!isAdmin) {
        const { data: membros, error: memError } = await supabase
          .from('producer_members')
          .select('producer_profile_id')
          .eq('user_id', user.id)
          .eq('status', 'active');
        if (memError) {
          console.error('Error reading producer_members:', memError);
          return json({ error: 'Erro interno do servidor' }, 500);
        }
        const produtoras = new Set((membros ?? []).map((m: { producer_profile_id: string }) => m.producer_profile_id));
        const alheio = (eventos ?? []).find((e: { producer_id: string; producer_profile_id: string | null }) =>
          e.producer_id !== user.id && !(e.producer_profile_id && produtoras.has(e.producer_profile_id))
        );
        if (alheio) {
          console.warn('create-collaborator recusado: evento alheio', user.id, alheio.id);
          return json({ error: 'Não autorizado a vincular este evento' }, 403);
        }
      }
    }

    // Hash password with bcrypt
    const passwordHash = hashSync(password);

    // Create collaborator (without password_hash)
    const { data: collaborator, error } = await supabase
      .from('collaborators')
      .insert({
        name,
        username,
        producer_id: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating collaborator:', error);
      if (error.code === '23505') {
        return json({ error: 'Já existe um colaborador com este username' }, 400);
      }
      throw error;
    }

    // Store password hash in separate credentials table
    const { error: credError } = await supabase
      .from('collaborator_credentials')
      .insert({
        collaborator_id: collaborator.id,
        password_hash: passwordHash,
      });

    if (credError) {
      console.error('Error storing credentials:', credError);
      // Rollback collaborator creation
      await supabase.from('collaborators').delete().eq('id', collaborator.id);
      throw credError;
    }

    // Assign events to collaborator (já conferidos acima)
    if (eventIds.length > 0) {
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
        // Desfaz: login sem o evento pedido não serve na portaria.
        await supabase.from('collaborators').delete().eq('id', collaborator.id);
        throw eventsError;
      }
    }

    console.log('Collaborator created successfully:', collaborator.id);

    return json({ success: true, collaborator });
  } catch (error) {
    console.error('Error in create-collaborator:', error);
    return json({ error: 'Erro interno do servidor' }, 500);
  }
});
