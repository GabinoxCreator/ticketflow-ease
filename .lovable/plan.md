## Fix: erro "Edge Function returned non-2xx" ao entrar na lista pública

### Causa
Bug de fuso UTC-3 ao parsear a data do evento (`YYYY-MM-DD`) sem o sufixo `T12:00:00`. Em UTC-3 a data desliza um dia para trás, e a Edge Function `public-guest-list-signup` conclui que "o evento já passou" → retorna `400`. O mesmo bug faz o card exibir o dia anterior ao real.

### Correção

**`supabase/functions/public-guest-list-signup/index.ts`** (linha 56)
- Trocar `new Date(eventData.date)` por `new Date(\`${eventData.date}T12:00:00-03:00\`)` para fixar a data no fuso de São Paulo e evitar o shift.

**`src/pages/GuestListPublicForm.tsx`**
- Linha 214 e linha 258: `new Date(listData.event.date)` → `new Date(\`${listData.event.date}T12:00:00\`)` para que o card mostre a data correta.
- Linha 150 já está correta (`T12:00:00`), manter.

### Sem mudanças
- Sem alteração de schema, RLS, fluxo de inscrição ou lógica de rate limit. Só o parsing de data.
