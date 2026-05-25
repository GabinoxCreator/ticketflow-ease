## Entrega B — Separação Online/Manual + Fix de Taxa Real

### Bug confirmado na baseline
`/produtor/financeiro/{evento}` mostra "Taxa Plataforma (10%) − R$ 1.034,00" sobre R$ 10.340 em PIX. Mas o PIX desse evento está configurado a **0%** em `event_fee_overrides`. Causa: `useProducerFinance.ts` recalcula `fee = gross * 10%` em vez de usar o `service_fee_amount` real já salvo em cada `order` (que é a fonte de verdade no momento da venda e já respeita overrides + `apply_fee` manual).

Esse fix entra junto da Entrega B porque é a mesma refatoração da soma de receita.

---

### 1. `src/hooks/useProducerFinance.ts` (fix + particionamento)

**Mudança 1 — usar fee real do banco:**
- Trocar o recálculo flat por soma direta de `service_fee_amount`:
  - `gross += o.total_amount`
  - `fee += o.service_fee_amount` (em vez de `gross * percent/100`)
  - `net = gross - fee`
- Remover dependência do `feeConfig.percent` no cálculo (mantém `feeConfig` exposto só pra exibição informativa).

**Mudança 2 — particionar por `sale_origin`:**
- Adicionar `sale_origin` ao SELECT de orders.
- Por evento, produzir 4 buckets adicionais:
  - `grossOnline`, `feeOnline`, `netOnline`
  - `grossManual`, `feeManual`, `netManual`
- `gross/fee/net` totais permanecem = soma dos dois (zero regressão na soma).
- Vendas canceladas continuam fora (filtro `status IN ('paid','completed')` mantido).

### 2. `src/pages/FinanceiroEvento.tsx`

- Linha 101: trocar `Taxa Plataforma ({percent}%)` por `Taxa Plataforma` (sem hardcode do percent, já que cada venda pode ter taxa diferente por método/manual).
- Adicionar quebra colapsável da Receita Bruta:
  ```
  Receita Bruta              R$ 10.340,00
    ↳ Online                 R$ 10.340,00
    ↳ Manual                 R$ 0,00
  Taxa Plataforma            − R$ 0,00     (era −R$ 1.034 errado)
  Receita Líquida            R$ 10.340,00  (era R$ 9.306 errado)
  ```

### 3. `src/pages/Financeiro.tsx`

- Adicionar mini-bloco "Composição da Receita Líquida" acima dos 3 cards atuais:
  - Card pequeno Online + card pequeno Manual.
- 3 cards principais (Receita Líquida, Já Repassado, Disponível) ficam intocados — só o número agora vai bater com a realidade (PIX 0%).

### 4. `src/components/producer/tabs/EventFinanceiroTab.tsx`

- Adicionar `sale_origin` ao SELECT.
- Filtrar `grossOnline` para `sale_origin='online' || null` (manual nunca entra em estimativa MP).
- Novo card "Vendas Manuais" entre "Ingressos" e "Vendas na Portaria":
  - Breakdown por `manual_payment_method` (PIX, Dinheiro, Cartão Débito/Crédito, Transferência, Outro).
  - Tooltip (HoverCard + ícone Info) com a redação:
    > "Vendas registradas manualmente pelo produtor. O FestPag não processa esses pagamentos — apenas registra para emitir ingressos e somar na receita. Diferencia das vendas online (com transação no MP) e de vendas na portaria (não entram na receita)."
- KPI "Vendas Totais" passa a mostrar `grossOnline + grossManual` com legenda "Online + Manual".
- Resumo MP / Pagamentos online: usa só `grossOnline` (PIX/Cartão MP fees nunca incidem sobre manual). Já era o comportamento implícito, agora fica explícito com filtro `sale_origin`.

### 5. Smoke test pós-deploy (manual, sem código)

Validar no evento `a8ceede6-...`:
- [ ] `/produtor/financeiro/{evento}` → "Taxa Plataforma" agora = **R$ 0,00** (PIX 0%), "Receita Líquida" = R$ 10.340,00, "Disponível" = R$ 10.340,00.
- [ ] `/produtor/financeiro` (lista) → totais Receita Líquida agregada bate; bloco Composição mostra Online R$ 10.340 / Manual R$ 0.
- [ ] Aba Financeiro do evento → "Vendas Totais" = R$ 10.340 (Online + Manual), card "Vendas Manuais" mostra R$ 0,00, Resumo MP intocado.
- [ ] Criar 1 venda manual de teste PIX com `apply_fee=true` → entra em `grossManual` e `feeManual`; NÃO entra em PIX online; NÃO entra em estimativa taxa MP.
- [ ] Cancelar essa venda → some de tudo (status filter já cuida).

### O que NÃO muda

- Schema do banco (nenhuma migration).
- Edge functions.
- RLS.
- Door sales (continua "apenas conferência").
- Cálculo de payouts (continua sobre `net_amount`).
- Cards principais do dashboard agregado.

### Riscos

- **Único risco real:** se algum order legado tem `service_fee_amount = NULL`, vai contar como 0 fee. Mitigação: `Number(o.service_fee_amount || 0)` (já é o padrão atual no `EventFinanceiroTab`). Se aparecer evento com fee 0 indevida, ajuste posterior em migration backfill — fora do escopo da B.
