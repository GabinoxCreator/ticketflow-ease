# Limpeza do Hero da Home

## Objetivo

Remover completamente o bloco de polaroids (fotos) do banner da home e transformar o hero em um layout centralizado, focado apenas no texto e nos botões de ação.

## O que será feito

### 1. Remover os cards de imagens
No componente `src/components/home/HomeHeroBanner.tsx`:
- Remover toda a coluna esquerda que contém os polaroids (festival, público em show e o card central "Pagou!").
- Remover o subcomponente `Polaroid` que ficará sem uso.
- Remover imports relacionados que não serão mais necessários (`Instagram` e ícone usado apenas nas imagens, se aplicável).

### 2. Centralizar o conteúdo textual
- Trocar o grid de 2 colunas (`lg:grid-cols-2`) por um container centralizado de coluna única.
- Aplicar `text-center` no título e `mx-auto` no container, com largura máxima confortável (ex.: `max-w-4xl`).
- Centralizar os botões "Explorar festivais" e "Vender na FestPag" horizontalmente abaixo do título.
- Manter as animações de entrada (framer-motion) e os efeitos de gradiente do título ("PAGAMENTOS" e "grandes eventos").

### 3. Ajustar elementos decorativos
- Manter os glows de fundo (primary/accent blur) que dão profundidade ao banner.
- Reposicionar o ícone do globo decorativo para uma posição que faça sentido no layout centralizado (ex.: canto inferior direito do container, com opacidade sutil), ou remover se ficar deslocado.
- Ajustar o padding vertical para garantir respiração adequada agora que o conteúdo é mais compacto.

## Resultado esperado

Um banner hero limpo, centralizado e impactante, com:
- Título grande em destaque no centro
- Dois botões de CTA centralizados logo abaixo
- Glows de fundo mantendo a estética visual
- Sem espaços vazios ou cards quebrados na lateral

## Arquivos modificados

- `src/components/home/HomeHeroBanner.tsx`
