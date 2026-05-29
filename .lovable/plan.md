# Agrupar Meus Ingressos por compra

Hoje `/meus-ingressos` renderiza 1 card por ticket (`src/pages/MeusIngressos.tsx:555/573/589` → `<TicketCardSimple>`). Compras com várias unidades (mesa + adicionais) viram N cards soltos. Vou agrupar por `order_id` e mostrar 1 card-resumo por compra, expandindo os tickets individuais inline. Nada de geração/validação/QR/status muda — só apresentação.

## Mudanças

### 1. `src/hooks/useUserTickets.ts`
- Adicionar `order_id: string` ao `UserTicket` e incluí-lo no `.select(...)` do query.
- Resto da lógica (filtros upcoming/past/cancelled por data do evento) permanece intacta.

### 2. `src/pages/MeusIngressos.tsx`
Novo componente local `OrderGroupCard({ tickets })` que recebe N tickets do mesmo `order_id` (todos do mesmo evento, já que orders são por evento).

Função helper `groupByOrder(tickets)`:
- Reduce em `Map<order_id, UserTicket[]>` preservando a ordem original (que já vem por `created_at desc` do hook → cards-resumo ordenados pela compra mais recente, igual hoje).
- Dentro de cada grupo, ordena os tickets por `seat.label ?? ticket_code` (estável) para a expansão.

Renderização por aba — substituir cada `upcomingTickets.map(t => <TicketCardSimple … />)` por:
```
groupByOrder(upcomingTickets).map(group => <OrderGroupCard tickets={group} />)
```
Mesma troca em `past` e `cancelled`. Tabs e contadores no header continuam contando tickets (não grupos) — match com o badge atual.

### 3. `OrderGroupCard` — comportamento

**Caso 1 ingresso (decisão):** renderiza **direto o `<TicketCardSimple>` existente, sem wrapper nem botão de expandir.** Mantém UX atual idêntica pra quem comprou só 1 ingresso (sem clique extra).

**Caso N ingressos:**
- Card-resumo (mesmo visual base do TicketCardSimple — imagem do evento + título + data/hora/local em grid + faixa lateral colorida) mostrando:
  - Imagem + título do evento (clica → vai pro evento)
  - Badge "N ingressos" no topo direito (substitui o badge de status individual, já que vários tickets podem ter status diferentes)
  - Sub-resumo de status: ex. "4 válidos · 2 utilizados" (só os contadores > 0)
  - Data / Horário / Local (mesmos cards de info já usados)
  - Botão **"Ver ingressos (N)"** com chevron — toggleia `expanded` (default `false`)
- Quando `expanded`:
  - Renderiza `tickets.map(t => <TicketCardSimple ticket={t} />)` numa lista indentada (`pl-4 border-l border-border/40`) abaixo do botão.
  - **NÃO altera o `<TicketCardSimple>`** — cada um mantém seu QR, código único, badge Válido/Usado, PDF e botão "Usar Ingresso" individuais.

### 4. Detalhes técnicos
- `expanded` é estado local do `OrderGroupCard` (`useState(false)`).
- Para contadores de status no resumo: `tickets.filter(t => t.status === 'valid').length` etc.
- Não toca em `useUserTickets` além de adicionar `order_id` ao select e ao tipo.
- Não toca em edges, checkout, validação, QR, PDF, TicketCardSimple.
- Não cria abas novas — agrupa dentro das abas existentes (Próximos/Anteriores/Cancelados).

## Validação
- `tsc --noEmit` limpo.
- Screenshots: card-resumo colapsado mostrando "6 ingressos", mesmo card expandido com os 6 TicketCardSimple individuais (cada um com seu QR/PDF/Usar), e compra de 1 ingresso renderizando direto sem botão de expandir.

## Arquivos editados
- `src/hooks/useUserTickets.ts` (adicionar `order_id`)
- `src/pages/MeusIngressos.tsx` (novo `OrderGroupCard` + `groupByOrder` + trocar `.map` nas 3 abas)
