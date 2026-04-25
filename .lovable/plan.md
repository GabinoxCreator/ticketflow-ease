
## Ajustes solicitados

### 1. Hero da Home — eliminar a "faixa preta" acima do banner
**Arquivo:** `src/pages/Index.tsx`
- O `<main>` hoje usa `pt-24`, criando o espaço vazio entre o header fixo e o banner.
- Trocar para `pt-20` (altura exata do header) e mover qualquer respiro interno para dentro do próprio `HomeHeroBanner`, fazendo o glow/decoração do hero começar imediatamente abaixo do menu.

**Arquivo:** `src/components/home/HomeHeroBanner.tsx`
- Reduzir o `py-10 md:py-16 lg:py-20` do container do hero para `pt-6 md:pt-10` + `pb-10 md:pb-16`, garantindo que o conteúdo (incluindo o glow de fundo) inicie colado ao header.
- Estender os blobs de glow (`-top-20`) para que pintem também a faixa imediatamente abaixo do header e não fiquem "cortados".

### 2. Hero — remover bloco de avaliações
**Arquivo:** `src/components/home/HomeHeroBanner.tsx`
- Remover por completo a div com "4.9 ⭐ +10 mil avaliações do App" (linhas do bloco `Social proof`).
- Remover também o import `Star` que ficará órfão.

### 3. Remover os 2 cards "perdidos" abaixo do botão "Vender na FestPag"
Na imagem 2, os retângulos vazios visíveis abaixo dos CTAs são os 2 últimos polaroids do hero (esquerda e direita) que ficam "soltos" no mobile porque o card central tem altura maior. No mobile, a coluna de polaroids fica alta demais e deixa duas "molduras" vazias sobrando.

**Arquivo:** `src/components/home/HomeHeroBanner.tsx`
- No mobile (`<lg`), exibir **apenas o polaroid central em destaque** (o do "FestPag! / Pagou!"), ocultando os dois polaroids laterais com `hidden lg:block`.
- Reduzir a altura da coluna de polaroids no mobile (`h-[380px]` → `h-[280px] sm:h-[340px]`) e centralizar o polaroid central, eliminando o espaço vazio.
- Manter o layout completo (3 polaroids) inalterado em desktop.

### 4. Seção "Soluções Integradas" — simplificar header
**Arquivo:** `src/components/home/ProducerSolutionsSection.tsx`
- Remover o `<h2>` "Soluções Integradas para Eventos".
- Remover o `<p>` de descrição "Da venda online ao check-in na portaria…".
- Manter apenas o badge pill "Para produtores e organizadores" (com o ícone Sparkles), reduzindo o `mb-10 md:mb-14` para `mb-8 md:mb-10` para o bento grid começar logo abaixo.
- Variante `'page'` (usada em `AreaDoProdutor.tsx`) **continua igual** (mantém título e subtítulo) — só a variante `'home'` recebe o tratamento minimalista.

### Arquivos a modificar
- `src/pages/Index.tsx`
- `src/components/home/HomeHeroBanner.tsx`
- `src/components/home/ProducerSolutionsSection.tsx`

Nenhum arquivo será criado ou deletado. Sem mudanças de banco, rotas ou edge functions.
