## Objetivo

Reorganizar visualmente o bloco **Quando** da etapa 2 do wizard de criação de evento (`/produtor/criar-evento`) para seguir o padrão da referência: dois sub-blocos rotulados **INÍCIO** e **FIM**, cada um com sua própria linha contendo data + horário lado a lado. Bloco **Onde** fica intacto.

## Arquivo

- `src/pages/CriarEvento.tsx` (apenas o JSX do `currentStep === 2` na seção "Quando", linhas ~385–452)

## Mudanças

1. Remover o título único `Quando` + o grid de 4 colunas atual.
2. Criar dois sub-blocos:
   - **SectionLabel "INÍCIO"** → grid 2 colunas (`sm:grid-cols-2`) com:
     - Data de Início (Popover + Calendar — mantém componente atual)
     - Horário de Início (`TimeSelect` — mantém)
   - **SectionLabel "FIM"** → mesma estrutura para Data de Fim e Horário de Fim.
3. Manter:
   - Toda a lógica de estado (`startDate`, `startTime`, `endDate`, `endTime`)
   - Validações e mensagens de erro
   - Regra de `filteredEndTimeOptions` quando data fim = data início
   - Badge de "Duração" abaixo
4. Não alterar o componente `TimeSelect` — o seletor de hora + minuto já existe no projeto e é exibido em um único campo (não vou desmembrar em dois selects separados como na referência, pois o componente atual já cumpre a função em uma UX equivalente).
5. Bloco **Onde** (Local/Cidade/Estado/Endereço) permanece exatamente como está.
6. Não tocar em `EditarEvento.tsx` (escopo é só criação, conforme pedido).

## Fora de escopo

- Não vou trocar o tema (continua dark Indigo/Magenta — não vou copiar o tema claro/verde da referência).
- Não vou reescrever `TimeSelect` em dois dropdowns separados (hora/minuto). Se quiser esse desmembramento depois, abrimos bloco específico.
- Sem mudanças em validação, persistência, ou no passo 3/4.

## Validação manual

1. Abrir `/produtor/criar-evento`, ir para a etapa 2.
2. Conferir layout: rótulo "INÍCIO" com data + hora; abaixo rótulo "FIM" com data + hora.
3. Selecionar data de início → calendário de fim respeita disabled.
4. Selecionar mesma data início/fim → horários de fim ≤ início devem sumir do select.
5. Badge de duração aparece corretamente.
6. Bloco "Onde" intacto. Botão "Próximo" continua funcionando.