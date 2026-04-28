## Tabs sem scroll + escassez inline no card de lote

### 1. Tabs principais do EventDashboard — grid no mobile
**Problema atual**: 8 abas em barra rolável → usuário precisa arrastar.

**Solução** em `src/pages/EventDashboard.tsx`:
- Trocar wrapper rolável por `TabsList` com classes `grid grid-cols-4 sm:flex sm:flex-wrap w-full gap-1 p-1 h-auto` mantendo o visual glass.
- Mobile: 8 ícones distribuídos em 2 fileiras de 4 (sem labels — só ícones, como já é hoje).
- Desktop (`sm+`): volta ao layout horizontal flex com ícone + label.
- Remover `whitespace-nowrap` e `overflow-x-auto`. Triggers ficam centralizados (`justify-center`).

### 2. Sub-tabs Pedidos / Participantes — grid no mobile
**Problema atual**: 4 abas (Todos / Pagos / Pendentes / Cancelados) saem do enquadramento.

**Solução** em `EventOrdersTab.tsx` e `EventParticipantsTab.tsx`:
- Substituir wrapper `overflow-x-auto` por `TabsList` direto com `grid grid-cols-4 sm:flex w-full gap-1 p-1 h-auto`.
- Triggers: `whitespace-nowrap` removido, texto encolhe naturalmente (`text-[11px] sm:text-sm`), badge fica abaixo do label no mobile (ou some no breakpoint mais estreito) usando `flex-col sm:flex-row` no conteúdo do trigger.
- Resultado: 4 botões iguais ocupando 25% cada, sem scroll.

### 3. Card de lote — controle de escassez inline
**Problema**: para mexer na % de escassez exibida, é preciso abrir o dialog de edição.

**Solução** em `src/components/producer/LotManager.tsx`, dentro do card de cada lote (após o badge "Escassez"):
- Quando `lot.fake_scarcity_enabled === true`, mostrar bloco compacto:
  - Header: ícone Flame + "Escassez" + valor atual (ex: "75%")
  - Slider (`min=10 max=95 step=5`) com debounce de ~600ms para chamar `onUpdate(lot.id, { fake_scarcity_percentage: novoValor })`.
  - Sem precisar salvar manualmente — atualiza ao soltar o slider.
- Adicionar também um botão pequeno "Desativar" (ghost, `text-xs`) para chamar `onUpdate(lot.id, { fake_scarcity_enabled: false })`.
- Quando `fake_scarcity_enabled === false`, mostrar mini-link "Ativar escassez" que chama `onUpdate(lot.id, { fake_scarcity_enabled: true, fake_scarcity_percentage: 50 })`.

### Arquivos a modificar
- `src/pages/EventDashboard.tsx` — TabsList em grid no mobile
- `src/components/producer/tabs/EventOrdersTab.tsx` — sub-tabs em grid
- `src/components/producer/tabs/EventParticipantsTab.tsx` — sub-tabs em grid
- `src/components/producer/LotManager.tsx` — slider de escassez inline no card

### Fora de escopo
- Não alterar o dialog de edição completo do lote (ele continua funcionando como hoje).
- Sem mudanças no schema.
