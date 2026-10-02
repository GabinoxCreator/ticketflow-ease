/*
 * aviso-reembolso: o comprador pediu o dinheiro de volta; a casa tem que saber.
 *
 * POR QUE EXISTE (OS-103, 02/10/2026): o pedido de reembolso passou a nascer em
 * Meus Ingressos, e a decisão do Gabriel é que A CASA APROVA ANTES. Enquanto
 * ninguém olha, o ingresso fica bloqueado e a vaga fica presa. Pedido que
 * ninguém vê é o mesmo buraco do repasse da Luana (23/09): dinheiro que muda de
 * estado precisa CHAMAR alguém, não esperar ser encontrado.
 *
 * É o mesmo motor do `aviso-repasse`, com as mesmas duas portas:
 *   { reembolso_id }     → o gatilho `trg_reembolsos_aviso`, no ato do pedido
 *   { modo: 'repescar' } → o cron de 10 em 10 minutos, que tenta de novo o que
 *                          não saiu
 * Admin logado também pode chamar, para reenviar um aviso na mão.
 *
 * Dois canais, independentes: WhatsApp (Gabriel e João) e push/sino do app da
 * gestão. Um não segura o outro.
 *
 * ⚠️ O aviso NÃO leva a chave PIX do comprador. Ela fica no painel, atrás de
 * login.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { carregarConfigWhatsApp, enviarTextoWhatsApp, normalizarNumeroBr, mascararNumero } from '../_shared/whatsapp.ts';
import { avisarGestao } from '../_shared/avisarGestao.ts';
import { decidirTentativa, JANELA_INSISTENCIA_H } from '../_shared/insistenciaDeAviso.ts';
import { type Caso, PAINEL, dinheiro, quandoBR, montarTexto } from './texto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const log = (passo: string, dados?: unknown) =>
  console.log(`[AVISO-REEMBOLSO] ${passo}${dados ? ' ' + JSON.stringify(dados) : ''}`);

/** Repesca não olha o arquivo inteiro: pedido de 2 meses atrás não é novidade. */
const JANELA_REPESCA_DIAS = 60;

async function carregarCaso(admin: any, reembolsoId: string): Promise<Caso | null> {
  const { data: reembolso, error } = await admin
    .from('reembolsos')
    .select('id, numero, status, forma, valor_a_devolver, valor_ingressos, valor_taxa, devolve_taxa, solicitado_em, regra, order_id, event_id')
    .eq('id', reembolsoId)
    .maybeSingle();
  if (error || !reembolso) {
    log('reembolso não encontrado', { reembolsoId, erro: error?.message });
    return null;
  }

  const [{ data: pedido }, { data: evento }, pedidos, doPedido] = await Promise.all([
    admin.from('orders').select('customer_name').eq('id', reembolso.order_id).maybeSingle(),
    admin.from('events').select('title, date').eq('id', reembolso.event_id).maybeSingle(),
    admin.from('reembolso_ingressos').select('ticket_id', { count: 'exact', head: true }).eq('reembolso_id', reembolsoId),
    admin.from('tickets').select('id', { count: 'exact', head: true }).eq('order_id', reembolso.order_id).neq('status', 'pending'),
  ]);

  // O que sobra para o produtor no evento. A base já vem descontada deste
  // reembolso (a fórmula única olha os pedidos de reembolso abertos).
  let saldoDoProdutor: number | null = null;
  const { data: resumo, error: eResumo } = await admin.rpc('resumo_repasse_do_evento', { _event_id: reembolso.event_id });
  if (eResumo) {
    log('resumo do repasse não veio (o aviso sai sem ele)', { erro: eResumo.message });
  } else {
    const r = Array.isArray(resumo) ? resumo[0] : resumo;
    if (r) saldoDoProdutor = Number(r.base ?? 0) - Number(r.ja_pago ?? 0) - Number(r.ja_pedido ?? 0);
  }

  return {
    reembolso,
    comprador: pedido?.customer_name || 'Comprador sem nome no pedido',
    evento: evento?.title || 'Evento não identificado',
    dataEvento: evento?.date ?? null,
    ingressosPedidos: pedidos.count ?? 0,
    ingressosDoPedido: doPedido.count ?? 0,
    saldoDoProdutor,
  };
}

