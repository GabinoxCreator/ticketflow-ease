/*
 * meta-capi-purchase — manda a COMPRA para a Meta pelo nosso servidor.
 *
 * POR QUE EXISTE (29/09/2026): a Luana, da Filhos da Luz, queria fazer tráfego
 * pago para o Carlos Caetano e reclamou que "não aparece nada na Meta". Duas
 * coisas estavam erradas. A primeira era o pixel do navegador, que acendia e
 * não falava (consertado em src/lib/metaPixel.ts). A segunda é esta: o site
 * NUNCA teve evento de compra. Sem compra, a campanha não consegue otimizar por
 * venda nem mostrar retorno — que é exatamente o que ela queria.
 *
 * Por que pelo servidor e não só pelo navegador: o evento do navegador se perde
 * em bloqueador de anúncio, no Safari do iPhone e na volta da tela de pagamento
 * (muita gente fecha a aba depois de pagar o PIX). O que sai daqui não se perde.
 * Os dois caminhos mandam o MESMO `event_id` (o id do pedido), e a Meta
 * deduplica: uma venda, não duas.
 *
 * Quem chama: o gatilho `trg_orders_meta_capi`, quando o pedido vira 'paid'.
 * Só venda ONLINE — cortesia, maquininha e venda manual não vieram de anúncio.
 *
 * ⚠️ LGPD — a trava que não pode sair daqui: isto envia dados do comprador
 * (e-mail, telefone, nome) para a Meta, nos EUA. Base legal é CONSENTIMENTO, e
 * ele mora em `profiles.marketing_consent`. Quem não aceitou os cookies de
 * marketing NÃO é enviado, ponto. A função é FAIL-CLOSED: na dúvida, não manda.
 * Tudo vai com hash SHA-256 (padrão da Meta) e nada de dado pessoal entra em
 * log nem na tabela de registro.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Log NUNCA leva dado pessoal — só ids técnicos e motivo.
const log = (passo: string, dados?: unknown) =>
  console.log(`[META-CAPI] ${passo}${dados ? ' ' + JSON.stringify(dados) : ''}`);

const GRAPH = 'https://graph.facebook.com/v21.0';
const SITE = 'https://festpag.digital';

/** SHA-256 em hexadecimal — o formato que a Meta exige para os dados do cliente. */
async function sha256(valor: string): Promise<string> {
  const bytes = new TextEncoder().encode(valor);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Telefone no formato que a Meta espera: só dígitos, com o 55 do Brasil na frente. */
function normalizarTelefone(bruto: string | null): string | null {
  if (!bruto) return null;
  let d = bruto.replace(/\D/g, '');
  if (d.length < 10) return null;
  if (!d.startsWith('55')) d = '55' + d;
  return d;
}

/** Nome do comprador dividido em primeiro e último, sem acento e minúsculo. */
function partirNome(nome: string | null): { fn: string | null; ln: string | null } {
  if (!nome) return { fn: null, ln: null };
  const partes = semAcento(nome.trim().toLowerCase()).replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { fn: null, ln: null };
  return { fn: partes[0], ln: partes.length > 1 ? partes[partes.length - 1] : null };
}

async function registrar(
  admin: any,
  orderId: string,
  campos: { pixel_id?: string | null; sucesso: boolean; motivo?: string | null; resposta?: unknown },
) {
  try {
    await admin.from('meta_capi_envios').upsert(
      {
        order_id: orderId,
        pixel_id: campos.pixel_id ?? null,
        sucesso: campos.sucesso,
        motivo: campos.motivo ?? null,
        resposta: campos.resposta ?? null,
        enviado_em: new Date().toISOString(),
      },
      { onConflict: 'order_id' },
    );
  } catch (e) {
    log('não consegui registrar o envio', { orderId, erro: String(e).slice(0, 120) });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // --- porta: o mesmo segredo compartilhado dos outros gatilhos ---
  const segredo = req.headers.get('x-cron-secret') ?? req.headers.get('X-Cron-Secret');
  if (!segredo) return json({ error: 'não autorizado' }, 401);
  try {
    const { data: doVault } = await admin.rpc('get_cron_secret');
    if (!doVault || segredo !== doVault) return json({ error: 'não autorizado' }, 401);
  } catch {
    return json({ error: 'não autorizado' }, 401);
  }

  let body: { order_id?: string; origem?: string } = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }
  const orderId = body.order_id;
  if (!orderId) return json({ error: 'order_id obrigatório' }, 400);

  // --- já mandamos este pedido? (o gatilho pode disparar mais de uma vez) ---
  const { data: jaEnviado } = await admin
    .from('meta_capi_envios')
    .select('order_id, sucesso')
    .eq('order_id', orderId)
    .maybeSingle();
  if (jaEnviado?.sucesso) {
    log('pedido já enviado antes', { orderId });
    return json({ ok: true, pulado: 'já enviado' });
  }

  // --- o pedido ---
  const { data: pedido } = await admin
    .from('orders')
    .select('id, event_id, user_id, status, sale_origin, total_amount, customer_email, customer_phone, customer_name, updated_at')
    .eq('id', orderId)
    .maybeSingle();

  if (!pedido) return json({ error: 'pedido não encontrado' }, 404);
  if (pedido.status !== 'paid') {
    return json({ ok: true, pulado: 'pedido não está pago' });
  }
  if ((pedido.sale_origin ?? 'online') !== 'online') {
    return json({ ok: true, pulado: 'venda não é do site' });
  }

  // --- LGPD: o comprador autorizou marketing? Fail-closed. ---
  let identificadores: { fbp: string | null; fbc: string | null } = { fbp: null, fbc: null };
  if (pedido.user_id) {
    const { data: perfil } = await admin
      .from('profiles')
      .select('marketing_consent, fbp, fbc')
      .eq('id', pedido.user_id)
      .maybeSingle();
    if (perfil?.marketing_consent !== true) {
      log('sem consentimento de marketing — não enviado', { orderId });
      await registrar(admin, orderId, { sucesso: false, motivo: 'sem consentimento de marketing' });
      return json({ ok: true, pulado: 'sem consentimento' });
    }
    identificadores = { fbp: perfil?.fbp ?? null, fbc: perfil?.fbc ?? null };
  } else {
    log('pedido sem conta — não enviado', { orderId });
    await registrar(admin, orderId, { sucesso: false, motivo: 'pedido sem conta (sem consentimento registrável)' });
    return json({ ok: true, pulado: 'sem conta' });
  }

  // --- o evento e o produtor ---
  const { data: evento } = await admin
    .from('events')
    .select('id, title, slug, producer_profile_id')
    .eq('id', pedido.event_id)
    .maybeSingle();
  if (!evento?.producer_profile_id) {
    await registrar(admin, orderId, { sucesso: false, motivo: 'evento sem produtor' });
    return json({ ok: true, pulado: 'evento sem produtor' });
  }

  const { data: produtor } = await admin
    .from('producer_profiles')
    .select('id, meta_pixel_id, tracking_enabled')
    .eq('id', evento.producer_profile_id)
    .maybeSingle();

  if (!produtor?.tracking_enabled || !produtor?.meta_pixel_id) {
    return json({ ok: true, pulado: 'produtor sem rastreamento ligado' });
  }

  const { data: segredoProdutor } = await admin
    .from('producer_tracking_secrets')
    .select('meta_capi_token')
    .eq('producer_profile_id', produtor.id)
    .maybeSingle();

  const token = segredoProdutor?.meta_capi_token;
  if (!token) {
    // Não é erro: o produtor só configurou o pixel do navegador, não a API.
    await registrar(admin, orderId, {
      pixel_id: produtor.meta_pixel_id,
      sucesso: false,
      motivo: 'produtor sem token da API de Conversões',
    });
    return json({ ok: true, pulado: 'sem token' });
  }

  // --- quantos ingressos ---
  const { count: qtdIngressos } = await admin
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId);

  // --- monta o evento com tudo hasheado ---
  const email = pedido.customer_email?.trim().toLowerCase() || null;
  const telefone = normalizarTelefone(pedido.customer_phone);
  const { fn, ln } = partirNome(pedido.customer_name);

  const user_data: Record<string, unknown> = {};
  if (email) user_data.em = [await sha256(email)];
  if (telefone) user_data.ph = [await sha256(telefone)];
  if (fn) user_data.fn = [await sha256(fn)];
  if (ln) user_data.ln = [await sha256(ln)];
  user_data.external_id = [await sha256(pedido.user_id)];
  user_data.country = [await sha256('br')];
  // _fbp/_fbc vão CRUS de propósito — é assim que a Meta os espera, e são eles
  // que ligam esta compra ao clique no anúncio.
  if (identificadores.fbp) user_data.fbp = identificadores.fbp;
  if (identificadores.fbc) user_data.fbc = identificadores.fbc;

  const quando = pedido.updated_at ? Math.floor(new Date(pedido.updated_at).getTime() / 1000) : Math.floor(Date.now() / 1000);
  const agora = Math.floor(Date.now() / 1000);
  // A Meta recusa evento com mais de 7 dias.
  const event_time = agora - quando > 6 * 24 * 3600 ? agora : quando;

  const payload = {
    data: [
      {
        event_name: 'Purchase',
        event_time,
        event_id: pedido.id, // ← deduplica com o Purchase do navegador
        action_source: 'website',
        event_source_url: `${SITE}/evento/${evento.slug || evento.id}`,
        user_data,
        custom_data: {
          currency: 'BRL',
          value: Number(pedido.total_amount) || 0,
          content_type: 'product',
          content_ids: [evento.id],
          content_name: evento.title,
          num_items: qtdIngressos ?? undefined,
        },
      },
    ],
  };

  try {
    const resp = await fetch(`${GRAPH}/${produtor.meta_pixel_id}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, access_token: token }),
    });
    const resposta = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      log('a Meta recusou', { orderId, status: resp.status, erro: resposta?.error?.message?.slice(0, 160) });
      await registrar(admin, orderId, {
        pixel_id: produtor.meta_pixel_id,
        sucesso: false,
        motivo: `meta recusou (${resp.status})`,
        resposta,
      });
      return json({ ok: false, status: resp.status, resposta }, 200);
    }

    log('compra enviada', { orderId, recebidos: resposta?.events_received });
    await registrar(admin, orderId, { pixel_id: produtor.meta_pixel_id, sucesso: true, resposta });
    return json({ ok: true, resposta });
  } catch (e) {
    log('falha de rede ao falar com a Meta', { orderId, erro: String(e).slice(0, 160) });
    await registrar(admin, orderId, {
      pixel_id: produtor.meta_pixel_id,
      sucesso: false,
      motivo: 'falha de rede',
    });
    return json({ ok: false, erro: 'falha de rede' }, 200);
  }
});
