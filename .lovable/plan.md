## Modal "Novo Setor" redesenhado

Substituir os radio buttons por seleção visual em **cards grandes**, com o setor já existente vindo selecionado por padrão.

### Layout

```text
┌─ Novo Setor ────────────────────────────────────────────┐
│  Escolha um setor para adicionar o ingresso             │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │INGRESSOS │  │ ÁREA VIP │  │ CAMAROTE │  │   +    │ │
│  │ 3 itens  │  │  1 item  │  │  0 itens │  │ Novo   │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
│                                                         │
│  (se "Novo" clicado:)                                   │
│  Nome do novo setor: [_____________________________]    │
│                                                         │
│              [ Cancelar ]      [ Continuar → ]          │
└─────────────────────────────────────────────────────────┘
```

### Comportamento
- Ao abrir o modal, o **primeiro setor existente já vem selecionado** (highlight). Usuário só clica Continuar.
- Cards de setores existentes são clicáveis. Clique = troca a seleção.
- Card final **"+ Novo"** com ícone Plus grande. Ao clicar, vira "modo novo setor" e abre input inline (autoFocus).
- Apenas um item selecionado por vez.
- **Continuar** habilita quando há setor selecionado (existente) ou nome digitado (novo).
- Se não houver nenhum setor ainda, abre direto em modo "Novo" sem mostrar grid.

### Visual
- Modal mais largo: `sm:max-w-2xl`, padding generoso.
- Cards: grid responsivo (`grid-cols-2 sm:grid-cols-3`), `min-h-[110px]`, `p-5`, `border-2`, `rounded-xl`.
- Selecionado: `border-primary bg-primary/10 ring-2 ring-primary/30`.
- Não selecionado: `border-border hover:border-primary/40 hover:bg-muted/50`.
- Card "Novo": `border-dashed`, ícone Plus 28px centralizado, label "Novo setor".
- Tipografia maior nos botões/títulos. Sem radios nativos.

### Etapa 2 (formulário do ingresso)
- Mantida como está. Badge do setor no topo + link "alterar".

### Arquivo afetado
- `src/components/producer/LotManager.tsx` — apenas a etapa 1 do modal e estado relacionado.

Sem alterações de banco, hooks ou tipos.