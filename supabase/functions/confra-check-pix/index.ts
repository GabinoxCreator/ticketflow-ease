import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { applyOrderApproved } from "../_shared/applyOrderApproved.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CONFRA-CHECK-PIX] ${step}${d}`);
};

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const marcelBase = Deno.env.get('MARCEL_PIX_BASE');
    if (!marcelBase) throw new Error('MARCEL_PIX_BASE is not set');

    // Auth: cliente logado (mesmo padrão da confra-create-pix)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) return json({ error: 'Unauthorized' }, 401);

    const { orderId } = await req.json() as { orderId: string };
    if (!orderId) return json({ error: 'invalid_request' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Pega o pedido + o transactionId do Marcel
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, status, provider_transaction_id')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr || !order) return json({ error: 'order_not_found' }, 404);

    // Já pago: responde pago (idempotente, não chama o Marcel de novo)
    if (order.status === 'paid') {
      return json({ paid: true, status: 'paid' });
    }

    if (!order.provider_transaction_id) {
      return json({ error: 'no_transaction' }, 422);
    }

    // Pergunta pro Marcel se pagou
    const resp = await fetch(`${marcelBase}/checkpix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: Number(order.provider_transaction_id) }),
    });

    if (!resp.ok) {
      logStep('checkpix http error', { httpStatus: resp.status });
      return json({ paid: false, status: order.status });
    }

    const data = await resp.json();
    const isPaid = data?.aprovado === true || data?.status === 3;

    if (!isPaid) {
      return json({ paid: false, status: order.status });
    }

    // Pago — marca pago + emite tickets (reusa a função existente, idempotente)
    logStep('payment confirmed, applying', { orderId });
    await applyOrderApproved(admin, {
      orderId: order.id,
      mpPaymentId: String(order.provider_transaction_id),
      source: 'confra-check-pix',
    });

    return json({ paid: true, status: 'paid' });
  } catch (err: any) {
    logStep('ERROR', { message: err?.message });
    return json({ error: err?.message }, 500);
  }
});
