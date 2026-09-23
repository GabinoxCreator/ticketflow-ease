/*
 * aviso-repasse — o produtor pediu o dinheiro dele; alguém tem que ficar sabendo.
 *
 * POR QUE EXISTE (23/09/2026): a Luana, da Filhos da Luz, pediu R$ 1.050,00 de
 * repasse do Carlos Caetano em 22/09 pelo painel do produtor. O pedido entrou
 * certo no banco e ficou parado — a casa só descobriu porque ela cobrou o
 * Manoel por fora. Conferido: a tabela `payouts` não tinha aviso nenhum. O
 * pedido só existia para quem abrisse /admin/repasses por vontade própria.
 *
 * É o mesmo buraco do `avisarGestao` (18/08): dinheiro que muda de estado
 * precisa CHAMAR alguém, não esperar ser encontrado.
 *
 * Duas portas de entrada, as duas com o mesmo segredo de sempre:
 *   { payout_id }        → o gatilho `trg_payouts_aviso`, no ato do pedido
 *   { modo: 'repescar' } → o cron de 10 em 10 minutos, que tenta de novo o que
 *                          não saiu (a Evolution cai — ficou fora o 08/09 todo)
 * Admin logado também pode chamar, para reenviar um aviso na mão.
 *
 * Dois canais, independentes: WhatsApp do Gabriel e push/sino do app da gestão.
 * Um não segura o outro — se o WhatsApp está fora, o push ainda chega, e a
 * repesca continua tentando só o que faltou.
 *
 * ⚠️ O aviso NÃO leva dados bancários. Chave PIX e conta ficam no painel, atrás
 * de login. WhatsApp é tela de bloqueio, prévia de notificação, celular que
 * passa de mão — não é lugar para a conta de quem vai receber.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { carregarConfigWhatsApp, enviarTextoWhatsApp, normalizarNumeroBr, mascararNumero } from '../_shared/whatsapp.ts';
import { avisarGestao } from '../_shared/avisarGestao.ts';
import { type Caso, PAINEL, dinheiro, quandoBR, montarTexto } from './texto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const log = (passo: string, dados?: unknown) =>
  console.log(`[AVISO-REPASSE] ${passo}${dados ? ' ' + JSON.stringify(dados) : ''}`);

/** Quantas vezes insistir antes de desistir de um canal. 10 min × 12 = 2 horas. */
const MAX_TENTATIVAS = 12;
/** Repesca não olha o arquivo inteiro: pedido de 3 meses atrás não é novidade. */
const JANELA_REPESCA_DIAS = 60;


