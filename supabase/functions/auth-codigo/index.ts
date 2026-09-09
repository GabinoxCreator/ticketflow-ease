/*
 * auth-codigo — cadastro e login com senha + código (plano de 09/09/2026).
 *
 * Seis ações, todas POST com { acao, ... }:
 *
 *   pedir_cadastro     { cpf, nome, whatsapp?, email?, canal }
 *                      → manda o código para o canal escolhido. Ainda NÃO cria conta.
 *   confirmar_cadastro { desafioId, codigo, cpf, nome, whatsapp?, email?, senha }
 *                      → confere o código, cria a conta (com senha) e devolve a sessão.
 *   pedir_login        { identificador, contaIndice?, canal, senha }
 *                      → confere a SENHA primeiro; só então manda o código.
 *                        (ninguém dispara WhatsApp alheio sem a senha da conta)
 *   confirmar_login    { desafioId, codigo, identificador, contaIndice?, senha }
 *                      → confere o código, confere a senha de novo e devolve a sessão.
 *   pedir_reset        { identificador, contaIndice?, canal }
 *                      → "esqueci a senha": manda o código para um canal DA CONTA.
 *   confirmar_reset    { desafioId, codigo, identificador, contaIndice?, novaSenha }
 *                      → confere o código, troca a senha e devolve a sessão.
 *
 * A sessão é a do Supabase (`signInWithPassword` feito AQUI, no servidor): o
 * navegador recebe access_token + refresh_token e chama `setSession`. Nada de
 * token próprio.
 *
 * Quem só tem WhatsApp ganha um e-mail interno no Supabase
 * (`<cpf>@sem-email.festpag.digital`, metadata `sem_email`); o perfil fica com
 * e-mail vazio e nenhum envio vai para lá.
 *
 * Pública (verify_jwt=false): quem chama ainda não tem sessão. Travas: rate limit
 * fail-closed em cada ação (por IP, por destino e por conta na senha), código com
 * 10 min e 5 tentativas, e a senha conferida antes do envio no login.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../_shared/rateLimit.ts';
import { validateCPF, unformatCPF } from '../_shared/cpf.ts';
import { validarNomePessoa, normalizarNomePessoa } from '../_shared/nomePessoa.ts';
import { carregarConfigWhatsApp, normalizarNumeroBr, numeroTemWhatsApp, mascararNumeroParaTela } from '../_shared/whatsapp.ts';
import { criarEEnviarCodigo, conferirCodigo, emailInternoSemEmail, ehEmailInterno, type Canal } from '../_shared/codigoAcesso.ts';
import { classificarIdentificador, resolverContas, buscarContas, canaisDaConta, type Conta } from '../_shared/contasV2.ts';
import { maskEmail } from '../_shared/pii.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENHA_MIN = 6;
const SENHA_MAX = 72;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

type Sessao = { access_token: string; refresh_token: string; expires_in?: number };

/** Confere a senha e devolve a sessão (ou null se a senha está errada). */
async function sessaoPorSenha(emailAuth: string, senha: string): Promise<Sessao | null> {
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: emailAuth, password: senha });
  if (error || !data.session) return null;
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token, expires_in: data.session.expires_in };
}

function respostaDeEnvio(r: Awaited<ReturnType<typeof criarEEnviarCodigo>>, extra: Record<string, unknown> = {}) {
  if (r.ok) return json({ ok: true, desafioId: r.desafioId, expiraEm: r.expiraEm, ...extra });
  if (r.erro === 'rate_limited' || r.erro === 'rate_limit_unavailable') return rateLimitResponse(r.rateLimit, corsHeaders);
  const status = r.erro.startsWith('whatsapp') ? 502 : r.erro === 'email_nao_enviado' ? 502 : 500;
  return json({ ok: false, erro: r.erro, ...extra }, status);
}

