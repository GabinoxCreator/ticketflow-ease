## Ajustar botão "Falar com vendas" no card hero da home

O botão `ghost` "Falar com nosso time de vendas" no card grande da home (`ProducerSolutionsSection`) está vazando do card por ser longo demais e por não ter contorno — visualmente parece "fora" do card.

## Solução

No mesmo container de botões do card 2x2:

1. **Encurtar o texto** para "Falar com vendas" (mais limpo, premium e cabe ao lado).
2. **Trocar o variant** de `ghost` para `outline` com borda sutil em `primary/30` — fica como botão secundário "de verdade", contido visualmente dentro do card.
3. **Permitir quebra/wrap** no flex container (`flex-wrap`, `items-stretch sm:items-center`) e colocar `w-full sm:w-auto` em ambos os botões — assim em telas estreitas eles empilham sem cortar.

Resultado: dois botões equilibrados (CTA primário + secundário) totalmente dentro do card, com aparência premium.

## Arquivo afetado

- **`src/components/home/ProducerSolutionsSection.tsx`** — apenas o bloco dos dois botões dentro do card hero (linhas 137–155). Sem novos componentes ou dependências.