

# Fase 5 — Operação Avançada de Eventos

---

## 1. Diagnóstico: QR Code e Check-in

**O que existe:**
- `EventCheckinTab` no painel do produtor — busca por nome/email/código, botão de check-in que atualiza `tickets.status` para `used` e `validated_at` via client-side Supabase
- `QRCodeScanner` para colaboradores — usa `html5-qrcode` para ler câmera, valida via edge function `collaborator-validate-ticket` (com sessão)
- `qrcode.react` (`QRCodeSVG`) no lado do cliente — gera QR com `ticket_code` em `MeusIngressos` e `TicketCard`
- `ticket_code` é um UUID gerado automaticamente (`gen_random_uuid()::text`)

**Gaps:**
- O check-in do produtor (`EventCheckinTab`) **não tem QR Code reader** — só busca manual
- O check-in do produtor faz update direto pelo client sem registrar operador
- Não há `checkin_logs` — sem rastreabilidade de quem fez o check-in
- Não há proteção contra race condition (dois cliques simultâneos)
- O `ticket_code` é um UUID longo — funciona mas não é amigável para busca manual

---

## 2. Diagnóstico: Portaria

**O que existe:** Nada. Não existe tabela `door_sales`, nem tela, nem hook. É funcionalidade 100% nova.

---

## 3. Diagnóstico: Relatórios/Exportações

**O que existe:**
- CSV de pedidos em `EventOrdersTab` (nome, email, telefone, valor, status, método, data)
- CSV de participantes em `EventParticipantsTab` (nome, email, telefone, código, status, data)
- Métricas no `EventOverviewTab` via `useEventStats` (receita, vendidos, disponíveis, conversão, vendas por lote, vendas por dia)
- Ações rápidas "Exportar" e "Relatórios" no overview são **placeholders** (onClick vazio)

**Gaps:**
- Não há CSV de check-ins (filtrado por validados + data/hora de validação)
- Não há CSV de listas de convidados
- Não há filtros por período nas exportações
- Métricas de portaria não existem (não há door_sales)

---

## 4. O que pode ser reaproveitado

| Componente | Reuso |
|---|---|
| `useEventParticipants` | Base para check-in — já filtra por status |
| `EventCheckinTab` | Evoluir para incluir QR reader |
| `QRCodeScanner` (colaborador) | Extrair lógica de scanner como componente reutilizável |
| `collaborator-validate-ticket` edge function | Referência de lógica — mas produtor usa Supabase Auth direto |
| `useEventStats` | Estender para incluir métricas de portaria |
| `useEventLots` | Base para seleção de lote na portaria |
| `html5-qrcode` + `qrcode.react` | Já instalados |
| CSV inline nas tabs | Extrair para util reutilizável |

---

## 5. Proposta de Tabelas

### `door_sales` (nova)
```sql
CREATE TABLE door_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES event_lots(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'dinheiro',
  notes TEXT,
  operator_id UUID NOT NULL,  -- auth.users.id do produtor/membro
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
RLS: produtor do evento pode SELECT/INSERT. Membros da organização podem SELECT/INSERT.

### `checkin_logs` (nova — opcional mas recomendada)
```sql
CREATE TABLE checkin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id),
  event_id UUID NOT NULL,
  operator_id UUID,           -- auth.users.id ou null
  collaborator_id UUID,       -- para colaboradores legados
  action TEXT NOT NULL DEFAULT 'checkin', -- 'checkin' | 'undo'
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'qrcode' | 'api'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
RLS: produtor do evento pode SELECT/INSERT.

Essas tabelas são incrementais — não alteram nada existente.

---

## 6. Plano de Implementação

### Bloco 1 — Check-in com QR Code no painel do produtor
- Extrair componente `QRScannerModal` reutilizável a partir da lógica de `QRCodeScanner.tsx`
- Integrar no `EventCheckinTab` — botão "Escanear QR Code" que abre modal com câmera
- Ao ler QR, buscar ticket pelo código e mostrar resultado com feedback visual
- Adicionar proteção contra duplo-clique (disable button durante mutação)
- **Arquivos**: novo `src/components/producer/QRScannerModal.tsx`, editar `EventCheckinTab.tsx`

### Bloco 2 — Tabela `checkin_logs` + registro de operador
- Migração SQL: criar `checkin_logs` com RLS
- Atualizar `useEventParticipants.updateTicketStatus` para aceitar `operatorId` e `source`
- Inserir log no `checkin_logs` ao validar/desfazer check-in
- **Arquivos**: migração SQL, editar `useEventParticipants.ts`

### Bloco 3 — Portaria (door_sales)
- Migração SQL: criar `door_sales` com RLS
- Novo hook `useDoorSales.ts`
- Nova tab "Portaria" no `EventDashboard` — formulário rápido: lote, quantidade, pagamento, observações
- Listagem de vendas de portaria com totais
- Atualizar `sold_quantity` no lote após venda (via trigger ou no hook)
- **Arquivos**: migração SQL, novo `src/hooks/useDoorSales.ts`, novo `src/components/producer/tabs/EventDoorSalesTab.tsx`, editar `EventDashboard.tsx`

### Bloco 4 — Exportações CSV avançadas
- Extrair util `src/utils/csvExport.ts` com função genérica
- CSV de check-ins (nome, email, código, lote, data/hora validação, operador)
- CSV de listas de convidados (nome, status, data inscrição, data check-in)
- Conectar ações rápidas "Exportar" e "Relatórios" no overview
- **Arquivos**: novo `src/utils/csvExport.ts`, editar `EventOverviewTab.tsx`, `EventListsTab.tsx`

### Bloco 5 — Métricas e relatórios
- Estender `useEventStats` para incluir: vendas de portaria, check-ins realizados, taxa de ocupação
- Adicionar cards de portaria no overview
- **Arquivos**: editar `useEventStats.ts`, `EventOverviewTab.tsx`

### Bloco 6 — Robustez operacional
- Estados vazios e loading melhores em todas as tabs
- Prevenção de ações duplicadas (desabilitar botões durante mutações)
- Feedback visual com vibração e sons opcionais no check-in
- Consistência de mensagens de erro/sucesso
- **Arquivos**: ajustes pontuais em tabs existentes

---

## 7. Riscos

| Risco | Mitigação |
|---|---|
| `sold_quantity` em `event_lots` pode ficar inconsistente com door_sales | Usar trigger SQL para incrementar, ou recalcular no hook |
| QR scanner no desktop pode não ter câmera | Fallback automático para busca manual (já existe no design) |
| `ticket_code` como UUID é longo para busca manual | Manter — busca por prefixo de 8 chars já funciona |
| Área pública do cliente | Nenhum dos blocos altera fluxo de compra ou login |
| Race condition em check-in | Usar `.eq('status', 'valid')` no UPDATE para garantir atomicidade |

---

## 8. Arquivos Impactados (resumo)

**Novos:**
- `src/components/producer/QRScannerModal.tsx`
- `src/components/producer/tabs/EventDoorSalesTab.tsx`
- `src/hooks/useDoorSales.ts`
- `src/utils/csvExport.ts`
- 2 migrações SQL (`checkin_logs`, `door_sales`)

**Editados:**
- `src/components/producer/tabs/EventCheckinTab.tsx`
- `src/hooks/useEventParticipants.ts`
- `src/pages/EventDashboard.tsx` (nova tab Portaria)
- `src/hooks/useEventStats.ts`
- `src/components/producer/tabs/EventOverviewTab.tsx`
- `src/components/producer/tabs/EventListsTab.tsx`

