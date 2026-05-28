
# Fase 11.1 — Correções da página pública e do mapa

Quatro problemas independentes, uma rodada. Sem mexer em business logic (RPCs `hold_seats`/`release_seats`, `useSeatHold` continuam como estão).

---

## Problema 1 — Card "Reserve sua Mesa" (UX)

**Arquivos:** `src/hooks/useEventSeatAvailability.ts`, `src/components/event/MesaReservaCTA.tsx`, `src/pages/EventDetails.tsx`, migration nova.

- Estender `useEventSeatAvailability` para também devolver `basePrice`, `extraPrice`, `baseCapacity`, `maxCapacity` por `seat_type_name` (pega do primeiro seat do tipo — todos do mesmo tipo compartilham). Hoje só traz status/price.
- Reescrever `MesaReservaCTA`:
  - Remove os chips de estoque (`Bistrô · 40/40`, `Mesa Padrão · 40/40`).
  - Remove o bloco "A partir de R$" interno (fica só no `PriceAndShareBar` no topo).
  - Lista um item por `seat_type_name` no formato:
    `MESA PADRÃO · 4 pessoas + até 2 extras · R$ 120,00 · +R$ 30,00 por extra`
  - Adiciona descrição curta acima (campo `event.mesa_reserva_description` no banco; fallback "Escolha sua mesa diretamente no mapa do local").
  - Mantém botão "Ver Mapa de Mesas" e badge "Esgotado" quando `totalAvailable === 0`.
- Migration: `ALTER TABLE public.events ADD COLUMN mesa_reserva_description text;` (nullable, sem default).
- Editor de evento (`EditarEvento.tsx` / `CriarEvento.tsx`): adicionar `<Textarea>` opcional "Descrição da reserva de mesas" só quando `event_type ∈ {mesa, hibrido}`. **Fora de escopo** deste fix se ficar grande — mínimo aceitável: só adicionar a coluna + fallback; o editor entra na Fase 12. Confirmar com você antes de tocar nos forms.

---

## Problema 2 — Responsividade mobile (regressão)

**Arquivo:** `src/pages/EventDetails.tsx`.

- Banner: hoje `aspect-[4/5] sm:aspect-[16/9]` dentro de `max-w-5xl px-4`. Em ≤380px o `rounded-2xl` + sombra causa overflow visual. Trocar wrapper para `px-3 sm:px-4`, garantir `w-full max-w-full overflow-hidden` no container do `<img>`, e `object-cover object-center`.
- Tipografia: `h1` passa de `text-3xl md:text-4xl` para `text-2xl sm:text-3xl md:text-4xl lg:text-5xl`. Subtítulos `text-base sm:text-lg`. Aplicar `break-words` onde já não tem.
- Section content: trocar `px-4` por `px-3 sm:px-4`; manter `min-w-0`.
- `MesaReservaCTA`: `p-6` → `p-4 sm:p-6`, ícone container `w-10 h-10` ok, mas `flex-wrap` nos meta-rows.
- `LotCard` / Sticky bottom bar: revisar paddings e font-sizes equivalentes.
- QA: verificar em viewport 380×740 que nada estoura horizontalmente (sem scroll-x).

---

## Problema 3 — Mapa fullscreen com header dedicado (regressão)

**Arquivos:** `src/pages/EventMapPage.tsx` (reescrever), `src/pages/EventDetailsSeated.tsx` (refatorar), `src/components/seated/SeatMapRenderer.tsx` (adicionar zoom).

- `EventMapPage`: NÃO renderiza mais `<Header />` do FestPag. Layout próprio:
  - Top bar fixo (h-14): `[← Voltar]` à esquerda, `Nome do evento · DD/MM · HH:mm` centralizado (truncate no mobile), controles `[−] [100%] [+] [⛶ fullscreen]` à direita.
  - Canvas do mapa ocupa `calc(100vh - 3.5rem)`, sem `Footer`.
  - Painel de seleção: drawer/sheet inferior no mobile (≤md), sidebar direita no desktop.
