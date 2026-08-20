# Auditoria de pedidos PAGOS — caça a furos/testes na receita (READ-ONLY)

> **Evento:** `a8ceede6-37d8-4be4-8a60-f4539024f747` · **Supabase:** `nsrromaqysgoxqvqagdm`
> Só material para você rodar no SQL Editor. **Nenhuma query foi executada.** Nenhum cancelamento proposto.
> Todas filtram o evento acima e (salvo indicado) `status='paid'`. Colunas conforme as reais informadas.
> `event_lots.price` existe no schema (confirmado em types.ts) — usado no cat.5.

---

## 1. Email/nome sintético

**(a)**
```sql
SELECT id, created_at, customer_name, customer_email, customer_phone,
       total_amount, sale_origin
FROM orders
WHERE event_id = 'a8ceede6-37d8-4be4-8a60-f4539024f747'
  AND status = 'paid'
  AND (
        customer_email ILIKE '%@smartpos.local'
     OR customer_email ILIKE '%@test%'
     OR customer_email ILIKE '%teste%'
     OR customer_email ILIKE '%example%'
     OR customer_email ILIKE '%.local'
     OR customer_name  ILIKE '%teste%'
     OR customer_name  ILIKE '%test%'
     OR customer_name  ILIKE '%balcao%'
     OR customer_name  ILIKE '%balcão%'
     OR customer_name  ILIKE '%venda balcao%'
  )
ORDER BY created_at;
```
**(b)** Pega pedidos com e-mail/nome de teste ou rótulo de balcão. Cada linha é candidata forte a furo — confira o valor: se for irrisório ou de teste, provável descarte; nome "balcão" pode ser venda física legítima registrada com rótulo genérico, então cruze com o cat.3/cat.2.

---

## 2. Valor irrisório (< R$ 5)

**(a)**
```sql
SELECT id, created_at, customer_name, customer_email,
       total_amount, sale_origin, payment_method, manual_payment_method
FROM orders
WHERE event_id = 'a8ceede6-37d8-4be4-8a60-f4539024f747'
  AND status = 'paid'
  AND total_amount < 5
ORDER BY total_amount, created_at;
```
**(b)** Todos os pagos abaixo de R$ 5 (o teste de R$ 0,11 cai aqui), qualquer origem. Valor abaixo de qualquer preço de ingresso real = quase certamente teste. Confirme que não é algum ajuste/cortesia intencional antes de decidir.

---

## 3. POS com dado mockado (smartpos)

**(a)**
```sql
SELECT id, created_at, customer_name, customer_email, total_amount, sale_origin,
       pos_nsu, pos_authorization_code, pos_card_brand, pos_terminal_id
FROM orders
WHERE event_id = 'a8ceede6-37d8-4be4-8a60-f4539024f747'
  AND status = 'paid'
  AND sale_origin = 'smartpos'
  AND (
        pos_nsu ~ '^0+[0-9]{1,6}$'
     OR pos_authorization_code ILIKE 'AUTH%'
     OR pos_nsu ILIKE '%123456%'
     OR pos_authorization_code IS NULL
  )
ORDER BY created_at;
```
**(b)** Venda física cujo comprovante do SiTef parece de exemplo (NSU só zeros, autorização "AUTH...", `123456`, ou sem código de autorização). Julgue caso a caso pelas colunas `pos_*`: transação real traz NSU/autorização não-triviais e bandeira. `pos_authorization_code IS NULL` pode ser PIX no POS (não gera código de cartão) — não descarte só por isso; olhe `pos_card_brand`/`payment_method`.

---

## 4. Pago sem ticket

**(a)**
```sql
SELECT o.id, o.created_at, o.customer_name, o.customer_email,
       o.total_amount, o.sale_origin,
       count(t.id) AS ticket_count
FROM orders o
LEFT JOIN tickets t ON t.order_id = o.id
WHERE o.event_id = 'a8ceede6-37d8-4be4-8a60-f4539024f747'
  AND o.status = 'paid'
GROUP BY o.id, o.created_at, o.customer_name, o.customer_email, o.total_amount, o.sale_origin
HAVING count(t.id) = 0
ORDER BY o.total_amount DESC;
```
**(b)** Pedido pago que não emitiu nenhum ingresso — furo grave (dinheiro sem entrega, ou pedido de teste que nunca gerou ticket). Qualquer linha com `total_amount > 0` merece investigação; com `total_amount` irrisório reforça o cat.2.

