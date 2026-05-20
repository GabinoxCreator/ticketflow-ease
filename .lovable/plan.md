# URL amigável de evento (slug em vez de UUID)

## Objetivo

Trocar URLs públicas como `/evento/61d0b7dc-e789-4f81-b72f-e2567eee995b` por algo como `/evento/lancamento-audiovisual-feliz-no-simples` — usando o nome do evento. Links antigos com UUID continuam funcionando para não quebrar nada já compartilhado/indexado.

## O que muda

### Banco
- Adicionar coluna `slug TEXT UNIQUE` em `public.events`.
- Backfill: gerar slug a partir do `title` para todos os eventos existentes (lowercase, sem acento, espaços/símbolos viram `-`, colisões recebem sufixo curto baseado no id).
- Trigger `BEFORE INSERT/UPDATE` em `events` que: se `slug` veio nulo OU `title` mudou e o usuário não enviou slug manual, regenera o slug e garante unicidade. Eventos publicados ficam estáveis (não regerar slug se já existe).

### Backend / leitura
- Em `useEvent(idOrSlug)` (hook que alimenta `EventDetails`), passar a buscar primeiro por `slug = param`, e se não achar, cair em `id = param`. Garante compatibilidade com URLs UUID antigas.

### Frontend
- Toda navegação pública para `/evento/...` passa a usar `event.slug ?? event.id`:
  - `src/components/EventCard.tsx`
  - `src/components/producer/EventListItem.tsx`
  - `src/components/producer/EventDashboardHeader.tsx`
  - `src/components/producer/tabs/EventDataTab.tsx`
  - `src/components/producer/tabs/EventOverviewTab.tsx`
  - `src/pages/EditarEvento.tsx`
  - `src/pages/MeusIngressos.tsx` (link + share)
  - `src/pages/EventDetails.tsx` (canonical e `og:url`)
- Rota `/evento/:id` continua igual em `App.tsx` — o parâmetro vira "id ou slug".
- Rotas internas de produtor (`/produtor/eventos/:id`) e colaborador (`/colaborador/evento/:id`) **continuam usando UUID** — são backoffice, mudança não agrega valor e dá menos risco.

### Tipos
- Adicionar `slug: string | null` na interface `Event` em `src/hooks/useEvents.ts` e nos hooks que tipam evento. (O `src/integrations/supabase/types.ts` regenera sozinho após a migration.)

## Fora do escopo

- Não vamos criar rotas de redirect 301 (não há servidor próprio; a tabela `events` resolve isso já que o ID antigo continua funcionando).
- Não vamos adicionar UI para editar slug manualmente neste passo — fica automático a partir do título. Posso adicionar depois se quiser.
- Não mexer em rotas de admin, colaborador ou dashboard do produtor.

## Validação manual

- Criar um evento novo → URL pública vira `/evento/<slug-do-titulo>`.
- Editar o título → slug regenera (se ainda for único).
- Acessar URL antiga com UUID → carrega o mesmo evento normalmente.
- Dois eventos com mesmo título → segundo recebe sufixo curto para evitar colisão.
