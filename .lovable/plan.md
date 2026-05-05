# Bloco 1 — Revisado com seus 3 ajustes

Tudo do plano anterior fica igual. Mudanças apenas nos 3 pontos pedidos.

---

## Ajuste 1 — `confirm_lot_sale` valida reserva real

Sem `GREATEST`. Confirmação só passa se `reserved_quantity >= _qty`. Versão final:

```sql
CREATE OR REPLACE FUNCTION public.confirm_lot_sale(_lot_id uuid, _qty integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ok int;
BEGIN
  IF _qty <= 0 THEN RETURN false; END IF;

  UPDATE public.event_lots
     SET reserved_quantity = reserved_quantity - _qty,
         sold_quantity     = sold_quantity + _qty
   WHERE id = _lot_id
     AND reserved_quantity >= _qty;   -- guarda atômica

  GET DIAGNOSTICS _ok = ROW_COUNT;
  RETURN _ok = 1;
END $$;
```

Comportamento:
- Se a reserva não cobre `_qty` (ex: foi liberada por engano, race com cleanup, dupla confirmação), o UPDATE não toca a row e retorna `false`.
- Edge function trata `false` como erro grave: loga o evento, **não** altera order/tickets, e retorna erro para o caller. Isso evita venda fantasma sem reserva.
- Caso prático onde isso protege: webhook + polling chegando ao mesmo tempo. Quem chegar primeiro consome a reserva; o segundo recebe `false` e simplesmente não faz nada (idempotente via `eq('status','pending')` na order).

`release_lot_quantity` mantém `GREATEST(0, ...)` porque libera reserva sempre é seguro (clamp evita ir negativo se alguém liberar 2x).

---

## Ajuste 2 — Mapa atual: `sold_quantity` vs tickets `valid` vs orders `paid`

Levantado por `rg`. Resumo do que cada dashboard usa hoje:

| Tela / Hook | Métrica de "vendido" | Fonte |
|---|---|---|
| `useProducerStats.ts` (dashboard global do produtor) | receita | `orders` status `paid`/`completed` |
| `useProducerStats.ts` | ingressos vendidos | `tickets` status `valid`/`used` |
| `useProducerFinance.ts` (financeiro) | repasses/receita | `orders` status `paid`/`completed` |
| `useEventStats.ts` (dashboard do evento) | vendidos / receita | `tickets` status `valid`/`used` |
| `useEventOrders.ts` → EventOrdersTab | pedidos | `orders` agrupado por status |
| `useEventParticipants.ts` → EventParticipantsTab | participantes | `tickets` status `valid`/`used`/`cancelled` |
| `EventCheckinTab.tsx` | check-ins | `tickets` status `used` |
| `EventListItem.tsx` (listagem produtor) | "X vendidos" e receita estimada | **`event_lots.sold_quantity`** |
| `LotManager.tsx` (gestão de lotes) | barra "X / Y vendidos" | **`event_lots.sold_quantity`** |
| `LotSummaryCard.tsx` | resumo de lotes | **`event_lots.sold_quantity`** |
| `EventDetails.tsx` (página pública) | "disponível" | `total - sold_quantity` |
| `Index.tsx` (homepage / cards) | "disponível" / progresso | `total - sold_quantity` |
| `useEventLots.ts` | totais agregados | `sold_quantity` |
| `TestePagamento.tsx` | disponibilidade | `total - sold_quantity` |

### Coerência após o Bloco 1

Como nada vai mais incrementar `sold_quantity` antes do pagamento, a relação fica:

- **Dashboards de receita/participantes** (orders `paid` e tickets `valid`) — passam a refletir **só vendas reais**. **Vão ficar mais baixos do que estão hoje** (porque hoje contam abandono também via tickets pending? Não — eles já filtram `valid`/`paid`, então não muda nada para essa categoria; melhora a precisão).
- **`sold_quantity` em si** — vai bater **exatamente** com `count(tickets where status in ('valid','used'))` + `door_sales` (porque `confirm_lot_sale` é a única porta de entrada além do trigger de portaria).
- **"Disponível" público** — passa a usar `total - sold - reserved`, então o produto mostra menos disponibilidade durante checkouts ativos. **Esse é o efeito desejado**, evita oversell visual.

