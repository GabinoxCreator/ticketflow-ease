

# Corrigir data no header do dashboard do produtor

## Problema

O arquivo `src/components/producer/EventDashboardHeader.tsx` linha 18 ainda usa `new Date(event.date)` sem o sufixo `T12:00:00`, causando o mesmo bug de timezone que já foi corrigido nos outros arquivos.

## Correção

**`src/components/producer/EventDashboardHeader.tsx`** (linha 18):
- Alterar `new Date(event.date)` para `new Date(event.date + 'T12:00:00')`

Este é o único arquivo restante com o bug. A página do evento (`EventDetails.tsx`) já foi corrigida na última edição.

