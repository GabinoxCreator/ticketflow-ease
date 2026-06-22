import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// ============================================================
// FestPag Ingressos — federacao-emitir-token
// Emite um token de vínculo (link_token) assinado pra federar a conta do
// Ingressos com o FestPay. Tijolo isolado: valida a sessão do cliente, monta um
// payload com os dados da pessoa e assina com HMAC-SHA256. NÃO chama o festpay,
// NÃO grava nada no banco, NÃO cria UI. Só emite o token.
//
// Token = base64url(payload) + "." + base64url(HMAC-SHA256(base64url(payload)))
//   payload = { ingressos_user_id, cpf, nome, email, iat, exp }  (exp = iat + 5min)
// Segredo: FESTPAG_FESTPAY_LINK_SECRET (compartilhado com o festpay na verificação).
// verify_jwt = true (padrão das edges autenticadas de cliente do repo) + getUser manual.
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[FEDERACAO-EMITIR-TOKEN] ${step}${detailsStr}`);
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

// base64url sem padding (formato JWS compacto)
function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const TOKEN_TTL_SECONDS = 5 * 60; // 5 min

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const secret = Deno.env.get('FESTPAG_FESTPAY_LINK_SECRET');
    if (!supabaseUrl || !anonKey) throw new Error('Supabase env not set');
    if (!secret) throw new Error('FESTPAG_FESTPAY_LINK_SECRET is not set');

    // ---- valida a sessão do cliente (padrão do repo: Bearer + ANON + getUser) ----
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const token = authHeader.replace('Bearer ', '');

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      logStep('Auth failed', { userErr: userErr?.message });
      return json({ error: 'Unauthorized' }, 401);
    }
    const userId: string = userData.user.id;
    const authEmail: string | null = userData.user.email ?? null;

    // ---- resolve os dados da pessoa (cpf, nome, email) via RLS do próprio usuário ----
    const { data: profile } = await userClient
      .from('profiles')
      .select('nome_completo, email, cpf')
      .eq('id', userId)
      .single();

    // ---- monta o payload (exp = agora + 5 min, em segundos) ----
    const iat = Math.floor(Date.now() / 1000);
    const payload = {
      ingressos_user_id: userId,
      cpf: profile?.cpf ?? null,
      nome: profile?.nome_completo ?? null,
      email: profile?.email ?? authEmail,
      iat,
      exp: iat + TOKEN_TTL_SECONDS,
    };

    // ---- assina (HMAC-SHA256 sobre o payload base64url) ----
    const encodedPayload = base64url(new TextEncoder().encode(JSON.stringify(payload)));
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encodedPayload));
    const encodedSig = base64url(new Uint8Array(sigBuf));
    const link_token = `${encodedPayload}.${encodedSig}`;

    logStep('token emitido', { userId, exp: payload.exp });
    return json({ link_token });
  } catch (error: any) {
    logStep('ERROR', { message: error?.message });
    return json({ error: error?.message || 'internal_error' }, 500);
  }
});
