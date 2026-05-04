## Problema

Ao classificar "Próximos" vs "Anteriores", o sistema usa só `event.date` em vários lugares — então qualquer evento cujo dia seja hoje (ex.: Festa na ST, 04/05 17:00–23:00) já cai como "passado" desde o início do dia. Isso afeta tanto os ingressos do cliente quanto a listagem de eventos do produtor (e o badge "Encerrado" no header).

Já corrigi `src/hooks/useUserTickets.ts`. Faltam os outros pontos.

## Mudanças

**`src/hooks/useEvents.ts`** (linhas 155–156)
Substituir o filtro por `getEventEndDate(e)`:
- Se `end_date` existe → fim = `end_date + (end_time || 23:59)`.
- Senão → fim = `date + time + 6h` (buffer padrão).
- `activeEvents` = published e fim ≥ agora.
- `pastEvents` = `finished` OU (não-draft e fim < agora).

**`src/components/producer/EventDashboardHeader.tsx`** (linhas 19–21)
Trocar `isPast(eventDate)` (que usa só a data) pela mesma função `getEventEndDate(event)`, para o badge "Encerrado" só aparecer após o fim real.

**`src/pages/EventDetails.tsx`** (linha 129)
Trocar `new Date(event.date + 'T23:59:59') < new Date()` por cálculo equivalente baseado em `end_date/end_time` (com fallback `date + time + 6h`).

**`src/pages/colaborador/ColaboradorEventos.tsx`** (linhas 25–37)
Atualmente usa `isAfter(parseISO(date), today)`. Trocar para a mesma lógica de fim de evento (passados = fim < agora; próximos = caso contrário).

### Resultado
Ingressos e eventos só são marcados como "anteriores"/"encerrados" depois que o evento de fato termina. Cobre cliente, produtor e colaborador de forma consistente.