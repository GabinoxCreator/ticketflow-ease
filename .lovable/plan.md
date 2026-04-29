# Polimento Premium do Checkout

Upgrade puramente visual nas 4 telas do fluxo (Modal/Header, Pagamento, PIX, Cartão). Sem mudanças de lógica, dados ou backend.

## Princípios de design
- **Dark premium**: gradient sutil no fundo do modal (indigo → magenta a 5-8% opacity), glow em pontos focais.
- **Glassmorphism**: cards de resumo com `bg-card/60 backdrop-blur` + borda gradient suave.
- **Hierarquia tipográfica**: total grande (3xl) com `gradient-text`, labels em uppercase tracking-wide muted.
- **Microinterações**: hover scale 1.02, ring de foco indigo, ícones em containers gradient.
- **Mobile-first**: respeita `100dvh`, espaçamento generoso, botões `h-14` no CTA principal.

## 1. CheckoutModal – Header & Container

- Adicionar fundo decorativo no `DialogContent`: gradient radial sutil indigo/magenta no topo (absolute, `pointer-events-none`, opacity-20, blur-3xl).
- Header redesenhado:
  - Altura `h-16`, borda inferior sutil com gradient (`border-b border-border/50`).
  - Título centralizado com `font-display font-bold text-base`.
  - Ícones `Voltar` e `X` em variante `ghost` com `rounded-full`, hover `bg-secondary/60`.
- Footer "trust strip" fixo no mobile (apenas nas telas payment/card/pix): `Lock` icon + "Pagamento 100% seguro" em `text-[10px]` muted.

## 2. CheckoutStepPayment

**Resumo do pedido (card premium):**
- Container glass: `bg-gradient-to-br from-card/80 to-secondary/40 backdrop-blur-xl border border-border/60 rounded-2xl p-5`.
- Pequena tag no topo: badge gradient indigo/magenta com nome do evento + data em chip lado a lado.
- Lista de itens com leading mais arejado, quantidade em pill `bg-primary/10 text-primary`.
- Linha do **Total**: caixa destacada com gradient sutil + shadow `shadow-primary/20`, valor `text-3xl gradient-text`.

**Cupom:**
- Quando aplicado: card verde com gradient + ícone com glow.
- Quando vazio: input com altura `h-12`, ícone `Tag` indigo, botão "Aplicar" em variant `gradient`.

**Botões de método de pagamento:**
- Cards maiores (`p-5`, gap-4), borda `border-border/60`.
- Ícone num container `w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20` com `shadow-inner`.
- Hover: `border-primary scale-[1.02] shadow-lg shadow-primary/10`.
- Adicionar chevron `ArrowRight` à direita (ganha `translate-x-1` no hover) para affordance.
- Selo "Recomendado" no PIX (badge gradient pequeno, `top-3 right-3`).

## 3. CheckoutStepPix

- **Header de valor**: bloco centralizado com glow circular atrás do preço (absolute blur-3xl bg-primary/30).
- **QR Code premium**: container `rounded-3xl` com **borda gradient** (técnica `gradient-border`), padding `p-5`, sombra `shadow-2xl shadow-primary/20`. Cantos com pequenos "corner brackets" decorativos em indigo (4 absolute divs).
- **Timer** dentro de pill `bg-secondary/60 backdrop-blur border border-border/60 rounded-full px-4 py-1.5` com ícone de relógio.
- **Botão "Copiar PIX"**: variant `hero`, `h-14`, fonte semibold.
- **PIX copia-e-cola**: card com header "PIX Copia e Cola" + monoespaçada truncada e botão `Copy` sutil à direita.
- **Instruções**: passar para um card glass único com 3 linhas, números em círculo gradient (`bg-gradient-to-br from-primary to-accent text-white`).
- **"Já paguei, verificar"**: variant `outline` com borda gradient sutil.

## 4. CheckoutStepCard

- **Total compacto** vira card glass com lock icon + "Pagamento criptografado" em badge.
- Inputs com `h-12`, ícones à esquerda em todos os campos (Card, User, Calendar, Lock, IdCard).
- Bandeira do cartão exibida como **chip pill** colorido no canto direito do input.
- Grid Validade/CVV mantido, mas labels com uppercase tracking-wide.
- Select de parcelas com trigger `h-12` e ícone à esquerda.
- Botão "Pagar X" em `hero` `h-14` com brilho animado (`animate-pulse-glow` quando habilitado).
- Footer trust: 3 selos lado a lado (`Lock` SSL, `Shield` Mercado Pago, `CheckCircle2` Garantia).

## Detalhes técnicos

Arquivos a editar (somente JSX/Tailwind):
- `src/components/checkout/CheckoutModal.tsx` – header + decoração de fundo.
- `src/components/checkout/CheckoutStepPayment.tsx` – resumo, cupom, botões de método.
- `src/components/checkout/CheckoutStepPix.tsx` – QR premium, total com glow, instruções.
- `src/components/checkout/CheckoutStepCard.tsx` – inputs com ícones, total glass, trust strip.

Reusar tokens existentes: `gradient-text`, `gradient-border`, `glass`, `card-glow`, `animate-pulse-glow` (já definidos em `src/index.css`). Sem novos pacotes, sem mudanças em CSS global, sem alterações em hooks/edge functions/DB.

## Fora do escopo
- Lógica de pagamento, validação de cupom, integração Mercado Pago.
- Mudanças no fluxo (steps, navegação, callbacks).
- Telas `Awaiting`, `Success`, `Expired` (manter como estão, podem entrar em iteração futura se desejar).
