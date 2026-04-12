

# Melhorias de UX no Fluxo de Criação de Evento

## Resumo

Ajustes de layout, interação e lógica de validação nas 4 etapas de criação de evento para que cada etapa caiba em uma tela sem scroll, com controles mais intuitivos.

## Mudanças por Etapa

### Etapa 1 — Informações Básicas
- **Remover** o switch "Destacar como Em Alta" (todos eventos aparecem na Home por padrão)
- **Layout compacto**: Header (Voltar + título) e stepper numa faixa superior condensada, campos lado a lado quando possível, imagem menor para caber sem scroll
- Mover o título "Criar Novo Evento" e "Voltar" para uma linha horizontal compacta no topo

### Etapa 2 — Data e Local
- **Data de Fim obrigatória** (não mais opcional), com validação
- **Bloquear horários de fim** anteriores ao horário de início quando a data de fim = data de início
- **Meia-noite (00:00)** é tratada como início do dia (00:00 até 11:59), não como fim
- **Mostrar duração** do evento após selecionar fim (ex: "Duração: 6 horas")
- **Layout horizontal/compacto**: campos em 2 colunas, local/cidade/estado/endereço lado a lado para evitar scroll
- **Cor do calendário**: trocar `day_today` de `bg-accent` (rosa) para uma cor neutra (ex: `ring-1 ring-primary text-foreground`) para o dia atual ficar sutil e não confundir com seleção

### Etapa 3 — Ingressos
- **Nome do setor**: renomear padrão de "Ingresso" para "Ingressos", exibir label "Setor atual: Ingressos" com botão de edição visível e claro
- **Período de Vendas**: trocar Select por **botões toggle** (Publicar agora | Agendar | Após encerrar) — último só aparece a partir do 2o ingresso
- **"Após encerrar ingresso"**: mostrar cards clicáveis dos outros ingressos ao invés de select dropdown
- **Data de fim de vendas**: marcar como "(opcional)", usar Popover+Calendar + TimeSelect ao invés de `input type=datetime-local`; validar que data > data início de vendas/hoje
- **Ingresso em Grupo**: substituir input numérico por **botões de 2 a 8** selecionáveis
- **Escassez Fictícia**: unificar slider e preview em uma **única barra interativa** (arrastar a barra já é o preview)
- **Layout compacto** para caber sem scroll

### Etapa 4 — Revisão
- **Layout em grid compacto**: imagem menor (h-32), dados em 3-4 colunas, ingressos em lista condensada, botões visíveis sem scroll

### Layout Global (todas as etapas)
- Container `max-w-4xl` ao invés de `max-w-3xl` para mais espaço horizontal
- Stepper integrado no topo junto com o título, economizando espaço vertical
- Botões de navegação (Anterior/Próximo) fixos na parte inferior do card ou logo abaixo sem margin grande
- Reduzir `mb-8` entre seções para `mb-4`

## Lógica de Negócio
- Todos os eventos aparecem na Home (remover campo `is_hot` do form, setar `true` por padrão no submit)
- End date/time obrigatórios na validação da etapa 2
- Filtrar timeOptions do horário de fim baseado na data selecionada vs data de início

## Arquivos Impactados

| Arquivo | Mudança |
|---|---|
| `src/pages/CriarEvento.tsx` | Reescrita de layout, lógica de validação, novos controles |
| `src/components/ui/calendar.tsx` | Ajustar cor do `day_today` |

Nenhuma migração SQL necessária. Nenhum hook alterado.

