## Bug: lista pública aparece "expirada" no dia do evento

**Causa:** Em `src/pages/GuestListPublicForm.tsx`, dentro de `isListValid()`:

```ts
const eventDate = new Date(listData.event.date); // "2026-05-24"
```

`new Date("2026-05-24")` é interpretado como **UTC meia-noite**, que no Brasil (UTC-3) vira **23/05 às 21:00**. Resultado:
- `eventDate.toDateString()` → "Sat May 23 2026"
- `now.toDateString()` → "Sun May 24 2026"
- Não bate como "hoje", e `eventDate > now` também falha → retorna `false` → tela mostra "O prazo para inscrição expirou", mesmo com o evento sendo hoje e o `valid_until_time` (23:00) ainda no futuro.

Esse é exatamente o padrão de bug já registrado na memória do projeto: strings `YYYY-MM-DD` precisam de `T12:00:00` antes de virar `Date`.

### Correção

**`src/pages/GuestListPublicForm.tsx` — função `isListValid()`**

Trocar:
```ts
const eventDate = new Date(listData.event.date);
```
por:
```ts
const eventDate = new Date(`${listData.event.date}T12:00:00`);
```

Isso resolve tanto a comparação "é hoje?" quanto a "evento no futuro?".

### Fora de escopo
- Não muda schema, edge function (`public-guest-list-signup`), nem a tela do produtor.
- Não altera a renderização da data no card (já usa `new Date(date)` só para `format()` — pode causar deslocamento de 1 dia exibido também, mas como o usuário não reportou isso, mantenho fora; se quiser, faço numa próxima.).
