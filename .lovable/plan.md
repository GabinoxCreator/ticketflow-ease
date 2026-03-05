

# Corrigir Inconsistência de Data dos Eventos

## Problema

O evento está salvo no banco como `2026-03-08`. Quando o JavaScript faz `new Date("2026-03-08")`, ele interpreta como **meia-noite UTC**, que no fuso horário do Brasil (UTC-3) vira **7 de março às 21h**. Por isso, `toLocaleDateString('pt-BR')` exibe "07 de março" em vez de "08 de março".

## Solução

Adicionar `T12:00:00` ao parsear datas que vêm como `yyyy-MM-dd` do banco, evitando que o offset de fuso horário mude o dia.

### Arquivos afetados

1. **`src/pages/EventDetails.tsx`** (linha 128): `formatDate` faz `new Date(dateString)` — corrigir para `new Date(dateString + 'T12:00:00')`

2. **`src/components/EventCard.tsx`** (linhas 26 e 82): Dois lugares onde `new Date(dateString)` é usado para formatar a data — mesma correção

3. **`src/components/producer/tabs/EventDataTab.tsx`** (linha 28): Usa `new Date(event.date)` com `format()` do date-fns — mesma correção

4. **`src/pages/colaborador/ColaboradorDashboard.tsx`** (linha 29): `new Date(dateStr)` no `formatDate` — mesma correção

5. **`src/pages/EventDetails.tsx`** (linha 124): `new Date(event.date + 'T23:59:59')` para checar evento encerrado — este já está correto

6. **`src/hooks/useEvents.ts`** (linha 155): `usePublicEvents` usa `new Date().toISOString().split('T')[0]` para filtro de data no banco — está correto pois compara strings no banco

A correção é simples e pontual: em todo lugar que faz `new Date(dateOnlyString)` para **exibição**, adicionar `T12:00:00` para garantir que o dia não mude com o fuso horário.

