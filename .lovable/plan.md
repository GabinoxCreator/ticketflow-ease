## Objetivo

Hoje todos os lotes (independentemente do setor) aparecem misturados em um único grid no painel do produtor e em uma única lista "INGRESSOS" na página pública do evento. Vamos passar a **agrupar visualmente por setor**, criando um card separado para cada setor (ex: "Ingresso", "Área VIP"), tanto no painel do produtor quanto na página pública.

O campo `sector_name` já existe no banco e em cada lote — não há mudança de schema, é apenas reorganização visual.

## Mudanças

### 1. Painel do produtor — `src/components/producer/LotManager.tsx`
- Em vez de um único grid `grid-cols-3` com todos os lotes, agrupar `lots` por `sector_name` (fallback: "Ingresso").
- Para cada setor, renderizar **um card-container** com:
  - Cabeçalho do setor: nome do setor + contagem de lotes + botão "Adicionar Lote neste Setor" (pré-preenche `sector_name` no diálogo).
  - Dentro do container, os cards menores de cada lote do setor (mantém o visual atual de cada lote: preço, vendidos, escassez inline, editar/excluir).
- Botão geral "Adicionar Lote" no topo continua existindo (cria lote em setor novo, com campo "Nome do Setor" editável).
- Ordem dos setores: "Ingresso" primeiro (padrão), depois os demais por ordem de criação do primeiro lote do setor.

### 2. Página pública — `src/pages/EventDetails.tsx`
- Substituir o card único "INGRESSOS" por **um card por setor**, empilhados verticalmente.
- Cada card mostra o nome do setor como título (ex: "INGRESSO", "ÁREA VIP") e lista apenas os `LotCard` daquele setor.
- O `Resumo` lateral (desktop) e a barra inferior (mobile) continuam somando todos os setores normalmente.

### 3. Detalhe técnico do agrupamento
```text
const grouped = lots.reduce((acc, lot) => {
  const key = lot.sector_name?.trim() || 'Ingresso';
  (acc[key] ||= []).push(lot);
  return acc;
}, {});
```
Renderizar `Object.entries(grouped)` mantendo "Ingresso" no topo.

## Arquivos afetados
- `src/components/producer/LotManager.tsx` (refatorar render + adicionar handler "adicionar neste setor")
- `src/pages/EventDetails.tsx` (quebrar card único em múltiplos cards por setor)

Sem migração de banco. Sem mudança em hooks ou em checkout — apenas apresentação.
