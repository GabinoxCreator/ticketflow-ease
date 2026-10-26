import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { compareSync, hashSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";
import { hashToken } from "../_shared/collaboratorSession.ts";


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Login do vendedor dura até o fim do evento (OS-229, decisão do Gabriel em
// 14/10/2026). Antes vencia em 24h e o totem de ingresso parava a venda na tela
// de usuário e senha. Fim do evento = dia seguinte ao end_date (ou date), às
// 23h59 de Brasília (UTC-3, sem horário de verão). Vários eventos: vale o que
// termina por último. Nunca menos de 24h, então quem não tem evento por vir
// segue como antes. Desativar o vendedor continua derrubando a sessão na hora
// (collaboratorSession.ts, ensureCollaboratorActive).
const DAY_MS = 24 * 60 * 60 * 1000;

// Hash bcrypt de uma senha que ninguém usa (OS-268): conferido quando o nome não
// existe, para a resposta demorar o mesmo que a de um nome que existe.
const FAKE_HASH = '$2a$10$wyahbLYldNy/She/vpcRk.B093UY94p18znPX84bHbIVhTG3avDCS';

function sessionExpiresAt(events: Array<{ date?: string | null; end_date?: string | null }>): Date {
  let expires = Date.now() + DAY_MS;
  for (const ev of events) {
    const lastDay = ev.end_date || ev.date;
    if (!lastDay || !/^\d{4}-\d{2}-\d{2}/.test(lastDay)) continue;
    // 23:59:59 em Brasília do dia seguinte = 02:59:59 UTC de dois dias depois.
    const end = Date.parse(`${lastDay.slice(0, 10)}T23:59:59-03:00`) + DAY_MS;
    if (Number.isFinite(end) && end > expires) expires = end;
  }
  return new Date(expires);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username, password } = await req.json();
    
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

    // OS-268 (21/10/2026, varredura OS-262, achado E2). Antes:
    //  - a trava contava só pelo NOME (10 erros = 15 min fora), também para quem tinha a
    //    senha certa: quem soubesse o nome trancava a portaria de um cliente de qualquer
    //    lugar;
    //  - a tentativa só era contada DEPOIS de conferir a senha (várias em paralelo
    //    passavam todas);
    //  - nome repetido em dois produtores dava erro 500 para os dois (maybeSingle).
    // Agora a trava é por NOME + IP (contada ANTES de conferir a senha, e zerada quando
    // a senha confere), mais a trava por IP de antes; usuário que não existe gasta o
    // mesmo tempo de conferência; e nome repetido não derruba ninguém (o nome passou a
    // ser único no site, migration 20261021170000, e até lá vale a senha que conferir).
    const uname = String(username).trim().toLowerCase();
    const ip = getClientIp(req);
    const userIpBucket = `login:user:${uname}:ip:${ip}`;
    const ipBucket = `login:ip:${ip}`;
    const USER_MAX = 10;
    const IP_MAX = 20;
    const WINDOW_S = 900;
    const BLOCK_S = 900;

    const peek = async (bucket: string) => {
      const { data } = await supabase
        .from('auth_rate_limits')
        .select('blocked_until')
        .eq('bucket_key', bucket)
        .maybeSingle();
      const until = data?.blocked_until ? new Date(data.blocked_until) : null;
      if (until && until > new Date()) {
        const retry = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
        return { blocked: true, retry };
      }
      return { blocked: false, retry: 0 };
    };

    const peekIp = await peek(ipBucket);
    if (peekIp.blocked) return rateLimitResponse({ allowed: false, retryAfter: peekIp.retry }, corsHeaders);

    // Conta a tentativa ANTES de conferir a senha (nome + IP). Fail-closed: sem o
    // contador, 503.
    const tentativa = await checkRateLimit(supabase, userIpBucket, USER_MAX, WINDOW_S, BLOCK_S);
    if (!tentativa.allowed) return rateLimitResponse(tentativa, corsHeaders);

    const consumeFailure = async () => {
      try {
        await checkRateLimit(supabase, ipBucket, IP_MAX, WINDOW_S, BLOCK_S);
      } catch (e) {
        console.error('consumeFailure error', e);
      }
    };

    const falhou = async () => {
      await consumeFailure();
      return new Response(
        JSON.stringify({ error: 'Usuário ou senha inválidos' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    };

    // Find collaborator by username (pode vir mais de um até a migration subir)
    const { data: candidatos, error: findError } = await supabase
      .from('collaborators')
      .select('*')
      .eq('username', uname)
      .eq('is_active', true)
      .limit(5);

    if (findError) {
      console.error('Error finding collaborator:', findError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar colaborador' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get credentials from separate table
    const ids = (candidatos ?? []).map((c: { id: string }) => c.id);
    let credenciais: Array<{ collaborator_id: string; password_hash: string }> = [];
    if (ids.length > 0) {
      const { data: creds, error: credError } = await supabase
        .from('collaborator_credentials')
        .select('collaborator_id, password_hash')
        .in('collaborator_id', ids);

      if (credError) {
        console.error('Error fetching credentials:', credError);
        return new Response(
          JSON.stringify({ error: 'Erro ao verificar credenciais' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      credenciais = creds ?? [];
    }

    if (credenciais.length === 0) {
      // Usuário que não existe (ou sem senha) gasta o mesmo tempo de quem existe,
      // para o tempo de resposta não dizer quais nomes existem.
      try { compareSync(password, FAKE_HASH); } catch (_) { /* só o tempo importa */ }
      console.log('Collaborator not found or inactive');
      return await falhou();
    }

    // Verify password with bcrypt
    const senhaConfere = async (cred: { collaborator_id: string; password_hash: string }) => {
      try {
        return compareSync(password, cred.password_hash);
      } catch (e) {
        console.error('Error comparing password:', e);
        // Fallback for legacy base64 passwords - verify and upgrade
        const legacyHash = btoa(password);
        if (cred.password_hash === legacyHash) {
          // Upgrade to bcrypt hash
          const newHash = hashSync(password);
          await supabase
            .from('collaborator_credentials')
            .update({ password_hash: newHash, updated_at: new Date().toISOString() })
            .eq('collaborator_id', cred.collaborator_id);
          console.log('Upgraded legacy password hash for collaborator:', cred.collaborator_id);
          return true;
        }
        return false;
      }
    };

    const conferem: string[] = [];
    for (const cred of credenciais) {
      if (await senhaConfere(cred)) conferem.push(cred.collaborator_id);
    }

    if (conferem.length !== 1) {
      // 0 = senha errada. 2+ = mesmo nome E mesma senha em dois produtores: não dá para
      // saber de qual evento é, então recusa como senha errada (antes era 500 para
      // qualquer nome repetido). Some quando o nome único subir.
      if (conferem.length > 1) console.error('Nome repetido com a mesma senha:', uname, conferem);
      else console.log('Invalid password');
      return await falhou();
    }

    const collaborator = (candidatos ?? []).find((c: { id: string }) => c.id === conferem[0]);

    // Senha certa: zera a contagem deste nome neste IP (não trava quem entra várias
    // vezes do mesmo lugar, como as maquininhas de um evento atrás do mesmo roteador).
    try {
      await supabase.from('auth_rate_limits').delete().eq('bucket_key', userIpBucket);
    } catch (e) {
      console.error('reset rate limit error', e);
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
          end_date,
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

    // Generate a secure session token
    const sessionToken = crypto.randomUUID();
    const expiresAt = sessionExpiresAt(
      (collaboratorEvents ?? []).map((ce: any) => ce.events).filter(Boolean),
    );

    // Hash the token with SHA-256 (fast, deterministic, no WASM) before storing.
    // Old bcrypt-hashed sessions remain valid via fallback in validateCollaboratorSession.
    const tokenHash = await hashToken(sessionToken);


    // Store session in database (upsert to handle existing sessions)
    const { error: sessionError } = await supabase
      .from('collaborator_sessions')
      .upsert({
        collaborator_id: collaborator.id,
        session_token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      }, {
        onConflict: 'collaborator_id'
      });

    if (sessionError) {
      console.error('Failed to create session:', sessionError);
      return new Response(
        JSON.stringify({ error: 'Erro ao criar sessão' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
          token: sessionToken, // Send plain token to client (hashed in DB)
          expires_at: expiresAt.toISOString(),
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
