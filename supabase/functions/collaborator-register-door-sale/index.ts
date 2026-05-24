import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { compareSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_METHODS = new Set(['pix', 'dinheiro', 'cartao_debito', 'cartao_credito']);

async function validateSession(supabase: any, collaboratorId: string, sessionToken: string) {
  if (!sessionToken) return { valid: false, error: 'Token de sessão não fornecido' };
  const { data: session } = await supabase
    .from('collaborator_sessions')
    .select('session_token_hash, expires_at')
    .eq('collaborator_id', collaboratorId)
    .single();
  if (!session) return { valid: false, error: 'Sessão não encontrada. Faça login novamente.' };
  if (new Date(session.expires_at) < new Date()) return { valid: false, error: 'Sessão expirada.' };
  try {
    if (!compareSync(sessionToken, session.session_token_hash)) {
      return { valid: false, error: 'Token de sessão inválido.' };
    }
  } catch {
    return { valid: false, error: 'Erro ao verificar sessão' };
  }
  return { valid: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { collaborator_id, session_token, event_id, lot_id, quantity, payment_method, notes } = body;

    if (!collaborator_id || !event_id || !lot_id || !payment_method) {
      return new Response(JSON.stringify({ error: 'Dados obrigatórios ausentes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const qty = parseInt(String(quantity), 10);
    if (!qty || qty < 1 || qty > 50) {
      return new Response(JSON.stringify({ error: 'Quantidade inválida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!ALLOWED_METHODS.has(payment_method)) {
      return new Response(JSON.stringify({ error: 'Meio de pagamento inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const sess = await validateSession(supabase, collaborator_id, session_token);
    if (!sess.valid) {
      return new Response(JSON.stringify({ error: sess.error, session_expired: true }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: access } = await supabase
      .from('collaborator_events')
      .select('id')
      .eq('collaborator_id', collaborator_id)
      .eq('event_id', event_id)
      .maybeSingle();
    if (!access) {
      return new Response(JSON.stringify({ error: 'Colaborador não tem acesso a este evento' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: lot } = await supabase
      .from('event_lots')
      .select('id, event_id, price, total_quantity, sold_quantity, reserved_quantity, is_active, name')
      .eq('id', lot_id)
      .maybeSingle();
    if (!lot || lot.event_id !== event_id) {
      return new Response(JSON.stringify({ error: 'Lote não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!lot.is_active) {
      return new Response(JSON.stringify({ error: 'Lote inativo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const available = lot.total_quantity - lot.sold_quantity - lot.reserved_quantity;
    if (available < qty) {
      return new Response(JSON.stringify({ error: `Apenas ${available} ingresso(s) disponível(is)` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const unit_price = Number(lot.price);
    const total_amount = +(unit_price * qty).toFixed(2);

    const { data: sale, error } = await supabase
      .from('door_sales')
      .insert({
        event_id,
        lot_id,
        quantity: qty,
        unit_price,
        total_amount,
        payment_method,
        notes: notes || null,
        operator_id: collaborator_id,
      })
      .select('*, lot:event_lots(name)')
      .single();

    if (error) {
      console.error('[door-sale] insert error', error);
      return new Response(JSON.stringify({ error: 'Falha ao registrar venda' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, sale }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[door-sale] error', err);
    return new Response(JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
