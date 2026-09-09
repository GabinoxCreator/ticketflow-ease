/*
 * auth-canal — "Minha conta": confirmar, adicionar ou trocar WhatsApp/e-mail, e
 * trocar a senha, sempre com código (Bloco 2, plano de 09/09/2026).
 *
 * Exige sessão (verify_jwt=true). Duas ações:
 *
 *   pedir     { canal, destino? }
 *             destino ausente = confirmar o que já está no perfil;
 *             destino presente = adicionar/trocar (o código vai para o NOVO).
 *   confirmar { desafioId, codigo, novaSenha? }
 *             código certo → grava o canal como confirmado (e troca o e-mail no
 *             Supabase, se for e-mail); com `novaSenha`, troca a senha também.
 *
 * Quem só tinha WhatsApp e confirma um e-mail de verdade deixa de ter o e-mail
 * interno: o Supabase passa a conhecer o endereço real (e o `sem_email` sai do
 * metadata). Produtor continua fora disto — ele muda e-mail pelo caminho dele.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../_shared/rateLimit.ts';
import { carregarConfigWhatsApp, normalizarNumeroBr, numeroTemWhatsApp, mascararNumeroParaTela } from '../_shared/whatsapp.ts';
import { criarEEnviarCodigo, conferirCodigo, type Canal } from '../_shared/codigoAcesso.ts';
import { ehEmailInterno } from '../_shared/emailInterno.ts';
import { buscarContas } from '../_shared/contasV2.ts';
import { maskEmail } from '../_shared/pii.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
  const ip = getClientIp(req);

  try {
    // Quem é: pelo token da sessão, nunca por id no body.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return json({ ok: false, erro: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const acao = String(body?.acao ?? '');

    const { data: perfil } = await admin.from('profiles')
      .select('id, nome_completo, whatsapp, email, whatsapp_confirmado_em, email_confirmado_em, canal_preferido')
      .eq('id', uid).maybeSingle();
    if (!perfil) return json({ ok: false, erro: 'perfil_nao_encontrado' }, 404);

    if (acao === 'pedir') {
      const canal = body?.canal as Canal;
      if (canal !== 'whatsapp' && canal !== 'email') return json({ ok: false, erro: 'canal_invalido' }, 400);

      let destino: string | null;
      if (canal === 'whatsapp') {
        destino = body?.destino ? normalizarNumeroBr(body.destino) : normalizarNumeroBr(perfil.whatsapp);
        if (!destino) return json({ ok: false, erro: 'whatsapp_invalido' }, 400);
        await carregarConfigWhatsApp(admin);
        const tem = await numeroTemWhatsApp(destino);
        if (tem && !tem.existe) return json({ ok: false, erro: 'numero_sem_whatsapp' }, 400);
        if (tem?.numero) destino = tem.numero;
      } else {
        destino = String(body?.destino ?? perfil.email ?? '').trim().toLowerCase();
        if (!destino || !EMAIL_RE.test(destino) || ehEmailInterno(destino)) return json({ ok: false, erro: 'email_invalido' }, 400);
        // E-mail de OUTRA conta não pode virar o desta.
        const donos = await buscarContas(admin, 'email', destino);
        if (donos.some((c) => c.user_id !== uid)) return json({ ok: false, erro: 'email_ja_cadastrado' }, 409);
      }

      const r = await criarEEnviarCodigo(admin, { proposito: 'canal', canal, destino, userId: uid, nome: perfil.nome_completo, ip });
      if (!r.ok) {
        if (r.erro === 'rate_limited' || r.erro === 'rate_limit_unavailable') return rateLimitResponse(r.rateLimit, corsHeaders);
        return json({ ok: false, erro: r.erro }, r.erro.startsWith('whatsapp') || r.erro === 'email_nao_enviado' ? 502 : 500);
      }
      return json({
        ok: true, desafioId: r.desafioId, expiraEm: r.expiraEm, canal,
        destinoMascarado: canal === 'whatsapp' ? mascararNumeroParaTela(destino) : maskEmail(destino),
      });
    }

    if (acao === 'confirmar') {
      const rl = await checkRateLimit(admin, `canal:confirmar:${uid}`, 10, 900, 900);
      if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

      const c = await conferirCodigo(admin, String(body?.desafioId ?? ''), String(body?.codigo ?? ''));
      if (!c.ok) return json({ ok: false, erro: c.erro, tentativasRestantes: c.tentativasRestantes }, 400);
      if (c.desafio.proposito !== 'canal' || c.desafio.user_id !== uid) return json({ ok: false, erro: 'desafio_nao_confere' }, 400);

      const agora = new Date().toISOString();
      const novaSenha = body?.novaSenha ? String(body.novaSenha) : null;
      if (novaSenha && (novaSenha.length < 6 || novaSenha.length > 72)) return json({ ok: false, erro: 'senha_invalida' }, 400);

      if (c.desafio.canal === 'whatsapp') {
        await admin.from('profiles').update({
          whatsapp: c.desafio.destino, whatsapp_confirmado_em: agora,
          ...(perfil.canal_preferido ? {} : { canal_preferido: 'whatsapp' }),
        }).eq('id', uid);
      } else {
        const { data: u } = await admin.auth.admin.getUserById(uid);
        const emailAtual = u?.user?.email ?? '';
        const metadata = { ...(u?.user?.user_metadata ?? {}) } as Record<string, unknown>;
        delete metadata.sem_email;
        if (emailAtual.toLowerCase() !== c.desafio.destino) {
          const { error: e } = await admin.auth.admin.updateUserById(uid, { email: c.desafio.destino, email_confirm: true, user_metadata: metadata });
          if (e) {
            console.error('[AUTH-CANAL] updateUserById email', e.message);
            return json({ ok: false, erro: /already|exists|registered/i.test(e.message) ? 'email_ja_cadastrado' : 'nao_trocou_email' }, 409);
          }
        }
        await admin.from('profiles').update({
          email: c.desafio.destino, email_confirmado_em: agora,
          ...(perfil.canal_preferido ? {} : { canal_preferido: 'email' }),
        }).eq('id', uid);
      }

      if (novaSenha) {
        const { error: e } = await admin.auth.admin.updateUserById(uid, { password: novaSenha });
        if (e) return json({ ok: false, erro: 'nao_trocou_senha' }, 500);
      }

      console.log('[AUTH-CANAL] confirmado', c.desafio.canal, novaSenha ? '+senha' : '');
      return json({ ok: true, canal: c.desafio.canal, senhaTrocada: !!novaSenha });
    }

    if (acao === 'preferencia') {
      const pref = body?.canal_preferido;
      if (!['whatsapp', 'email', 'ambos'].includes(pref)) return json({ ok: false, erro: 'canal_invalido' }, 400);
      if (pref !== 'email' && !perfil.whatsapp_confirmado_em) return json({ ok: false, erro: 'sem_whatsapp' }, 400);
      if (pref !== 'whatsapp' && (!perfil.email || ehEmailInterno(perfil.email))) return json({ ok: false, erro: 'sem_email' }, 400);
      await admin.from('profiles').update({ canal_preferido: pref }).eq('id', uid);
      return json({ ok: true, canal_preferido: pref });
    }

    return json({ ok: false, erro: 'acao_invalida' }, 400);
  } catch (e) {
    console.error('[AUTH-CANAL]', e instanceof Error ? e.message : e);
    return json({ ok: false, erro: 'internal' }, 500);
  }
});
