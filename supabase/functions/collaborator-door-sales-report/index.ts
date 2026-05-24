import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { compareSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function validateSession(supabase: any, collaboratorId: string, sessionToken: string) {
  if (!sessionToken) return { valid: false };
  const { data: session } = await supabase
    .from('collaborator_sessions')
    .select('session_token_hash, expires_at')
    .eq('collaborator_id', collaboratorId)
    .single();
  if (!session) return { valid: false };
  if (new Date(session.expires_at) < new Date()) return { valid: false };
  try {
    if (!compareSync(sessionToken, session.session_token_hash)) return { valid: false };
  } catch { return { valid: false }; }
  return { valid: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { collaborator_id, session_token, event_id } = await req.json();
    if (!collaborator_id || !event_id) {
      return new Response(JSON.stringify({ error: 'Dados ausentes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const sess = await validateSession(supabase, collaborator_id, session_token);
    if (!sess.valid) {
      return new Response(JSON.stringify({ error: 'Sessão inválida', session_expired: true }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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

    const { data: sales } = await supabase
      .from('door_sales')
      .select('id, quantity, unit_price, total_amount, payment_method, operator_id, created_at, lot_id, event_lots(name)')
      .eq('event_id', event_id)
      .order('created_at', { ascending: false });

    const list = sales || [];

    // Aggregates
    let totalTickets = 0;
    let totalRevenue = 0;
    const byLot = new Map<string, { name: string; qty: number; revenue: number }>();
    const byMethod = new Map<string, { qty: number; revenue: number; sales: number }>();
    const byOperator = new Map<string, { qty: number; revenue: number; sales: number }>();

    for (const s of list) {
      const qty = Number(s.quantity);
      const total = Number(s.total_amount);
      totalTickets += qty;
      totalRevenue += total;

      const lotName = (s as any).event_lots?.name || 'Sem lote';
      const lotKey = s.lot_id || 'unknown';
      const l = byLot.get(lotKey) || { name: lotName, qty: 0, revenue: 0 };
      l.qty += qty; l.revenue += total;
      byLot.set(lotKey, l);

      const m = byMethod.get(s.payment_method) || { qty: 0, revenue: 0, sales: 0 };
      m.qty += qty; m.revenue += total; m.sales += 1;
      byMethod.set(s.payment_method, m);

      const opKey = s.operator_id || 'unknown';
      const op = byOperator.get(opKey) || { qty: 0, revenue: 0, sales: 0 };
      op.qty += qty; op.revenue += total; op.sales += 1;
      byOperator.set(opKey, op);
    }

    // Resolve operator names from collaborators
    const operatorIds = Array.from(byOperator.keys()).filter(id => id !== 'unknown');
    let operatorNames = new Map<string, string>();
    if (operatorIds.length > 0) {
      const { data: collabs } = await supabase
        .from('collaborators')
        .select('id, name')
        .in('id', operatorIds);
      (collabs || []).forEach((c: any) => operatorNames.set(c.id, c.name));
    }

    return new Response(JSON.stringify({
      totals: {
        tickets: totalTickets,
        revenue: totalRevenue,
        sales: list.length,
        ticketMedio: list.length > 0 ? totalRevenue / list.length : 0,
      },
      byLot: Array.from(byLot.entries()).map(([id, v]) => ({ lot_id: id, ...v })),
      byMethod: Array.from(byMethod.entries()).map(([method, v]) => ({ method, ...v })),
      byOperator: Array.from(byOperator.entries()).map(([id, v]) => ({
        operator_id: id,
        name: operatorNames.get(id) || 'Desconhecido',
        ...v,
      })),
      recent: list.slice(0, 20).map(s => ({
        id: s.id,
        quantity: s.quantity,
        unit_price: Number(s.unit_price),
        total_amount: Number(s.total_amount),
        payment_method: s.payment_method,
        created_at: s.created_at,
        lot_name: (s as any).event_lots?.name || '',
      })),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[door-sales-report] error', err);
    return new Response(JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
