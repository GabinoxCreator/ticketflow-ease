
# Corrigir Espaçamento das Tabs e Aumentar Ícones no Dashboard do Evento

## Problema

Na página do dashboard do evento, as tabs (Visão Geral, Dados, Lotes, Pedidos, Participantes, Listas) estão com espaçamento irregular e os ícones estão pequenos demais para fácil visualização no mobile.

## Solução

**Arquivo: `src/pages/EventDashboard.tsx`**

1. Trocar a classe do `TabsList` de `w-full justify-start mb-6 overflow-x-auto` para `grid grid-cols-6 w-full mb-6` -- distribui as 6 tabs uniformemente
2. Aumentar os ícones de `h-4 w-4` para `h-5 w-5` para melhor visualização
3. Adicionar `text-xs sm:text-sm` nos `TabsTrigger` para texto responsivo
