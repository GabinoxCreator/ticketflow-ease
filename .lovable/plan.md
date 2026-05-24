# Vendas na Portaria (Colaborador) + Financeiro por Evento

Escopo dividido em 3 blocos. Tudo reaproveita a tabela `door_sales` que já existe (atualmente usada na aba "Portaria" do produtor).

---

## Bloco 1 — Aba "Vender" no Colaborador

**Onde:** bottom nav de `/colaborador/check-in/:eventId` (`ColaboradorBottomNav`).

**Adicionar 2 abas novas** ao bottom nav: `Vender` (ShoppingBag) e `Relatórios` (BarChart3). Total passa a ser 4: Check-in · Listas · Vender · Relatórios.

**Fluxo "Vender" (modal em 2 passos, igual aos prints enviados):**

1. **Passo 1 — Lote + Quantidade**
   - Lista lotes ativos do evento com preço e disponíveis (`total_quantity - sold_quantity - reserved_quantity`).
   - Stepper de quantidade (− / input / +), máx = disponível.
   - Botão "Continuar" libera com lote selecionado.

2. **Passo 2 — Meio de pagamento**
   - 4 cards grandes (grid 2x2): **PIX**, **Dinheiro**, **Cartão Débito**, **Cartão Crédito**.
   - Mostra resumo `Nx Lote — R$ total`.
   - "Confirmar Venda" registra via Edge Function nova `collaborator-register-door-sale`.

**Edge Function nova `collaborator-register-door-sale`:**
- Valida `sessionToken` do colaborador (mesmo padrão das outras edge functions de colaborador).
- Confere que o colaborador está vinculado ao evento (`collaborator_events`).
- Insere em `door_sales` com `operator_id = collaborator.id` e payment_method ∈ {pix, dinheiro, cartao_debito, cartao_credito}.
- Retorna a venda criada para feedback visual.

**RLS:** a INSERT policy atual de `door_sales` exige produtor dono. Vamos manter — a função roda com service role, então não precisa mexer em RLS.

---

## Bloco 2 — Aba "Relatórios" no Colaborador

Tela mobile-first com cards (igual print 3):

- **KPIs topo (grid 2x2):** Ingressos vendidos · Valor Total · Vendas (transações) · Ticket Médio.
- **Por Lote:** lista cada lote com qtd e R$ vendido na portaria.
- **Por Meio de Pagamento:** PIX, Dinheiro, Débito, Crédito — qtd + R$.
- **Por Operador:** quanto cada colaborador (incluindo o atual) vendeu.

**Edge Function nova `collaborator-door-sales-report`:**
- Valida sessão; checa vínculo ao evento.
- Retorna door_sales agregadas (por lote, por método, por operador) + nomes dos colaboradores via `collaborators`.
- Hook `useColaboradorDoorSalesReport(eventId, sessionToken)`.

---

## Bloco 3 — Aba "Financeiro" por Evento (Produtor)

Hoje só existe lista de eventos em `/produtor/financeiro` e a página `FinanceiroEvento` mostra "Balanço Disponível + Transferências". Vamos **adicionar uma aba "Financeiro" dentro do dashboard do evento** (`/produtor/eventos/:id`, ao lado de Dados/Ingressos/Listas/Cupons/Pedidos/Participantes/Portaria/Check-in) com a estrutura do print 5:

**Seção 1 — 3 cards topo:**
- **Vendas Totais** = soma `orders.total_amount` (paid).
- **Repasse ao Produtor** = vendas − taxa de conveniência (sem subtrair taxas MP — esse valor é o que o produtor recebe).
- **Seu Lucro (Plataforma)** = taxa de conveniência arrecadada − taxas MP. *Renderizado só pra admin/dono — discutir abaixo.*

**Seção 2 — Ingressos:**
- Ingressos vendidos `X / capacidade total` (somando `total_quantity` dos lotes do evento).
- Valor arrecadado.
- Breakdown por método: PIX (R$ X · N vendas), Cartão (R$ X · N vendas).

**Seção 3 — Resumo de Pagamentos (taxas MP reais):**
- Total Bruto.
- PIX: bruto + Taxa MP real (vinda da diferença `total_amount - net_received` se disponível) e valor descontado.
- Cartão: idem.
- "Total Taxas Mercado Pago" e "Valor Líquido após MP".

   ⚠ Hoje não temos `mp_fee` salvo nos pedidos. Vamos:
   - Aplicar **estimativa fixa configurável** por método (PIX ~0,99%, Cartão ~4,98%) lida de `platform_settings` (nova key `mp_fee_estimates`), com fallback hardcoded.
   - Marcar visualmente como "estimativa" até começarmos a salvar a taxa real (fora deste escopo).

**Seção 4 — Taxa de Conveniência:**
- Taxa Bruta (10% sobre subtotal, do `service_fee_amount`).
- Taxa MP Descontada.
- Taxa Líquida (lucro da plataforma).

**Seção 5 — Vendas na Portaria (Apenas conferência):**
- Quantidade total e valor de referência (`door_sales`).
- Aviso explícito: **"Estes valores não são contabilizados na receita. Servem apenas para controle de caixa."**
- Breakdown por método (PIX / Dinheiro / Débito / Crédito) e por operador.

---

## Decisão a confirmar antes da execução

No seu print, **vendas na portaria são "apenas conferência"** (não entram na receita), mas você falou que "isso contabiliza na receita". Vou seguir o padrão do print (não contabiliza), porque misturar tornaria a conciliação financeira inconsistente — door_sales não passam pelo MP, não geram ticket nem nota. Se preferir contabilizar, é só me avisar que adiciono uma coluna separada "Receita Portaria" nos KPIs sem misturar com a receita online.

---

## Detalhes técnicos

- **Arquivos novos:**
  - `src/components/colaborador/ColaboradorVenderTab.tsx`
  - `src/components/colaborador/ColaboradorVenderModal.tsx` (2 passos)
  - `src/components/colaborador/ColaboradorRelatoriosTab.tsx`
  - `src/hooks/useColaboradorDoorSales.ts`
  - `src/components/producer/tabs/EventFinanceiroTab.tsx`
  - `supabase/functions/collaborator-register-door-sale/index.ts`
  - `supabase/functions/collaborator-door-sales-report/index.ts`

- **Arquivos alterados:**
  - `src/components/colaborador/ColaboradorBottomNav.tsx` — 4 tabs.
  - `src/pages/colaborador/ColaboradorEvento.tsx` — render condicional das novas abas.
  - `src/pages/EventDashboard.tsx` — nova tab "Financeiro".
  - Remover (ou esconder) `EventDoorSalesTab` do produtor? **Não** — mantém pra produtor seguir podendo registrar manualmente.

- **Migração SQL:** opcional, apenas se o trigger `handle_door_sale_lot_update` ainda não permitir `operator_id` ser o ID de um colaborador (não-UUID de `auth.users`). Verifico antes de executar; se precisar, removo o NOT NULL/FK ou adiciono coluna `collaborator_id`.

- **Memória de projeto:** após implementar, salvo regra em `mem://features/collaborator-door-sales` para vínculo colaborador → operador.