
# Corrigir Centralização da Página "Meus Eventos" no Mobile

## Problema

No mobile, o conteúdo da página "Meus Eventos" está deslocado para a esquerda, com elementos (botão "Criar Evento", campo de busca, abas) ultrapassando a largura da tela. Isso acontece porque o layout flex do `SidebarInset` não restringe o overflow dos filhos.

## Solução

Adicionar restrições de overflow em dois pontos:

### 1. `ProducerLayout.tsx`
- Adicionar `min-w-0` no `SidebarInset` para que o flex item respeite os limites do container
- Adicionar `overflow-hidden` no `<main>` para evitar que o conteúdo extrapole a tela

### 2. `DashboardEventos.tsx`
- Adicionar `overflow-hidden` no container principal (`div.space-y-6`) para garantir que todos os elementos internos fiquem contidos
- Fazer a `TabsList` ter scroll horizontal com `overflow-x-auto` para caber no mobile sem quebrar o layout

## Detalhes Técnicos

**Arquivo: `src/components/producer/ProducerLayout.tsx`**
- Linha 45: `SidebarInset` recebe `className="flex-1 min-w-0"`
- Linha 70: `<main>` recebe `className="flex-1 p-6 overflow-hidden"`

**Arquivo: `src/pages/DashboardEventos.tsx`**
- Linha 104: container principal recebe `overflow-hidden`
- Linha 132: `TabsList` recebe `w-full overflow-x-auto`
