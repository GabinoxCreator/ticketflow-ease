
# Banner preenchendo o card sem espaços

## Problema
O banner usa `object-contain` que preserva o aspect ratio mas deixa espaços em cima/embaixo. O usuário quer que o banner preencha toda a area do card (sem gaps) mas ainda mostre a imagem completa.

## Solucao
Usar `object-cover` para preencher o container, mas aumentar a largura do container do banner para que a imagem caiba melhor sem cortar partes importantes. Combinar com uma altura que acompanhe o conteudo do lado direito.

- **Desktop**: Trocar `md:w-72` por `md:w-80` (320px) e usar `object-cover` com `rounded-l-xl` para o banner preencher a area toda sem gaps
- **Mobile**: `h-52` com `object-cover` para preencher sem espacos
- Remover `bg-black/5` (nao precisa mais pois nao havera gaps)

Como o banner e um flyer vertical/quadrado e o card tem altura limitada pelo conteudo, `object-cover` vai cortar minimamente mas preencher todo o espaco. Para banners com aspect ratio muito diferente, isso e inevitavel — mas o resultado visual sera muito mais limpo.

## Arquivo impactado
| Arquivo | Mudanca |
|---|---|
| `src/components/producer/EventDashboardHeader.tsx` | Linha 79: `md:w-80`, linha 84: `object-cover`, remover `bg-black/5` |
