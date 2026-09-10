/*
 * auth-identificar — o primeiro passo da conta de cliente (plano 09/09/2026).
 *
 * A pessoa digita celular, e-mail ou CPF. Esta função responde UMA de duas coisas:
 *   · "já existe conta": quais contas (por índice) e os canais de cada uma,
 *     MASCARADOS ("(17) *****-1234", "ga***@gmail.com") — a tela pede a senha;
 *   · "não existe": só isso. Nada além do tipo do que foi digitado.
 *
 * ⚠️ Até 10/09/2026 esta função devolvia, para CPF sem conta, o primeiro nome do
 * dono, consultado na API do Marcel — que lê a base da Receita, não a nossa.
 * Ou seja: qualquer um digitava um CPF qualquer, de qualquer brasileiro, e
 * recebia o nome de volta. Isso saiu daqui e não volta: nome de terceiro não
 * é resposta de função pública, em hipótese nenhuma.
 *
 * Pública (verify_jwt=false): quem chama ainda não tem sessão. As travas:
 *   · rate limit por IP, fail-closed (20 em 10 min — um login honesto usa 1 ou 2);
 *   · dígito verificador do CPF conferido antes de qualquer busca;
 *   · documento no BODY, nunca em query string; log só com os 3 últimos dígitos;
 *   · nunca devolve número, e-mail, nome de terceiro ou id de usuário inteiros.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../_shared/rateLimit.ts';
import { classificarIdentificador, resolverContas, resumoDaConta } from '../_shared/contasV2.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const tail = (d: string) => (d.length >= 3 ? `***${d.slice(-3)}` : '***');

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const candidatos = classificarIdentificador((body as { identificador?: string }).identificador);
    if (candidatos.length === 0) return json({ ok: false, erro: 'identificador_invalido' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false },
    });

    const ip = getClientIp(req);
    const rl = await checkRateLimit(admin, `identificar:ip:${ip}`, 20, 600, 900);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const achado = await resolverContas(admin, candidatos);
    if (achado) {
      console.log('[AUTH-IDENTIFICAR] conta existe', achado.candidato.tipo, achado.contas.length);
      return json({
        ok: true,
        existe: true,
        tipo: achado.candidato.tipo,
        contas: achado.contas.map(resumoDaConta),
      });
    }

    const cpf = candidatos.find((c) => c.tipo === 'cpf');
    if (cpf) console.log('[AUTH-IDENTIFICAR] cpf sem conta', tail(cpf.valor));

    return json({ ok: true, existe: false, tipo: cpf ? 'cpf' : candidatos[0].tipo });
  } catch (e) {
    console.error('[AUTH-IDENTIFICAR]', e instanceof Error ? e.message : e);
    return json({ ok: false, erro: 'internal' }, 500);
  }
});
