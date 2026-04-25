## Novo Hero Banner — Estilo "Somos a rede de pagamentos e serviços focados em grandes eventos"

Substituir o banner atual da home (imagem `bannerHome` com gradiente simples) por um hero **split-layout** construído inteiramente em código, fiel à referência mas adaptado ao tema dark do FestPag (Indigo/Magenta sobre `bg-background`, em vez do bege da referência — para manter consistência visual com o resto do app).

### 1. Layout (2 colunas no desktop, empilhado no mobile)

**Coluna esquerda** — colagem de 3 "polaroids":
- Card central em destaque (rotação 0°, sombra forte, z-index maior) com selo circular "FestPag!" branco e legenda manuscrita "Pagou!" no rodapé.
- Card à esquerda levemente rotacionado (-8°) atrás, mostrando imagem de festival/fogos.
- Card à direita rotacionado (+6°) atrás, mostrando imagem de público em show.
- Imagens via Unsplash (eventos/festivais) ou geradas — usaremos URLs Unsplash já validadas no projeto para não criar assets novos.

**Coluna direita** — bloco textual:
- Headline em `font-display` (Sora) extra-bold, uppercase, tracking apertado:
  - "SOMOS A REDE DE" (foreground)
  - "**PAGAMENTOS** E SERVIÇOS" (PAGAMENTOS em gradient Indigo→Magenta)
  - "FOCADOS EM *GRANDES EVENTOS*" (GRANDES EVENTOS em fonte script/itálica accent verde-lima `text-lime-400` para citar a referência sem perder identidade)
- Linha de social proof: ⭐ 4.9 + "+10 mil avaliações do App"
- Dois CTAs em pill outline (estilo da referência):
  - "Explorar festivais" → scroll suave para `#eventos` (a `EventGrid` já existente)
  - "Vender na FestPag" → `/area-do-produtor/cadastro`
- Globo decorativo Indigo no canto inferior direito (`<Globe>` lucide com baixa opacidade), igual ao usado em `ProducerSolutionsSection`.

### 2. Implementação técnica

**Arquivo novo**: `src/components/home/HomeHeroBanner.tsx`
- Componente self-contained, sem props.
- Uso de `framer-motion` para entrada staggered das polaroids e do texto.
- Imagens das polaroids via `<img>` com `object-cover` dentro de wrappers `rounded-2xl bg-card p-3 shadow-2xl` (efeito polaroid com padding branco/card).
- Tipografia responsiva: `text-4xl md:text-5xl lg:text-6xl xl:text-7xl`.
- Container: `container mx-auto px-4 py-12 md:py-20 grid lg:grid-cols-2 gap-12 items-center`.

**Arquivo modificado**: `src/pages/Index.tsx`
- Remover o bloco `<section>` atual com `bannerHome` e o `import bannerHome`.
- Substituir por `<HomeHeroBanner />` logo após `<main className="pt-24">`.
- Adicionar `id="eventos"` no wrapper do `<EventGrid>` para o CTA "Explorar festivais" funcionar.

### 3. Detalhes de fidelidade vs. adaptação

| Referência | Nossa versão |
|---|---|
| Fundo bege claro | `bg-background` dark (consistência com app) |
| "PAGAMENTOS" roxo + "GRANDES EVENTOS" verde manuscrito | Mantém: Indigo-gradient + lime script italic |
| 3 polaroids colagem | ✅ Mantido idêntico |
| Selo "FestPag!" + "Pagou!" manuscrito | ✅ Mantido (texto, não imagem) |
| 4.9 ⭐ + avaliações | ✅ Mantido |
| 2 botões pill | ✅ Mantido (cores adaptadas ao dark) |
| Globo roxo decorativo | ✅ Mantido |

### Arquivos

**Criar:**
- `src/components/home/HomeHeroBanner.tsx`

**Modificar:**
- `src/pages/Index.tsx` (remover banner atual + import, adicionar `<HomeHeroBanner />` e `id="eventos"`)

**Não tocar:**
- Asset `src/assets/banner-home.png` continua no repo mas deixa de ser importado (pode ser removido depois manualmente).