/** Sobe (ou cria) a linha do canal e devolve quantas tentativas já houve. */
async function registrar(admin: any, reembolsoId: string, canal: string, patch: Record<string, unknown>) {
  const { data: atual } = await admin
    .from('reembolso_avisos')
    .select('id, tentativas')
    .eq('reembolso_id', reembolsoId).eq('canal', canal)
    .maybeSingle();

  const tentativas = Number(atual?.tentativas ?? 0) + 1;
  if (atual?.id) {
    await admin.from('reembolso_avisos').update({ ...patch, tentativas }).eq('id', atual.id);
  } else {
    await admin.from('reembolso_avisos').insert({ reembolso_id: reembolsoId, canal, tentativas, ...patch });
  }
  return tentativas;
}

/**
 * Os números que recebem o aviso. Vault primeiro, para trocar sem deploy.
 * Enquanto o segredo próprio não existir, cai no destino do aviso de repasse:
 * aviso que chega em um número só é melhor que aviso que não chega.
 */
async function destinosWhatsApp(admin: any): Promise<string[]> {
  let bruto = Deno.env.get('AVISO_REEMBOLSO_WHATSAPP') ?? '';
  if (!bruto) {
    const { data } = await admin.rpc('ler_segredo', { _nome: 'AVISO_REEMBOLSO_WHATSAPP' });
    bruto = String(data ?? '');
  }
  if (!bruto) {
    const { data } = await admin.rpc('ler_segredo', { _nome: 'AVISO_REPASSE_WHATSAPP' });
    bruto = String(data ?? '');
  }
  return bruto.split(',').map((n) => normalizarNumeroBr(n)).filter((n): n is string => !!n);
}

/** Manda o aviso de UM pedido. Cada canal se vira sozinho. */
async function avisar(admin: any, reembolsoId: string): Promise<{ whatsapp: boolean; gestao: boolean }> {
  const caso = await carregarCaso(admin, reembolsoId);
  if (!caso) return { whatsapp: false, gestao: false };

  // Pedido já respondido (ou desistido) entre o gatilho e a repesca não precisa
  // mais de aviso.
  if (caso.reembolso.status !== 'solicitado') {
    log('pedido não está mais em análise; nada a avisar', { reembolsoId, status: caso.reembolso.status });
    await Promise.all([
      registrar(admin, reembolsoId, 'whatsapp', { enviado_em: new Date().toISOString(), ultimo_erro: 'pedido_ja_resolvido' }),
      registrar(admin, reembolsoId, 'gestao', { enviado_em: new Date().toISOString(), ultimo_erro: 'pedido_ja_resolvido' }),
    ]);
    return { whatsapp: true, gestao: true };
  }

  const texto = montarTexto(caso);
  const resultado = { whatsapp: false, gestao: false };

  // ── Canal 1: WhatsApp ────────────────────────────────────────────────────
  const { data: jaWhats } = await admin
    .from('reembolso_avisos').select('enviado_em').eq('reembolso_id', reembolsoId).eq('canal', 'whatsapp').maybeSingle();
  if (jaWhats?.enviado_em) {
    resultado.whatsapp = true;
  } else {
    const temConfig = await carregarConfigWhatsApp(admin);
    const numeros = await destinosWhatsApp(admin);
    if (!temConfig || numeros.length === 0) {
      // Precisa gritar no log: sem isto, a casa acha que está sendo avisada.
      log('SEM CONFIGURAÇÃO DE WHATSAPP: o aviso não saiu', { reembolsoId, temConfig, destinos: numeros.length });
      await registrar(admin, reembolsoId, 'whatsapp', { ultimo_erro: temConfig ? 'sem_destino' : 'whatsapp_nao_configurado' });
    } else {
      let algumFoi = false;
      const erros: string[] = [];
      for (const numero of numeros) {
        const r = await enviarTextoWhatsApp(numero, texto, { timeoutMs: 15_000 });
        if (r.ok) algumFoi = true;
        else erros.push(`${mascararNumero(numero)}:${r.erro}${'status' in r && r.status ? `/${r.status}` : ''}`);
      }
      await registrar(admin, reembolsoId, 'whatsapp', {
        destino: numeros.map(mascararNumero).join(', '),
        enviado_em: algumFoi ? new Date().toISOString() : null,
        ultimo_erro: erros.length ? erros.join(' | ') : null,
      });
      resultado.whatsapp = algumFoi;
    }
  }

  // ── Canal 2: sino e push do app da gestão ────────────────────────────────
  const { data: jaGestao } = await admin
    .from('reembolso_avisos').select('enviado_em').eq('reembolso_id', reembolsoId).eq('canal', 'gestao').maybeSingle();
  if (jaGestao?.enviado_em) {
    resultado.gestao = true;
  } else {
    const ok = await avisarGestao({
      tipo: 'reembolso',
      titulo: `Reembolso pedido: ${dinheiro(caso.reembolso.valor_a_devolver)} · ${caso.comprador}`,
      mensagem: `${caso.evento}. Pedido nº ${caso.reembolso.numero} em ${quandoBR(caso.reembolso.solicitado_em)}. Os ingressos ficam bloqueados até a resposta. Analisar em ${PAINEL}`,
      referencia: reembolsoId,
    });
    await registrar(admin, reembolsoId, 'gestao', {
      destino: 'gestao',
      enviado_em: ok ? new Date().toISOString() : null,
      ultimo_erro: ok ? null : 'gestao_nao_recebeu',
    });
    resultado.gestao = ok;
  }

  log('avisado', { reembolsoId, ...resultado });
  return resultado;
}

