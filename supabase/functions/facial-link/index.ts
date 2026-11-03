// facial-link — terminar o cadastro facial no celular, por link no WhatsApp.
//
// Nasceu em 28/09/2026, junto com a decisão do Gabriel de tornar a facial
// OBRIGATÓRIA. O site vende muito no computador, e computador quase nunca tem
// câmera boa (ou câmera nenhuma): sem esta porta, "obrigatória" viraria "quem
// está no desktop não compra". Então o computador pede um link, a pessoa tira a
// foto no celular, e a tela do computador segue sozinha.
//
// ⚠️ O QUE ESTE LINK VALE: uma sessão de verdade na conta da pessoa. Por isso
//   · o token vai ao WhatsApp dela e a nós só fica o HASH (sha-256);
//   · vale 15 MINUTOS e UM USO — o segundo clique não abre nada;
//   · pedir um link novo QUEIMA os anteriores daquela pessoa;
//   · o token nunca é logado, nem inteiro nem em pedaço.
// É o mesmo canal por onde já vai o código de 6 números do login, então o risco
// não é novo — mas a validade curta é o que o mantém do tamanho de sempre.
//
// verify_jwt=false porque a ação `abrir` acontece no celular, ANTES de existir
// sessão. As ações `enviar` e `gerar` validam o usuário na mão, pelo header.
//
// OS-343 (29/10/2026): ação nova `gerar`. O WhatsApp da casa ficou fora de 10/10
// em diante, e uma saída que dependa só dele trava o cadastro. `gerar` devolve o
// endereço com o token para o PRÓPRIO computador logado mostrar como QR Code; as
// regras são as mesmas do link no WhatsApp (15 minutos, um uso, um link vivo por
// conta). Quem chama já tem a sessão da conta, então o QR não abre nada que o
// computador já não abra. E `enviar` passou a conferir número e configuração do
// WhatsApp ANTES de queimar o link anterior: com o WhatsApp fora, pedir o link
// não mata mais o QR que está na tela.
// Só é chamada com a chave da facial obrigatória ligada no site
// (`src/lib/facialObrigatoria.ts`); desligada, nada no site chama esta edge.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import {
  carregarConfigWhatsApp, enviarTextoWhatsApp,
  mascararNumeroParaTela, mascararNumero,
} from '../_shared/whatsapp.ts';
import { checkRateLimit, rateLimitResponse } from '../_shared/rateLimit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const SITE = 'https://festpag.digital';
const VALIDADE_MIN = 15;

// OS-343: limite de pedidos de link (QR ou WhatsApp) por conta. Uma pessoa honesta
// pede 1 a 3 (o código venceu, quis pelo WhatsApp). 10 em 15 minutos cobre isso e
// impede usar a edge para disparar mensagem em série no WhatsApp da própria conta.
// Fail-closed, como as outras: rate limit fora do ar = 503, nunca libera.
const RL_MAX = 10;
const RL_JANELA_S = 15 * 60;
const RL_BLOQUEIO_S = 15 * 60;

const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

