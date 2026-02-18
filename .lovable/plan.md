
# Layout Desktop: Hero Split (Info + Imagem lado a lado)

## O que sera feito

Alterar o layout desktop da pagina de detalhes do evento para ter uma secao hero com duas colunas: informacoes do evento a esquerda e imagem do banner a direita, similar a referencia enviada. O layout mobile permanece inalterado (banner full-width acima, info abaixo).

## Alteracoes

### Arquivo: `src/pages/EventDetails.tsx`

**Secao do Banner (linhas 191-222) - Substituir por hero split no desktop:**

- **Mobile** (sem mudanca): banner full-width com imagem, gradiente e botao de curtir no canto inferior direito
- **Desktop (lg+)**: secao hero com duas colunas lado a lado
  - Coluna esquerda: titulo do evento, cidade/estado, venue (cor primaria), endereco com icone MapPin, data e hora com icones Calendar e Clock
  - Coluna direita: imagem do evento em um container com bordas arredondadas
  - Fundo com gradiente suave baseado na cor do tema
  - Botao de curtir posicionado no canto inferior direito da imagem

**Secao de conteudo abaixo (linhas 224-362):**

- **Remover o bloco de info do evento** (linhas 230-265) da coluna principal no desktop, pois essas informacoes ja estarao no hero. Manter no mobile como esta.
- Na pratica: o `motion.div` de info tera classe `lg:hidden` para sumir no desktop, ja que a info estara no hero
- O restante (ingressos, sobre, sidebar de resumo) continua como esta

### Estrutura do Hero Desktop

```text
+--------------------------------------------------+
|  TITULO DO EVENTO          |   [Imagem do Evento] |
|  Cidade, Estado            |                      |
|  Venue (cor primaria)      |                      |
|  MapPin Endereco           |              [Heart]  |
|  Calendar Data  Clock Hora |                      |
+--------------------------------------------------+
```

### Detalhes tecnicos

1. A secao hero tera `hidden lg:flex` para aparecer so no desktop, usando `grid grid-cols-2` ou `flex` com gap
2. O banner mobile atual tera `lg:hidden` para aparecer so no mobile
3. O bloco de info dentro do content tera `lg:hidden` para evitar duplicacao no desktop
4. A imagem no hero desktop tera `rounded-xl overflow-hidden` e `object-cover`
5. O fundo do hero usara altura fixa (`min-h-[60vh]`) com padding generoso e um gradiente escuro suave

### Resumo de arquivos alterados
- `src/pages/EventDetails.tsx`: reestruturar banner/hero para layout split no desktop
