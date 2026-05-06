## Objetivo
Ajustar a terminologia e o fluxo de criação na aba de Lotes/Ingressos do dashboard do produtor para refletir o modelo mental correto: **Ingresso = setor** (ex: "Ingresso", "Área VIP", "Camarote") e **Lote = variação de preço/quantidade dentro de um setor** (ex: "1º Lote", "2º Lote").

Tudo é trabalho de UI/UX no frontend — sem mudanças no banco ou regras de negócio.

---

## Mudanças

### 1. Renomear a aba na barra do dashboard
Arquivo: `src/pages/EventDashboard.tsx`
- Trocar `label: 'Lotes'` por `label: 'Ingressos'` no item de menu (mantém `value: 'lots'` internamente para não quebrar nada).

### 2. Renomear título e botão principal
Arquivo: `src/components/producer/LotManager.tsx`
- Título da seção: `Lotes de Ingressos` → `Ingressos`
- Botão grande (topo direito): `Adicionar Lote` → `Novo Ingresso`
  - Abre o modal em modo "criar setor": campo "Nome do Ingresso (Setor)" como input livre + primeiro lote.
- Estado vazio: ajustar texto para "Nenhum ingresso criado ainda…" e botão "Criar Primeiro Ingresso".

### 3. Botão "Novo Lote" dentro de cada setor
Continua existindo dentro de cada card de setor (ex: dentro de "AREA VIP" → "+ Novo Lote"). 
- Hoje ele já passa `presetSector`, mas o usuário relatou que o setor não vem preenchido. Vamos garantir o comportamento via mudança no modal (ver item 4).

### 4. Reformular o modal de Lote
Arquivo: `src/components/producer/LotManager.tsx`
- Trocar o input livre `Nome do Setor` por um **Select** com:
  - Opções: lista de setores únicos já existentes (extraída de `lots`)
  - Opção fixa final: "➕ Criar novo setor…"
  - Quando "Criar novo setor" é selecionado, aparece um input de texto abaixo para digitar o nome.
- Comportamento:
  - **Modo "Novo Ingresso"** (botão do topo): Select inicia em "Criar novo setor" com input vazio.
  - **Modo "Novo Lote" dentro de um setor**: Select já vem com aquele setor pré-selecionado e travado visualmente (ainda permite trocar, mas pré-selecionado corretamente — corrige o bug relatado de cair em "Ingresso").
  - **Modo "Editar"**: Select pré-selecionado com o setor atual do lote.
- Ajustar o label do modal: "Novo Lote" / "Editar Lote" / "Novo Ingresso" conforme contexto.

### 5. Pequenos textos de apoio
- Tooltip/legendas: trocar referências a "lote" para "ingresso" onde se refere ao setor, mantendo "lote" apenas para variações de preço dentro de um setor.
- Linha "3 lotes" abaixo do nome do setor: manter como está (correto — são lotes do setor).

---

## Detalhes técnicos

```text
Estrutura conceitual final:
Ingresso (setor)        ← criado pelo botão "Novo Ingresso"
 ├─ Lote 1              ← criado pelo botão "Novo Lote" dentro do setor
 ├─ Lote 2
 └─ ...
```

- Sem migrations. `event_lots.sector_name` continua sendo o campo que agrupa.
- Lista de setores existentes derivada de `Array.from(new Set(lots.map(l => l.sector_name?.trim() || 'Ingresso')))`.
- Adicionar um pequeno estado local no modal: `sectorMode: 'existing' | 'new'` para controlar o Select vs input.

---

## Arquivos afetados
- `src/pages/EventDashboard.tsx` (1 linha — label da aba)
- `src/components/producer/LotManager.tsx` (modal + textos + botões)

Nenhuma alteração de backend, RLS, hooks ou tipos.