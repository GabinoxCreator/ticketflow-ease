import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[REQUEST-PAYOUT] ${step}${d}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claimsData?.claims?.sub) return json({ error: 'Unauthorized' }, 401);
    const userId: string = claimsData.claims.sub;

    const body = await req.json().catch(() => ({}));
    const eventId = body?.event_id;
    if (!eventId || typeof eventId !== 'string') {
      return json({ ok: false, error: 'missing_event_id' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    log('calling request_payout', { eventId, userId });
    const { data, error } = await admin.rpc('request_payout', {
      p_event_id: eventId,
      p_user_id: userId,
    });

    if (error) {
      log('rpc_error', error);
      return json({ ok: false, error: 'rpc_error', detail: error.message }, 500);
    }

    const ok = (data as any)?.ok === true;
    return json(data, ok ? 200 : 400);
  } catch (e) {
    log('exception', String(e));
    return json({ ok: false, error: 'internal_error' }, 500);
  }
});
