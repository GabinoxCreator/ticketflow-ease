import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateCollaboratorSession, sessionErrorResponse } from "../_shared/collaboratorSession.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESERVE_MINUTES = 30;

// Placeholders de balcão (colunas NOT NULL, sem cliente real numa venda via maquininha)
const BALCAO_CUSTOMER_NAME = 'Venda Balcão';
const BALCAO_CUSTOMER_EMAIL = 'balcao@smartpos.local';
const BALCAO_HOLDER_NAME = 'Ingresso Balcão';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { collaborator_id, session_token, event_id, items } = await req.json();

    if (!collaborator_id || !event_id || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios ausentes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // PASSO 1a — sessão (mesmo helper das outras edges de colaborador)
    const sv = await validateCollaboratorSession(supabase, collaborator_id, session_token);
    if (!sv.valid) return sessionErrorResponse(sv, corsHeaders);

    // PASSO 1b — trava de autorização: vínculo colaborador↔evento (mesma da list-lots)
    const { data: access } = await supabase
      .from('collaborator_events')
      .select('id')
      .eq('collaborator_id', collaborator_id)
      .eq('event_id', event_id)
      .maybeSingle();
    if (!access) {
      return new Response(JSON.stringify({ error: 'Sem acesso a este evento' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // PASSO 2 — validar itens (quantidade inteira > 0; lot_id presente)
    const normalized: { lot_id: string; quantity: number }[] = [];
    for (const it of items) {
      const lotId = it?.lot_id;
      const qty = it?.quantity;
      if (!lotId || !Number.isInteger(qty) || qty <= 0) {
        return new Response(JSON.stringify({ error: 'Item inválido (lot_id e quantity inteiro > 0)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      normalized.push({ lot_id: lotId, quantity: qty });
    }

    // Busca os lotes no banco; TODOS devem pertencer ao event_id. Preço sempre do banco.
    const lotIds = Array.from(new Set(normalized.map(i => i.lot_id)));
    const { data: lots, error: lotsErr } = await supabase
      .from('event_lots')
      .select('id, event_id, price')
      .in('id', lotIds);
    if (lotsErr) {
      console.error('[RESERVE] lots query error:', lotsErr);
      return new Response(JSON.stringify({ error: 'Erro ao validar lotes' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const lotMap = new Map((lots || []).map((l: any) => [l.id, l]));
    for (const id of lotIds) {
      const lot = lotMap.get(id);
      if (!lot || lot.event_id !== event_id) {
        return new Response(JSON.stringify({ error: 'Lote inválido para este evento', lot_id: id }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // PASSO 3 — reservar estoque (padrão create-mercadopago-pix) com rollback ativo
    const reservedSoFar: { lot_id: string; quantity: number }[] = [];
    const releaseAll = async () => {
      for (const r of reservedSoFar) {
        await supabase.rpc('release_lot_quantity', { _lot_id: r.lot_id, _qty: r.quantity });
      }
    };

    for (const item of normalized) {
      const { data: reserved, error: rpcErr } = await supabase
        .rpc('reserve_lot_quantity', { _lot_id: item.lot_id, _qty: item.quantity });
      if (rpcErr) {
        console.error('[RESERVE] reserve RPC error:', rpcErr);
        await releaseAll();
        return new Response(JSON.stringify({ error: 'Erro ao reservar estoque' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (!reserved) {
        await releaseAll();
        return new Response(JSON.stringify({ error: 'Estoque insuficiente', lot_id: item.lot_id }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      reservedSoFar.push({ lot_id: item.lot_id, quantity: item.quantity });
    }

    // total_amount = soma(price_do_banco × quantity)
    const lineItems = normalized.map(i => {
      const unit_price = Number(lotMap.get(i.lot_id).price);
      return { lot_id: i.lot_id, quantity: i.quantity, unit_price, subtotal: unit_price * i.quantity };
    });
    const totalAmount = Math.round(lineItems.reduce((s, li) => s + li.subtotal, 0) * 100) / 100;
    const expiresAtIso = new Date(Date.now() + RESERVE_MINUTES * 60 * 1000).toISOString();

    // PASSO 4 — criar order pending
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        event_id,
        status: 'pending',
        sale_origin: 'smartpos',
        payment_method: 'card', // placeholder; atualizado na confirmação do pagamento
        total_amount: totalAmount,
        service_fee_amount: 0,
        discount_amount: 0,
        user_id: null,
        customer_name: BALCAO_CUSTOMER_NAME,
        customer_email: BALCAO_CUSTOMER_EMAIL,
        expires_at: expiresAtIso,
      })
      .select('id')
      .single();

    if (orderError || !order) {
      console.error('[RESERVE] order insert error:', orderError);
      await releaseAll();
      return new Response(JSON.stringify({ error: 'Erro ao criar pedido' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // PASSO 5 — criar tickets pending (1 por unidade). ticket_code = default do banco.
    const ticketsToCreate = lineItems.flatMap(li =>
      Array.from({ length: li.quantity }, () => ({
        order_id: order.id,
        event_id,
        lot_id: li.lot_id,
        status: 'pending',
        holder_name: BALCAO_HOLDER_NAME,
      }))
    );
    const { error: ticketsError } = await supabase.from('tickets').insert(ticketsToCreate);
    if (ticketsError) {
      console.error('[RESERVE] tickets insert error:', ticketsError);
      await supabase.from('orders').delete().eq('id', order.id);
      await releaseAll();
      return new Response(JSON.stringify({ error: 'Erro ao gerar ingressos' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      order_id: order.id,
      total_amount: totalAmount,
      expires_at: expiresAtIso,
      items: lineItems,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[RESERVE] error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
