
## Ajustes solicitados

### 1. Remover o polaroid "perdido" no mobile
**Arquivo:** `src/components/home/HomeHeroBanner.tsx`

Hoje, no mobile, **ainda aparece o polaroid central** (o do prato/“Pagou!”) flutuando solto à direita, abaixo do botão "Vender na FestPag" — exatamente o card que aparece na screenshot do usuário. Isso acontece porque só os polaroids laterais foram ocultados; o central continua visível em todos os tamanhos.

**Mudança:**
- Adicionar `hidden lg:flex` na coluna de polaroids inteira (`<div className="relative h-[...] order-2 lg:order-1">`), ocultando os 3 polaroids no mobile/tablet.
- Resultado: no mobile, o hero mostra apenas o bloco textual + CTAs + globo decorativo, ficando limpo e focado em conversão.
- Em desktop (≥lg), nada muda — a colagem de 3 polaroids continua intacta.
- Como bônus, remover a altura `h-[280px] sm:h-[340px]` que reservava espaço vazio no mobile (passa a ser apenas `lg:h-[520px]`).

### 2. Título "Próximos Eventos" sempre visível na home
**Arquivo:** `src/pages/Index.tsx`

Hoje o título "Próximos Eventos" e o subtítulo só aparecem dentro do `<EventGrid>`, que **só é renderizado quando existem eventos**. Quando a lista está vazia (estado atual da home), o usuário vê apenas a frase "Nenhum evento disponível no momento" sem nenhum cabeçalho de seção.

**Mudança:**
- Extrair o cabeçalho da seção de eventos para o próprio `Index.tsx`, fora do bloco condicional.
- Renderizar sempre, dentro do `<div id="eventos">`:
  - `<h2>` "Próximos Eventos" (font-display, bold, gradiente sutil opcional)
  - `<p>` subtítulo "Não perca os melhores eventos da região"
- Abaixo do cabeçalho, manter os 3 estados:
  - **Loading** → spinner
  - **Vazio** → mensagem "Nenhum evento disponível no momento" (estilizada com mais respiro e ícone discreto)
  - **Com eventos** → `<EventGrid>` **sem** as props `title` e `subtitle` (para não duplicar)
- Manter o `scroll-mt-24` para que o link "#eventos" do hero pouse no título.

### Arquivos a modificar
- `src/components/home/HomeHeroBanner.tsx`
- `src/pages/Index.tsx`

Nenhum arquivo será criado ou deletado. Sem mudanças de banco, rotas, edge functions ou lógica de negócio.
