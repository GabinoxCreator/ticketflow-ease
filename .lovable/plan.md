## Objetivo

Criar uma nova seção promocional na **home** (logo abaixo dos eventos disponíveis) dedicada a atrair produtores de eventos, inspirada no print enviado (estilo "bento grid" com card escuro grande à esquerda + cards claros à direita com ícones/mockup e CTAs). Em seguida, refazer a página `/area-do-produtor` aplicando a mesma linguagem visual, deixando-a mais premium e conectada à nova seção da home.

---

## 1. Nova seção na Home — `ProducerSolutionsSection`

**Onde:** `src/pages/Index.tsx`, inserida **depois** do `<EventGrid />` e antes do `<Footer />`.

**Arquivo novo:** `src/components/home/ProducerSolutionsSection.tsx`

**Estrutura visual (bento grid):**

- Título centralizado: **"Soluções Integradas para Eventos"** + subtítulo.
- Grid responsivo:
  - **Desktop (lg):** 4 colunas × 2 linhas
    - Card principal escuro ocupa **col-span-2 row-span-2** (esquerda)
    - 2 cards superiores (col-span-1 cada) à direita
    - 2 cards inferiores (col-span-1 cada) à direita
  - **Tablet (md):** 2 colunas (card principal full-width no topo)
  - **Mobile:** 1 coluna empilhada

**Card principal (escuro / hero):**
- Fundo `bg-gradient-to-br from-background via-background to-primary/10` com borda gradiente sutil
- Ícone de maquininha/pulseira no topo (usar `Ticket` + `CreditCard` da lucide, ou imagem stylizada)
- Título grande: **"A CONTA DIGITAL QUE CONECTA EVENTOS E PÚBLICO"** (font-display, uppercase)
- Underline gradient (Indigo→Magenta) abaixo do título
- Parágrafo descritivo
- Botão primário magenta: **"Abra sua conta!"** → navega para `/area-do-produtor/cadastro`
- Link secundário: **"Falar com nosso time de vendas →"** → `mailto:` ou abre dialog
- Detalhe decorativo: globo/grid SVG no canto inferior esquerdo (usar `Globe` lucide com opacity baixa)

**4 cards secundários (claros/glass):**
1. **GESTÃO DE EVENTOS** — ícone `BarChart3` — "Controle total da bilheteria, vendas online, gestão de comissários e relatórios em tempo real." → CTA "Saiba mais sobre vendas →"
2. **CHECK-IN E PORTARIA** — ícone `QrCode` — "Validação por QR Code, listas VIP e operação mobile-first para sua equipe." → CTA "Ver como funciona →"
3. **PAGAMENTOS SEGUROS** — ícone `Shield` — "Pix instantâneo e cartão via Mercado Pago. Repasses claros e sem surpresas." → CTA "Conhecer taxas →"
4. **EQUIPE E COLABORADORES** — ícone `Users` — "Adicione comissários, porteiros e gerentes com permissões granulares." → CTA "Organizar equipe →"

**Estilo dos cards secundários:**
- `bg-card/40 backdrop-blur-sm border border-border/50 rounded-2xl p-6`
- Hover: `hover:border-primary/40 hover:bg-card/60 transition-all`
- Título uppercase com `gradient-text` (Indigo→Magenta)
- Ícone em círculo `bg-primary/10`
- Animação de entrada com `framer-motion` (stagger por índice)

**Todos os CTAs apontam para `/area-do-produtor`** (com âncoras opcionais futuras).

---

## 2. Redesign da página `/area-do-produtor`

**Arquivo:** `src/pages/AreaDoProdutor.tsx` (reescrita parcial)

**Mudanças:**

### Hero
- Manter estrutura mas **reaproveitar o mesmo bento grid** logo abaixo do hero como prova de valor.
- Trocar fundo do hero para um gradiente mais rico: `bg-gradient-to-br from-primary/20 via-background to-accent/10` + um glow radial atrás do título.
- Substituir o badge atual por uma pílula glass com o ícone `Sparkles`.
- Botão primário "Começar agora" mantém variant `hero`, botão "Já tenho conta" ganha variant `outline` com hover gradient.

### Nova seção "Bento" (reutiliza componente)
- Importar e renderizar `<ProducerSolutionsSection variant="page" />` logo após o hero.
- Prop `variant` controla pequenas diferenças (ex: na home tem título "Soluções Integradas para Eventos"; na página interna pode ser "Tudo numa plataforma só" ou ocultar título).

### Seção de features (existente)
- Manter, mas **trocar o grid por cards estilo bento mais sofisticados** — ainda 6 features, mas com:
  - Card de tamanho variável (1 grande no centro com mockup/imagem dummy + 5 cards menores)
  - Glass effect, bordas com gradient on hover
  - Ícones maiores (`w-7 h-7`) com fundo `bg-gradient-to-br from-primary/20 to-accent/20`

### Nova seção "Como funciona" (3 passos)
- Adicionar entre features e CTA final:
  1. Crie sua conta (ícone `UserPlus`)
  2. Configure seu evento (ícone `Settings2`)
  3. Comece a vender (ícone `TrendingUp`)
- Layout horizontal com linha conectora gradient entre os passos (desktop) / vertical no mobile.

### CTA final
- Aumentar o impacto: card glass full-width com gradient border, headline maior, dois botões (Cadastrar / Falar com vendas).

---

## 3. Detalhes técnicos

**Arquivos criados:**
- `src/components/home/ProducerSolutionsSection.tsx` — componente bento reutilizável (aceita prop `variant?: 'home' | 'page'`)

**Arquivos modificados:**
- `src/pages/Index.tsx` — importar e renderizar `<ProducerSolutionsSection variant="home" />` após `<EventGrid />`
- `src/pages/AreaDoProdutor.tsx` — refatorar hero, inserir bento section, reformular features e adicionar "Como funciona"

**Dependências:** nenhuma nova — usar `framer-motion`, `lucide-react` e `@/components/ui/*` já presentes.

**Responsividade:** mobile-first, breakpoints `md` (2 col) e `lg` (bento 4 col). Card escuro principal vira full-width no mobile e ocupa as duas linhas no desktop. Sem overflow horizontal (respeitando regra de `min-w-0` da memória do projeto).

**Identidade visual:** mantém o tema dark Indigo→Magenta, usa `gradient-text`, `bg-card/40 backdrop-blur`, bordas `border-border/50` e glow `shadow-primary/10` — alinhado ao restante da plataforma.

**Acessibilidade:** todos os CTAs são `<Button>` ou `<a>` reais com texto descritivo; ícones decorativos com `aria-hidden`.

---

## Resultado esperado

- Home ganha uma seção promocional **profissional e visualmente forte** convertendo visitantes do feed público em produtores cadastrados.
- Página `/area-do-produtor` fica **premium, consistente** com a nova seção e com narrativa clara: hero → soluções (bento) → features → como funciona → CTA.
- Tudo conectado por links para `/area-do-produtor/cadastro` e `/area-do-produtor/login`.