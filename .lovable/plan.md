# Fase 11 — Página pública do evento estilo Made in Brazil Bar

## Objetivo

Refazer `/evento/:id` numa única página linear (sem sidebar sticky desktop, sem split-hero), válida para os 3 tipos de evento (`ingresso`, `mesa`, `hibrido`). O mapa de mesas deixa de ser embutido — vira página separada acessada por botão "Ver Mapa de Mesas".

## Estrutura final da página (ordem fixa, mobile-first, replica em desktop)

```text
┌─────────────────────────────────────────┐
│ Header (existente)                      │
├─────────────────────────────────────────┤
│ [Banner: image_url, full-width]         │  ← object-cover, aspect 16/9 desktop, 4/5 mobile
│   ❤ likes (overlay canto inferior)      │
├─────────────────────────────────────────┤
│ Título grande                           │
│ Data formatada · Hora                   │
│ Venue (negrito) · cidade/UF             │
│ 📍 endereço completo                    │
├─────────────────────────────────────────┤
│ "A partir de R$ XX,XX"   [Compartilhar] │  ← faixa horizontal
├─────────────────────────────────────────┤
│ ┌─ Reserve sua Mesa ─────────────────┐ │  ← APENAS se mesa|hibrido c/ table_map_id
│ │ Escolha sua mesa no mapa           │ │
│ │ Setores: Mesas · Bistrôs           │ │  ← chips com contagem disponível
│ │ A partir de R$ XX                  │ │
│ │ [Ver Mapa de Mesas →]              │ │  ← Link para /evento/:slug/mapa
│ └────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ ┌─ Ingressos ────────────────────────┐ │  ← APENAS se ingresso|hibrido c/ lots ativos
│ │ Agrupado por sector_name           │ │  ← reaproveita LotCard atual
│ │ [- 0 +] por lote                   │ │
│ └────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ Sobre o evento (descrição)              │
├─────────────────────────────────────────┤
│ Realização (produtora)                  │
├─────────────────────────────────────────┤
│ Políticas do Evento (acordeão)          │  ← NOVO: meia/cancelamento/idade
├─────────────────────────────────────────┤
│ Footer + Bottom bar mobile (carrinho)   │
└─────────────────────────────────────────┘
```

## Mudanças em código

### 1. Substituir branch `hasMap` em `EventDetails.tsx`
- **Remover** o `return <EventDetailsSeated event={event} />` (linhas 152–158).
- `EventDetailsSeated.tsx` **não é apagado** — passa a ser usado APENAS pela nova rota `/evento/:slug/mapa` (Passo 4).
- A página única passa a renderizar TODOS os blocos, condicionando `<MesaCTA>` por `hasMap` e `<IngressosSection>` por `activeLots.length > 0`.

### 2. Novo componente `<MesaReservaCTA>` em `src/components/event/MesaReservaCTA.tsx`
Props: `event`, `tableMapId`. Internamente faz query leve em `event_seats` (count por `seat_type` agrupado, disponíveis = status `available`) e mostra:
- Lista de setores derivada de `seat_types` do mapa (Mesa Padrão, Bistrô) com contagem `X disponíveis de Y`.
- "A partir de R$ XX" (menor `base_price` entre `seat_types` do mapa).
- Botão `Link to={`/evento/${slug ?? id}/mapa`}` variant hero.
- Se 0 disponíveis em todos: badge "Esgotado" e botão desabilitado.

### 3. Nova rota dedicada `/evento/:id/mapa`
- Em `App.tsx`: `<Route path="/evento/:id/mapa" element={<EventMapPage />} />` (acima da rota `/evento/:id`).
- Novo arquivo `src/pages/EventMapPage.tsx`: chama `useEvent(slugOrId)`, valida `hasMap`, e renderiza `<EventDetailsSeated event={event} />` (que já contém todo o fluxo de seleção/hold/checkout).
- Se evento não for `mesa|hibrido` ou faltar `table_map_id`: redireciona para `/evento/:id`.
- Adicionar breadcrumb/back: header com `< Voltar para o evento`.

