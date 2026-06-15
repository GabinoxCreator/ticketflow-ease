### Corrigir visualização do mapa de mesas no desktop (EventDetailsSeated)

### Problema
No desktop, o mapa publicado de mesas (`EventDetailsSeated`) não exibe completamente: fica cortado pela metade e não é possível arrastar/pan. No mobile o layout empilhado funciona corretamente.

### Causa raiz
O grid do desktop usa `lg:grid-cols-[1fr_360px]` mas não define `grid-template-rows`. Sem uma linha explícita, a altura da linha fica `auto`, e um filho com `h-full` dentro de `auto` colapsa — o container do SVG fica menor que o esperado, e `preserveAspectRatio="meet"` corta a visualização.

### Mudança
Arquivo: `src/pages/EventDetailsSeated.tsx` (apenas classes CSS, zero lógica alterada)

1. Adicionar `lg:grid-rows-[minmax(0,1fr)]` ao grid raiz (linha 120) para forçar a linha desktop a ocupar toda a altura disponível sem estourar o container pai.
2. Adicionar `min-h-0` ao flex container da coluna do mapa (linha 121) para permitir que ele encolha corretamente dentro do grid.
3. Adicionar `min-h-0` ao `<aside>` do painel direito (linha 147) para consistência no grid e evitar overflow indesejado.

Nenhuma alteração em `SeatMapRenderer`, zoom, pan, ou outro componente. O renderer já se adapta quando recebe um container com altura bem definida.

### Como validar
- Abrir a página de um evento com mapa de mesas no desktop.
- Confirmar que o mapa ocupa a altura total da área visível.
- Confirmar que o pan/drag funciona normalmente.
- Verificar que o mobile continua funcionando como antes.