- `EventDetailsSeated`: remove `<Header/>`, `<Footer/>`, título/meta e o `pt-20`. Vira componente puro de "mapa + painel", recebe `event` por prop. Toda a parte de cabeçalho do evento já é responsabilidade do `EventMapPage`.
- `SeatMapRenderer`: envelopar SVG em wrapper com `transform: scale()` controlado por estado `zoom` (50%–200%, passo 10%). Expor handlers via props (`zoom`, `onZoomIn`, `onZoomOut`, `onFit`) para o header da page controlar. Botão fullscreen usa `document.documentElement.requestFullscreen()`.
- Detalhe: o sticky `Voltar` antigo do `EventMapPage` (top-20 left-4) sai.

---

## Problema 4 — Modal de detalhes da mesa (regressão crítica)

**Arquivos:** novo `src/components/seated/SeatDetailModal.tsx`, edit `EventDetailsSeated.tsx`, edit `SelectionPanel.tsx`.

- Clique em seat `available`/`selected-mine` deixa de toggar `localSelection` diretamente. Em vez disso, abre `<SeatDetailModal seat={...} />`.
- Modal (shadcn `Dialog`):
  - Header: `M01 · {seat.label}` + tipo de mesa.
  - Capacidade base: "Inclui X pessoas" (de `base_capacity`).
  - Stepper "Pessoas adicionais" 0 → (`max_capacity - base_capacity`), com label "+R$ Y por pessoa".
  - Resumo: linha "Mesa (X pessoas) R$ base", "+N extras R$ N*extra", "Taxa de conveniência" (puxar do `useEventFees` se aplicável aqui — confirmar; senão omitir nesta etapa), "Total".
  - Botões: `Adicionar` (adiciona à `localSelection` + grava `pendingAddons[seatId]` no estado do pai, fecha modal), `Reservar Mesa` (adiciona + dispara `handleContinue` imediato).
  - Se seat já está em `localSelection`: botão vira `Atualizar` + `Remover`.
- Estado novo no `EventDetailsSeated`: `pendingAddons: Record<seatId, number>` para guardar addons antes do hold. Quando `handleContinue` chama `holdSelected(ids)` com sucesso, copia para `useSeatHold` via `setSeatAddon(id, qty)` para cada um (já existente na B2; persiste em `festpag:hold:${eventId}.addons`).
- `SelectionPanel`: continua igual no modo `heldMode` (stepper visível após reservar — já funciona). No modo pré-hold, agora mostra resumo "M01 (4+2 pessoas) — R$ 180,00" sem stepper, porque addons já foram setados no modal.
- Validação client-side de `addons_exceed_max` continua sendo backstop do servidor; modal já bloqueia stepper no limite.

---

## Verificações pós-fix

- `rg -n "useSeatHold|markProceeding|clearLocalHold" src/` deve listar: `useSeatHold.ts`, `EventDetailsSeated.tsx`, `SeatCheckout.tsx` (todos preservados).
- `bunx tsc --noEmit` limpo.
- Screenshots: viewport 380×740 e 1280×800 em `/evento/:slug` e `/evento/:slug/mapa`, antes/depois do modal aberto.
- Clicar em mesa abre modal; confirmar; `Continuar`; checar `sessionStorage.festpag:hold:{eventId}` tem `addons`.

---

## Fora de escopo

- Editor de `mesa_reserva_description` no wizard (Fase 12).
- Pan/drag do mapa (só zoom in/out + fit/fullscreen agora).
- Mudar `hold_seats` / addons no checkout.
- Taxa de conveniência no modal — se for trivial puxar do hook existente, incluo; senão deixo `Total = base + extras` e a taxa aparece no checkout como hoje.

## Pergunta antes de implementar

1. Confirmar que posso adicionar a coluna `events.mesa_reserva_description` agora **sem** já adicionar o campo no editor de evento (fica só fallback até a Fase 12). Ou prefere que o editor entre nesta mesma rodada?
2. Taxa de conveniência no modal de mesa: incluo agora (puxando de `useEventFees`) ou deixo só na tela de checkout?
