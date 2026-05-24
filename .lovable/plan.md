## Botão "Esgotar" no card do ingresso

### O que muda

No card de cada ingresso (lote) na aba **Ingressos** do dashboard do produtor, além do botão de editar/excluir, adicionar um botão para **marcar como Esgotado** manualmente. Ao ativar:

- O card do produtor mostra a tag "Esgotado" e o botão vira "Reativar vendas".
- Na página pública do evento, o lote aparece com badge **Esgotado** e o seletor de quantidade é desabilitado.
- O backend bloqueia novas reservas desse lote (mesmo se ainda houver estoque), evitando vendas acidentais.

Sem novo modal: clique único alterna o estado, com `toast` de confirmação.

### Banco de dados

Adicionar coluna `manually_sold_out boolean NOT NULL DEFAULT false` em `public.event_lots`.

Atualizar a função `reserve_lot_quantity` para também exigir `manually_sold_out = false` — assim o checkout/colaborador não conseguem reservar um lote esgotado manualmente.

### Frontend

- `src/hooks/useEventLots.ts`: incluir `manually_sold_out` em `EventLot` e em `LotFormData`.
- `src/components/producer/LotManager.tsx` (card do lote, ~linha 203-247):
  - Adicionar botão de ícone (ex: `Ban` / `CheckCircle2`) entre editar e excluir.
  - Texto/tooltip: "Marcar como esgotado" ou "Reativar vendas".
  - Ao clicar, chama `onUpdate(lot.id, { manually_sold_out: !lot.manually_sold_out })`.
  - Mostrar badge "Esgotado" no card quando `manually_sold_out` for `true`.
- `src/pages/EventDetails.tsx` (~linha 619): `isSoldOut = available === 0 || lot.manually_sold_out`.
- `src/components/colaborador/ColaboradorVenderModal.tsx`: respeitar `manually_sold_out` ao calcular disponibilidade (mostra "Esgotado").

Sem alteração em RLS, ordens, ingressos já vendidos, ou relatórios — apenas controle visual e bloqueio de novas reservas.
