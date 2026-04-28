# Premium Redesign — Meus Eventos

Aplicar a mesma linguagem visual premium (gradientes Indigo→Magenta, blur, glows, bordas `primary/10`) já usada na Visão Geral, agora na lista de eventos. Hoje os cards são planos, sem hierarquia visual, sem métricas e a página inteira parece "vazia". Vamos elevar o nível mantendo funcionalidade.

## O que muda visualmente

### 1. Header da página (`DashboardEventos.tsx`)
- Título "Meus Eventos" com gradiente (Indigo → Magenta), igual ao "Visão Geral".
- Subtítulo mais sutil + chip mostrando total de eventos ativos.
- Botão "Criar Evento" com glow primário (sombra `shadow-primary/30`) e ícone destacado.
- Wrapper geral com fundo radial sutil (`bg-gradient-to-br from-primary/5 via-transparent to-accent/5`) atrás do header.

### 2. Barra de busca + filtros
- Input de busca com `bg-card/50 backdrop-blur border-primary/10`, ícone destacado, focus ring em `primary/40`.
- Tabs reformuladas: pílulas com fundo `bg-card/40 border border-primary/10`, tab ativa com gradiente sutil (`bg-gradient-to-r from-primary/20 to-accent/20`) e contador em badge separado (Ativos `[3]`).
- Layout responsivo: busca + tabs ficam alinhados horizontalmente em desktop, empilhados em mobile.

### 3. Cards de evento (`EventListItem.tsx`) — refatoração principal
Hoje é um card chapado em row. Vai virar um card "premium" com:

- Container: `bg-card/40 backdrop-blur border border-primary/10 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 transition-all`.
- Imagem (lado esquerdo desktop / topo mobile):
  - `aspect-video md:aspect-square md:w-56`, `object-cover`, `rounded-l-xl`.
  - Overlay gradiente bottom→top sobre a imagem para legibilidade.
  - Badge de status flutuando sobre a imagem (canto sup. esquerdo) com cores próprias:
    - Publicado: `bg-emerald-500/90` com glow.
    - Rascunho: `bg-amber-500/90`.
    - Finalizado: `bg-muted/80`.
    - Cancelado: `bg-destructive/90`.
  - Badge "🔥 Em Alta" sobreposta no canto sup. direito quando aplicável.
  - Placeholder com gradiente Indigo→Magenta + ícone calendário quando não há imagem.
- Conteúdo (direita):
  - Título maior (`text-xl font-bold`) com `truncate`.
  - Linha de meta com ícones em cor `primary`: data formatada + horário, separador `·`, venue + cidade.
  - Mini-stats inline (3 chips pequenas): "Vendidos: X/Y", "Receita: R$ X", "Lotes: N". Vamos buscar via `event_lots` (já disponível no `usePublicEvents` pattern) para os eventos do produtor — adicionar inclusão de lots no `useEvents` query (`event_lots(total_quantity, sold_quantity, price)`).
  - Footer do card: data de criação à esquerda em `text-xs text-muted-foreground`, ações rápidas à direita.
- Ações: substituir o dropdown único por:
  - Botões inline visíveis: "Visualizar" (ghost) e "Editar" (outline com `border-primary/30`).
  - DropdownMenu com `MoreVertical` apenas para Duplicar e Excluir.
- Card inteiro continua clicável (navega para `/produtor/eventos/:id`), com `stopPropagation` nos botões.

### 4. Empty states
- Card grande centralizado com:
  - Ícone calendário em círculo `bg-primary/10 border border-primary/20` com glow.
  - Título "Nenhum evento por aqui ainda" + subtítulo contextual por aba.
  - Botão CTA "Criar meu primeiro evento" com gradiente primário.
- Estado de busca vazia: ícone `Search`, mensagem específica e botão "Limpar busca".

### 5. Loading skeletons
- Trocar `Skeleton` simples por skeletons que imitem o novo card (imagem + linhas), com efeito de shimmer já existente no projeto.

## Mudanças técnicas (resumo)

- `src/hooks/useEvents.ts`:
  - Estender o `select` da query principal para incluir `event_lots(id, price, total_quantity, sold_quantity)`.
  - Tipar `Event` com campo opcional `event_lots?: Array<{...}>`.
  - Helpers internos no hook ou no componente para calcular `sold`, `capacity`, `revenue` por evento.
- `src/components/producer/EventListItem.tsx`: reescrita conforme acima, mantendo props (`event`, `onDelete`, `onDuplicate`).
- `src/pages/DashboardEventos.tsx`:
  - Novo header gradiente + chip de contagem.
  - Reestilização de busca e tabs.
  - Novo empty state component (inline).
  - Novo skeleton component (inline) refletindo o card.
- Sem mudanças de banco, sem mudanças de rotas, sem mudanças de RLS.

## Fora do escopo
- Não vamos mexer em criação/edição de eventos.
- Não vamos adicionar gráficos por evento na lista (isso já existe no detalhe do evento).
- Não vamos alterar o sidebar nem o `ProducerLayout`.