### 4. Faixa "A partir de + Compartilhar"
- Novo componente `<PriceAndShareBar>` em `src/components/event/PriceAndShareBar.tsx`.
- Preço: menor entre lots ativos + (se mesa) menor `seat_type.base_price`.
- Botão Compartilhar: `navigator.share` com fallback para copiar link (toast).

### 5. Bloco "Políticas do Evento"
- Componente `<EventPolicies>` em `src/components/event/EventPolicies.tsx`.
- Acordeão (shadcn) com itens fixos por enquanto (textos genéricos): Meia-entrada · Cancelamento · Política de idade · Acesso ao local.
- Conteúdo hardcoded nesta fase. Campo customizável fica para fase futura.

### 6. Limpeza/reuso
- LotCard interno em `EventDetails.tsx` → extrair para `src/components/event/LotCard.tsx` (mesma lógica, sem mudança visual).
- Remover sidebar desktop "Resumo" (linhas 500–560): o fluxo de checkout passa a usar **apenas** a barra fixa mobile, agora visível também em desktop quando `totalTickets > 0` (full-width, sticky bottom).
- Remover o split-hero desktop (linhas 280–343): banner único para os dois breakpoints.

## Detalhes técnicos

- **Rota do mapa antes da rota do evento**: React Router v6 casa por ordem; `/evento/:id/mapa` precisa vir antes de `/evento/:id`, senão `:id` captura "mapa".
- **`useEvent`**: já busca por slug/uuid, sem alteração.
- **`useSeatHold`**: continua usado APENAS dentro de `EventDetailsSeated` (que agora vive em `/evento/:id/mapa`). O hold persiste em `sessionStorage` por `eventId`, então se o usuário voltar pra `/evento/:id` e clicar de novo em "Ver Mapa", o hold é rehidratado normalmente.
- **Preço "a partir de"**: calcular no parent (`EventDetails`) para evitar 2 queries duplicadas; passar via prop pro `<MesaReservaCTA>` e `<PriceAndShareBar>`.
- **Contagem de disponíveis por seat_type**: nova query leve em `useEventSeats` ou novo hook `useEventSeatAvailability(eventId)` que retorna `{ seatTypeName, available, total, basePrice }[]`. Decisão: hook novo, evita reaproveitar payload pesado de `useEventSeats` que carrega 80 linhas.
- **SEO**: manter `<Helmet>` igual. Adicionar `<link rel="alternate">` em `/evento/:id` apontando pra `/evento/:id/mapa` quando aplicável.
- **Tracking**: `trackPageView` e `trackViewContent` permanecem em `EventDetails`. Na rota `/mapa`, replicar com `content_type: 'product_group'` para não duplicar conversão.

## Fora de escopo (não fazer agora)
- Editor visual de "Políticas" (campo no evento).
- Animações novas do hero.
- Mudanças no checkout/CheckoutModal.
- Refazer `EventDetailsSeated` visual — só vira página standalone com um header de voltar.
- Fase 12 (wizard criar evento) e Fase 10 (entrega parcial).

## Arquivos a criar
- `src/pages/EventMapPage.tsx`
- `src/components/event/MesaReservaCTA.tsx`
- `src/components/event/PriceAndShareBar.tsx`
- `src/components/event/EventPolicies.tsx`
- `src/components/event/LotCard.tsx`
- `src/hooks/useEventSeatAvailability.ts`

## Arquivos a editar
- `src/pages/EventDetails.tsx` — refatoração grande (remoção branch, nova composição, remoção sidebar/split-hero).
- `src/App.tsx` — adicionar rota `/evento/:id/mapa` ANTES de `/evento/:id`.
- `src/pages/EventDetailsSeated.tsx` — adicionar header com "Voltar para o evento" e remover duplicação de título/data/hora (que agora vive no /evento/:id).
