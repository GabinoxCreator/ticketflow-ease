## Contexto

O `AddGuestListDialog` já foi reescrito anteriormente com 3 seções, time picker com máscara, presets, resumo dinâmico e tela de sucesso. Esta nova rodada é de **refinamento visual e de UX** sobre a base existente, focando nos pontos que ainda podem incomodar no uso real.

## Arquivos a alterar

- `src/components/producer/AddGuestListDialog.tsx` — refinamento (sem reescrita total)
- Nenhum outro arquivo precisa ser tocado (props `eventTime` já chegam via `EventListsTab`)

## Refinamentos propostos

### 1. Campo de horário — mais "picker", menos "input solto"

Hoje: input HH:MM + botão relógio que abre Popover com Select padrão. Funciona, mas o popover usa um Select shadcn (gera dois cliques para escolher).

Mudar para:
- **Trigger único do picker:** o **input inteiro** vira clicável e abre o popover, além de continuar editável por teclado. Visual: input "premium" com borda mais marcada, ícone Clock à esquerda, chevron sutil à direita.
- **Conteúdo do popover:** grid de horários ao invés de Select aninhado.
  - Coluna esquerda: lista vertical scrollável com horários de 30 em 30min (00:00 → 23:30), `max-h-56 overflow-y-auto`
  - Item selecionado destacado com `bg-primary/15 text-primary`
  - Auto-scroll para o horário atual ao abrir
- **Validação visual mais suave:** trocar borda verde permanente por:
  - borda neutra quando válido (sem "verde insistente")
  - borda destrutiva + ícone `AlertCircle` à direita SOMENTE quando inválido E o campo já foi tocado (evita erro no estado inicial)
- **Presets reorganizados em 2 linhas claras:**
  - Linha 1 (atalhos do evento, se `eventTime`): `Início do evento` · `1h antes` · `2h antes` — chips destacados em primary outline
  - Linha 2 (genéricos): `18:00` · `20:00` · `22:00` · `23:59` — chips neutros
  - Label pequeno acima de cada linha: "Sugestões do evento" / "Horários comuns"

### 2. Hierarquia visual do modal

- Aumentar o espaçamento entre seções (`space-y-6` em vez de `space-y-5`)
- Labels de seção com **número** e linha divisória sutil:
  ```
  ─── 1 · IDENTIFICAÇÃO ───────────
  ```
  Implementar com flex + `<span>` + `<div className="h-px flex-1 bg-border/60" />`
- Header do dialog com ícone temático à esquerda do título (`Users` em círculo `bg-primary/10`)

### 3. Bloco de compartilhamento mais leve

Hoje ocupa 3 linhas. Reduzir para uma linha compacta:
- Texto único: `LinkIcon` + "Um link público será gerado automaticamente após criar"
- `text-xs text-muted-foreground` em uma única linha, sem caixa com borda dashed
- Remove a sensação de "campo editável"

### 4. Resumo do rodapé — mais visual

- Trocar texto inline por **3 mini-pílulas** lado a lado (nome | horário | limite), cada uma com ícone próprio (`Tag`, `Clock`, `Users`)
- Quando o campo correspondente está vazio/inválido, pílula fica em estado muted "—"
- Visual de cartão `bg-muted/30 rounded-lg p-3`

### 5. Limite de convidados

- Quando preenchido, mostrar pílula sutil verde "Máximo de N" abaixo do input em vez de só texto
- Quando vazio, manter "Deixe em branco para ilimitado" mais discreto (`text-xs text-muted-foreground`)

### 6. Tela de sucesso — incluir botão "Gerenciar lista"

Hoje tem: Copiar link / Criar outra / Concluir.
Adicionar ação principal:
- **"Abrir gerenciamento da lista"** (variant outline) — fecha o modal e o `EventListsTab` foca/abre essa lista. Implementação mínima: callback `onListCreated?: (list) => void` no dialog; se `EventListsTab` não consumir agora, o botão simplesmente fecha o modal (degradação suave). **Sem alterações em outros arquivos nesta rodada** — apenas preparar o callback como noop por padrão.

### 7. Microcopy

- Header: "Nova lista de cortesia" → manter, mas subtítulo: **"Configure quem pode entrar e até quando o link funciona."**
- Placeholder do nome: "VIP, Imprensa, Aniversariantes…"
- Helper do horário: **"Horário máximo, na data do evento, em que novos convidados podem se inscrever."**
- Botão final: "Criar lista" → **"Criar e gerar link"** (mais ação, menos abstrato)

## Detalhes técnicos

- Estado novo: `timeTouched: boolean` (controla quando exibir erro de validação)
- Reuso: continuar usando `useGuestListMutations`, mesmo schema (`name`, `valid_until_time`, `max_guests`)
- Popover do horário: substituir `TimeSelect` por lista custom inline (`<div role="listbox">`) com auto-scroll via `useEffect` + `scrollIntoView({ block: 'center' })`
- Não criar arquivos novos
- Manter responsividade `sm:max-w-md`; em mobile (390px) o popover do horário usa `w-[calc(100vw-3rem)]` se necessário

## Fora de escopo

- Schema/RLS/edge functions
- Outros componentes de lista (`GuestListEntriesManager`, `EventListsTab` — exceto eventual consumo futuro do callback)
- Auth, pagamentos, checkout
- Tema global

## Checklist de validação

1. Abrir modal → header com ícone, 3 seções numeradas com divisores
2. Clicar em qualquer parte do input de horário → abre popover com lista de horários
3. Lista do popover faz auto-scroll para o horário atual
4. Selecionar horário no popover preenche e fecha
5. Digitar horário inválido NÃO mostra erro até sair do campo
6. Presets do evento aparecem em linha separada com label "Sugestões do evento"
7. Bloco de compartilhamento agora é uma única linha leve
8. Resumo do rodapé mostra 3 pílulas com ícones (nome/horário/limite)
9. Botão final lê "Criar e gerar link"
10. Após criar, tela de sucesso mantém Copiar link e oferece "Abrir gerenciamento da lista"
11. Em mobile (390px) tudo permanece legível, sem overflow horizontal
12. Nenhum outro arquivo foi modificado
