## Trocar "Ver mapa" por visão de reservas

O modal atual carrega o snapshot real do venue (SeatMapRenderer + objetos do mapa) e isso não é o que você precisa. Vou substituir por uma **grade ilustrativa** focada só nas mesas reservadas.

### O que muda

Reescrever `src/components/producer/tabs/EventTablesMapModal.tsx` (mesmo nome de componente e botão "Ver mapa", então `EventTablesTab.tsx` não muda):

- **Remove** `SeatMapRenderer`, fetch de `map_snapshot` e `event_seats` cru.
- **Usa só** o hook `useEventTables(eventId)` que já temos (com `seats_sold`, cliente, status).
- **Filtra** para mostrar apenas mesas com reserva: `status === 'sold' || status === 'manual'`.
- Renderiza como **grade de cards ilustrativos** (uma "mesa" por card), com:
  - Código + label da mesa no topo (ex.: "M12 — Mesa Padrão").
  - Ilustração simples: ícone de mesa redonda/quadrada no centro com N cadeirinhas ao redor (SVG inline, gerado a partir de `seats_sold ?? base_capacity`). Cor da mesa = verde (vendida) ou âmbar (manual).
  - Nome do cliente (`customer_name` ou `manual_holder_name`) em destaque.
  - Linha "X de Y cadeiras" (`seats_sold` de `max_capacity`/`base_capacity`).
  - Telefone do responsável quando manual.
- **Header do modal**: contador "X mesas reservadas · Y cadeiras ocupadas", busca por nome/código e filtro Vendidas/Manual/Todas.
- **Empty state**: "Nenhuma mesa reservada ainda."
- Layout: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`, scroll interno.
- Mantém o `Dialog` grande já existente, sem zoom/pan (não é mapa de verdade).

### Não muda

- Botão "Ver mapa" em `EventTablesTab.tsx` continua igual.
- Cards da grade principal continuam mostrando "X de Y cadeiras".
- Bug do fechamento manual (já corrigido na rodada anterior) intacto.
- Nada de RLS, edge functions, schema.

### Arquivo tocado

- `src/components/producer/tabs/EventTablesMapModal.tsx` — reescrito.