### Onde precisa ajustar a fórmula de "disponível" no frontend

Adicionar `reserved_quantity` na interface e subtrair em:
- `src/hooks/useEventLots.ts` (campo + `availableQuantity`)
- `src/hooks/useEvents.ts` (select inclui `reserved_quantity`)
- `src/pages/EventDetails.tsx` linha 543
- `src/pages/Index.tsx` linhas 25, 51
- `src/pages/TestePagamento.tsx` linha 239
- `src/components/checkout/CheckoutStepPayment.tsx` (se mostrar restante)

### Onde NÃO mudar

- `EventListItem.tsx`, `LotManager.tsx`, `LotSummaryCard.tsx`: continuam mostrando `sold_quantity` puro porque representam "vendido confirmado". Isso é o que o produtor quer ver.
- Hooks de stats/finance: já usam `paid`/`valid`, não tocam `sold_quantity`. Ficam intactos.

Resultado: produtor vê os mesmos números (ou mais coerentes), público vê disponibilidade mais conservadora, e nunca acontece "vendido pulou enquanto cliente abandonou".

---

## Ajuste 3 — Cartão rejeitado: preservar order como `failed`

**Decisão**: vou preservar a order com status novo `failed` (não deletar). Mantém rastreabilidade sem quebrar nada.

### Como vai ficar

1. **Tickets**: continuam sendo deletados em rejeição. Motivo: tickets pending órfãos confundem cliente em "Meus Ingressos" e o RLS atual permite o cliente vê-los. Não tem valor de auditoria — a order já guarda tudo (cliente, valor, MP id).
2. **Order**: passa de `pending` → `failed`. Fica registrada com `payment_method = card:<mpId>` para você conseguir cruzar com MP depois (chargeback, suporte ao cliente, antifraude).
3. **Reserva**: `release_lot_quantity` é chamado para devolver estoque imediatamente.
4. **expires_at**: setado para `now()` (já expirou — não vira candidato a recuperação no Bloco 3).

### Migration extra (aditiva)

```sql
-- O CHECK na coluna status hoje aceita: pending, paid, completed, cancelled, refunded
-- Não há CHECK explícito hoje (só o tipo text). Apenas documentamos via comment.
COMMENT ON COLUMN public.orders.status IS
  'pending | paid | completed | cancelled | refunded | failed';
```

(Não há constraint a alterar — `status` é `text` livre. Se quiser eu posso adicionar um CHECK constraint NOT VALID, me avisa.)

### Frontend impactado

- `useEventOrders.ts`: adicionar `'failed'` no union type. Adicionar grupo `failedOrders` (ou agrupar com `cancelledOrders` na UI). Sem mudar visual.
- `OrderListItem.tsx`: adicionar badge "Falhou" para `failed` (cinza). Não aparece botão de reenvio de e-mail (que só existe em `paid`).
- `useUserTickets.ts`: já filtra só `valid`/`used`, então cliente não vê nada mudando. Bom.

### Impacto

- **Positivo**: produtor consegue analisar taxa de rejeição de cartão sem rodar query manual no banco; suporte consegue achar a tentativa do cliente; auditoria fica completa.
- **Negativo**: tabela `orders` cresce ~10-30% mais rápido (depende da taxa de rejeição). Aceitável — orders é tabela leve.
- **Risco zero** de quebrar fluxo: nenhum lugar do código depende de "order foi deletada após rejeição" (validei no rg acima).

---

## O que fica idêntico ao plano original

- Migration: coluna `reserved_quantity`, `expires_at`, índice, constraint nonneg.
- RPCs `reserve_lot_quantity` e `release_lot_quantity` (mesmo conteúdo).
- Edge functions afetadas: `create-mercadopago-pix`, `process-card-payment`, `check-mercadopago-payment`.
- Estratégia PIX 30min / Cartão 20min de `expires_at`.
- Plano de rollback (mais 1 linha: limpar comentário do status).
- Checklist de validação.
- Riscos para Blocos 2/3/4.

---

Confirma esses 3 ajustes que eu já implemento o Bloco 1 inteiro nessa versão.