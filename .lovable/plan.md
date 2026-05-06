## Hierarquia correta
- **Setor** = grupo (ex: Área VIP, Camarote, Pista). Botão grande do topo: **+ Novo Setor**.
- **Ingresso** = item vendável dentro de um setor (ex: 1º Lote, Meia, Inteira). Botão dentro do card de cada setor: **+ Novo Ingresso**.
- Aba do dashboard continua "Ingressos" (já está correto).

## Renomeações de texto (`src/components/producer/LotManager.tsx`)
- Botão topo direito: "Novo Ingresso" → **"Novo Setor"**.
- Estado vazio: "Nenhum setor criado ainda…" / **"Criar Primeiro Setor"**.
- Botão dentro de cada card de setor: "Novo Lote" → **"Novo Ingresso"**.
- Linha "3 lotes" abaixo do nome do setor → **"3 ingressos"**.
- Título do modal:
  - Editar → "Editar Ingresso"
  - Criar setor (etapa 1) → "Novo Setor"
  - Criar ingresso em setor existente → "Novo Ingresso em {setor}"
- Label "Nome do Lote *" → **"Nome do Ingresso *"**.

## Modal multietapas (apenas no fluxo "Novo Setor")
Ao clicar **+ Novo Setor** no topo, modal abre na **etapa 1 – Setor**:

```text
┌─ Novo Setor ──────────────────────┐
│  ( ) Usar setor existente         │
│      [ Select de setores ▾ ]      │
│  (•) Criar novo setor             │
│      [ Input: nome do setor ]     │
│           [ Cancelar ] [ Continuar → ]
└───────────────────────────────────┘
```

- Sem setores ainda → "Usar setor existente" desabilitado, "Criar novo setor" marcado por padrão.
- **Continuar** valida nome e avança para **etapa 2 – Ingresso** (formulário atual com nome, preço, quantidade, escassez, grupo, etc.).
- **Voltar** disponível na etapa 2 só nesse fluxo.

Ao clicar **+ Novo Ingresso** dentro de um card de setor → abre **direto na etapa 2** com setor travado.
Ao **editar** ingresso existente → abre direto na etapa 2 (comportamento atual).

## Implementação técnica
- Estado local: `step: 1 | 2` e `flow: 'new_sector' | 'add_to_sector' | 'edit'`.
- Etapa 2 mostra setor escolhido como **badge read-only** no topo (com link "alterar" só se `flow === 'new_sector'`).
- Remove o Select "Ingresso (Setor)" da etapa 2.
- `handleSubmit` só dispara na etapa 2.

## Arquivos afetados
- `src/components/producer/LotManager.tsx` (único arquivo)

Sem mudanças no banco, hooks ou tipos.