/** O que ficou para trás: pedido em análise sem os dois canais entregues. */
async function repescar(admin: any) {
  const desde = new Date(Date.now() - JANELA_REPESCA_DIAS * 86_400_000).toISOString();
  const { data: abertos } = await admin
    .from('reembolsos')
    .select('id')
    .eq('status', 'solicitado')
    .gte('solicitado_em', desde)
    .order('solicitado_em', { ascending: true })
    .limit(50);

  if (!abertos?.length) return { olhados: 0, reenviados: 0, desistidos: 0 };

  const { data: avisos } = await admin
    .from('reembolso_avisos')
    .select('id, reembolso_id, canal, enviado_em, tentativas, ultimo_erro, created_at, updated_at')
    .in('reembolso_id', abertos.map((p: any) => p.id));

  const agora = new Date();
  let reenviados = 0, desistidos = 0;

  for (const p of abertos) {
    const meus = (avisos ?? []).filter((a: any) => a.reembolso_id === p.id);
    const entregues = meus.filter((a: any) => a.enviado_em).length;
    if (entregues >= 2) continue; // os dois canais já saíram

    // Nunca houve linha nenhuma: é aviso que o gatilho não conseguiu criar.
    const pendentes = meus.filter((a: any) => !a.enviado_em);
    if (pendentes.length === 0) {
      await avisar(admin, p.id);
      reenviados++;
      continue;
    }

    const decisoes = pendentes.map((a: any) => decidirTentativa({
      tentativas: Number(a.tentativas ?? 0),
      criadoEm: a.created_at,
      ultimaEm: a.updated_at ?? null,
    }, agora));

    if (decisoes.includes('tentar')) {
      await avisar(admin, p.id);
      reenviados++;
      continue;
    }

    // Passou das 48 horas e nunca saiu. Desistir em silêncio seria repetir o
    // buraco de origem: o que resta é contar que NÃO conseguimos avisar.
    const paraDesistir = pendentes.filter((a: any, i: number) =>
      decisoes[i] === 'desistir' && !String(a.ultimo_erro ?? '').startsWith('desistiu'));
    if (paraDesistir.length > 0) {
      for (const a of paraDesistir) {
        await admin.from('reembolso_avisos')
          .update({ ultimo_erro: `desistiu após ${JANELA_INSISTENCIA_H}h: ${a.ultimo_erro ?? 'sem resposta'}`.slice(0, 500) })
          .eq('id', a.id);
      }
      const canais = paraDesistir.map((a: any) => a.canal).join(' e ');
      log('DESISTIU de avisar', { reembolsoId: p.id, canais });
      // Só vale avisar a gestão se o canal DELA estiver de pé.
      if (!paraDesistir.some((a: any) => a.canal === 'gestao')) {
        await avisarGestao({
          tipo: 'reembolso',
          titulo: `Não consegui avisar por ${canais} sobre um pedido de reembolso`,
          mensagem: `O pedido continua em análise e os ingressos seguem bloqueados. O canal ${canais} falhou por ${JANELA_INSISTENCIA_H}h seguidas: conferir se o WhatsApp da empresa está conectado. ${PAINEL}`,
          referencia: p.id,
        });
      }
      desistidos++;
    }
  }
  return { olhados: abertos.length, reenviados, desistidos };
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

    const reembolsoId = body?.reembolso_id;
    if (!reembolsoId || typeof reembolsoId !== 'string') return json({ ok: false, erro: 'reembolso_id_ausente' }, 400);

    const r = await avisar(admin, reembolsoId);
    return json({ ok: true, ...r });
  } catch (e) {
    // Não dá para devolver 500 calado: o gatilho não olha a resposta, então o
    // log é o único lugar onde este erro existe.
    log('exceção', { msg: e instanceof Error ? e.message : String(e) });
    return json({ ok: false, erro: 'erro_interno' }, 500);
  }
});
