# Fase 2 — Motor de solicitação de saque

Duas peças, apenas. Sem frontend, sem RLS, sem storage, sem admin.

## Peça 1 — Função SQL `public.request_payout(p_event_id uuid, p_user_id uuid)`

`SECURITY DEFINER`, `SET search_path = public`. Retorna `jsonb`. Toda lógica numa transação.

```sql
CREATE OR REPLACE FUNCTION public.request_payout(p_event_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event           RECORD;
  _net_revenue     numeric;
  _already_paid    numeric;
  _already_req     numeric;
  _available       numeric;
  _bank            jsonb;
  _payout_id       uuid;
BEGIN
  -- 1. evento
  SELECT id, producer_id, producer_profile_id
    INTO _event
    FROM public.events
   WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_found');
  END IF;

  -- 2. ownership
  IF _event.producer_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_event_owner');
  END IF;

  -- 3. receita líquida (mesmo filtro do useProducerFinance)
  SELECT GREATEST(0,
           COALESCE(SUM(total_amount), 0) - COALESCE(SUM(service_fee_amount), 0))
    INTO _net_revenue
    FROM public.orders
   WHERE event_id = p_event_id
     AND status IN ('paid', 'completed')
     AND sale_origin <> 'courtesy';

  -- 4. já pago
  SELECT COALESCE(SUM(net_amount), 0)
    INTO _already_paid
    FROM public.payouts
   WHERE event_id = p_event_id
     AND status = 'paid';

  -- 5. já solicitado
  SELECT COALESCE(SUM(net_amount), 0)
    INTO _already_req
    FROM public.payouts
   WHERE event_id = p_event_id
     AND status = 'requested';

  -- 6. disponível
  _available := _net_revenue - _already_paid - _already_req;
  IF _available <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_available_balance');
  END IF;

  -- 7. conta bancária do produtor
  SELECT to_jsonb(b.*)
    INTO _bank
    FROM public.producer_bank_accounts b
   WHERE b.user_id = p_user_id
   LIMIT 1;
  IF _bank IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_bank_account');
  END IF;

  -- 8. insert (status gravado explicitamente)
  INSERT INTO public.payouts (
    producer_profile_id, event_id,
    gross_amount, platform_fee, net_amount,
    status, period_start, period_end,
    bank_account_snapshot
  ) VALUES (
    _event.producer_profile_id, p_event_id,
    _available, 0, _available,
    'requested', now(), now(),
    _bank
  )
  RETURNING id INTO _payout_id;

  -- 9. ok
  RETURN jsonb_build_object('ok', true, 'payout_id', _payout_id, 'amount', _available);

EXCEPTION
  WHEN unique_violation THEN
    -- trava do índice uniq_payout_requested_per_event
    RETURN jsonb_build_object('ok', false, 'error', 'already_requested');
END;
$$;

REVOKE ALL ON FUNCTION public.request_payout(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_payout(uuid, uuid) TO service_role;
```

Notas:
- Usa `p_user_id` em vez de `auth.uid()` (vai ser chamada com service role pela Edge Function).
- `unique_violation` cobre o índice parcial `uniq_payout_requested_per_event` da Fase 1.
- Nada é alterado em outras tabelas. Sem trigger. Sem RLS nova.
- `EXECUTE` só para `service_role`; o produtor nunca chama essa função diretamente do cliente.

## Peça 2 — Edge Function `supabase/functions/request-payout/index.ts`

Mesmo padrão de `process-card-payment`: client anon só para `getClaims`, client service-role para o RPC.

```ts
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
    // Auth
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

    // Body
    const body = await req.json().catch(() => ({}));
    const eventId = body?.event_id;
    if (!eventId || typeof eventId !== 'string') {
      return json({ ok: false, error: 'missing_event_id' }, 400);
    }

    // Service-role client
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

    const ok = data?.ok === true;
    return json(data, ok ? 200 : 400);
  } catch (e) {
    log('exception', String(e));
    return json({ ok: false, error: 'internal_error' }, 500);
  }
});
```

Sem PIN, sem rate limit, sem alteração de `config.toml` (verify_jwt já é false por default no Lovable).

## O que NÃO entra nesta fase

- Frontend (botão "Solicitar saque" fica para a próxima).
- Policies RLS de `payouts` (já existem 5; não toco).
- Storage / comprovante.
- Tela do admin para aprovar/recusar.
- Nenhuma alteração em outras tabelas.

## Resumo do que aplicar (após aprovação)

1. Migration com `CREATE OR REPLACE FUNCTION public.request_payout(...)` + grants.
2. Criar `supabase/functions/request-payout/index.ts` (deploy automático).
