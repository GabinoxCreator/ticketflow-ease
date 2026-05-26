## Objetivo

Fazer o pedido de cortesia da Cristiani Teixeira de Souza (R$ 2.200) entrar na receita de repasse do produtor, mantendo o restante do fluxo intacto.

## Situação atual

- Pedido `fd556601-6871-4e99-aed3-6717a38b56ee`: `sale_origin = 'courtesy'`, `total_amount = 0`, `status = 'paid'`.
- A receita do produtor (`useProducerFinance.ts` linha 120) **ignora explicitamente** pedidos com `sale_origin = 'courtesy'`, então mesmo que tivesse valor, não entraria.

## Mudança proposta (só dados, sem código)

Atualizar esse pedido específico via migração:

- `sale_origin`: `courtesy` → `manual` (passa a contar como venda manual / receita de portaria)
- `total_amount`: `0` → `2200`
- `service_fee_amount`: mantém `0` (sem taxa, vai 100% para o produtor)
- `status`: continua `paid`

Resultado:
- Receita bruta do produtor para esse evento aumenta em R$ 2.200.
- Receita líquida (repasse) também aumenta em R$ 2.200 (taxa zero).
- Os ingressos vinculados continuam válidos.
- Nada muda em código, design ou em outras telas.

## Detalhes técnicos

```sql
UPDATE public.orders
   SET sale_origin = 'manual',
       total_amount = 2200,
       service_fee_amount = 0,
       updated_at = now()
 WHERE id = 'fd556601-6871-4e99-aed3-6717a38b56ee';
```
