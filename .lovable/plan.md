## Objetivo

Deixar a grade de soluções da página "Sou Produtor" mais premium e legível, no estilo da segunda imagem de referência (ícones coloridos sólidos, cada card com sua identidade), e garantir que **toda a descrição apareça** sem cortes.

## O que muda visualmente

1. **Ícones coloridos por card** (substitui o tom roxo único atual):
   Cada uma das 17 soluções recebe uma cor sólida com um leve gradiente, no estilo "app icon" (quadrado arredondado, com sombra colorida sutil):

   - Cadastro de Eventos → roxo
   - Gestão de Lotes → azul
   - Site Exclusivo → indigo
   - Eventos para Convidados → ciano-claro
   - Eventos Gratuitos → rosa
   - Pré-venda Restrita → âmbar
   - Ingresso Nominal → verde-esmeralda
   - Cupom de Desconto → laranja
   - Validação de Ingressos → verde-lima
   - Dashboard → roxo-violeta
   - Controle de Vendas → azul-céu
   - Ingresso Digital → teal
   - Área do Produtor → fúcsia
   - Gestão de Produtores → rosa-quente
   - Área do Colaborador → laranja-vermelho
   - Check-in com QR Code → vermelho
   - Listas de Convidados → amarelo

   O ícone perde o fundo translúcido fraco e ganha um fundo **sólido colorido** com leve gradiente e sombra na mesma cor (efeito "app icon" da segunda imagem).

2. **Descrição completa, sem cortes**:
   - Remove o `line-clamp-2` que estava cortando o texto.
   - Aumenta a altura mínima das linhas do bento (de `auto-rows-[180px]` para algo como `auto-rows-[210px]` no desktop) para acomodar 3–4 linhas de descrição confortavelmente.
   - Aumenta levemente o tamanho da fonte da descrição (`text-xs md:text-sm`) e melhora a entrelinha.

3. **Mantém o layout bento atual** (card hero 2x2 + cards 1x1 ao redor) — só refina padding e espaçamento para o texto respirar.

4. **Acessibilidade / hover**:
   - Mantém a animação de hover (elevar + glow), mas o glow agora pega a cor do próprio card.

## Arquivos afetados

- **`src/components/home/ProducerSolutionsBento.tsx`** — única alteração:
  - Adicionar uma propriedade `color` em cada item de `solutions` (classes Tailwind para gradiente do ícone + sombra).
  - Trocar o bloco do ícone para usar essa cor (`bg-gradient-to-br ${color} shadow-lg shadow-${color}/30`).
  - Remover `line-clamp-2` da descrição.
  - Ajustar `auto-rows` da grade e tipografia da descrição.

Sem novos componentes, sem novas dependências, sem alterações em outras páginas.

## Por que não tornar o card clicável

O card clicável que abre um modal/popover seria útil se as descrições fossem longas (parágrafos). Como cada descrição tem 1 frase curta, é mais limpo e mais premium **simplesmente mostrar tudo** — alinhado com o padrão da referência. Se você preferir clicável, é só dizer e ajusto.