/** Limpa e valida o que veio do cadastro. Devolve erro pronto para responder, ou os dados. */
function lerDadosDeCadastro(body: any) {
  const cpf = unformatCPF(body?.cpf);
  if (!validateCPF(cpf)) return { erro: json({ ok: false, erro: 'cpf_invalido' }, 400) };
  const nome = normalizarNomePessoa(body?.nome);
  const erroNome = validarNomePessoa(nome);
  if (erroNome) return { erro: json({ ok: false, erro: 'nome_invalido', mensagem: erroNome }, 400) };
  const whatsapp = body?.whatsapp ? normalizarNumeroBr(body.whatsapp) : null;
  if (body?.whatsapp && !whatsapp) return { erro: json({ ok: false, erro: 'whatsapp_invalido' }, 400) };
  const email = body?.email ? String(body.email).trim().toLowerCase() : null;
  if (email && (!EMAIL_RE.test(email) || ehEmailInterno(email))) return { erro: json({ ok: false, erro: 'email_invalido' }, 400) };
  if (!whatsapp && !email) return { erro: json({ ok: false, erro: 'sem_contato' }, 400) };
  const canal = body?.canal as Canal;
  if (canal !== 'whatsapp' && canal !== 'email') return { erro: json({ ok: false, erro: 'canal_invalido' }, 400) };
  if (canal === 'whatsapp' && !whatsapp) return { erro: json({ ok: false, erro: 'sem_whatsapp' }, 400) };
  if (canal === 'email' && !email) return { erro: json({ ok: false, erro: 'sem_email' }, 400) };
  return { dados: { cpf, nome, whatsapp, email, canal } };
}

/** Acha a conta do login pelo identificador + índice (mesma ordem do auth-identificar). */
async function contaDoLogin(admin: any, body: any): Promise<{ conta: Conta } | { erro: Response }> {
  const candidatos = classificarIdentificador(body?.identificador);
  if (candidatos.length === 0) return { erro: json({ ok: false, erro: 'identificador_invalido' }, 400) };
  const achado = await resolverContas(admin, candidatos);
  if (!achado) return { erro: json({ ok: false, erro: 'conta_nao_encontrada' }, 404) };
  const indice = Number.isInteger(body?.contaIndice) ? Number(body.contaIndice) : 0;
  if (achado.contas.length > 1 && !Number.isInteger(body?.contaIndice)) {
    return { erro: json({ ok: false, erro: 'escolha_conta', contas: achado.contas.length }, 400) };
  }
  const conta = achado.contas[indice];
  if (!conta) return { erro: json({ ok: false, erro: 'conta_nao_encontrada' }, 404) };
  return { conta };
}

/** E-mail com que a conta faz login no Supabase (real ou interno). */
async function emailDeAuth(admin: any, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  return data.user.email;
}

/** Senha errada demais = bloqueio, por conta e por IP. Fail-closed. */
async function limiteDeSenha(admin: any, userId: string, ip: string) {
  const rlConta = await checkRateLimit(admin, `senha:conta:${userId}`, 5, 900, 1800);
  if (!rlConta.allowed) return rateLimitResponse(rlConta, corsHeaders);
  const rlIp = await checkRateLimit(admin, `senha:ip:${ip}`, 20, 900, 1800);
  if (!rlIp.allowed) return rateLimitResponse(rlIp, corsHeaders);
  return null;
}

