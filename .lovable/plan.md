## Reformular página Financeiro do Produtor (estilo Shotgun)

Inspirado nos prints enviados, o Financeiro vira um painel com **visão por evento**, lista de **transferências (payouts)** com PDF, e os dados bancários/PIN ficam em uma seção de configurações dentro da mesma página. Mantemos o **gate por PIN** que já existe.

### Estrutura final da página `/produtor/financeiro`

```text
[Gate PIN — mantido]
        │
        ▼
┌────────────────────────────────────────────────────────────┐
│ Header: Financeiro                                         │
├────────────────────────────────────────────────────────────┤
│ Card "Balanço Global"                                      │
│   • Receita Líquida total (todos eventos pagos)            │
│   • Já Repassado (sum payouts.paid)                        │
│   • Disponível (líquida − repassado)                       │
├────────────────────────────────────────────────────────────┤
│ Tabs:  [Por Evento]   [Dados & PIN]                        │
│                                                            │
│ ── Por Evento ─────────────────────────────────────────    │
│   [busca: Buscar eventos]                                  │
│   Lista de eventos do produtor:                            │
│   ┌────────────────────────────────────────────────────┐   │
│   │ [img] Nome do evento     R$ Líquida   R$ Disponív.│   │
│   │       data formatada                              │   │
│   └────────────────────────────────────────────────────┘   │
│   → ao clicar, abre detalhe do evento                      │
│                                                            │
│ ── Dados & PIN ────────────────────────────────────────    │
│   • BankAccountCard (já existe, refinado)                  │
│   • PinSetupCard (já existe)                               │
└────────────────────────────────────────────────────────────┘
```

### Detalhe do evento (`/produtor/financeiro/:eventId`)

```text
← Todos os Eventos                       [Baixar Relatório]
        Nome do evento
        data formatada

┌──────────────── Balanço ────────────────┐  ┌── Transferências (payouts) ──┐
│ Receita Bruta:        R$ X              │  │ [busca]                      │
│ Taxa plataforma (10%): -R$ Y            │  │ ┌──────────────────────────┐ │
│ Receita Líquida:      R$ Z              │  │ │ Título  Valor   [PDF]   │ │
│ Já enviado:          -R$ W              │  │ │ Para banco · data       │ │
│ ─────────────────────────────           │  │ └──────────────────────────┘ │
│ Disponível:           R$ Z−W            │  │ (vazio: "Nenhuma ainda")    │
└─────────────────────────────────────────┘  └──────────────────────────────┘
```

- **Receita Bruta** = sum `orders.total_amount` (status `paid`/`completed`) do evento.
- **Taxa plataforma** = aplica `producer_fee_overrides` se existir, senão `platform_settings.default_platform_fee_percent` (atual: 10% + R$0).
- **Repasses** = `payouts` da `producer_profile_id` do produtor cujo período cobre o evento (filtragem por `bank_account_snapshot->>event_id` ou novo campo opcional). Para esta etapa, vamos **filtrar payouts por `notes` contendo o id do evento** ou exibir todos os payouts da organização e marcar quais cobrem o período do evento. Detalhe abaixo.
- **PDF**: gerado client-side com `jsPDF` (já presente em `ticketPdf.ts`) contendo: dados do produtor, dados bancários snapshot, valores, data, número do repasse.

### Decisão sobre vinculação payout ↔ evento

A tabela `payouts` hoje tem `period_start/period_end` por `producer_profile_id` (não por evento). Para o painel "por evento" funcionar, vamos **adicionar `event_id uuid NULL` em `payouts`** (FK opcional para `events`). Quando o admin cria um repasse específico de evento, marca esse campo. Repasses sem `event_id` aparecem apenas no Balanço Global. Isso é compatível com dados existentes.

### Mudanças

1. **DB migration**
   - `ALTER TABLE payouts ADD COLUMN event_id uuid NULL REFERENCES events(id) ON DELETE SET NULL;`
   - Index em `payouts(event_id)`.

2. **Hook novo `src/hooks/useProducerFinance.ts`**
   - Retorna: `globalBalance` (bruta, líquida, repassado, disponível), `eventsFinance[]` (id, nome, banner, data, bruta, líquida, repassado, disponível), `getEventDetail(eventId)`, `feePercent`.
   - Busca: events do produtor + orders agregadas + payouts (filtrando por `producer_profile_id` do user) + `producer_fee_overrides`/`platform_settings`.

3. **Nova página `src/pages/Financeiro.tsx`** (refatorada)
   - Mantém gate PIN existente.
   - Header + Card Balanço Global.
   - Tabs "Por Evento" / "Dados & PIN".
   - Lista de eventos (componente `EventFinanceListItem`).

4. **Nova página `src/pages/FinanceiroEvento.tsx`** rota `/produtor/financeiro/:eventId`
   - Cards de balanço + tabela de transferências com botão PDF.
   - Botão "Baixar Relatório" (CSV via `csvExport.ts` + opção PDF).

5. **Componente `src/components/producer/PayoutPdfButton.tsx`**
   - Gera PDF do repasse com `jsPDF` (logo, dados, valor, banco, data).

6. **Roteamento `src/App.tsx`**
   - Adicionar rota protegida `/produtor/financeiro/:eventId` → `FinanceiroEvento`.

7. **Refino visual `BankAccountCard` + `PinSetupCard`**
   - Pequenos ajustes para ficarem coerentes dentro da nova tab "Dados & PIN" (sem mudar lógica). Mantém edição inline já existente.

### Visual / estilo
- Tema escuro Indigo→Magenta (já em uso). Cards com `bg-card`, bordas suaves, números grandes (`text-3xl font-bold`) para valores. Linhas de evento com hover, banner thumbnail `w-14 h-14 rounded-lg object-cover`.
- Tabela de transferências: header sutil, ícone verde `ArrowUpRight` para enviado, valor em vermelho (`-R$`), botão "PDF" com ícone `Download`.
- Mobile: lista de eventos vira cards empilhados (sem tabela horizontal); detalhe do evento empilha balanço acima das transferências.

### Fora de escopo
- Criação manual de payouts pelo produtor (continua semi-manual pelo admin, conforme memória `payout-processing-model`).
- Integração com gateway de transferência automática.
- Mudança no fluxo de PIN.
- Mexer em `EventOrdersTab` ou outras abas do dashboard de evento.

### Observações técnicas
- Sem mexer em RLS (políticas atuais já permitem produtor ler `payouts` próprios via `is_producer_member`).
- PDF gerado no cliente; sem Edge Function nova nesta etapa.
- Gate PIN continua bloqueando a página antes de qualquer fetch financeiro.
