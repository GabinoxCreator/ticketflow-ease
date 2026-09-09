/*
 * auth-identificar — o primeiro passo do caminho novo de conta (plano 09/09/2026).
 *
 * A pessoa digita CPF, celular ou e-mail. Esta função responde UMA de duas coisas:
 *   · "já existe conta": quais contas (por índice) e os canais de cada uma,
 *     MASCARADOS ("(17) *****-1234", "ga***@gmail.com") — a tela vai pedir a senha;
 *   · "não existe": se foi CPF, consulta o nome na API do Marcel e devolve SÓ o
 *     primeiro nome ("É você, Maria?") — decisão do Gabriel, 09/09 — e se o CPF
 *     foi encontrado. A tela segue para o cadastro.
 *
 * Pública (verify_jwt=false): quem chama ainda não tem sessão. As travas:
 *   · rate limit por IP, fail-closed (20 em 10 min — um login honesto usa 1 ou 2);
 *   · dígito verificador do CPF conferido ANTES de qualquer consulta externa;
 *   · documento no BODY, nunca em query string; log só com os 3 últimos dígitos;
 *   · nunca devolve número, e-mail ou id de usuário inteiros.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../_shared/rateLimit.ts';
import { classificarIdentificador, primeiroNome, resolverContas, resumoDaConta } from '../_shared/contasV2.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const tail = (d: string) => (d.length >= 3 ? `***${d.slice(-3)}` : '***');

type ConsultaCpf = { situacao: 'ok' | 'nao_encontrado' | 'indisponivel'; primeiroNome: string | null };

async function consultarNomePeloCpf(cpf: string): Promise<ConsultaCpf> {
  const base = Deno.env.get('MARCEL_DOC_BASE');
  if (!base) return { situacao: 'indisponivel', primeiroNome: null };
  try {
    const resp = await fetch(`${base}/cpf?ni=${cpf}`, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) return { situacao: 'nao_encontrado', primeiroNome: null };
    const data = await resp.json();
    // `aprovado` = "achei o documento", não "está regular".
    if (data?.aprovado !== true) return { situacao: 'nao_encontrado', primeiroNome: null };
    const nome = typeof data?.nome === 'string' ? data.nome.trim() : '';
    if (!nome) return { situacao: 'nao_encontrado', primeiroNome: null };
    return { situacao: 'ok', primeiroNome: primeiroNome(nome) };
  } catch {
    console.warn('[AUTH-IDENTIFICAR] consulta de CPF falhou', tail(cpf));
    return { situacao: 'indisponivel', primeiroNome: null };
  }
}

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
    if (cpf) {
      const consulta = await consultarNomePeloCpf(cpf.valor);
      console.log('[AUTH-IDENTIFICAR] cpf novo', tail(cpf.valor), consulta.situacao);
      return json({ ok: true, existe: false, tipo: 'cpf', consulta: consulta.situacao, primeiroNome: consulta.primeiroNome });
    }

    return json({ ok: true, existe: false, tipo: candidatos[0].tipo });
  } catch (e) {
    console.error('[AUTH-IDENTIFICAR]', e instanceof Error ? e.message : e);
    return json({ ok: false, erro: 'internal' }, 500);
  }
});
