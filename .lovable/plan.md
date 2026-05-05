# Bloco 2 — Webhook Mercado Pago (revisado com seus 6 ajustes)

## Mudanças vs versão anterior

### Ajuste 1 — Resolução de order sem depender de fallback textual

Adicionar coluna nova em `orders`:
```sql
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS mp_payment_id text;

CREATE INDEX IF NOT EXISTS orders_mp_payment_id_idx
  ON public.orders (mp_payment_id);
```

Edge functions de checkout (`process-card-payment`, `create-mercadopago-pix`) passam a gravar `mp_payment_id` diretamente após criar o pagamento no MP (em paralelo ao já existente `payment_method = 'pix:<id>'` / `'card:<id>'`, que mantemos por compatibilidade com dados antigos).

Ordem de busca no webhook:
1. `external_reference` (do payload MP) → `orders.id`. **Caminho principal**.
2. Se ausente: `orders.mp_payment_id = <paymentId>`.
3. Último recurso (dados legados, < hoje): `payment_method ilike '%<paymentId>%'`.

### Ajuste 2 — Side effects estritamente guardados por transição

Padrão obrigatório em todos os ramos (approved, rejected, refunded):

```ts
const { data: changed, error } = await supabase
  .from('orders')
  .update({ status: NEW_STATUS, ...extras })
  .eq('id', orderId)
  .eq('status', EXPECTED_PREVIOUS_STATUS)  // guarda explícita
  .select('id, coupon_id')
  .maybeSingle();

if (error) throw error;          // erro real → 500 (ver Ajuste 6)
if (!changed) {
  log('idempotent no-op', { orderId, status: NEW_STATUS });
  return ok();                   // 0 linhas → 200 idempotente
}

// somente AQUI executar confirm_lot_sale / tickets / cupom / release
```

A função `confirm_lot_sale` já tem guarda atômica (Bloco 1). Mas a chamada só acontece se a transição de order foi efetiva.

### Ajuste 3 — Assinatura obrigatória em produção

```ts
const secret = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET');
const allowUnsigned = Deno.env.get('MP_WEBHOOK_ALLOW_UNSIGNED') === 'true';

if (!secret) {
  // produção sem secret = configuração quebrada → bloqueia
  if (!allowUnsigned) return new Response('signature required', { status: 401 });
}

const sig = req.headers.get('x-signature');
const reqId = req.headers.get('x-request-id');
const dataId = url.searchParams.get('data.id') ?? body?.data?.id;

if (secret) {
  const valid = verifyMpSignature({ sig, reqId, dataId, secret });
  if (!valid) {
    log('invalid signature', { reqId, dataId });
    return new Response('invalid signature', { status: 401 });
  }
}
```

`MP_WEBHOOK_ALLOW_UNSIGNED` só serve para o botão "Simular" do MP no setup inicial. Documento isso no checklist.

### Ajuste 4 — Tabela de idempotência real

Migration:
```sql
CREATE TABLE IF NOT EXISTS public.mp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_payment_id text NOT NULL,
  mp_status text NOT NULL,
  request_id text,
  order_id uuid,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL  -- 'applied' | 'noop' | 'ignored' | 'order_not_found'
);

-- chave de dedupe: mesmo payment + mesmo status processado uma vez só
CREATE UNIQUE INDEX IF NOT EXISTS mp_webhook_events_dedupe_idx
  ON public.mp_webhook_events (mp_payment_id, mp_status);

CREATE INDEX IF NOT EXISTS mp_webhook_events_order_idx
  ON public.mp_webhook_events (order_id);

ALTER TABLE public.mp_webhook_events ENABLE ROW LEVEL SECURITY;

-- só admin enxerga; service role (edge function) bypassa RLS
CREATE POLICY "Admins can view mp_webhook_events"
  ON public.mp_webhook_events FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));
```

Fluxo no webhook:
1. Após buscar payment no MP, tentar `INSERT INTO mp_webhook_events (mp_payment_id, mp_status, ...)`.
2. Se violar UNIQUE (`23505`) → já processamos → log + responde 200 sem aplicar nada.
3. Se inseriu → segue para aplicar transição. Update do `outcome` no fim.

### Ajuste 5 — Refund/chargeback com log estruturado

