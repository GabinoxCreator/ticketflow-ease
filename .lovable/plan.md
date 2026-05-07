## Objetivo

Reformular o `AddGuestListDialog` para ficar mais profissional, com hierarquia clara, time picker confiável e estado de sucesso com link copiável. Sem mudanças de regra de negócio (mesmos campos: `name`, `valid_until_time`, `max_guests`).

## Arquivos alterados

- `src/components/producer/AddGuestListDialog.tsx` — reescrito (UI/UX)
- `src/components/producer/tabs/EventListsTab.tsx` — passar `eventDate` e `eventTime` ao dialog (props opcionais) para alimentar atalhos inteligentes; nada mais muda
- (sem novos componentes — usar `TimeSelect` existente em `src/components/producer/TimeSelect.tsx` para o select 15-em-15min)

## Novo layout do modal

Header reforçado:
- Título: "Nova Lista de Cortesia"
- Subtítulo curto e operacional: "Defina nome, validade e limite. O link público é gerado automaticamente."

Conteúdo dividido em 3 seções, separadas por divider sutil e label de seção (uppercase, `text-xs text-muted-foreground tracking-wide`):

### Seção 1 — Identificação
- Label "Nome da lista" + Input
- Placeholder: "Ex: Lista VIP, Aniversariantes, Imprensa"
- Helper: "Aparece para os convidados ao se inscreverem"
- Contador 0/40 caracteres à direita do label

### Seção 2 — Regras
**Horário de validade (foco principal):**
- Componente: input com máscara HH:MM (regex onChange) + botão relógio à direita que abre Popover com `TimeSelect` (slots de 15min). Ícone `Clock` à esquerda dentro do input.
- Validação visual: borda verde quando HH:MM válido, vermelha quando inválido.
- Linha de presets (chips clicáveis com `Badge` variant outline, hover primary):
  - Atalhos genéricos: 18:00 · 20:00 · 22:00 · 23:59
  - Se `eventTime` foi passado: chips extras "Início do evento (HH:MM)", "1h antes", "2h antes" (calculados subtraindo)
- Helper: "A lista ficará válida na data do evento até este horário"

**Limite de convidados (opcional):**
- Input numérico
- Placeholder: "Sem limite"
- Helper dinâmico:
  - vazio: "Deixe em branco para ilimitado"
  - preenchido: "Máximo de N convidados nesta lista" (verde)

### Seção 3 — Compartilhamento
- Bloco compacto não-input: ícone `LinkIcon` + texto em duas linhas
  - "Link público gerado automaticamente"
  - "Você poderá copiar e compartilhar após criar a lista"
- Visual: `rounded-lg border border-dashed bg-muted/30 p-3` (parece informativo, não editável)

## Rodapé inteligente (resumo + ações)

Acima dos botões, mini-resumo dinâmico em card sutil:
```
[Nome da lista] · válida até [HH:MM] · [sem limite | até N convidados]
```
- Se nome vazio: mostra placeholder "Preencha o nome da lista"
- Se horário inválido: chip vermelho "horário inválido"

Botões:
- "Cancelar" (ghost) à esquerda
- "Criar lista" (primary) à direita, desabilitado se nome vazio ou horário inválido

## Estado pós-criação (sucesso)

Após `createList.mutateAsync` ok, NÃO fechar imediatamente. Trocar conteúdo do dialog para uma view de sucesso:

- Ícone `CheckCircle2` grande (verde) centralizado
- Título: "Lista criada com sucesso"
- Subtítulo: "Compartilhe o link abaixo com seus convidados"
- Card com URL `${origin}/lista/${slug}` em fonte mono, truncada
- Botão "Copiar link" (primary, ícone `Copy` → vira `Check` por 2s após copiar)
- Botão secundário "Criar outra lista" → reseta form e volta à etapa de criação
- Botão "Concluir" → fecha modal

## Detalhes técnicos

- Estado novo: `createdList: GuestList | null`, `copied: boolean`, `timeError: boolean`
- Validação horário: `/^([01]\d|2[0-3]):[0-5]\d$/`
- Máscara: ao digitar, manter só dígitos, inserir `:` após 2 dígitos, limitar a 5 chars
- Cálculo de presets baseados em `eventTime` (formato `HH:MM:SS` ou `HH:MM`): subtrair minutos via Date helper local
- Manter mesma chamada `createList.mutateAsync({ event_id, name, valid_until_time, max_guests })` — schema do banco intocado
- Reset ao fechar: limpar `name`, `validUntilTime`, `maxGuests`, `createdList`, `copied`
- `EventListsTab` lê `event` (já tem via context? — se não, fazer lookup leve via prop opcional; passar somente se já disponível, senão omitir e os atalhos inteligentes simplesmente não aparecem)

## Acessibilidade / responsivo

- Labels associados via `htmlFor`
- Foco automático no campo Nome ao abrir
- Em mobile (`< 640px`): chips de preset quebram em grid 4 colunas; modal permanece `sm:max-w-md`
- aria-invalid no input de horário quando inválido

## Fora de escopo

- Não mexer em `useGuestLists`, schema, RLS, edge functions
- Não mexer em `GuestListEntriesManager`, `EventListsTab` (além de passar 1-2 props)
- Não tocar em auth, pagamentos, checkout

## Checklist de validação

1. Abrir "Nova Lista" → modal premium com 3 seções visíveis
2. Digitar nome → contador atualiza, helper visível
3. Campo horário aceita digitação com máscara HH:MM e mostra erro se inválido
4. Clicar ícone relógio → abre popover com slots 15min
5. Clicar preset (ex: 22:00) → preenche horário
6. Se evento tem horário: chips "Início do evento", "1h antes" aparecem e funcionam
7. Limite vazio → "Deixe em branco para ilimitado"; preenchido → "Máximo de N convidados"
8. Resumo no rodapé reflete em tempo real
9. Botão "Criar lista" desabilitado até nome + horário válidos
10. Após criar → tela de sucesso com link, botão "Copiar link" funciona (vira Check)
11. "Criar outra lista" reseta form; "Concluir" fecha
12. Lista aparece corretamente na grid após fechar
