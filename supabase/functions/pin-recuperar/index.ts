/*
 * pin-recuperar: PIN esquecido do painel do produtor (OS-166, 07/10/2026).
 *
 * Exige sessão (verify_jwt=true); quem é vem do token, nunca do body.
 *
 * O código vai SEMPRE para o e-mail guardado quando o PIN foi criado
 * (`producer_stripe_accounts.pin_email`), nunca para o e-mail atual da conta.
 * Por quê: quem entra com a senha roubada consegue trocar o e-mail da conta
 * (a confirmação de e-mail do cadastro está desligada e a "Minha conta" manda o
 * código só para o e-mail novo), mas não consegue trocar esse. Decisão do
 * Gabriel em 07/10: "e-mail guardado no PIN". Quem perdeu esse e-mail fala com
 * o suporte e a casa zera o PIN (`admin_zerar_pin`, sem tela).
 *
 *   pedir     {}                              → manda o código; devolve desafioId e o e-mail mascarado
 *   confirmar { desafioId, codigo, pinNovo }  → confere o código e grava o PIN novo
 *
 * O PIN novo é gravado pela função `redefinir_pin_por_recuperacao` (só
 * service_role), que é a única fora do painel que consegue trocar um PIN que
 * existe: o gatilho da tabela recusa qualquer outro caminho.
 *
 * Respostas de negócio voltam 200 com { ok:false, erro }; 401 sem sessão,
 * 429/503 do limite de tentativas (padrão do `rateLimitResponse`).
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../_shared/rateLimit.ts';
import { criarEEnviarCodigo, conferirCodigo, VALIDADE_MIN } from '../_shared/codigoAcesso.ts';
import { ehEmailInterno } from '../_shared/emailInterno.ts';
import { assuntoCodigoPin, htmlCodigoPin } from '../_shared/emailCodigo.ts';
import { maskEmail } from '../_shared/pii.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** "g•••@gmail.com", o mesmo jeito que a função meu_pin() mostra na tela. */
const mascarar = (email: string) => {
  const arroba = email.indexOf('@');
  return arroba < 1 ? '' : `${email.slice(0, 1)}•••${email.slice(arroba)}`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
  const ip = getClientIp(req);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return json({ ok: false, erro: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const acao = String(body?.acao ?? '');

    const { data: conta, error: erroConta } = await admin.from('producer_stripe_accounts')
      .select('pin_hash, pin_email')
      .eq('user_id', uid).maybeSingle();
    if (erroConta) {
      console.error('[PIN-RECUPERAR] leitura', erroConta.message);
      return json({ ok: false, erro: 'indisponivel' }, 503);
    }
    if (!conta?.pin_hash) return json({ ok: false, erro: 'sem_pin' });

    const destino = String(conta.pin_email ?? '').trim().toLowerCase();
    if (!destino || ehEmailInterno(destino)) return json({ ok: false, erro: 'sem_email' });

    if (acao === 'pedir') {
      const { data: perfil } = await admin.from('profiles')
        .select('nome_completo').eq('id', uid).maybeSingle();
      const nome = perfil?.nome_completo ?? null;

      const r = await criarEEnviarCodigo(admin, {
        proposito: 'pin', canal: 'email', destino, userId: uid, nome, ip,
        emailPersonalizado: (codigo) => ({
          assunto: assuntoCodigoPin(codigo),
          html: htmlCodigoPin({ codigo, nome, validadeMin: VALIDADE_MIN }),
        }),
      });
      if (!r.ok) {
        if (r.erro === 'rate_limited' || r.erro === 'rate_limit_unavailable') return rateLimitResponse(r.rateLimit, corsHeaders);
        return json({ ok: false, erro: r.erro === 'falha_ao_guardar' ? 'indisponivel' : 'email_nao_enviado' }, 502);
      }
      console.log('[PIN-RECUPERAR] código enviado para', maskEmail(destino));
      return json({ ok: true, desafioId: r.desafioId, expiraEm: r.expiraEm, destinoMascarado: mascarar(destino) });
    }

    if (acao === 'confirmar') {
      // PIN novo errado não gasta tentativa do código.
      const pinNovo = String(body?.pinNovo ?? '');
      if (!/^\d{4}$/.test(pinNovo)) return json({ ok: false, erro: 'pin_invalido' });

      const rl = await checkRateLimit(admin, `pin:recuperar:${uid}`, 10, 900, 900);
      if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

      const c = await conferirCodigo(admin, String(body?.desafioId ?? ''), String(body?.codigo ?? ''));
      if (!c.ok) return json({ ok: false, erro: c.erro, tentativasRestantes: c.tentativasRestantes });
      // O código tem que ser deste usuário, deste propósito e do e-mail guardado de agora.
      if (c.desafio.proposito !== 'pin' || c.desafio.user_id !== uid || c.desafio.destino !== destino) {
        return json({ ok: false, erro: 'desafio_nao_confere' });
      }

      const { data: res, error } = await admin.rpc('redefinir_pin_por_recuperacao', { _user_id: uid, _pin_novo: pinNovo });
      if (error || !res?.ok) {
        console.error('[PIN-RECUPERAR] não gravou', error?.message ?? res?.error);
        return json({ ok: false, erro: res?.error ?? 'indisponivel' }, error ? 500 : 200);
      }
      console.log('[PIN-RECUPERAR] PIN novo gravado');
      return json({ ok: true });
    }

    return json({ ok: false, erro: 'acao_invalida' }, 400);
  } catch (e) {
    console.error('[PIN-RECUPERAR] erro', e instanceof Error ? e.message : String(e));
    return json({ ok: false, erro: 'indisponivel' }, 500);
  }
});