```ts
case 'refunded':
case 'charged_back':
  const { data: changed } = await supabase
    .from('orders')
    .update({
      status: status === 'refunded' ? 'refunded' : 'charged_back',
      // mantém expires_at = null (já era paid)
    })
    .eq('id', orderId)
    .eq('status', 'paid')
    .select('id, total_amount, customer_email, event_id')
    .maybeSingle();

  if (changed) {
    console.log('[MP-WEBHOOK]', JSON.stringify({
      event: status,
      order_id: changed.id,
      event_id: changed.event_id,
      customer_email: changed.customer_email,
      amount: changed.total_amount,
      mp_payment_id: paymentId,
      action_required: 'manual_inventory_review',
    }));
    // estoque NÃO é devolvido — produtor decide manualmente
  }
  break;
```

Adiciono `'charged_back'` ao comentário de status documentado no Bloco 1.

### Ajuste 6 — Códigos HTTP conscientes

| Situação | HTTP | Motivo |
|---|---|---|
| Tipo ignorado (`merchant_order`, etc.) | 200 | MP não precisa reenviar |
| Assinatura inválida | 401 | Sinaliza problema real, não loop |
| Secret ausente em prod | 401 | Idem |
| Dedupe (já processado) | 200 | Idempotente |
| Order não encontrada (race com INSERT) | 200 | MP reenvia naturalmente; logamos `order_not_found` no `mp_webhook_events` |
| Transição idempotente (0 rows) | 200 | Esperado |
| Erro do MP API (timeout, 5xx) | 502 | MP reenvia |
| Erro interno (DB down, exception não tratada) | 500 | MP reenvia; alarme do nosso lado |
| Sucesso | 200 | Padrão |

Removida a regra anterior "sempre 200". Mantida a postura defensiva apenas onde faz sentido (no-op, dedupe, ignored).

---

## O que continua igual ao plano original

- Path: `supabase/functions/mercadopago-webhook/index.ts`
- `verify_jwt = false` em `supabase/config.toml`
- Polling do `CheckoutStepPix` segue ativo como fallback redundante
- Secret novo `MERCADOPAGO_WEBHOOK_SECRET` solicitado via `add_secret`
- Aceita `?type=payment&data.id=...` (query) e body JSON
- URL pública: `https://nsrromaqysgoxqvqagdm.supabase.co/functions/v1/mercadopago-webhook`

## Arquivos que serão alterados

- **Criar**: `supabase/functions/mercadopago-webhook/index.ts`
- **Editar**: `supabase/config.toml` (bloco da nova função)
- **Editar**: `supabase/functions/create-mercadopago-pix/index.ts` (gravar `mp_payment_id`)
- **Editar**: `supabase/functions/process-card-payment/index.ts` (gravar `mp_payment_id`)
- **Migration**: `orders.mp_payment_id` + índice; tabela `mp_webhook_events` + RLS

## Ordem de execução

1. Pedir o secret `MERCADOPAGO_WEBHOOK_SECRET` (você copia do painel MP).
2. Migration (aditiva, sem risco).
3. Atualizar as 2 edge functions de checkout para gravar `mp_payment_id`.
4. Criar `mercadopago-webhook`.
5. Atualizar `config.toml`.
6. Te passar o checklist manual (configurar URL no painel MP, simular, testar fechando aba).

## Checklist manual de validação

1. Configurar URL e copiar Secret no painel MP → adicionar no Lovable.
2. Botão "Simular" do MP → log `[MP-WEBHOOK] signature ok` e linha em `mp_webhook_events` com `outcome='order_not_found'` ou similar.
3. PIX teste, fechar aba antes de pagar, pagar pelo banco → após ~1min: order=`paid`, tickets=`valid`, `sold_quantity` subiu, `reserved_quantity` voltou. Webhook insere row com `outcome='applied'`.
4. Reenviar mesmo webhook (botão MP) → row dedupe ignorada (UNIQUE), order intacta.
5. Cartão recusado → order=`failed`, reserva liberada, tickets deletados.
6. Desligar webhook → polling ainda funciona.

## Riscos remanescentes (vão para Bloco 3)

- Pedidos `pending` que nunca recebem nem polling nem webhook (cliente nunca pagou e nunca voltou). → cron de expiração.
- 25 pedidos órfãos atuais. → script de reconciliação batch.

---

**Confirma para implementar?** Vou pedir o `MERCADOPAGO_WEBHOOK_SECRET` logo no início (você gera no painel do Mercado Pago → Suas integrações → app FestPag → Webhooks → Configurar).
