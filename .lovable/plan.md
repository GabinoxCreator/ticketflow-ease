
# Corrigir status de pedidos por cartão

## Problema

Há uma inconsistência de status entre as edge functions:

- **`process-card-payment`** (linha 194): quando o pagamento por cartão é aprovado, define o status do pedido como `'completed'`
- **`check-mercadopago-payment`** (linhas 95, 117): quando o PIX é aprovado, define como `'paid'`
- **Frontend** (`useEventOrders.ts`): filtra pedidos por `'paid'`, `'pending'`, `'cancelled'`, `'refunded'`

Resultado: pedidos aprovados por cartão ficam com status `'completed'`, que não é reconhecido pelo frontend como "pago" — aparecem como "pendente" por exclusão.

## Correção

### 1. `supabase/functions/process-card-payment/index.ts` (linha 194)
- Alterar `status: 'completed'` para `status: 'paid'` — padronizando com o restante do sistema

### 2. `src/hooks/useEventOrders.ts` (linhas 13, 60)
- Adicionar `'completed'` como status válido na interface e nos filtros de `paidOrders`, para compatibilidade com pedidos já existentes no banco com esse status

### 3. Correção de dados existentes (migração SQL)
- Atualizar pedidos com status `'completed'` para `'paid'`:
```sql
UPDATE orders SET status = 'paid' WHERE status = 'completed';
```