/** Token de 32 bytes em base64url — o que vai na mensagem. */
function novoToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** O que fica guardado. Token cru nunca toca o banco. */
async function hash(token: string): Promise<string> {
  const dados = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'metodo' }, 405);

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return json({ ok: false, erro: 'corpo_invalido' }, 400);
  }

  const db = admin();
  const acao = String(corpo?.acao ?? '');

  // ── enviar (WhatsApp) ou gerar (QR na tela): o computador pede o link ─────
  if (acao === 'enviar' || acao === 'gerar') {
    const auth = req.headers.get('Authorization') ?? '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!jwt) return json({ ok: false, erro: 'sem_sessao' }, 401);

    const { data: dono, error: erroDono } = await db.auth.getUser(jwt);
    if (erroDono || !dono?.user) return json({ ok: false, erro: 'sessao_invalida' }, 401);
    const userId = dono.user.id;

    const rl = await checkRateLimit(db, `faciallink:${userId}`, RL_MAX, RL_JANELA_S, RL_BLOQUEIO_S);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const { data: perfil } = await db
      .from('profiles')
      .select('whatsapp, facial_photo_path')
      .eq('id', userId)
      .maybeSingle();

    // Já tem rosto: nada a fazer, e é bom o computador saber disso.
    if (perfil?.facial_photo_path) return json({ ok: true, jaTem: true });

    const numero = String(perfil?.whatsapp ?? '').replace(/\D/g, '');
    const numeroCompleto = numero.startsWith('55') ? numero : `55${numero}`;
    if (acao === 'enviar') {
      if (numero.length < 10) return json({ ok: false, erro: 'sem_whatsapp' }, 400);
      if (!(await carregarConfigWhatsApp(db))) {
        return json({ ok: false, erro: 'whatsapp_nao_configurado' }, 502);
      }
    }

    // Um link de cada vez. OS-343: o novo nasce PRIMEIRO e só depois os outros
    // daquela conta são queimados (todos menos o novo). Com dois pedidos ao mesmo
    // tempo, cada um queima o do outro: no pior caso nenhum fica vivo (a pessoa
    // pede outro), e nunca ficam dois vivos. Queimar antes e criar depois, como era,
    // deixava dois vivos quando os pedidos se cruzavam.
    const token = novoToken();
    const expira = new Date(Date.now() + VALIDADE_MIN * 60_000).toISOString();
    const { data: novo, error: erroInsert } = await db.from('facial_links').insert({
      user_id: userId,
      token_hash: await hash(token),
      expira_em: expira,
      canal: acao === 'gerar' ? 'qr' : 'whatsapp',
    }).select('id').single();
    if (erroInsert || !novo?.id) {
      console.error('[FACIAL-LINK] insert falhou:', erroInsert?.message);
      return json({ ok: false, erro: 'falha_ao_gerar' }, 500);
    }
    await db.from('facial_links')
      .update({ usado_em: new Date().toISOString() })
      .eq('user_id', userId)
      .is('usado_em', null)
      .neq('id', novo.id);

    if (acao === 'gerar') {
      // O token volta só para quem já está logado nesta conta; nunca é logado.
      console.log('[FACIAL-LINK] código gerado para a tela');
      return json({ ok: true, url: `${SITE}/facial/${token}`, expiraEm: expira });
    }

    const texto =
      'Falta só a sua foto para terminar o cadastro na FestPag 📸\n\n' +
      `Abra aqui pelo celular: ${SITE}/facial/${token}\n\n` +
      `O link vale por ${VALIDADE_MIN} minutos e só funciona uma vez. ` +
      'Se não foi você que pediu, é só ignorar.';

    const envio = await enviarTextoWhatsApp(numeroCompleto, texto);
    if (!envio.ok) {
      console.error('[FACIAL-LINK] envio falhou para', mascararNumero(numeroCompleto), envio.erro);
      return json({ ok: false, erro: envio.erro }, 502);
    }

    console.log('[FACIAL-LINK] link enviado para', mascararNumero(numeroCompleto));
    return json({ ok: true, destinoMascarado: mascararNumeroParaTela(numeroCompleto) });
  }

  // ── abrir: o celular chegou com o token ───────────────────────────────────
  if (acao === 'abrir') {
    const token = String(corpo?.token ?? '');
    if (token.length < 20) return json({ ok: false, erro: 'token_invalido' }, 400);

    const { data: linha } = await db
      .from('facial_links')
      .select('id, user_id, expira_em, usado_em')
      .eq('token_hash', await hash(token))
      .maybeSingle();

    if (!linha) return json({ ok: false, erro: 'nao_encontrado' }, 404);
    if (linha.usado_em) return json({ ok: false, erro: 'ja_usado' }, 410);
    if (new Date(linha.expira_em).getTime() < Date.now()) {
      return json({ ok: false, erro: 'expirado' }, 410);
    }

    // Queima ANTES de devolver a sessão: se algo falhar depois, o link já morreu.
    const { data: queimado } = await db
      .from('facial_links')
      .update({ usado_em: new Date().toISOString() })
      .eq('id', linha.id)
      .is('usado_em', null)
      .select('id')
      .maybeSingle();
    if (!queimado) return json({ ok: false, erro: 'ja_usado' }, 410);

    const { data: usuario, error: erroUsuario } = await db.auth.admin.getUserById(linha.user_id);
    if (erroUsuario || !usuario?.user?.email) {
      return json({ ok: false, erro: 'conta_nao_encontrada' }, 404);
    }

    // Sessão pelo caminho oficial: link mágico gerado no servidor e trocado por
    // sessão aqui mesmo — o `hashed_token` nunca sai daqui.
    const { data: gerado, error: erroGerar } = await db.auth.admin.generateLink({
      type: 'magiclink',
      email: usuario.user.email,
    });
    const hashed = (gerado?.properties as { hashed_token?: string } | undefined)?.hashed_token;
    if (erroGerar || !hashed) {
      console.error('[FACIAL-LINK] generateLink falhou:', erroGerar?.message);
      return json({ ok: false, erro: 'falha_sessao' }, 500);
    }

    const anon = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { auth: { persistSession: false } },
    );
    const { data: sessaoNova, error: erroSessao } = await anon.auth.verifyOtp({
      token_hash: hashed,
      type: 'email',
    });
    if (erroSessao || !sessaoNova?.session) {
      console.error('[FACIAL-LINK] verifyOtp falhou:', erroSessao?.message);
      return json({ ok: false, erro: 'falha_sessao' }, 500);
    }

    console.log('[FACIAL-LINK] link aberto no celular');
    return json({
      ok: true,
      sessao: {
        access_token: sessaoNova.session.access_token,
        refresh_token: sessaoNova.session.refresh_token,
      },
    });
  }

  return json({ ok: false, erro: 'acao_desconhecida' }, 400);
});