---

## 5. Contagem de ticket × valor (outliers)

**(a)**
```sql
SELECT o.id, o.created_at, o.customer_name, o.customer_email,
       o.total_amount, o.sale_origin,
       count(t.id)                                   AS ticket_count,
       o.total_amount - o.service_fee_amount         AS ingresso_sem_taxa,
       o.discount_amount,
       string_agg(DISTINCT l.name, ', ')             AS lotes,
       string_agg(DISTINCT l.price::text, ', ')      AS precos_lote,
       CASE
         WHEN count(t.id) = 0 THEN 'sem_ticket'
         WHEN o.total_amount >= 100 AND count(t.id) <= 1 THEN 'valor_alto_poucos_tickets'
         WHEN o.total_amount < 20 AND count(t.id) >= 3 THEN 'muitos_tickets_valor_baixo'
         ELSE 'ok'
       END AS flag
FROM orders o
LEFT JOIN tickets t   ON t.order_id = o.id
LEFT JOIN event_lots l ON l.id = t.lot_id
WHERE o.event_id = 'a8ceede6-37d8-4be4-8a60-f4539024f747'
  AND o.status = 'paid'
GROUP BY o.id, o.created_at, o.customer_name, o.customer_email,
         o.total_amount, o.service_fee_amount, o.discount_amount, o.sale_origin
HAVING CASE
         WHEN count(t.id) = 0 THEN 'sem_ticket'
         WHEN o.total_amount >= 100 AND count(t.id) <= 1 THEN 'valor_alto_poucos_tickets'
         WHEN o.total_amount < 20 AND count(t.id) >= 3 THEN 'muitos_tickets_valor_baixo'
         ELSE 'ok'
       END <> 'ok'
ORDER BY o.total_amount DESC;
```
**(b)** Levanta pedidos onde a relação valor↔quantidade destoa: valor alto com 0–1 ticket, ou 3+ tickets somando quase nada. `precos_lote` ajuda a bater a conta na mão. Os limiares (100 / 20) são arbitrários — ajuste se seu ticket médio for diferente. Combo/ingresso de grupo (1 pedido = muitos tickets) e meia-entrada podem cair aqui como falso-positivo (ver nota final).

---

## 6. Identificação faltando (CPF+telefone+user nulos)

**(a)**
```sql
SELECT id, created_at, customer_name, customer_email,
       total_amount, sale_origin, manual_payment_method, manual_sold_by,
       (sale_origin = 'courtesy') AS eh_cortesia
FROM orders
WHERE event_id = 'a8ceede6-37d8-4be4-8a60-f4539024f747'
  AND status = 'paid'
  AND customer_cpf   IS NULL
  AND customer_phone IS NULL
  AND user_id        IS NULL
ORDER BY eh_cortesia, created_at;
```
**(b)** Pagos sem nenhum identificador. A coluna `eh_cortesia` separa o que é cortesia (esperado ter isso — **não é furo**) do resto. Foque nas linhas com `eh_cortesia = false`: pedido pago anônimo pode ser venda de teste/física sem cadastro — cruze com cat.1/cat.3.

---

## 7. Duplicata suspeita (mesmo email + mesmo valor em < 120s)

**(a)**
```sql
WITH base AS (
  SELECT id, created_at, customer_name, customer_email, total_amount, sale_origin,
         lag(created_at) OVER (
           PARTITION BY customer_email, total_amount ORDER BY created_at
         ) AS prev_created_at,
         lag(id) OVER (
           PARTITION BY customer_email, total_amount ORDER BY created_at
         ) AS prev_order_id
  FROM orders
  WHERE event_id = 'a8ceede6-37d8-4be4-8a60-f4539024f747'
    AND status = 'paid'
)
SELECT id, created_at, customer_name, customer_email, total_amount, sale_origin,
       prev_order_id,
       EXTRACT(EPOCH FROM (created_at - prev_created_at)) AS segundos_do_anterior
FROM base
WHERE prev_created_at IS NOT NULL
  AND created_at - prev_created_at < interval '120 seconds'
ORDER BY customer_email, created_at;
```
**(b)** Cada linha é o pedido "de trás" de um par mesmo-email+mesmo-valor criado a menos de 120s do anterior (`prev_order_id` = o par). Dedo-duro de clique duplo/reprocessamento. Cuidado: comprador que legitimamente faz 2 compras iguais em sequência existe — confirme se ambos têm tickets/pagamento reais antes de tratar como duplicata.

