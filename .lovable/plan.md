## Objetivo
Permitir que **você (admin geral)** configure a taxa da plataforma **por evento e por meio de pagamento** (PIX e/ou Cartão), substituindo o padrão de 10%. Caso da Feijuca da Ana: PIX com 0%. Cartão segue 10%.

A UI fica dentro do painel do produtor (na página do evento), mas o card só aparece para usuários com role `admin`. Produtores normais não veem nem editam.

---

## Banco de dados (migration)

Nova tabela `event_fee_overrides`:
- `event_id` (FK lógico events.id)
- `payment_method` ∈ `pix` | `card` (uma linha por método)
- `fee_percent` numeric (ex.: 0, 5, 10)
- `fee_fixed` numeric default 0
- `notes` text
- `created_by`, `created_at`, `updated_at`
- UNIQUE (event_id, payment_method)

RLS:
- SELECT: admin OU produtor dono do evento (para o checkout/cliente conseguir ler, criar policy pública de SELECT — taxa não é dado sensível, e o checkout precisa calcular).
- INSERT/UPDATE/DELETE: **apenas admin** (`has_role(auth.uid(),'admin')`).

Função helper `get_event_fee(_event_id uuid, _method text)` retornando `(fee_percent, fee_fixed)` — usa override se existir, senão 10% / 0.

## Edge functions (cálculo da taxa real cobrada)
- `supabase/functions/create-mercadopago-pix/index.ts`: trocar constante `SERVICE_FEE_RATE = 0.10` por consulta a `event_fee_overrides` (método `pix`) com fallback 10%.
- `supabase/functions/process-card-payment/index.ts`: idem, método `card`.

## Frontend — Checkout
- `src/components/checkout/CheckoutStepPayment.tsx`: hoje calcula uma taxa única exibida no resumo. Passar a buscar overrides do evento (hook novo `useEventFees(eventId)`) e calcular a taxa de acordo com o método selecionado. Como o resumo é mostrado antes da escolha, exibimos a menor (ou um range) e recomputamos ao escolher PIX/Cartão.
- `src/components/checkout/CheckoutModal.tsx`: usar o valor de taxa retornado pelo hook em vez de `0.10` fixo.

## Frontend — Painel do produtor (admin-only)
- Novo componente `src/components/producer/AdminFeeOverrideCard.tsx`:
  - Mostra dois inputs: **Taxa PIX (%)** e **Taxa Cartão (%)** + campo opcional fee_fixed.
  - Botões "Salvar" para cada método; "Remover override" volta ao padrão 10%.
  - Aviso visual "Visível apenas para Admin da plataforma".
- Inserir o card em `src/components/producer/tabs/EventOverviewTab.tsx` (ou em uma nova aba "Taxas") condicionado a `userRole === 'admin'` via `useAuth()`.
- Hook `src/hooks/useEventFeeOverrides.ts` com CRUD via Supabase client.

## Fora de escopo
- Override por organização/produtor inteiro (já existe `producer_fee_overrides`, não mexer).
- Histórico/auditoria detalhada além do já registrado em `audit_logs`.
- Aplicar retroativamente a pedidos já criados.

## Validação manual
1. Logar como admin → abrir Feijuca da Ana no painel do produtor → setar PIX = 0% → salvar.
2. Abrir checkout do evento como cliente → escolher PIX → resumo mostra taxa R$ 0,00; total = subtotal.
3. Escolher Cartão → taxa volta a 10%.
4. Logar como produtor (não-admin) → o card de override **não aparece**.
5. Outros eventos continuam com 10% em ambos os métodos.
