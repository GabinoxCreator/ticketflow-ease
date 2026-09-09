/*
 * entregar-ingressos-whatsapp — o ingresso chega no WhatsApp (Bloco 3, plano 09/09/2026).
 *
 * Chamada pelo cron a cada minuto (X-Cron-Secret, conferido no Vault — mesmo
 * padrão de `expire-pending-orders`). Reivindica até 8 entregas pendentes
 * (RPC `entregas_whatsapp_reivindicar`, segura contra dois crons ao mesmo tempo)
 * e, para cada pedido pago:
 *   1. uma mensagem de texto: evento, data, local, quantos ingressos, link;
 *   2. uma IMAGEM de QR por ingresso, com legenda (titular, lote, código curto).
 *      O QR codifica o `ticket_code` cru — o mesmo que a portaria valida e o
 *      mesmo do e-mail. O PNG vai para o bucket privado `ingressos-whatsapp` e
 *      sai como link assinado de 30 dias (a Evolution só aceita mídia por URL).
 *
 * Falhou no meio? `mensagens_enviadas` guarda até onde chegou; a próxima
 * tentativa continua dali, sem repetir o que a pessoa já recebeu. Espera
 * crescente (1, 2, 5, 10, 20, 30, 60… min) por até 24 h; depois desiste e
 * registra o motivo. O e-mail continua saindo pelo caminho de hoje — este aqui
 * é um canal a mais, nunca substitui.
 *
 * Quem entra na fila é decidido no banco (gatilho `on_order_paid_agendar_whatsapp`):
 * só comprador com conta e WhatsApp CONFIRMADO por código.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { carregarConfigWhatsApp, enviarTextoWhatsApp, enviarImagemWhatsApp, mascararNumero } from '../_shared/whatsapp.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const BUCKET = 'ingressos-whatsapp';
const LINK_DIAS = 30;
const MAX_TENTATIVAS = 12;
const MAX_HORAS = 24;
const ESPERA_MIN = [1, 2, 5, 10, 20, 30, 60, 60, 60, 120, 120, 240];

type Entrega = {
  id: string; order_id: string; user_id: string | null; destino: string;
  tentativas: number; mensagens_enviadas: number; criado_em: string;
};

const log = (event: string, data: Record<string, unknown> = {}) => {
  try { console.log(JSON.stringify({ scope: 'entrega_whatsapp', event, ...data })); } catch { console.log(event); }
};

function primeiroNome(nome: unknown): string {
  const n = String(nome ?? '').trim().split(/\s+/)[0] ?? '';
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : '';
}

function dataPorExtenso(date: string | null, time: string | null): string {
  if (!date) return '';
  const d = new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const h = time ? String(time).slice(0, 5) : '';
  return h ? `${d}, às ${h}` : d;
}

/** Monta as mensagens (texto primeiro, depois uma imagem por ingresso). */
async function montarMensagens(admin: any, orderId: string) {
  const { data: order } = await admin.from('orders')
    .select('id, status, customer_name, user_id, event_id, total_amount')
    .eq('id', orderId).maybeSingle();
  if (!order) throw new Error('pedido_nao_encontrado');
  if (order.status !== 'paid') throw new Error(`pedido_nao_pago:${order.status}`);

  const [{ data: event }, { data: ticketRows }] = await Promise.all([
    admin.from('events').select('title, date, time, venue, city, state, slug').eq('id', order.event_id).maybeSingle(),
    admin.from('tickets').select('ticket_code, holder_name, lot_id').eq('order_id', orderId).order('created_at'),
  ]);
  const tickets = (ticketRows ?? []) as Array<{ ticket_code: string; holder_name: string | null; lot_id: string | null }>;
  if (tickets.length === 0) throw new Error('pedido_sem_ingressos');

  const lotIds = [...new Set(tickets.map((t) => t.lot_id).filter(Boolean))] as string[];
  const lotNameById = new Map<string, string>();
  if (lotIds.length > 0) {
    const { data: lots } = await admin.from('event_lots').select('id, name').in('id', lotIds);
    for (const l of (lots ?? []) as Array<{ id: string; name: string }>) lotNameById.set(l.id, l.name);
  }

  const titulo = event?.title ?? 'seu evento';
  const local = event?.venue ? `${event.venue}${event?.city ? ` — ${event.city}/${event.state ?? ''}` : ''}` : '';
  const quando = dataPorExtenso(event?.date ?? null, event?.time ?? null);
  const nome = primeiroNome(order.customer_name);
  const n = tickets.length;

  const texto = [
    `Olá${nome ? `, ${nome}` : ''}! 🎉 Seu pagamento foi confirmado.`,
    '',
    `*${titulo}*`,
    quando ? `📅 ${quando}` : '',
    local ? `📍 ${local}` : '',
    '',
    n === 1
      ? 'Seu ingresso vem logo abaixo, como imagem. Na entrada, é só mostrar o QR.'
      : `Você tem ${n} ingressos. Cada um vem logo abaixo, como imagem. Na entrada, é só mostrar o QR.`,
    '',
    'Para ver seus ingressos a qualquer hora: https://festpag.digital/meus-ingressos',
  ].filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');

  const imagens = tickets.map((t, i) => ({
    codigo: t.ticket_code,
    caminho: `${orderId}/${i + 1}-${t.ticket_code.slice(0, 8)}.png`,
    legenda: [
      `🎟️ Ingresso ${i + 1} de ${n} · *${titulo}*`,
      t.lot_id && lotNameById.get(t.lot_id) ? lotNameById.get(t.lot_id) : null,
      `Titular: ${t.holder_name || order.customer_name || 'Convidado'}`,
      `Código: ${t.ticket_code.slice(0, 8).toUpperCase()}`,
      'Mostre este QR na entrada.',
    ].filter(Boolean).join('\n'),
  }));

  return { texto, imagens };
}