async function carregarCaso(admin: any, payoutId: string): Promise<Caso | null> {
  const { data: payout, error } = await admin
    .from('payouts')
    .select('id, status, net_amount, created_at, event_id, producer_profile_id')
    .eq('id', payoutId)
    .maybeSingle();
  if (error || !payout) {
    log('payout não encontrado', { payoutId, erro: error?.message });
    return null;
  }

  const [{ data: perfil }, { data: evento }] = await Promise.all([
    admin.from('producer_profiles').select('brand_name, legal_name').eq('id', payout.producer_profile_id).maybeSingle(),
    payout.event_id
      ? admin.from('events').select('title, date').eq('id', payout.event_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let resumo = null;
  if (payout.event_id) {
    const { data, error: eResumo } = await admin.rpc('resumo_repasse_do_evento', { _event_id: payout.event_id });
    if (eResumo) log('resumo não veio (o aviso sai sem ele)', { erro: eResumo.message });
    else resumo = Array.isArray(data) ? data[0] : data;
  }

  return {
    payout,
    produtor: perfil?.brand_name || perfil?.legal_name || 'Produtor sem nome no cadastro',
    evento: evento?.title || 'Evento não identificado',
    dataEvento: evento?.date ?? null,
    resumo,
  };
}

/** Sobe (ou cria) a linha do canal e devolve quantas tentativas já houve. */
async function registrar(admin: any, payoutId: string, canal: string, patch: Record<string, unknown>) {
  const { data: atual } = await admin
    .from('payout_avisos')
    .select('id, tentativas')
    .eq('payout_id', payoutId).eq('canal', canal)
    .maybeSingle();

  const tentativas = Number(atual?.tentativas ?? 0) + 1;
  if (atual?.id) {
    await admin.from('payout_avisos').update({ ...patch, tentativas }).eq('id', atual.id);
  } else {
    await admin.from('payout_avisos').insert({ payout_id: payoutId, canal, tentativas, ...patch });
  }
  return tentativas;
}

/** Os números que recebem o aviso. Vault primeiro, para trocar sem deploy. */
async function destinosWhatsApp(admin: any): Promise<string[]> {
  let bruto = Deno.env.get('AVISO_REPASSE_WHATSAPP') ?? '';
  if (!bruto) {
    const { data } = await admin.rpc('ler_segredo', { _nome: 'AVISO_REPASSE_WHATSAPP' });
    bruto = String(data ?? '');
  }
  return bruto.split(',').map((n) => normalizarNumeroBr(n)).filter((n): n is string => !!n);
}

/** Manda o aviso de UM pedido. Cada canal se vira sozinho. */
async function avisar(admin: any, payoutId: string): Promise<{ whatsapp: boolean; gestao: boolean }> {
  const caso = await carregarCaso(admin, payoutId);
  if (!caso) return { whatsapp: false, gestao: false };

  // Pedido já pago entre o gatilho e a repesca não precisa mais de aviso.
  if (caso.payout.status !== 'requested') {
    log('pedido não está mais aberto; nada a avisar', { payoutId, status: caso.payout.status });
    await Promise.all([
      registrar(admin, payoutId, 'whatsapp', { enviado_em: new Date().toISOString(), ultimo_erro: 'pedido_ja_resolvido' }),
      registrar(admin, payoutId, 'gestao', { enviado_em: new Date().toISOString(), ultimo_erro: 'pedido_ja_resolvido' }),
    ]);
    return { whatsapp: true, gestao: true };
  }

  const texto = montarTexto(caso);
  const resultado = { whatsapp: false, gestao: false };

  // ── Canal 1: WhatsApp ────────────────────────────────────────────────────
  const { data: jaWhats } = await admin
    .from('payout_avisos').select('enviado_em').eq('payout_id', payoutId).eq('canal', 'whatsapp').maybeSingle();
  if (jaWhats?.enviado_em) {
    resultado.whatsapp = true;
  } else {
    const temConfig = await carregarConfigWhatsApp(admin);
    const numeros = await destinosWhatsApp(admin);
    if (!temConfig || numeros.length === 0) {
      // Precisa gritar no log: sem isto, a casa acha que está sendo avisada.
      log('SEM CONFIGURAÇÃO DE WHATSAPP — o aviso não saiu', { payoutId, temConfig, destinos: numeros.length });
      await registrar(admin, payoutId, 'whatsapp', { ultimo_erro: temConfig ? 'sem_destino' : 'whatsapp_nao_configurado' });
    } else {
      let algumFoi = false;
      const erros: string[] = [];
      for (const numero of numeros) {
        const r = await enviarTextoWhatsApp(numero, texto, { timeoutMs: 15_000 });
        if (r.ok) algumFoi = true;
        else erros.push(`${mascararNumero(numero)}:${r.erro}`);
      }
      await registrar(admin, payoutId, 'whatsapp', {
        destino: numeros.map(mascararNumero).join(', '),
        enviado_em: algumFoi ? new Date().toISOString() : null,
        ultimo_erro: erros.length ? erros.join(' | ') : null,
      });
      resultado.whatsapp = algumFoi;
    }
  }

  // ── Canal 2: sino e push do app da gestão ────────────────────────────────
  const { data: jaGestao } = await admin
    .from('payout_avisos').select('enviado_em').eq('payout_id', payoutId).eq('canal', 'gestao').maybeSingle();
  if (jaGestao?.enviado_em) {
    resultado.gestao = true;
  } else {
    const ok = await avisarGestao({
      tipo: 'repasse',
      titulo: `Repasse pedido: ${dinheiro(caso.payout.net_amount)} — ${caso.produtor}`,
      mensagem: `${caso.evento}. Pedido em ${quandoBR(caso.payout.created_at)}. Conferir e pagar em ${PAINEL}`,
      referencia: payoutId,
    });
    await registrar(admin, payoutId, 'gestao', {
      destino: 'gestao',
      enviado_em: ok ? new Date().toISOString() : null,
      ultimo_erro: ok ? null : 'gestao_nao_recebeu',
    });
    resultado.gestao = ok;
  }

  log('avisado', { payoutId, ...resultado });
  return resultado;
}

/** O que ficou para trás: pedido aberto sem os dois canais entregues. */
async function repescar(admin: any) {
  const desde = new Date(Date.now() - JANELA_REPESCA_DIAS * 86_400_000).toISOString();
  const { data: abertos } = await admin
    .from('payouts')
    .select('id')
    .eq('status', 'requested')
    .gte('created_at', desde)
    .order('created_at', { ascending: true })
    .limit(50);

  if (!abertos?.length) return { olhados: 0, reenviados: 0 };

  const { data: avisos } = await admin
    .from('payout_avisos')
    .select('payout_id, canal, enviado_em, tentativas')
    .in('payout_id', abertos.map((p: any) => p.id));

  let reenviados = 0;
  for (const p of abertos) {
    const meus = (avisos ?? []).filter((a: any) => a.payout_id === p.id);
    const entregues = meus.filter((a: any) => a.enviado_em).length;
    if (entregues >= 2) continue; // os dois canais já saíram

    // Desistir depois de 12 tentativas é de propósito: o que falha há duas
    // horas não se resolve na 13ª chamada, e insistir para sempre esconde o
    // problema atrás de log repetido. A conferência do "oi" pega o resto.
    const jaTentou = Math.max(0, ...meus.map((a: any) => Number(a.tentativas ?? 0)));
    if (jaTentou >= MAX_TENTATIVAS) continue;

    await avisar(admin, p.id);
    reenviados++;
  }
  return { olhados: abertos.length, reenviados };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // Duas portas autorizadas, igual às outras edges de gatilho/cron:
  //   1) segredo compartilhado no X-Cron-Secret (gatilho e cron)
  //   2) admin logado (reenviar um aviso na mão)
  let autorizado = false;
  const segredo = req.headers.get('x-cron-secret') ?? req.headers.get('X-Cron-Secret');
  if (segredo) {
    try {
      const { data: doVault } = await admin.rpc('get_cron_secret');
      if (doVault && segredo === doVault) autorizado = true;
    } catch (_) { /* segue para a porta do admin */ }
  }

  const authHeader = req.headers.get('Authorization');
  if (!autorizado && authHeader?.startsWith('Bearer ')) {
    try {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: claims } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
      const userId = claims?.claims?.sub;
      if (userId) {
        const { data: papeis } = await admin.from('user_roles').select('role').eq('user_id', userId);
        if (papeis?.some((r: any) => r.role === 'admin')) autorizado = true;
      }
    } catch (_) { /* cai no 403 */ }
  }

  if (!autorizado) return json({ error: 'Forbidden' }, 403);

  try {
    const body = await req.json().catch(() => ({}));

    if (body?.modo === 'repescar') {
      const r = await repescar(admin);
      log('repesca', r);
      return json({ ok: true, ...r });
    }

    const payoutId = body?.payout_id;
    if (!payoutId || typeof payoutId !== 'string') return json({ ok: false, erro: 'payout_id_ausente' }, 400);

    const r = await avisar(admin, payoutId);
    return json({ ok: true, ...r });
  } catch (e) {
    // Não dá para devolver 500 calado: o gatilho não olha a resposta, então o
    // log é o único lugar onde este erro existe.
    log('exceção', { msg: e instanceof Error ? e.message : String(e) });
    return json({ ok: false, erro: 'erro_interno' }, 500);
  }
});
