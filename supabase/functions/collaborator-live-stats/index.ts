import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateCollaboratorSession, sessionErrorResponse } from "../_shared/collaboratorSession.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FeedItem {
  id: string;
  source: 'online' | 'manual' | 'portaria' | 'cortesia';
  customer_name: string;
  lot_name: string;
  quantity: number;
  amount: number;
  created_at: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { event_id, collaborator_id, session_token } = await req.json();

    if (!event_id || !collaborator_id) {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios ausentes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const sv = await validateCollaboratorSession(supabase, collaborator_id, session_token);
    if (!sv.valid) return sessionErrorResponse(sv, corsHeaders);

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

    // Lots → revenue/availability
    const { data: lots } = await supabase
      .from('event_lots')
      .select('id, name, total_quantity, sold_quantity')
      .eq('event_id', event_id);

    const lotMap = new Map<string, { name: string }>();
    let ticketsAvailable = 0;
    (lots || []).forEach((l: any) => {
      lotMap.set(l.id, { name: l.name });
      ticketsAvailable += Math.max(0, Number(l.total_quantity || 0) - Number(l.sold_quantity || 0));
    });

    // Pedidos pagos do evento, TODOS (o banco corta em 1.000 linhas por consulta,
    // então pagina). `order_producer_value` é a fórmula única do valor de face
    // (sem taxa de conveniência, sem juro de parcela, já sem reembolso): a mesma
    // do painel do evento e do repasse. OS-148, 06/10/2026.
    const PAGE = 1000;
    const paidOrders: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('orders')
        .select('id, customer_name, created_at, sale_origin, user_id, order_producer_value')
        .eq('event_id', event_id)
        .in('status', ['paid', 'completed'])
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      paidOrders.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    const isCourtesy = (o: any) => o.sale_origin === 'courtesy';
    const orderById = new Map<string, any>(paidOrders.map((o: any) => [o.id, o]));

    // Ingressos válidos/usados dos pedidos pagos: vendidos e cortesias contados
    // como no painel (`lot_sales_counts`), mais lote/quantidade/titular do feed.
    const tickets: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, order_id, lot_id, holder_name')
        .eq('event_id', event_id)
        .in('status', ['valid', 'used'])
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      tickets.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }

    const ticketsByOrder = new Map<string, { count: number; lotId: string | null; holderName: string | null }>();
    let ticketsSoldOnline = 0;
    let courtesies = 0;
    tickets.forEach((t: any) => {
      const order = orderById.get(t.order_id);
      if (!order) return; // ingresso de pedido não pago não conta
      if (isCourtesy(order)) courtesies += 1;
      else ticketsSoldOnline += 1;
      const prev = ticketsByOrder.get(t.order_id) || { count: 0, lotId: null, holderName: null };
      prev.count += 1;
      if (!prev.lotId) prev.lotId = t.lot_id;
      if (!prev.holderName && t.holder_name) prev.holderName = t.holder_name;
      ticketsByOrder.set(t.order_id, prev);
    });

    // O feed mostra só as 200 vendas mais recentes (como antes).
    const orders = paidOrders.slice(0, 200);

    // Fallback names from profiles for orders with empty customer_name
    const missingUserIds = Array.from(new Set(
      (orders || [])
        .filter((o: any) => !o.customer_name || !o.customer_name.trim())
        .map((o: any) => o.user_id)
        .filter(Boolean)
    ));
    const profileNames = new Map<string, string>();
    if (missingUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nome_completo')
        .in('id', missingUserIds);
      (profiles || []).forEach((p: any) => {
        if (p.nome_completo) profileNames.set(p.id, p.nome_completo);
      });
    }

    // Door sales
    const { data: doorSales } = await supabase
      .from('door_sales')
      .select('id, quantity, total_amount, created_at, lot_id, payment_method')
      .eq('event_id', event_id)
      .order('created_at', { ascending: false })
      .limit(100);

    let doorRevenue = 0;
    let doorTickets = 0;
    (doorSales || []).forEach((d: any) => {
      doorRevenue += Number(d.total_amount || 0);
      doorTickets += Number(d.quantity || 0);
    });

    // Receita = valor de face dos pedidos vendidos (cortesia fora), igual ao painel
    // do evento. A portaria segue fora da receita, como sempre esteve.
    const soldOrders = paidOrders.filter((o: any) => !isCourtesy(o));
    const revenue = soldOrders.reduce((acc: number, o: any) => acc + Number(o.order_producer_value || 0), 0);
    const ticketsSold = ticketsSoldOnline + doorTickets;
    // Ticket médio por pedido vendido, como no início do painel do produtor.
    const avgTicket = soldOrders.length > 0 ? revenue / soldOrders.length : 0;

    // Build feed
    const feed: FeedItem[] = [];
    (orders || []).forEach((o: any) => {
      const info = ticketsByOrder.get(o.id);
      if (!info) return; // skip orders without paid tickets
      const lotName = info.lotId ? (lotMap.get(info.lotId)?.name || 'Ingresso') : 'Ingresso';
      feed.push({
        id: `order:${o.id}`,
        source: isCourtesy(o) ? 'cortesia' : o.sale_origin === 'manual' ? 'manual' : 'online',
        customer_name:
          (o.customer_name && o.customer_name.trim()) ||
          (o.user_id && profileNames.get(o.user_id)) ||
          info.holderName ||
          'Cliente',
        lot_name: lotName,
        quantity: info.count,
        amount: isCourtesy(o) ? 0 : Number(o.order_producer_value || 0),
        created_at: o.created_at,
      });
    });
    (doorSales || []).forEach((d: any) => {
      const lotName = lotMap.get(d.lot_id)?.name || 'Ingresso';
      feed.push({
        id: `door:${d.id}`,
        source: 'portaria',
        customer_name: 'Venda na portaria',
        lot_name: lotName,
        quantity: Number(d.quantity || 0),
        amount: Number(d.total_amount || 0),
        created_at: d.created_at,
      });
    });

    feed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const recent = feed.slice(0, 30);

    return new Response(JSON.stringify({
      kpis: { revenue, ticketsSold, courtesies, ticketsAvailable, avgTicket },
      recent,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[LIVE-STATS] error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
