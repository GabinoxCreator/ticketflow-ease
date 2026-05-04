## Problema

Os ingressos do "Festa na ST" estão aparecendo em **Ingressos Anteriores** mesmo com o evento ainda em andamento. Hoje a lógica em `useUserTickets.ts` considera somente `event.date` (sem horário), então qualquer evento cujo dia seja hoje ou anterior cai como "passado" assim que o relógio passa da meia-noite — ou até antes, dependendo do fuso.

## Solução

Usar a data/hora real de **término** do evento para decidir se ele é "próximo/atual" ou "passado". O ingresso deve permanecer válido enquanto o evento não tiver terminado.

### Regras de fim do evento (em ordem):
1. Se `end_date` e `end_time` existirem → fim = `end_date + end_time`.
2. Se só `end_date` existir → fim = `end_date 23:59`.
3. Caso contrário → fim = `date + time + 6h` (buffer padrão para festas que não definiram término).

Datas serão construídas com sufixo `T...:00` (sem `Z`) para respeitar o fuso local, conforme regra do projeto.

### Mudanças

**`src/hooks/useUserTickets.ts`**
- Incluir `end_date, end_time` no `select` de `event:events(...)`.
- Adicionar `end_date: string | null` e `end_time: string | null` ao tipo `UserTicket['event']`.
- Substituir a comparação atual `new Date(t.event.date) >= new Date()` por uma função `getEventEndDate(event)` que aplica as regras acima.
- `upcomingTickets` = eventos cujo fim ainda não passou. `pastTickets` = fim já passou.

### Resultado esperado
Ingressos do "Festa na ST" (hoje 04/05, 17:00) voltam para a aba **Próximos** e permanecem lá até o fim real do evento. Comportamento se aplica a todos os usuários automaticamente.