

# Mover Botao Curtir para o Canto Inferior Direito do Banner

## O que sera feito

Mover o botao de curtir (coracao + contagem) da secao de informacoes do evento para o canto inferior direito do banner da imagem, posicionado sobre a imagem com estilo overlay.

## Alteracoes

### Arquivo: `src/pages/EventDetails.tsx`

1. **Remover o botao curtir da secao de informacoes** (linhas 245-264): remover o bloco do `<button>` com o Heart que esta dentro do `motion.div` de informacoes.

2. **Adicionar o botao curtir dentro da section do banner** (linha 200-201, antes do fechamento da section): posicionar com `absolute bottom-4 right-4 z-10` para ficar no canto inferior direito sobre a imagem, com um fundo semi-transparente (`bg-black/50 backdrop-blur-sm rounded-full px-3 py-2`) para garantir visibilidade sobre qualquer imagem.

### Visual do botao no banner
- Fundo escuro semi-transparente com blur
- Bordas arredondadas (pill shape)
- Icone Heart + numero ao lado
- Quando curtido: coracao vermelho preenchido
- Quando nao curtido: coracao branco outline

