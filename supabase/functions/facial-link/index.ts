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
// sessão. A ação `enviar` valida o usuário na mão, pelo header.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import {
  carregarConfigWhatsApp, enviarTextoWhatsApp,
  mascararNumeroParaTela, mascararNumero,
} from '../_shared/whatsapp.ts';

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

  // ── enviar: o computador pede o link ──────────────────────────────────────
  if (acao === 'enviar') {
    const auth = req.headers.get('Authorization') ?? '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!jwt) return json({ ok: false, erro: 'sem_sessao' }, 401);

    const { data: dono, error: erroDono } = await db.auth.getUser(jwt);
    if (erroDono || !dono?.user) return json({ ok: false, erro: 'sessao_invalida' }, 401);
    const userId = dono.user.id;

    const { data: perfil } = await db
      .from('profiles')
      .select('whatsapp, facial_photo_path')
      .eq('id', userId)
      .maybeSingle();

    // Já tem rosto: nada a fazer, e é bom o computador saber disso.
    if (perfil?.facial_photo_path) return json({ ok: true, jaTem: true });

    const numero = String(perfil?.whatsapp ?? '').replace(/\D/g, '');
    if (numero.length < 10) return json({ ok: false, erro: 'sem_whatsapp' }, 400);
    const numeroCompleto = numero.startsWith('55') ? numero : `55${numero}`;

    // Um link de cada vez: pedir outro queima os anteriores.
    await db.from('facial_links')
      .update({ usado_em: new Date().toISOString() })
      .eq('user_id', userId)
      .is('usado_em', null);

    const token = novoToken();
    const expira = new Date(Date.now() + VALIDADE_MIN * 60_000).toISOString();
    const { error: erroInsert } = await db.from('facial_links').insert({
      user_id: userId,
      token_hash: await hash(token),
      expira_em: expira,
      canal: 'whatsapp',
    });
    if (erroInsert) {
      console.error('[FACIAL-LINK] insert falhou:', erroInsert.message);
      return json({ ok: false, erro: 'falha_ao_gerar' }, 500);
    }

    if (!(await carregarConfigWhatsApp(db))) {
      return json({ ok: false, erro: 'whatsapp_nao_configurado' }, 502);
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
