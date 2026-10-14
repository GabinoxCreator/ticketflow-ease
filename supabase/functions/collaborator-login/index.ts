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

    // Rate limit: PEEK only — don't increment on success.
    // We consume an attempt only on failed login below.
    const ip = getClientIp(req);
    const userBucket = `login:user:${String(username).trim().toLowerCase()}`;
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

    const peekUser = await peek(userBucket);
    if (peekUser.blocked) return rateLimitResponse({ allowed: false, retryAfter: peekUser.retry }, corsHeaders);
    const peekIp = await peek(ipBucket);
    if (peekIp.blocked) return rateLimitResponse({ allowed: false, retryAfter: peekIp.retry }, corsHeaders);

    const consumeFailure = async () => {
      try {
        await checkRateLimit(supabase, userBucket, USER_MAX, WINDOW_S, BLOCK_S);
        await checkRateLimit(supabase, ipBucket, IP_MAX, WINDOW_S, BLOCK_S);
      } catch (e) {
        console.error('consumeFailure error', e);
      }
    };

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
      await consumeFailure();
      return new Response(
        JSON.stringify({ error: 'Usuário ou senha inválidos' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get credentials from separate table
    const { data: credentials, error: credError } = await supabase
      .from('collaborator_credentials')
      .select('password_hash')
      .eq('collaborator_id', collaborator.id)
      .maybeSingle();

    if (credError) {
      console.error('Error fetching credentials:', credError);
      return new Response(
        JSON.stringify({ error: 'Erro ao verificar credenciais' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!credentials) {
      console.log('No credentials found for collaborator');
      await consumeFailure();
      return new Response(
        JSON.stringify({ error: 'Usuário ou senha inválidos' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify password with bcrypt
    let isValidPassword = false;
    try {
      isValidPassword = compareSync(password, credentials.password_hash);
    } catch (e) {
      console.error('Error comparing password:', e);
      // Fallback for legacy base64 passwords - verify and upgrade
      const legacyHash = btoa(password);
      if (credentials.password_hash === legacyHash) {
        // Upgrade to bcrypt hash
        const newHash = hashSync(password);
        await supabase
          .from('collaborator_credentials')
          .update({ password_hash: newHash, updated_at: new Date().toISOString() })
          .eq('collaborator_id', collaborator.id);
        isValidPassword = true;
        console.log('Upgraded legacy password hash for collaborator:', collaborator.id);
      }
    }

    if (!isValidPassword) {
      console.log('Invalid password');
      await consumeFailure();
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