---

## 8. Drift de estoque por lote

**(a)**
```sql
SELECT l.id AS lot_id, l.name,
       l.total_quantity,
       l.sold_quantity                                              AS sold_declarado,
       count(t.id) FILTER (WHERE t.status = 'valid')                AS valid_real,
       l.sold_quantity - count(t.id) FILTER (WHERE t.status = 'valid') AS drift_sold,
       l.reserved_quantity                                          AS reserved_declarado,
       count(t.id) FILTER (WHERE t.status = 'pending')              AS pending_real,
       l.reserved_quantity - count(t.id) FILTER (WHERE t.status = 'pending') AS drift_reserved
FROM event_lots l
LEFT JOIN tickets t ON t.lot_id = l.id
                   AND t.event_id = l.event_id
WHERE l.event_id = 'a8ceede6-37d8-4be4-8a60-f4539024f747'
GROUP BY l.id, l.name, l.total_quantity, l.sold_quantity, l.reserved_quantity
HAVING l.sold_quantity     <> count(t.id) FILTER (WHERE t.status = 'valid')
    OR l.reserved_quantity <> count(t.id) FILTER (WHERE t.status = 'pending')
ORDER BY abs(l.sold_quantity - count(t.id) FILTER (WHERE t.status = 'valid')) DESC;
```
**(b)** Lotes onde o contador do `event_lots` não bate com a contagem real de tickets: `drift_sold` = quantos `sold_quantity` a mais/menos que tickets `valid`; `drift_reserved` idem para `pending`. Positivo = contador inflado (venda cancelada que não devolveu, ou o furo que você procura). **Este é o check para ver se os 2 cancelamentos de hoje (Evelyn / balcão) bateram certo** — se aqueles lotes aparecerem com `drift_sold > 0`, o contador ficou torto. Nota: cancelamento seta ticket para `cancelled` (não conta em nenhum filtro), então após um cancelamento correto o `sold_quantity` deve ter sido decrementado e o drift ficar 0.

---

## Nota final — falso-positivos legítimos (não saia cancelando)

- **Cat. 6 (identificação faltando):** cortesia (`sale_origin='courtesy'`) sempre vem sem CPF/telefone/user — **normal**, já isolada na coluna `eh_cortesia`. Venda física/manual antiga também pode não ter coletado CPF.
- **Cat. 5 (ticket × valor):** ingresso de **grupo/combo** (1 pedido gera vários tickets) aparece como "muitos tickets"; **meia-entrada / cortesia dentro de pedido pago** e pedidos com **cupom de desconto grande** (`discount_amount` alto) puxam o valor pra baixo sem ser furo — por isso a query já traz `discount_amount` e `precos_lote` pra você conferir.
- **Cat. 3 (POS):** `pos_authorization_code IS NULL` é esperado em **PIX no POS** (não há autorização de cartão) — não trate como mock sozinho; olhe `payment_method`/`pos_card_brand`.
- **Cat. 7 (duplicata):** duas compras iguais em sequência do mesmo comprador podem ser reais (ex.: comprou, gostou, comprou de novo). Só é furo se um dos dois não tem entrega/pagamento efetivo.
- **Cat. 1 (nome balcão):** "balcão" pode ser rótulo de venda física legítima, não necessariamente teste — cruze com o valor e com os dados de POS.
- **Cat. 8 (drift):** um `drift_reserved` pequeno pode ser reflexo de pedidos `pending` ainda dentro da janela de 30min (venda em andamento) — reavalie minutos depois antes de concluir que o contador está torto.

> Regra de ouro: nenhuma categoria isolada prova furo. Cruze pelo menos duas (ex.: valor irrisório **e** email de teste, ou pago-sem-ticket **e** POS mockado) antes de decidir cancelar.