async function carimbarCanal(admin: any, userId: string, canal: Canal, whatsappConfirmado?: string | null) {
  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = canal === 'whatsapp'
    ? { whatsapp_confirmado_em: agora, ...(whatsappConfirmado ? { whatsapp: whatsappConfirmado } : {}) }
    : { email_confirmado_em: agora };
  const { data: atual } = await admin.from('profiles').select('canal_preferido').eq('id', userId).maybeSingle();
  if (!atual?.canal_preferido) patch.canal_preferido = canal;
  await admin.from('profiles').update(patch).eq('id', userId);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'method_not_allowed' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const ip = getClientIp(req);

  try {
    const body = await req.json().catch(() => ({}));
    const acao = String(body?.acao ?? '');

    const rlIp = await checkRateLimit(admin, `auth-codigo:ip:${ip}`, 40, 900, 900);
    if (!rlIp.allowed) return rateLimitResponse(rlIp, corsHeaders);

    // ------------------------------------------------------------------ cadastro
    if (acao === 'pedir_cadastro') {
      const lido = lerDadosDeCadastro(body);
      if (lido.erro) return lido.erro;
      const { cpf, nome, whatsapp, email, canal } = lido.dados!;

      if ((await buscarContas(admin, 'cpf', cpf)).length > 0) return json({ ok: false, erro: 'cpf_ja_cadastrado' }, 409);
      if (email && (await buscarContas(admin, 'email', email)).length > 0) return json({ ok: false, erro: 'email_ja_cadastrado' }, 409);

      let destino = canal === 'whatsapp' ? whatsapp! : email!;
      if (canal === 'whatsapp') {
        await carregarConfigWhatsApp(admin);
        const tem = await numeroTemWhatsApp(destino);
        if (tem && !tem.existe) return json({ ok: false, erro: 'numero_sem_whatsapp', podeTentarEmail: !!email }, 400);
        if (tem?.numero) destino = tem.numero; // formato que a Evolution reconhece
      }

      const r = await criarEEnviarCodigo(admin, { proposito: 'cadastro', canal, destino, cpf, nome, ip });
      return respostaDeEnvio(r, {
        canal,
        destinoMascarado: canal === 'whatsapp' ? mascararNumeroParaTela(destino) : maskEmail(destino),
        podeTentarEmail: canal === 'whatsapp' && !!email,
      });
    }

    if (acao === 'confirmar_cadastro') {
      const lido = lerDadosDeCadastro(body);
      if (lido.erro) return lido.erro;
      const { cpf, nome, whatsapp, email, canal } = lido.dados!;
      const senha = String(body?.senha ?? '');
      if (senha.length < SENHA_MIN || senha.length > SENHA_MAX) return json({ ok: false, erro: 'senha_invalida' }, 400);

      const c = await conferirCodigo(admin, String(body?.desafioId ?? ''), String(body?.codigo ?? ''));
      if (!c.ok) return json({ ok: false, erro: c.erro, tentativasRestantes: c.tentativasRestantes }, 400);
      const d = c.desafio;
      // O código tem de ser deste CPF, deste canal e deste destino — nada de trocar
      // o número depois de conferir.
      const destinoEsperado = canal === 'whatsapp' ? whatsapp : email;
      const destinoBate = d.canal === 'whatsapp'
        ? normalizarNumeroBr(d.destino)?.slice(-8) === normalizarNumeroBr(destinoEsperado)?.slice(-8)
        : d.destino === destinoEsperado;
      if (d.proposito !== 'cadastro' || d.cpf !== cpf || d.canal !== canal || !destinoBate) {
        return json({ ok: false, erro: 'desafio_nao_confere' }, 400);
      }

      // Corrida: alguém pode ter cadastrado este CPF entre o pedido e a confirmação.
      if ((await buscarContas(admin, 'cpf', cpf)).length > 0) return json({ ok: false, erro: 'cpf_ja_cadastrado' }, 409);

      const emailAuth = email ?? emailInternoSemEmail(cpf);
      const whatsappFinal = canal === 'whatsapp' ? d.destino : whatsapp;
      const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
        email: emailAuth,
        password: senha,
        email_confirm: true,
        user_metadata: {
          nome_completo: nome,
          cpf,
          whatsapp: whatsappFinal ?? '',
          tipo_conta: 'cliente',
          ...(email ? {} : { sem_email: 'true' }),
          canal_cadastro: canal,
        },
      });
      if (erroCriar || !criado?.user) {
        const msg = erroCriar?.message ?? '';
        console.error('[AUTH-CODIGO] createUser', msg);
        if (/already|registered|exists/i.test(msg)) return json({ ok: false, erro: 'email_ja_cadastrado' }, 409);
        return json({ ok: false, erro: 'nao_criou_conta' }, 500);
      }

      await carimbarCanal(admin, criado.user.id, canal, canal === 'whatsapp' ? d.destino : null);

      const sessao = await sessaoPorSenha(emailAuth, senha);
      if (!sessao) return json({ ok: false, erro: 'conta_criada_sem_sessao' }, 500);
      console.log('[AUTH-CODIGO] conta criada por', canal);
      return json({ ok: true, sessao, primeiroNome: nome.split(' ')[0] });
    }

    // --------------------------------------------------------------------- login
    if (acao === 'pedir_login') {
      const achado = await contaDoLogin(admin, body);
      if ('erro' in achado) return achado.erro;
      const { conta } = achado;
      const canal = body?.canal as Canal;
      if (canal !== 'whatsapp' && canal !== 'email') return json({ ok: false, erro: 'canal_invalido' }, 400);
      if (canal === 'whatsapp' && !conta.whatsapp) return json({ ok: false, erro: 'sem_whatsapp' }, 400);
      if (canal === 'email' && !conta.email) return json({ ok: false, erro: 'sem_email' }, 400);

      const bloqueio = await limiteDeSenha(admin, conta.user_id, ip);
      if (bloqueio) return bloqueio;
      const emailAuth = await emailDeAuth(admin, conta.user_id);
      if (!emailAuth) return json({ ok: false, erro: 'conta_nao_encontrada' }, 404);
      const senha = String(body?.senha ?? '');
      if (!senha || !(await sessaoPorSenha(emailAuth, senha))) return json({ ok: false, erro: 'senha_incorreta' }, 401);

      let destino = canal === 'whatsapp' ? conta.whatsapp! : conta.email!;
      if (canal === 'whatsapp') {
        await carregarConfigWhatsApp(admin);
        const tem = await numeroTemWhatsApp(destino);
        if (tem && !tem.existe) return json({ ok: false, erro: 'numero_sem_whatsapp', podeTentarEmail: !!conta.email }, 400);
        if (tem?.numero) destino = tem.numero;
      }
      const r = await criarEEnviarCodigo(admin, { proposito: 'login', canal, destino, userId: conta.user_id, nome: conta.nome, ip });
      return respostaDeEnvio(r, {
        canal,
        destinoMascarado: canal === 'whatsapp' ? mascararNumeroParaTela(destino) : maskEmail(destino),
        podeTentarEmail: canal === 'whatsapp' && !!conta.email,
        canais: canaisDaConta(conta),
      });
    }

    if (acao === 'confirmar_login') {
      const achado = await contaDoLogin(admin, body);
      if ('erro' in achado) return achado.erro;
      const { conta } = achado;

      const c = await conferirCodigo(admin, String(body?.desafioId ?? ''), String(body?.codigo ?? ''));
      if (!c.ok) return json({ ok: false, erro: c.erro, tentativasRestantes: c.tentativasRestantes }, 400);
      if (c.desafio.proposito !== 'login' || c.desafio.user_id !== conta.user_id) return json({ ok: false, erro: 'desafio_nao_confere' }, 400);

      const bloqueio = await limiteDeSenha(admin, conta.user_id, ip);
      if (bloqueio) return bloqueio;
      const emailAuth = await emailDeAuth(admin, conta.user_id);
      if (!emailAuth) return json({ ok: false, erro: 'conta_nao_encontrada' }, 404);
      const sessao = await sessaoPorSenha(emailAuth, String(body?.senha ?? ''));
      if (!sessao) return json({ ok: false, erro: 'senha_incorreta' }, 401);

      // Este login provou o canal: carimba (só se ainda não estava carimbado).
      const { data: perfil } = await admin.from('profiles')
        .select('whatsapp_confirmado_em, email_confirmado_em').eq('id', conta.user_id).maybeSingle();
      const jaCarimbado = c.desafio.canal === 'whatsapp' ? !!perfil?.whatsapp_confirmado_em : !!perfil?.email_confirmado_em;
      if (!jaCarimbado) await carimbarCanal(admin, conta.user_id, c.desafio.canal, c.desafio.canal === 'whatsapp' ? c.desafio.destino : null);

      console.log('[AUTH-CODIGO] login por', c.desafio.canal);
      return json({ ok: true, sessao, primeiroNome: conta.primeiroNome });
    }

    // ------------------------------------------------------ esqueci a senha
    if (acao === 'pedir_reset') {
      const achado = await contaDoLogin(admin, body);
      if ('erro' in achado) return achado.erro;
      const { conta } = achado;
      const canal = body?.canal as Canal;
      if (canal !== 'whatsapp' && canal !== 'email') return json({ ok: false, erro: 'canal_invalido' }, 400);
      if (canal === 'whatsapp' && !conta.whatsapp) return json({ ok: false, erro: 'sem_whatsapp' }, 400);
      if (canal === 'email' && !conta.email) return json({ ok: false, erro: 'sem_email' }, 400);

      let destino = canal === 'whatsapp' ? conta.whatsapp! : conta.email!;
      if (canal === 'whatsapp') {
        await carregarConfigWhatsApp(admin);
        const tem = await numeroTemWhatsApp(destino);
        if (tem && !tem.existe) return json({ ok: false, erro: 'numero_sem_whatsapp', podeTentarEmail: !!conta.email }, 400);
        if (tem?.numero) destino = tem.numero;
      }
      // Sem senha aqui, por definição — é ela que a pessoa perdeu. O que segura é o
      // rate limit por destino/IP do motor e o código só ir para um canal DA CONTA.
      const r = await criarEEnviarCodigo(admin, { proposito: 'reset', canal, destino, userId: conta.user_id, nome: conta.nome, ip });
      return respostaDeEnvio(r, {
        canal,
        destinoMascarado: canal === 'whatsapp' ? mascararNumeroParaTela(destino) : maskEmail(destino),
        podeTentarEmail: canal === 'whatsapp' && !!conta.email,
      });
    }

    if (acao === 'confirmar_reset') {
      const achado = await contaDoLogin(admin, body);
      if ('erro' in achado) return achado.erro;
      const { conta } = achado;
      const novaSenha = String(body?.novaSenha ?? '');
      if (novaSenha.length < SENHA_MIN || novaSenha.length > SENHA_MAX) return json({ ok: false, erro: 'senha_invalida' }, 400);

      const c = await conferirCodigo(admin, String(body?.desafioId ?? ''), String(body?.codigo ?? ''));
      if (!c.ok) return json({ ok: false, erro: c.erro, tentativasRestantes: c.tentativasRestantes }, 400);
      if (c.desafio.proposito !== 'reset' || c.desafio.user_id !== conta.user_id) return json({ ok: false, erro: 'desafio_nao_confere' }, 400);

      const { error: e } = await admin.auth.admin.updateUserById(conta.user_id, { password: novaSenha });
      if (e) {
        console.error('[AUTH-CODIGO] reset updateUserById', e.message);
        return json({ ok: false, erro: 'nao_trocou_senha' }, 500);
      }
      // O código provou o canal: carimba, se ainda não estava.
      const { data: perfil } = await admin.from('profiles')
        .select('whatsapp_confirmado_em, email_confirmado_em').eq('id', conta.user_id).maybeSingle();
      const jaCarimbado = c.desafio.canal === 'whatsapp' ? !!perfil?.whatsapp_confirmado_em : !!perfil?.email_confirmado_em;
      if (!jaCarimbado) await carimbarCanal(admin, conta.user_id, c.desafio.canal, c.desafio.canal === 'whatsapp' ? c.desafio.destino : null);

      const emailAuth = await emailDeAuth(admin, conta.user_id);
      const sessao = emailAuth ? await sessaoPorSenha(emailAuth, novaSenha) : null;
      console.log('[AUTH-CODIGO] senha redefinida por', c.desafio.canal);
      return json({ ok: true, sessao, primeiroNome: conta.primeiroNome });
    }

    return json({ ok: false, erro: 'acao_invalida' }, 400);
  } catch (e) {
    console.error('[AUTH-CODIGO]', e instanceof Error ? e.message : e);
    return json({ ok: false, erro: 'internal' }, 500);
  }
});
