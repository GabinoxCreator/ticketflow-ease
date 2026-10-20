// redeploy 2026-10-20: código só por e-mail (OS-285)
/*
 * auth-codigo — cadastro e login com senha + código (plano de 09/09/2026).
 *
 * Seis ações, todas POST com { acao, ... }:
 *
 *   pedir_cadastro     { cpf, nome, whatsapp?, email, canal: 'email' }
 *                      → manda o código para o e-mail. Ainda NÃO cria conta.
 *   confirmar_cadastro { desafioId, cpf, nome, whatsapp?, email, senha }
 *                      → confere a prova, cria a conta (com senha) e devolve a sessão.
 *   pedir_login        { identificador, contaIndice?, canal: 'email', senha, emailNovo? }
 *                      → confere a SENHA primeiro; só então manda o código.
 *                        Conta sem e-mail manda `emailNovo`: o código vai para ele.
 *   confirmar_login    { desafioId, codigo, identificador, contaIndice?, senha }
 *                      → confere o código, confere a senha de novo e devolve a sessão.
 *                        Se o código foi para um `emailNovo`, ele vira o e-mail da conta.
 *   pedir_reset        { identificador, contaIndice?, canal: 'email' }
 *                      → "esqueci a senha": manda o código para o e-mail DA CONTA.
 *   confirmar_reset    { desafioId, codigo, identificador, contaIndice?, novaSenha }
 *                      → confere o código, troca a senha e devolve a sessão.
 *
 * ── Só e-mail (OS-285, decisão do Gabriel, 20/10/2026) ───────────────────────
 * O código ia também pelo WhatsApp (pedido da Porcada do Amor, público mais
 * velho). O número da FestPag caiu em 10/10 e nenhum código saiu por ele desde
 * então, com 6 em 10 contas novas sem e-mail e sem como entrar. Voltou ao
 * normal: código SÓ por e-mail. O WhatsApp continua como campo do cadastro
 * (vai para o perfil, sem código e sem carimbo). `canal: 'whatsapp'` em
 * qualquer ação responde `whatsapp_nao_configurado` (erro que a tela antiga,
 * ainda em cache, já sabe tratar: mostra "use o e-mail" e, no login, desvia
 * sozinha para o e-mail da conta). As contas antigas sem e-mail
 * (`<cpf>@sem-email.festpag.digital`, metadata `sem_email`) ganham um na hora
 * de entrar, pelo `emailNovo`.
 *
 * A sessão é a do Supabase (`signInWithPassword` feito AQUI, no servidor): o
 * navegador recebe access_token + refresh_token e chama `setSession`. Nada de
 * token próprio.
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
import { normalizarNumeroBr } from '../_shared/whatsapp.ts';
import { criarEEnviarCodigo, conferirCodigo, provarCodigo, consumirProva, ehEmailInterno, type Canal } from '../_shared/codigoAcesso.ts';
import { buscarNomePeloCpf } from '../_shared/docCpf.ts';
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
  /*
   * O nome NÃO vem mais do navegador por padrão: vem do registro, pelo CPF
   * (decisão do Gabriel, 10/09). O corpo só traz `nome` no caso raro em que a
   * consulta não respondeu e a tela precisou perguntar. Por isso é opcional
   * aqui — mas continua passando pela mesma validação quando vem.
   */
  const nomeDigitado = body?.nome ? normalizarNomePessoa(body.nome) : '';
  if (nomeDigitado) {
    const erroNome = validarNomePessoa(nomeDigitado);
    if (erroNome) return { erro: json({ ok: false, erro: 'nome_invalido', mensagem: erroNome }, 400) };
  }
  const nome = nomeDigitado || null;
  const whatsapp = body?.whatsapp ? normalizarNumeroBr(body.whatsapp) : null;
  if (body?.whatsapp && !whatsapp) return { erro: json({ ok: false, erro: 'whatsapp_invalido' }, 400) };
  const email = body?.email ? String(body.email).trim().toLowerCase() : null;
  if (email && (!EMAIL_RE.test(email) || ehEmailInterno(email))) return { erro: json({ ok: false, erro: 'email_invalido' }, 400) };
  // Só o e-mail confirma a conta (OS-285). O WhatsApp é um campo: vai para o
  // perfil como foi digitado (normalizado), sem código e sem carimbo.
  // `whatsapp_nao_configurado` de propósito, e não um erro novo: a tela ANTIGA
  // (em cache até o publish chegar) conhece esse erro, mostra "use o e-mail" e,
  // no login, desvia sozinha para o e-mail quando vem `podeTentarEmail`.
  const canal = body?.canal as Canal;
  if (canal === 'whatsapp') return { erro: json({ ok: false, erro: 'whatsapp_nao_configurado', podeTentarEmail: !!email }, 400) };
  if (canal !== 'email') return { erro: json({ ok: false, erro: 'canal_invalido' }, 400) };
  if (!email) return { erro: json({ ok: false, erro: 'sem_email' }, 400) };
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

      /*
       * O nome vem do CPF. A pessoa não digita e a tela nunca o mostra — ele
       * sai do registro e vai direto para a conta (ver _shared/docCpf.ts).
       *
       * Se o registro não respondeu, aí sim perguntamos: a tela mostra o campo
       * e repete a chamada com `nome` preenchido. Nunca barramos por causa
       * disso — conta sem nome é ingresso em branco na portaria, mas cadastro
       * barrado é venda perdida, e a segunda dói mais.
       */
      const busca = await buscarNomePeloCpf(cpf);
      const nomeDoTitular = busca.situacao === 'ok' ? busca.nome : nome;
      if (!nomeDoTitular) {
        return json({ ok: false, erro: 'nome_necessario', motivo: busca.situacao }, 400);
      }

      const destino = email!;
      const r = await criarEEnviarCodigo(admin, { proposito: 'cadastro', canal, destino, cpf, nome: nomeDoTitular, ip });
      return respostaDeEnvio(r, { canal, destinoMascarado: maskEmail(destino) });
    }

    /*
     * Cadastro novo (10/09/2026): a pessoa confirma o canal AQUI, antes de
     * escolher a senha. Guarda a prova e NÃO queima o desafio — quem queima é o
     * `confirmar_cadastro` logo adiante. Se ela desistir na tela da senha, nada
     * fica para trás: a conta só nasce no passo seguinte.
     */
    if (acao === 'provar_cadastro') {
      const lido = lerDadosDeCadastro(body);
      if (lido.erro) return lido.erro;
      const { cpf, email, canal } = lido.dados!;

      const c = await provarCodigo(admin, String(body?.desafioId ?? ''), String(body?.codigo ?? ''));
      if (!c.ok) return json({ ok: false, erro: c.erro, tentativasRestantes: c.tentativasRestantes }, 400);
      const d = c.desafio;

      // O desafio tem de ser deste CPF, deste canal e deste destino. O
      // `confirmar_cadastro` confere de novo — de propósito, é a mesma trava
      // nos dois portões.
      const destinoBate = d.canal === 'email' && d.destino === email;
      if (d.proposito !== 'cadastro' || d.cpf !== cpf || d.canal !== canal || !destinoBate) {
        return json({ ok: false, erro: 'desafio_nao_confere' }, 400);
      }

      console.log('[AUTH-CODIGO] canal provado por', canal);
      return json({ ok: true, provado: true });
    }

    if (acao === 'confirmar_cadastro') {
      const lido = lerDadosDeCadastro(body);
      if (lido.erro) return lido.erro;
      const { cpf, nome, whatsapp, email, canal } = lido.dados!;
      const senha = String(body?.senha ?? '');
      if (senha.length < SENHA_MIN || senha.length > SENHA_MAX) return json({ ok: false, erro: 'senha_invalida' }, 400);

      /*
       * Duas portas para o mesmo lugar. O cadastro novo já provou o canal na
       * tela anterior e manda só o `desafioId`; o caminho antigo mandava código
       * e senha juntos. Nos dois casos o desafio é queimado aqui.
       */
      const codigoDigitado = String(body?.codigo ?? '').trim();
      const c = codigoDigitado
        ? await conferirCodigo(admin, String(body?.desafioId ?? ''), codigoDigitado)
        : await consumirProva(admin, String(body?.desafioId ?? ''));
      if (!c.ok) return json({ ok: false, erro: c.erro, tentativasRestantes: c.tentativasRestantes }, 400);
      const d = c.desafio;
      // O código tem de ser deste CPF, deste canal e deste destino — nada de trocar
      // o número depois de conferir.
      const destinoBate = d.canal === 'email' && d.destino === email;
      if (d.proposito !== 'cadastro' || d.cpf !== cpf || d.canal !== canal || !destinoBate) {
        return json({ ok: false, erro: 'desafio_nao_confere' }, 400);
      }

      // Corrida: alguém pode ter cadastrado este CPF entre o pedido e a confirmação.
      if ((await buscarContas(admin, 'cpf', cpf)).length > 0) return json({ ok: false, erro: 'cpf_ja_cadastrado' }, 409);

      /*
       * O nome sai do DESAFIO, não do corpo do pedido. Foi buscado no registro
       * quando o código foi pedido e esperou no banco desde então. Assim não
       * dá para mandar um nome no pedido e outro na confirmação — e o
       * navegador não participa disso em momento nenhum.
       */
      const nomeDaConta = d.nome ?? nome;
      if (!nomeDaConta) return json({ ok: false, erro: 'nome_necessario' }, 400);

      // O e-mail é o provado pelo código; o WhatsApp vai como foi digitado (OS-285).
      const emailAuth = email!;
      const whatsappFinal = whatsapp;
      const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
        email: emailAuth,
        password: senha,
        email_confirm: true,
        user_metadata: {
          nome_completo: nomeDaConta,
          cpf,
          whatsapp: whatsappFinal ?? '',
          tipo_conta: 'cliente',
          canal_cadastro: canal,
        },
      });
      if (erroCriar || !criado?.user) {
        const msg = erroCriar?.message ?? '';
        console.error('[AUTH-CODIGO] createUser', msg);
        if (/already|registered|exists/i.test(msg)) return json({ ok: false, erro: 'email_ja_cadastrado' }, 409);
        return json({ ok: false, erro: 'nao_criou_conta' }, 500);
      }

      await carimbarCanal(admin, criado.user.id, 'email');

      /*
       * Aceite dos documentos legais (21/09/2026). Gravado AQUI e não pelo gatilho
       * do banco porque só a edge enxerga o IP de quem clicou. Best-effort de
       * propósito: a conta já existe neste ponto, e perder o registro do aceite
       * não pode custar a conta nem a compra que vem depois dela.
       */
      try {
        const aceites = body?.aceites;
        if (aceites && typeof aceites === 'object') {
          await admin.rpc('registrar_aceite', {
            _usuario_id: criado.user.id,
            _versoes: aceites,
            _contexto: 'cadastro_cliente',
            _ip: getClientIp(req) ?? null,
            _navegador: (req.headers.get('user-agent') ?? '').slice(0, 300) || null,
          });
        }
      } catch (e) {
        console.error('[AUTH-CODIGO] aceite nao gravado', e instanceof Error ? e.message : e);
      }

      const sessao = await sessaoPorSenha(emailAuth, senha);
      if (!sessao) return json({ ok: false, erro: 'conta_criada_sem_sessao' }, 500);
      console.log('[AUTH-CODIGO] conta criada por', canal);
      return json({ ok: true, sessao, primeiroNome: nomeDaConta.split(' ')[0] });
    }

    // --------------------------------------------------------------------- login
    if (acao === 'pedir_login') {
      const achado = await contaDoLogin(admin, body);
      if ('erro' in achado) return achado.erro;
      const { conta } = achado;
      const canal = body?.canal as Canal;
      // Erro que a tela antiga conhece: com `podeTentarEmail` ela desvia para o e-mail sozinha.
      if (canal === 'whatsapp') return json({ ok: false, erro: 'whatsapp_nao_configurado', podeTentarEmail: !!conta.email }, 400);
      if (canal !== 'email') return json({ ok: false, erro: 'canal_invalido' }, 400);

      /*
       * Conta sem e-mail (nasceu só com WhatsApp, na Porcada e na Oktoberfest):
       * a tela pede um e-mail na hora e manda em `emailNovo`. O código vai para
       * ele e, confirmado no `confirmar_login`, ele vira o e-mail da conta. Até
       * lá nada muda na conta. Conta que JÁ tem e-mail ignora o `emailNovo`: o
       * código só vai para um e-mail DA CONTA.
       */
      const emailNovo = !conta.email && body?.emailNovo ? String(body.emailNovo).trim().toLowerCase() : null;
      if (!conta.email && !emailNovo) return json({ ok: false, erro: 'sem_email' }, 400);
      if (emailNovo) {
        if (!EMAIL_RE.test(emailNovo) || ehEmailInterno(emailNovo)) return json({ ok: false, erro: 'email_invalido' }, 400);
        const donos = await buscarContas(admin, 'email', emailNovo);
        if (donos.some((c) => c.user_id !== conta.user_id)) return json({ ok: false, erro: 'email_ja_cadastrado' }, 409);
      }

      const bloqueio = await limiteDeSenha(admin, conta.user_id, ip);
      if (bloqueio) return bloqueio;
      const emailAuth = await emailDeAuth(admin, conta.user_id);
      if (!emailAuth) return json({ ok: false, erro: 'conta_nao_encontrada' }, 404);
      const senha = String(body?.senha ?? '');
      if (!senha || !(await sessaoPorSenha(emailAuth, senha))) return json({ ok: false, erro: 'senha_incorreta' }, 401);

      const destino = conta.email ?? emailNovo!;
      const r = await criarEEnviarCodigo(admin, { proposito: 'login', canal, destino, userId: conta.user_id, nome: conta.nome, ip });
      return respostaDeEnvio(r, {
        canal,
        destinoMascarado: maskEmail(destino),
        emailNovo: !conta.email,
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
      const senha = String(body?.senha ?? '');
      let sessao = await sessaoPorSenha(emailAuth, senha);
      if (!sessao) return json({ ok: false, erro: 'senha_incorreta' }, 401);
      if (c.desafio.canal !== 'email') return json({ ok: false, erro: 'desafio_nao_confere' }, 400);

      /*
       * Conta que não tinha e-mail e acabou de provar um (ver `pedir_login`): o
       * e-mail vira o da conta, no auth e no perfil. Corrida: outra conta pode
       * ter ficado com ele entre o pedido e a confirmação, por isso a conferência
       * repete aqui. A sessão é refeita com o e-mail novo, para o token já nascer
       * certo; se isso falhar, vale a sessão que já estava na mão.
       */
      const destino = String(c.desafio.destino ?? '').trim().toLowerCase();
      if (!conta.email && EMAIL_RE.test(destino) && !ehEmailInterno(destino)) {
        const donos = await buscarContas(admin, 'email', destino);
        if (donos.some((d) => d.user_id !== conta.user_id)) return json({ ok: false, erro: 'email_ja_cadastrado' }, 409);
        const { data: atual } = await admin.auth.admin.getUserById(conta.user_id);
        const meta = { ...(atual?.user?.user_metadata ?? {}), sem_email: null };
        const { error: erroEmail } = await admin.auth.admin.updateUserById(conta.user_id, {
          email: destino, email_confirm: true, user_metadata: meta,
        });
        if (erroEmail) {
          console.error('[AUTH-CODIGO] não gravou o e-mail novo', erroEmail.message);
          if (/already|registered|exists/i.test(erroEmail.message)) return json({ ok: false, erro: 'email_ja_cadastrado' }, 409);
          return json({ ok: false, erro: 'nao_trocou_email' }, 500);
        }
        await admin.from('profiles').update({ email: destino }).eq('id', conta.user_id);
        sessao = (await sessaoPorSenha(destino, senha)) ?? sessao;
        console.log('[AUTH-CODIGO] e-mail novo gravado na conta');
      }

      // Este login provou o e-mail: carimba (só se ainda não estava carimbado).
      const { data: perfil } = await admin.from('profiles')
        .select('email_confirmado_em').eq('id', conta.user_id).maybeSingle();
      if (!perfil?.email_confirmado_em) await carimbarCanal(admin, conta.user_id, 'email');

      console.log('[AUTH-CODIGO] login por e-mail');
      return json({ ok: true, sessao, primeiroNome: conta.primeiroNome });
    }

    // ------------------------------------------------------ esqueci a senha
    if (acao === 'pedir_reset') {
      const achado = await contaDoLogin(admin, body);
      if ('erro' in achado) return achado.erro;
      const { conta } = achado;
      const canal = body?.canal as Canal;
      if (canal === 'whatsapp') return json({ ok: false, erro: 'whatsapp_nao_configurado', podeTentarEmail: !!conta.email }, 400);
      if (canal !== 'email') return json({ ok: false, erro: 'canal_invalido' }, 400);
      // Conta sem e-mail não recupera a senha sozinha: sem a senha não há como
      // provar que é o dono antes de aceitar um e-mail novo. A tela manda falar
      // com a FestPag.
      if (!conta.email) return json({ ok: false, erro: 'sem_email' }, 400);

      const destino = conta.email;
      // Sem senha aqui, por definição — é ela que a pessoa perdeu. O que segura é o
      // rate limit por destino/IP do motor e o código só ir para o e-mail DA CONTA.
      const r = await criarEEnviarCodigo(admin, { proposito: 'reset', canal, destino, userId: conta.user_id, nome: conta.nome, ip });
      return respostaDeEnvio(r, { canal, destinoMascarado: maskEmail(destino) });
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
      // O código provou o e-mail: carimba, se ainda não estava.
      const { data: perfil } = await admin.from('profiles')
        .select('email_confirmado_em').eq('id', conta.user_id).maybeSingle();
      if (!perfil?.email_confirmado_em) await carimbarCanal(admin, conta.user_id, 'email');

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
