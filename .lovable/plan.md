

# Reestruturação do Fluxo de Criação de Evento

## Resumo

Reformular as 4 etapas de criação de evento, adicionar ingressos inline, remover campos desnecessários, e alinhar a edição de evento com a mesma estrutura. Remover barra de escassez do nível de evento (fica só no ingresso).

## Mudanças nas Etapas

### Etapa 1 — Informações Básicas (simplificada)
- **Remover**: campo Categoria, campo Descrição Curta
- **Manter**: Título do Evento, Descrição Completa
- **Mover para cá**: Upload de imagem (vem da antiga etapa 3)
- **Mover para cá**: Switch "Em Alta"

### Etapa 2 — Data e Local (melhorada)
- **Data de início** + **Data de fim** do evento (dois datepickers separados)
- **Horário de início** + **Horário de fim**: seletor customizado (Select) com intervalos de 15 minutos (00:00, 00:15, 00:30, 00:45... até 23:45)
- **Local/Estabelecimento**: campo de texto manual
- **Endereço**: campo de texto manual (cidade, estado, rua — tudo num campo só ou separados como hoje)
- Manter campos cidade e estado separados por enquanto (sem Google Maps)

### Etapa 3 — Ingressos (nova, substitui antiga etapa de Imagem)
- Interface inline inspirada no print 5 do usuário
- Cada ingresso/lote aparece como card expandido com:
  - **Nome do setor** editável no cabeçalho (padrão "Ingresso", pode mudar para "Pista", "VIP", etc.)
  - Nome do ingresso (ex: "1o Lote", "Antecipado")
  - Descrição (opcional)
  - Preco (R$)
  - Quantidade disponível
  - **Período de vendas**: 3 opções — "Agora", "Agendar" (mostra datepicker de início), "Após encerrar ingresso" (mostra select dos outros ingressos)
  - **Data de fim** do ingresso (opcional, com botão "+ Adicionar horário de fim")
  - **Ingresso em Grupo**: switch — se ativado, campo para quantidade de ingressos por compra
  - **Escassez Fictícia**: switch + slider de porcentagem (movida do nível de evento para cá)
- Botão "+ Adicionar Ingresso" para criar mais lotes
- Permitir criar evento sem ingressos (opcional), mas mostrar aviso

### Etapa 4 — Revisão
- Mostrar resumo de todas as informações
- Mostrar ingressos criados com detalhes
- Botões: "Salvar Rascunho" e "Publicar Evento"

## Migração de Banco de Dados

1. Adicionar colunas `end_date` (date) e `end_time` (time) na tabela `events`
2. Tornar `category` nullable com default `'Outros'` (para não quebrar registros existentes)
3. Adicionar colunas `sector_name` (text, default 'Ingresso'), `group_ticket_enabled` (boolean, default false), `group_ticket_quantity` (integer, default 2), `sales_start_type` (text, default 'now'), `starts_after_lot_id` (uuid, nullable) na tabela `event_lots`

## Alterações na Edição de Evento (`EditarEvento.tsx`)

- Remover card "Barra de Escassez (Marketing)" do nível de evento
- Remover campos `fake_scarcity_enabled`/`fake_scarcity_percentage` do form do evento
- Remover campo Categoria e Descrição Curta
- Adicionar campos end_date e end_time
- Substituir input de horário manual por seletor de 15 em 15 minutos
- A aba "Lotes" já existe e continua funcionando — atualizar o `LotManager` para incluir os novos campos

## Arquivos Impactados

| Arquivo | Mudança |
|---|---|
| Migração SQL | Novas colunas em `events` e `event_lots` |
| `src/pages/CriarEvento.tsx` | Reescrita completa das 4 etapas |
| `src/pages/EditarEvento.tsx` | Remover escassez do evento, remover categoria/desc curta, adicionar end_date/end_time, seletor horário |
| `src/components/producer/LotManager.tsx` | Adicionar sector_name, grupo, período de vendas, escassez por lote |
| `src/hooks/useEvents.ts` | Atualizar interfaces `Event` e `EventFormData` |
| `src/hooks/useEventLots.ts` | Atualizar interfaces `EventLot` e `LotFormData` |
| `src/components/producer/TimeSelect.tsx` | Novo componente de seletor de horário (15 em 15 min) |

## Componente Novo: TimeSelect

Select com opções de 00:00 a 23:45, em intervalos de 15 minutos. Reutilizado em CriarEvento, EditarEvento e no período de vendas dos ingressos.

## Plano de Execução

1. Migração SQL (novas colunas)
2. Criar componente `TimeSelect`
3. Reescrever `CriarEvento.tsx` com as 4 novas etapas
4. Atualizar `LotManager.tsx` com novos campos inline
5. Atualizar `EditarEvento.tsx` (remover escassez, alinhar campos)
6. Atualizar hooks (`useEvents.ts`, `useEventLots.ts`)

