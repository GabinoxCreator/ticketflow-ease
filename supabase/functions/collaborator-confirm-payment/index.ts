// redeploy 2026-06-28 — força redeploy para garantir loadIssuedTickets (2 queries, sem embed)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateCollaboratorSession, sessionErrorResponse } from "../_shared/collaboratorSession.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mesmo system actor usado pelo wrapper _shared/applyOrderApproved.ts
const SYSTEM_ACTOR = '95628c4a-8040-44ed-83c5-d6a5b8793926';
// 'pix' liberado pro totem de ingresso (m-SiTef). Só cartão grava pos_* (ver isCard
// abaixo); prova do PIX (endToEndId/txid) NÃO é persistida por ora — dívida conhecida.
const VALID_METHODS = ['card_credit', 'card_debit', 'cash', 'pix'];

type IssuedTicket = { ticket_code: string; qr_payload: string; event_name: string | null; lot_name: string | null };

// ADITIVO: lê os ingressos JÁ emitidos da order para devolver ao totem.
// NÃO cria ticket — eles nascem em collaborator-reserve-order ('pending') e são
// promovidos a 'valid' pela RPC apply_order_approved. Aqui apenas consultamos, então
// reconfirmar o mesmo order_id nunca duplica. qr_payload = ticket_code CRU, idêntico
// ao que collaborator-validate-ticket lê na portaria — não reformatar.
// NUNCA lança: a verdade financeira (pedido pago) não pode depender desta leitura.
// Qualquer erro (select/rede) → loga e devolve []; a confirmação segue ok:true.
async function loadIssuedTickets(supabase: any, orderId: string, eventId: string): Promise<IssuedTicket[]> {
  try {
    // SEM embed: tickets e nome do lote vêm em queries separadas. O embed
    // event_lots(name) podia falhar e zerar a leitura; desacoplar garante que o
    // caso normal não falhe. qr_payload = ticket_code CRU (o que a portaria lê).
    const [evRes, tixRes] = await Promise.all([
      supabase.from('events').select('title').eq('id', eventId).maybeSingle(),
      supabase
        .from('tickets')
        .select('ticket_code, lot_id')
        .eq('order_id', orderId)
        .eq('status', 'valid')
        .order('ticket_code', { ascending: true }),
    ]);
    if (evRes?.error) console.error('[CONFIRM] loadIssuedTickets events error:', evRes.error);
    if (tixRes?.error) console.error('[CONFIRM] loadIssuedTickets tickets error:', tixRes.error);

    const eventName = evRes?.data?.title ?? null;
    const tix = (tixRes?.data || []) as Array<{ ticket_code: string; lot_id: string | null }>;

    // Nomes dos lotes em uma query só (lot_id → name).
    const lotIds = Array.from(new Set(tix.map((t) => t.lot_id).filter(Boolean))) as string[];
    const lotNameById = new Map<string, string>();
    if (lotIds.length > 0) {
      const lotsRes = await supabase.from('event_lots').select('id, name').in('id', lotIds);
      if (lotsRes?.error) console.error('[CONFIRM] loadIssuedTickets lots error:', lotsRes.error);
      for (const l of (lotsRes?.data || []) as Array<{ id: string; name: string | null }>) {
        if (l.name != null) lotNameById.set(l.id, l.name);
      }
    }

    return tix.map((t) => ({
      ticket_code: t.ticket_code,
      qr_payload: t.ticket_code,
      event_name: eventName,
      lot_name: t.lot_id ? lotNameById.get(t.lot_id) ?? null : null,
    }));
  } catch (e) {
    console.error('[CONFIRM] loadIssuedTickets threw (ignorado, retorna []):', e);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { collaborator_id, session_token, order_id, payment_method, pos } = await req.json();

    if (!collaborator_id || !order_id) {
      return json({ error: 'Parâmetros obrigatórios ausentes' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // PASSO 1 — sessão
    const sv = await validateCollaboratorSession(supabase, collaborator_id, session_token);
    if (!sv.valid) return sessionErrorResponse(sv, corsHeaders);

    // Carrega a order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, status, sale_origin, event_id')
      .eq('id', order_id)
      .maybeSingle();
    if (orderErr) {
      console.error('[CONFIRM] order load error:', orderErr);
      return json({ error: 'Erro ao carregar pedido' }, 500);
    }
    if (!order) return json({ error: 'Order não encontrada' }, 404);

    // Autorização: vínculo colaborador↔evento da própria order
    const { data: access } = await supabase
      .from('collaborator_events')
      .select('id')
      .eq('collaborator_id', collaborator_id)
      .eq('event_id', order.event_id)
      .maybeSingle();
    if (!access) return json({ error: 'Sem acesso a esta order' }, 403);

    // Só confirma vendas da maquininha
    if (order.sale_origin !== 'smartpos') {
      return json({ error: 'Order não é de venda via maquininha' }, 400);
    }

    // PASSO 2 — idempotência / estado
    if (order.status === 'paid') {
      const tickets = await loadIssuedTickets(supabase, order_id, order.event_id);
      return json({ ok: true, order_id, status: 'paid', first_transition: false, tickets }, 200);
    }
    if (order.status !== 'pending') {
      return json({ error: 'Order não está mais reservada', status: order.status }, 409);
    }

    // PASSO 3 — validar entrada
    if (!VALID_METHODS.includes(payment_method)) {
      return json({ error: 'payment_method inválido' }, 400);
    }
    const isCard = payment_method.startsWith('card_');
    if (isCard) {
      const hasIds = pos && (pos.nsu || pos.authorization_code);
      if (!hasIds) {
        // Cartão sem NSU/autorização é anômalo, mas não fatal — só registra.
        await supabase.from('audit_logs').insert({
          actor_id: SYSTEM_ACTOR,
          action: 'collaborator_confirm_payment_card_no_nsu',
          target_type: 'order',
          target_id: order_id,
          metadata: { collaborator_id, payment_method, pos: pos ?? null },
        });
      }
    }

    // PASSO 4 — grava dados do POS ANTES da RPC (guard status='pending')
    const updateObj: Record<string, unknown> = { payment_method };
    if (isCard && pos) {
      if (pos.nsu != null) updateObj.pos_nsu = pos.nsu;
      if (pos.nsu_host != null) updateObj.pos_nsu_host = pos.nsu_host;
      if (pos.authorization_code != null) updateObj.pos_authorization_code = pos.authorization_code;
      if (pos.card_brand != null) updateObj.pos_card_brand = pos.card_brand;
      if (pos.terminal_id != null) updateObj.pos_terminal_id = pos.terminal_id;
    }
    const { data: updated, error: updErr } = await supabase
      .from('orders')
      .update(updateObj)
      .eq('id', order_id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (updErr) {
      console.error('[CONFIRM] order update error:', updErr);
      return json({ error: 'Erro ao gravar dados do pagamento' }, 500);
    }
    if (!updated) {
      // Estado mudou entre a leitura e o update (ex.: cron expirou).
      return json({ error: 'Order não está mais reservada', status: 'changed' }, 409);
    }

    // PASSO 5 — confirma via RPC (sem wrapper p/ não disparar e-mail)
    const { data: rpcData, error: rpcErr } = await supabase
      .rpc('apply_order_approved', { _order_id: order_id, _mp_payment_id: null });

    if (rpcErr) {
      try {
        await supabase.from('audit_logs').insert({
          actor_id: SYSTEM_ACTOR,
          action: 'apply_order_approved_failed',
          target_type: 'order',
          target_id: order_id,
          metadata: { source: 'collaborator_confirm_payment', collaborator_id, error: rpcErr.message ?? String(rpcErr) },
        });
      } catch (_) { /* swallow */ }
      console.error('[CONFIRM] apply_order_approved error:', rpcErr);
      return json({ error: 'Erro ao confirmar pagamento' }, 500);
    }

    const result = (rpcData ?? {}) as { first_transition?: boolean; mismatch?: boolean; reason?: string; order_status?: string };
    if (result.mismatch === true) {
      await supabase.from('audit_logs').insert({
        actor_id: SYSTEM_ACTOR,
        action: 'collaborator_confirm_payment_mismatch',
        target_type: 'order',
        target_id: order_id,
        metadata: { collaborator_id, payment_method, reason: result.reason ?? null, order_status: result.order_status ?? null },
      });
      return json({ error: result.reason || 'Falha ao confirmar (mismatch)', status: result.order_status ?? null }, 500);
    }

    const firstTransition = !!result.first_transition;

    // PASSO 6 — audit de sucesso (sem e-mail)
    await supabase.from('audit_logs').insert({
      actor_id: SYSTEM_ACTOR,
      action: 'collaborator_confirm_payment_success',
      target_type: 'order',
      target_id: order_id,
      metadata: { collaborator_id, payment_method, first_transition: firstTransition },
    });

    // ADITIVO — devolve os ingressos emitidos (não altera os campos já existentes).
    const tickets = await loadIssuedTickets(supabase, order_id, order.event_id);
    return json({ ok: true, order_id, status: 'paid', first_transition: firstTransition, tickets }, 200);
  } catch (error) {
    console.error('[CONFIRM] error:', error);
    return json({ error: 'Erro interno' }, 500);
  }
});