/** Gera o PNG do QR, guarda no bucket e devolve o link assinado. */
async function linkDoQr(admin: any, caminho: string, codigo: string): Promise<string> {
  const QRCode: any = (await import('npm:qrcode@1.5.4')).default;
  const dataUrl: string = await QRCode.toDataURL(codigo, { width: 512, margin: 2, errorCorrectionLevel: 'M' });
  const base64 = dataUrl.split(',')[1];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const { error: upErr } = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: 'image/png', upsert: true });
  if (upErr) throw new Error(`storage_upload:${upErr.message}`);
  const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(caminho, LINK_DIAS * 24 * 3600);
  if (signErr || !signed?.signedUrl) throw new Error(`storage_sign:${signErr?.message ?? 'sem url'}`);
  return signed.signedUrl;
}

async function processar(admin: any, e: Entrega): Promise<{ ok: boolean; erro?: string; enviadas: number }> {
  const { texto, imagens } = await montarMensagens(admin, e.order_id);
  const passos: Array<() => Promise<{ ok: boolean; erro?: string }>> = [
    () => enviarTextoWhatsApp(e.destino, texto, { timeoutMs: 15_000 }),
    ...imagens.map((img) => async () => {
      const url = await linkDoQr(admin, img.caminho, img.codigo);
      return enviarImagemWhatsApp(e.destino, url, img.legenda, { timeoutMs: 30_000, fileName: `ingresso-${img.codigo.slice(0, 8)}.png` });
    }),
  ];

  let enviadas = e.mensagens_enviadas ?? 0;
  for (let i = enviadas; i < passos.length; i++) {
    const r = await passos[i]();
    if (!r.ok) return { ok: false, erro: r.erro ?? 'falha_envio', enviadas };
    enviadas = i + 1;
    await admin.from('entregas_whatsapp').update({ mensagens_enviadas: enviadas, atualizado_em: new Date().toISOString() }).eq('id', e.id);
  }
  return { ok: true, enviadas };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  });

  // Só o cron (segredo do Vault). Sem segredo, 401 — nunca "deixa passar".
  const fornecido = req.headers.get('x-cron-secret');
  let autorizado = false;
  if (fornecido) {
    try {
      const { data: segredo } = await admin.rpc('get_cron_secret');
      autorizado = !!segredo && fornecido === segredo;
    } catch { /* fica não autorizado */ }
  }
  if (!autorizado) return json({ ok: false, error: 'nao_autorizado' }, 401);

  const temWhatsApp = await carregarConfigWhatsApp(admin);
  if (!temWhatsApp) {
    log('whatsapp_nao_configurado');
    return json({ ok: false, error: 'whatsapp_nao_configurado' }, 503);
  }

  const { data: lote, error: erroLote } = await admin.rpc('entregas_whatsapp_reivindicar', { _limite: 8 });
  if (erroLote) {
    log('reivindicar_falhou', { error: erroLote.message });
    return json({ ok: false, error: 'reivindicar_falhou' }, 500);
  }
  const entregas = (lote ?? []) as Entrega[];
  const resumo = { processadas: entregas.length, enviadas: 0, adiadas: 0, desistidas: 0 };

  for (const e of entregas) {
    const agora = new Date();
    let resultado: { ok: boolean; erro?: string; enviadas: number };
    try {
      resultado = await processar(admin, e);
    } catch (err) {
      resultado = { ok: false, erro: String(err instanceof Error ? err.message : err).slice(0, 300), enviadas: e.mensagens_enviadas ?? 0 };
    }

    if (resultado.ok) {
      await admin.from('entregas_whatsapp').update({
        status: 'enviado', enviado_em: agora.toISOString(), atualizado_em: agora.toISOString(), ultimo_erro: null,
        tentativas: (e.tentativas ?? 0) + 1, mensagens_enviadas: resultado.enviadas,
      }).eq('id', e.id);
      resumo.enviadas++;
      log('enviado', { order_id: e.order_id, para: mascararNumero(e.destino), mensagens: resultado.enviadas });
      continue;
    }

    const tentativas = (e.tentativas ?? 0) + 1;
    const idadeHoras = (agora.getTime() - new Date(e.criado_em).getTime()) / 3_600_000;
    // Pedido que não está pago ou sem ingresso não vai se resolver esperando.
    const definitivo = /^pedido_/.test(resultado.erro ?? '');
    if (definitivo || tentativas >= MAX_TENTATIVAS || idadeHoras >= MAX_HORAS) {
      await admin.from('entregas_whatsapp').update({
        status: 'desistiu', tentativas, ultimo_erro: resultado.erro ?? null, atualizado_em: agora.toISOString(),
        mensagens_enviadas: resultado.enviadas,
      }).eq('id', e.id);
      resumo.desistidas++;
      log('desistiu', { order_id: e.order_id, erro: resultado.erro, tentativas });
      continue;
    }

    const esperaMin = ESPERA_MIN[Math.min(tentativas - 1, ESPERA_MIN.length - 1)];
    await admin.from('entregas_whatsapp').update({
      status: 'pendente', tentativas, ultimo_erro: resultado.erro ?? null, atualizado_em: agora.toISOString(),
      proximo_em: new Date(agora.getTime() + esperaMin * 60_000).toISOString(), mensagens_enviadas: resultado.enviadas,
    }).eq('id', e.id);
    resumo.adiadas++;
    log('adiado', { order_id: e.order_id, erro: resultado.erro, tentativas, espera_min: esperaMin });
  }

  return json({ ok: true, ...resumo });
});
