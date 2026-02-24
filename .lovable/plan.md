

# Corrigir Eventos Passados, Filtros e Página Pública

## 1. Atualizar eventos passados no banco de dados

Existem 6 eventos com data anterior a hoje que ainda estão com `status: 'published'`. Vou atualizar todos para `status: 'finished'` usando uma query direta.

**Eventos afetados:**
- MADE IN (14/02/2026)
- opps (20/12/2025)
- O Povo Pede Samba (14/12/2025) x3
- MADE IN BRAZIL FESTA (13/12/2025)

## 2. Filtrar eventos passados no feed público

**Arquivo: `src/hooks/useEvents.ts` (usePublicEvents)**

A query atual busca todos os eventos com `status: 'published'`, sem filtrar por data. Vou adicionar um filtro `.gte('date', today)` para que eventos com data passada nunca apareçam no feed, mesmo que o status não tenha sido atualizado manualmente.

## 3. Bloquear página pública de eventos finalizados

**Arquivo: `src/pages/EventDetails.tsx`**

Quando o evento tiver status `finished` ou data anterior a hoje:
- Exibir um banner "Evento Encerrado" no topo
- Esconder a seção de ingressos (não mostrar os lotes para compra)
- Desabilitar o botão de compra
- Manter as informações do evento visíveis (apenas leitura)

## 4. Corrigir espaçamento dos filtros (tabs) no mobile

**Arquivo: `src/pages/DashboardEventos.tsx`**

Remover `w-full` do `TabsList` e usar `grid grid-cols-4` para distribuir os botões uniformemente. Isso resolve o espaçamento irregular visível no screenshot.

## Detalhes Técnicos

### Banco de dados
```sql
UPDATE events SET status = 'finished' WHERE status = 'published' AND date < '2026-02-24';
```

### usePublicEvents (useEvents.ts)
- Adicionar filtro de data: `.gte('date', new Date().toISOString().split('T')[0])`

### EventDetails.tsx
- Verificar `event.status === 'finished'` ou `new Date(event.date) < new Date()`
- Se verdadeiro: mostrar badge "Evento Encerrado", esconder seção de lotes, desabilitar compra

### DashboardEventos.tsx
- `TabsList`: trocar `w-full overflow-x-auto` por `grid grid-cols-4 w-full`
- `TabsTrigger`: adicionar `text-xs sm:text-sm` para texto menor no mobile

