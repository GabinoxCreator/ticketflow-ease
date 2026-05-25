# Entrega A — Integração visual + deploy + smoke test

Escopo isolado: integrar UI da venda manual, sem tocar no financeiro. Financeiro fica para Entrega B.

## 1. Header do evento

`src/components/producer/EventDashboardHeader.tsx`
- Renderizar `<ManualSaleButton eventId={event.id} />` ao lado das ações existentes (Editar / Publicar).
- Condicional: só mostra se `event.producer_id === user.id` (gate já existe no botão, mas reforçar no header).

## 2. Aba de pedidos (`EventOrdersTab.tsx`)

- Botão "+ Nova venda manual" no topo da aba (mesmo `<ManualSaleButton />`, variante secundária para não duplicar com header — decidir: deixar só no header OU só na aba. **Proposta: só no header**, e na aba apenas badge + cancelar, para evitar duplicação visual).
- Badge `Manual` (cor accent) ao lado do nome do cliente quando `order.sale_origin === 'manual'`.
- Botão "Cancelar venda" (ícone + tooltip) visível só quando `sale_origin === 'manual' && status === 'paid'`. Abre `<CancelManualSaleDialog />`.
- Desabilitar botão durante a mutation (`isPending`).

## 3. `OrderListItem.tsx`

- Quando `sale_origin === 'manual'`, exibir bloco extra com:
  - `manual_payment_method` (Dinheiro/PIX/Cartão/Outro)
  - `manual_payment_note` (se houver)
  - `manual_fee_applied` → label "Taxa aplicada: Sim/Não"
- Manter layout existente para vendas online.

## 4. CSV export

`src/utils/csvExport.ts` (ou equivalente que gera CSV de pedidos)
- Adicionar colunas: `sale_origin`, `manual_payment_method`, `manual_fee_applied`, `manual_payment_note`.
- (Sem `cancellation_reason` por enquanto — não capturamos motivo no cancel; manter campo fora do CSV nesta entrega.)

## 5. Deploy edge functions

- `producer-create-manual-sale`
- `producer-cancel-manual-sale`

## 6. Smoke test (executado e reportado caso a caso)

Vou rodar como produtor dono do evento atual (`a8ceede6-37d8-4be4-8a60-f4539024f747`) e reportar resultado de cada item da sua lista, incluindo:
- Verificações via `read_query` no banco para `orders`, `tickets`, `event_lots.sold_quantity`, `event_coupons.uses_count`, `audit_logs`.
- Teste de gate de colaborador via `curl_edge_functions` com Authorization header de outro usuário → esperar 403.

## Fora de escopo (Entrega B)

- `useProducerFinance` / cards de receita Online vs Manual.
- Antes de começar B, envio screenshot do financeiro atual para baseline.

## Detalhes técnicos

- Arquivos a editar: `EventDashboardHeader.tsx`, `EventOrdersTab.tsx`, `OrderListItem.tsx`, `csvExport.ts` (path exato a confirmar ao implementar).
- Sem mudanças de banco ou edge function nesta entrega — só deploy do que já foi escrito.
- Gate de visibilidade: `event.producer_id === user.id` (consistente com padrão existente).

## Ordem de execução

1. Deploy edge functions (independente da UI).
2. Editar 4 arquivos da UI.
3. Smoke test + relatório.
