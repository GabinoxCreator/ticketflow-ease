
# Corrigir: Ingressos Pendentes Contados como Vendidos

## Problema Raiz

Os tickets são criados com `status: 'valid'` nas edge functions de PIX e preferência, **antes** da confirmação do pagamento. O constraint do banco só permite `'valid'`, `'used'`, `'cancelled'` — não existe status `'pending'` para tickets. Então o filtro no `useEventStats` que filtra por `valid || used` não resolve nada, porque todos os tickets já nascem como `valid`.

A edge function `check-mercadopago-payment` tenta atualizar tickets de `'pending'` para `'valid'`, mas como já são criados como `'valid'`, essa lógica é ineficaz.

## Solução

### 1. Migração: Adicionar status `'pending'` ao constraint de tickets

```sql
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check 
  CHECK (status IN ('pending', 'valid', 'used', 'cancelled'));
```

E corrigir os dados existentes deste evento: tickets vinculados a orders com status `'pending'` devem ter status `'pending'`:

```sql
UPDATE tickets SET status = 'pending' 
WHERE order_id IN (SELECT id FROM orders WHERE status = 'pending');
```

### 2. Edge Functions: Criar tickets como `'pending'`

**`create-mercadopago-pix/index.ts`** e **`create-mercadopago-preference/index.ts`**: Alterar `status: 'valid'` para `status: 'pending'` na criação dos tickets.

**`process-card-payment/index.ts`**: Criar tickets como `'pending'`, e após pagamento aprovado, atualizar para `'valid'`. No rollback (rejeição), já deleta — sem alteração necessária lá.

### 3. `useEventParticipants.ts`: Incluir `'pending'` na tipagem

Adicionar `'pending'` ao type do status do Ticket.

### Sem alteração necessária em:
- `useEventStats.ts` — já filtra corretamente por `valid || used`
- `check-mercadopago-payment` — já faz `UPDATE tickets SET status = 'valid' WHERE status = 'pending'`
