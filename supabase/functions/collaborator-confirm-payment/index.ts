import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateCollaboratorSession, sessionErrorResponse } from "../_shared/collaboratorSession.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mesmo system actor usado pelo wrapper _shared/applyOrderApproved.ts
const SYSTEM_ACTOR = '95628c4a-8040-44ed-83c5-d6a5b8793926';
const VALID_METHODS = ['card_credit', 'card_debit', 'cash'];

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
      return json({ ok: true, order_id, status: 'paid', first_transition: false }, 200);
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

    return json({ ok: true, order_id, status: 'paid', first_transition: firstTransition }, 200);
  } catch (error) {
    console.error('[CONFIRM] error:', error);
    return json({ error: 'Erro interno' }, 500);
  }
});
