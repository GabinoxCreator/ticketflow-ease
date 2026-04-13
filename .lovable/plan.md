

# Barra de Progresso visível no mobile

## Problema
No mobile (390px), os indicadores de etapas (1, 2, 3, 4) ficam na mesma linha do título "Criar Novo Evento" com `ml-auto`, e o espaço não é suficiente para exibi-los.

## Solução
Quebrar o header em duas linhas no mobile:
- **Linha 1**: Botão voltar + "Criar Novo Evento" (como já está)
- **Linha 2**: Stepper com os 4 passos centralizado abaixo do título

### Mudança em `src/pages/CriarEvento.tsx` (linhas 244-268)
Trocar o layout de `flex items-center gap-4` (tudo em uma linha) para um layout que empilha no mobile:
- Wrap o título e botão voltar em uma div flex
- Mover o stepper para uma div separada abaixo, visível sempre (remover `ml-auto`, usar `flex justify-center`)
- No desktop (`md:`), manter na mesma linha com `md:flex-row md:items-center`

O stepper em si não muda — apenas a posição no layout.

## Arquivo impactado
| Arquivo | Mudança |
|---|---|
| `src/pages/CriarEvento.tsx` | Reestruturar header para empilhar título e stepper no mobile |

