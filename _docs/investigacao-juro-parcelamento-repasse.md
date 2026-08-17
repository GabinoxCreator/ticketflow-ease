# Juro de parcelamento inflando o repasse ao produtor

**Data:** 30/07/2026 · **Repo:** site-festpag (`ticketflow-ease`) · **Supabase:** `nsrromaqysgoxqvqagdm`
**Status:** investigação READ-ONLY. Nada corrigido. **TODA correção é PÓS-EVENTO.**
**Evento de referência:** Confra `e86df07b-e06f-471e-abf0-a5ec94a11b93`

---

## Resumo em uma linha

O juro **não** vem do Mercado Pago — é um *gross-up* de tabela **hardcoded na edge `confra-process-card`**, somado dentro de `total_amount` **sem** ser somado em `service_fee_amount`. Como o repasse é calculado como `total_amount − service_fee_amount`, **100% do juro cai no bolso contábil do produtor** na exibição.

---

## 1) Onde vive o valor de face (e onde não vive)

**Não existe `order_items`.** Confirmado: zero ocorrências em `src/` e `supabase/`. Não há tabela de itens com preço unitário congelado.

**`tickets` não tem preço.** As colunas são `event_id, order_id, lot_id, holder_*, seat_label, status, ticket_code, event_seat_id, validated_at, abada_*` ([types.ts:1866-1884](site-festpag/src/integrations/supabase/types.ts#L1866-L1884)). Nenhuma coluna de valor.

**`event_lots.price` é a única fonte de face** ([types.ts:539](site-festpag/src/integrations/supabase/types.ts#L539)) — e é **mutável**: o produtor pode editar o preço do lote depois da venda. Não há snapshot histórico.

O que `orders` guarda de dinheiro, campo a campo ([types.ts:1206-1241](site-festpag/src/integrations/supabase/types.ts#L1206-L1241)):

| Campo | Conteúdo |
|---|---|
| `total_amount` | face − desconto + taxa **+ juro de parcelamento** |
| `service_fee_amount` | só a taxa de conveniência, calculada sobre o face **antes** do gross-up |
| `discount_amount` | desconto do cupom (já abatido de `total_amount`) |
| `manual_fee_applied` | boolean, só venda manual |

**Não existe NENHUM campo com o valor de face, nem com o juro, nem com o número de parcelas.** Sem `installments`, sem `mp_installments`, sem `installment_fee_amount`. As colunas de transação são só identificadores (`mp_payment_id`, `provider_transaction_id`, `pos_nsu`, `pos_authorization_code`, `pos_card_brand`…). **O número de parcelas escolhido pelo comprador é descartado** — só existe no request da edge e no provedor.

---

## 2) Como o juro entra em `total_amount`

Há **dois** provedores de cartão, e eles se comportam de forma **oposta**. O roteamento é por evento: [CheckoutModal.tsx:109-117](site-festpag/src/components/checkout/CheckoutModal.tsx#L109-L117) lê `events.payment_provider` e escolhe o par de edges; `'marcel'` → `confra-*`, senão → Mercado Pago ([linhas 134](site-festpag/src/components/checkout/CheckoutModal.tsx#L134), [350/367](site-festpag/src/components/checkout/CheckoutModal.tsx#L350-L367)).

### Mercado Pago (`process-card-payment`) — NÃO embute juro

[process-card-payment/index.ts:186-187](site-festpag/supabase/functions/process-card-payment/index.ts#L186-L187):

```ts
const serviceFee = Math.max(0, Math.round((totalAmount * fee.percent / 100 + fee.fixed) * 100) / 100);
const finalAmount = Math.max(0.01, totalAmount - discountAmount + serviceFee);
```

Esse `finalAmount` vai **igual** para `total_amount` ([linha 199](site-festpag/supabase/functions/process-card-payment/index.ts#L199)) e para `transaction_amount` do MP ([linha 253](site-festpag/supabase/functions/process-card-payment/index.ts#L253)), com `installments` repassado como parâmetro ([linha 256](site-festpag/supabase/functions/process-card-payment/index.ts#L256)). O juro do MP vive nos `payer_costs` — o front só **exibe** as opções vindas de `mp.getInstallments()` ([CheckoutStepCard.tsx:156-167](site-festpag/src/components/checkout/CheckoutStepCard.tsx#L156-L167)), sem alterar o valor enviado. Ou seja: nessa rota o comprador paga juro na fatura, mas `transaction_amount` (e `total_amount`) permanecem no valor base. **Sem inflação.**

### Marcel (`confra-process-card`) — EMBUTE o juro, e é aqui que está o problema

Tabela **hardcoded na própria edge** — não está no banco ([confra-process-card/index.ts:33-39](site-festpag/supabase/functions/confra-process-card/index.ts#L33-L39)):

```ts
// Custo do parcelamento embutido "por dentro" (gross-up) para cartão via Marcel.
// custo total por faixa = MDR da faixa + antecipação. Fonte: tabela de taxas do Marcel.
const PARCELAMENTO_CUSTO: Record<number, number> = {
  2: 0.0579, 3: 0.0673, 4: 0.0768, 5: 0.0862, 6: 0.0957,
  7: 0.1101, 8: 0.1196, 9: 0.1290, 10: 0.1385, 11: 0.1479, 12: 0.1574,
};
```

E o gross-up, em [confra-process-card/index.ts:260-268](site-festpag/supabase/functions/confra-process-card/index.ts#L260-L268) — **esta é a linha exata onde o juro nasce**:

```ts
const serviceFee = Math.max(0, Math.round((totalAmount * fee.percent / 100 + fee.fixed) * 100) / 100);
let finalAmount = Math.max(0.01, totalAmount - discountAmount + serviceFee);

// Parcelamento "por dentro" (gross-up) sobre o finalAmount já calculado.
// 2x–12x: repassa o custo do parcelamento ao cliente. 1x fica inalterado.
if (installments >= 2) {
  finalAmount = Math.round(finalAmount / (1 - PARCELAMENTO_CUSTO[installments]) * 100) / 100;
}
```

Gravação em [linhas 280-282](site-festpag/supabase/functions/confra-process-card/index.ts#L280-L282):

```ts
total_amount: finalAmount,        // ← COM o gross-up
service_fee_amount: serviceFee,   // ← SEM o gross-up (calculado antes, na linha 261)
```

**Duas consequências que se somam:**

1. `total_amount − service_fee_amount` = face + juro. Todo o juro fica no "valor do ingresso".
2. O gross-up é aplicado sobre `face + taxa`, então parte do juro corresponde economicamente à **taxa**, mas como `service_fee_amount` foi congelado antes do gross-up, **essa parte também cai no repasse**. A distorção é ligeiramente maior que o juro "sobre o face".

Fechando o cálculo: `total_amount = (face − desconto + taxa) / (1 − custo[n])`, logo
`juro = (face − desconto + taxa) × (1/(1 − custo[n]) − 1)`.

**Resposta direta à pergunta:** o juro é **decisão do site**, não do MP — mas não está em tabela no banco como se supunha: está **em constante no código da edge**. Mudar faixa de juro hoje exige deploy de edge (e, pelo `CLAUDE.md`, redeploy forçado — o publish do Lovable não redeploya edges).

---

## 3) Por que `producerFinance.ts` captura o juro

A linha exata é [producerFinance.ts:42-44](site-festpag/src/lib/producerFinance.ts#L42-L44):

```ts
/** Valor do ingresso do pedido, sem a taxa de conveniência (= repasse ao produtor). */
export function orderTicketNet(o: FinanceOrder): number {
  return Number(o.total_amount || 0) - Number(o.service_fee_amount || 0);
}
```

Ela só conhece dois números do pedido, e o juro está dentro de um deles e fora do outro. **Não há como essa função distinguir juro de face** — a informação necessária não está no `orders`.

Propagação (tudo herda a inflação):

- [producerFinance.ts:72](site-festpag/src/lib/producerFinance.ts#L72) — `net` por pedido alimenta `online` / `fisica` / `manual`; [linha 78](site-festpag/src/lib/producerFinance.ts#L78) `total = online + fisica + manual`, documentado como **"Repasse ao produtor = esse MESMO total"** ([linha 18](site-festpag/src/lib/producerFinance.ts#L18)).
- [producerFinance.ts:133](site-festpag/src/lib/producerFinance.ts#L133) + [138-143](site-festpag/src/lib/producerFinance.ts#L138-L143) — `computeSalesByLot` **rateia o net inflado** entre os tickets do pedido, então a **receita por lote também está superestimada**.
- [useProducerFinance.ts:129](site-festpag/src/hooks/useProducerFinance.ts#L129) — mesmo `orderTicketNet` alimenta `net` → `available = net − paidOut` ([linha 172](site-festpag/src/hooks/useProducerFinance.ts#L172)). **O "disponível para repasse" da página de repasse está inflado pelo mesmo valor.** Este é o mais grave: é o número que vira pagamento.
- [EventFinanceiroTab.tsx:192-194](site-festpag/src/components/producer/tabs/EventFinanceiroTab.tsx#L192-L194) — card "Repasse ao Produtor" exibe `stats.total`; o card "Vendas Totais" ([linha 183](site-festpag/src/components/producer/tabs/EventFinanceiroTab.tsx#L183)), o "Valor Arrecadado" e a linha "Cartão online" ([linha 230](site-festpag/src/components/producer/tabs/EventFinanceiroTab.tsx#L230), via `orderTicketNet` na [linha 116](site-festpag/src/components/producer/tabs/EventFinanceiroTab.tsx#L116)) sofrem do mesmo.

O exemplo confere com a mecânica: 23.711,16 − 63×370 = **401,16** de juro embutido em 63 vendas — coerente com um subconjunto dos pedidos em 2x–3x (as demais em 1x, sem gross-up).

---

## 4) Fonte confiável do face

**O face não está gravado em lugar nenhum.** Só dá para **derivar**: `tickets` (do pedido) × `event_lots.price`. É o mesmo caminho que a própria edge usa para *calcular* o total ([confra-process-card:209](site-festpag/supabase/functions/confra-process-card/index.ts#L209), `totalAmount += Number(lot.price) * item.quantity`), então reproduz o cálculo original — **enquanto o preço do lote não mudar**.

Três fragilidades da derivação, em ordem de risco:

1. **`event_lots.price` é mutável.** Se o produtor editar o preço de um lote, o face derivado dos pedidos antigos muda retroativamente. Não há snapshot. Esse é o motivo pelo qual a derivação é boa para *conferência* e arriscada como base permanente de repasse.
2. **Cupom.** `total_amount` já tem o desconto abatido; a soma de `event_lots.price` não. A derivação precisa subtrair `discount_amount` para comparar (a fórmula do item 2 já contempla).
3. **`tickets.lot_id` é nullable** ([types.ts:1877](site-festpag/src/integrations/supabase/types.ts#L1877)) e vendas de mesa/assento têm `event_seat_id` — pedidos de mesa podem não fechar por lote. Os SELECTs abaixo filtram cartão online; vale checar se algum pedido cai fora do join.

**Portanto: a correção "fácil" (campo existe) NÃO está disponível.** A correção robusta e definitiva exige **schema**: persistir no `orders`, no momento da criação, o face e o juro (ex.: `face_amount numeric`, `installment_fee_amount numeric`, `installments int`) — o que também resolve a dívida de "não descartar dados de transação" (hoje o nº de parcelas é jogado fora).

---

## 5) PIX, venda física e manual — conferem redondo

Confirmado, o problema é **só cartão via Marcel**:

- **PIX Marcel** — [confra-create-pix/index.ts:188](site-festpag/supabase/functions/confra-create-pix/index.ts#L188): `finalAmount = totalAmount − discountAmount + serviceFee`. **Sem gross-up** (a constante `PARCELAMENTO_CUSTO` não existe nesse arquivo). Grava direto em `total_amount` ([linha 200](site-festpag/supabase/functions/confra-create-pix/index.ts#L200)).
- **PIX Mercado Pago** (`create-mercadopago-pix`, `create-seat-pix`) — PIX não tem parcelamento; sem gross-up.
- **Cartão Mercado Pago** (`process-card-payment`, `charge-seat-card`) — conforme item 2, `installments` só é repassado ao MP; `transaction_amount` não é inflado. **Sem embutido.**
- **Venda física (SmartPOS/totem)** — [collaborator-reserve-order/index.ts:153](site-festpag/supabase/functions/collaborator-reserve-order/index.ts#L153) e [178-179](site-festpag/supabase/functions/collaborator-reserve-order/index.ts#L178-L179): `total_amount = soma(price_do_banco × quantity)` + taxa, sem qualquer noção de parcela.
- **Manual** — não tem conceito de parcelamento. **Caveat honesto:** a função que cria o pedido manual **não está nas migrations locais** (coerente com o aviso do `CLAUDE.md` de que migrations locais ≠ schema remoto), então verifiquei por ausência de gross-up no front/edges, não lendo o corpo da função. Se quiser certeza, o SELECT nº 4 abaixo cobre isso empiricamente.

**Uma premissa que não pude verificar sem executar SQL:** que a Confra está com `events.payment_provider = 'marcel'`. Toda a explicação depende disso, e o sintoma (juro embutido em cartão) só é possível nessa rota. O SELECT nº 0 confirma em uma linha.

---

## SELECTs — prontos para colar, **não executados**

> Read-only. Rodar no SQL Editor do projeto `nsrromaqysgoxqvqagdm`.

### 0. Confirmar o provedor e a taxa do evento (premissa do relatório)

```sql
select e.id, e.title, e.payment_provider,
       f.payment_method, f.fee_percent, f.fee_fixed
from events e
left join event_fee_overrides f on f.event_id = e.id
where e.id = 'e86df07b-e06f-471e-abf0-a5ec94a11b93';
```

### 1. Por pedido de cartão: total vs face derivado (a diferença = juro)

```sql
with card_orders as (
  select o.id, o.created_at, o.total_amount, o.service_fee_amount, o.discount_amount,
         o.payment_method, o.sale_origin, o.status
  from orders o
  where o.event_id = 'e86df07b-e06f-471e-abf0-a5ec94a11b93'
    and o.status in ('paid','completed')
    and o.payment_method = 'card'
    and coalesce(o.sale_origin,'online') = 'online'
),
face as (
  select t.order_id,
         count(*)                as qtd_tickets,
         sum(l.price)            as face_esperado
  from tickets t
  join event_lots l on l.id = t.lot_id
  where t.order_id in (select id from card_orders)
    and t.status in ('valid','used')
  group by t.order_id
)
select co.id,
       co.created_at,
       f.qtd_tickets,
       f.face_esperado,
       co.discount_amount,
       co.service_fee_amount,
       co.total_amount,
       (co.total_amount - co.service_fee_amount)                        as net_exibido_hoje,
       (co.total_amount - co.service_fee_amount)
         - (f.face_esperado - co.discount_amount)                       as juro_embutido,
       -- custo implícito do gross-up; casa com PARCELAMENTO_CUSTO da edge
       round(1 - ((f.face_esperado - co.discount_amount + co.service_fee_amount)
                  / nullif(co.total_amount,0))::numeric, 4)             as custo_implicito
from card_orders co
left join face f on f.order_id = co.id
order by juro_embutido desc nulls last;
```

`custo_implicito` deve bater com a tabela da edge (0.0579 = 2x, 0.0673 = 3x, …) e permite **reconstruir o número de parcelas** que não foi gravado. `face_esperado IS NULL` denuncia pedido cujos tickets não fecham por lote (ver caveat 3 do item 4).

### 2. Somatório: quanto de juro está embutido no total

```sql
with card_orders as (
  select o.id, o.total_amount, o.service_fee_amount, o.discount_amount
  from orders o
  where o.event_id = 'e86df07b-e06f-471e-abf0-a5ec94a11b93'
    and o.status in ('paid','completed')
    and o.payment_method = 'card'
    and coalesce(o.sale_origin,'online') = 'online'
),
face as (
  select t.order_id, sum(l.price) as face_esperado, count(*) as qtd
  from tickets t
  join event_lots l on l.id = t.lot_id
  where t.order_id in (select id from card_orders)
    and t.status in ('valid','used')
  group by t.order_id
)
select count(*)                                                  as vendas_cartao,
       sum(f.qtd)                                                 as tickets,
       sum(co.total_amount)                                       as soma_total_amount,
       sum(co.service_fee_amount)                                 as soma_taxas,
       sum(co.total_amount - co.service_fee_amount)                as repasse_exibido_hoje,
       sum(f.face_esperado - co.discount_amount)                   as repasse_correto_face,
       sum(co.total_amount - co.service_fee_amount)
         - sum(f.face_esperado - co.discount_amount)               as juro_total_embutido
from card_orders co
left join face f on f.order_id = co.id;
```

Esperado, pelo exemplo: `repasse_exibido_hoje ≈ 23711,16`, `repasse_correto_face ≈ 23310,00`, `juro_total_embutido ≈ 401,16`.

### 3. Mesmo teste por método/origem — provar que só cartão desvia

```sql
with all_orders as (
  select o.id, o.total_amount, o.service_fee_amount, o.discount_amount,
         coalesce(o.sale_origin,'online') as origem,
         coalesce(o.payment_method,'?')   as metodo
  from orders o
  where o.event_id = 'e86df07b-e06f-471e-abf0-a5ec94a11b93'
    and o.status in ('paid','completed')
    and coalesce(o.sale_origin,'online') <> 'courtesy'
),
face as (
  select t.order_id, sum(l.price) as face_esperado
  from tickets t
  join event_lots l on l.id = t.lot_id
  where t.order_id in (select id from all_orders)
    and t.status in ('valid','used')
  group by t.order_id
)
select ao.origem, ao.metodo,
       count(*)                                                    as vendas,
       sum(ao.total_amount - ao.service_fee_amount)                 as net_exibido,
       sum(f.face_esperado - ao.discount_amount)                    as face_derivado,
       sum(ao.total_amount - ao.service_fee_amount)
         - sum(f.face_esperado - ao.discount_amount)                as desvio
from all_orders ao
left join face f on f.order_id = ao.id
group by ao.origem, ao.metodo
order by desvio desc nulls last;
```

**Leitura esperada:** `desvio ≈ 0` em PIX, física e manual; desvio positivo **só** na linha cartão. Se aparecer desvio fora do cartão, a hipótese está incompleta — pare e reavalie antes de qualquer correção.

### 4. Sanidade do preço do lote (a fragilidade nº 1 do item 4)

```sql
select l.id, l.name, l.price, l.updated_at, l.created_at,
       count(t.id) as tickets_emitidos
from event_lots l
left join tickets t on t.lot_id = l.id and t.status in ('valid','used')
where l.event_id = 'e86df07b-e06f-471e-abf0-a5ec94a11b93'
group by l.id, l.name, l.price, l.updated_at, l.created_at
order by l.created_at;
```

Se `updated_at` for posterior às primeiras vendas, o `price` já mudou e o face derivado dos pedidos antigos **não é confiável** — o que reforça a necessidade da coluna persistida.

---

## RECOMENDAÇÃO — tudo PÓS-EVENTO

### Correção definitiva (schema + checkout) — a certa, mas arriscada agora

Persistir a decomposição no momento da criação do pedido:

```
orders.face_amount            numeric  -- soma(event_lots.price × qty) no ato da venda
orders.installment_fee_amount numeric  -- o gross-up; 0 em 1x, PIX, física, manual
orders.installments           int
```

`confra-process-card` já tem os três números em mãos nas [linhas 260-268](site-festpag/supabase/functions/confra-process-card/index.ts#L260-L268) — é gravar. Depois, `orderTicketNet` passa a ser `face_amount − discount_amount` (com fallback para a fórmula atual em pedidos antigos), e o repasse fica correto **por construção**, imune a mudança de preço de lote. Bônus: mata a dívida de descartar o nº de parcelas.

**Não fazer com evento vivo.** Toca a edge que processa pagamento — o pior lugar para errar. Backfill dos pedidos existentes via `custo_implicito` (SELECT nº 1), que reconstrói a parcela.

### Correção interina (só exibição) — segura, reversível, mas com ressalva

Dá para fazer **inteiramente em `src/lib/producerFinance.ts`**: `orderTicketNet` passa a aceitar o face derivado (tickets × `event_lots.price`) quando disponível, caindo para a fórmula atual quando não. Isso é frontend puro — não toca checkout, schema nem edge. Mas exige que **todos os consumidores** passem tickets+lots, o que hoje não acontece:

| Consumidor | Já tem tickets+lots? |
|---|---|
| [EventFinanceiroTab.tsx](site-festpag/src/components/producer/tabs/EventFinanceiroTab.tsx) | sim (usa `lots` no `useMemo`) |
| [computeSalesByLot](site-festpag/src/lib/producerFinance.ts#L115) | sim (já recebe os três) |
| [useProducerFinance.ts:118](site-festpag/src/hooks/useProducerFinance.ts#L118) | **não** — só faz `select` de `orders`; precisaria de query nova |

Ou seja: mesmo a correção "só de exibição" não é um one-liner — o hook da página de repasse (justamente o que gera pagamento) precisa buscar tickets+lots. E ela herda a fragilidade do `event_lots.price` mutável.

**Minha recomendação:** fazer as duas, em ordem, depois do evento — (1) persistir os campos e passar a gravá-los, (2) trocar a fórmula com fallback, (3) backfill do histórico. Fazer só a interina deixa o número certo hoje e frágil amanhã.

### Enquanto o evento está vivo

Nada de código. O que dá para fazer sem risco: rodar os SELECTs 0–4 para **quantificar** o juro embutido por evento e, se houver repasse a pagar antes da correção, usar `repasse_correto_face` do SELECT nº 2 como número de referência — não o do card. Vale registrar a dívida no `_docs/roadmap.md`.

### Pergunta de negócio que o código não responde

O gross-up cobre um **custo real** (MDR + antecipação do Marcel) que a plataforma paga à adquirente e repassou ao comprador. Confirmar com o Gabriel que ele é **da plataforma** — porque, se por contrato alguma parte dele pertencer ao produtor, o repasse correto não é o face puro e a fórmula acima muda. Marquei como `[A CONFIRMAR]`; não inventei regra.
