# Polimento Premium da Página do Evento

Upgrade visual da página `EventDetails.tsx` mantendo 100% da estrutura, dados e lógica (likes, lotes, checkout, auth). Aplicar a mesma linguagem premium que já está no checkout: glassmorphism, glows indigo/magenta, hierarquia tipográfica e microinterações.

## 1. Hero Desktop (split)

- Aumentar altura para `min-h-[60vh]`, gradient mais rico no background (blur + dois orbes flutuantes indigo/magenta).
- **Coluna esquerda**:
  - Chip pequeno acima do título com data curta + cidade ("SAB, 15 NOV · SÃO PAULO") em `bg-primary/10 border border-primary/30 text-primary text-xs uppercase tracking-wider`.
  - Título com `text-5xl xl:text-6xl gradient-text` na primeira linha (ou destaque parcial).
  - Cards info (data, hora, venue, endereço) em **pills glass** lado a lado: `bg-card/60 backdrop-blur border border-border/60 rounded-xl px-4 py-3` com ícones em container gradient mini.
  - Likes movidos para chip inline ao lado do título com `Heart` animado.
- **Coluna direita** (imagem):
  - `rounded-3xl` com **borda gradient** (indigo→magenta), shadow `shadow-2xl shadow-primary/30`.
  - Glow externo (absolute blur-3xl) atrás da imagem.
  - Botão de like em pill premium, com contagem em `font-bold tabular-nums`.

## 2. Hero Mobile

- Manter imagem em `object-contain`, mas adicionar **gradient overlay duplo** (top: indigo/10, bottom: background→transparent).
- Botão like com glassmorphism (`bg-background/40 backdrop-blur-xl border border-white/10 rounded-full`).
- Bloco de info mobile (logo abaixo do banner): mover para card glass único com:
  - Chip de categoria/data no topo.
  - Título grande, venue com ícone gradient.
  - Pills horizontais de data/hora/local em scroll horizontal se necessário.

## 3. Cards de Setores (lotes)

Atualmente cada setor tem `bg-card rounded-2xl border border-border`. Upgrade:

- Container: `bg-gradient-to-br from-card/90 to-secondary/30 backdrop-blur-xl border border-border/60 rounded-2xl shadow-xl shadow-primary/5 overflow-hidden`.
- **Header do setor** redesenhado:
  - Faixa superior com `bg-gradient-to-r from-primary/10 to-accent/10 border-b border-border/60 px-5 py-3`.
  - Ícone de setor (Ticket ou Crown para VIP) num container gradient à esquerda.
  - Nome do setor com `font-display font-bold text-base`, sem uppercase forçado (mantendo legibilidade).
  - Badge contador à direita: "X opções" em pill sutil.
- **LotCard** repaginado:
  - Linha em `py-5` com hover `bg-primary/5` sutil.
  - Nome em `font-bold text-base` (não mais uppercase apertado).
  - Preço com `text-xl font-display font-bold` (gradient-text apenas no preço final principal).
  - Original price com line-through bem suave + badge "−X%" em verde se houver desconto.
  - Badges "Últimos" / "Esgotado" com gradient (destrutivo gradient para "Últimos").
  - **Stepper +/−**: botões `w-10 h-10 rounded-xl` com `border-primary/30 hover:bg-primary/10`, valor central com `bg-primary/10 rounded-lg px-3 h-10` exibindo o número.
  - Quando `quantity > 0`, linha ganha leve highlight (`bg-primary/5 border-l-2 border-primary`).

## 4. Sobre o evento

- Card glass dedicado em vez de só `<div className="py-6">`:
  - `bg-card/60 backdrop-blur border border-border/60 rounded-2xl p-6`.
  - Título com ícone (Info) em container gradient.
  - Texto em `text-foreground/80 leading-relaxed`.

## 5. Sidebar Resumo (desktop)

- Container já é card; upgrade:
  - `bg-gradient-to-br from-card/90 to-secondary/40 backdrop-blur-xl border border-border/60 shadow-2xl shadow-primary/10`.
  - Header com ícone Receipt + "Resumo do pedido" em uppercase tracking-wider.
  - Linhas de itens com pill de quantidade (`bg-primary/15 text-primary`).
  - **Total destacado** dentro de caixa com gradient sutil (igual ao checkout): `bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-xl px-4 py-3` com valor `text-3xl gradient-text`.
  - Botão CTA com ícone Ticket e altura `h-14`.
  - Trust strip abaixo: 3 mini-selos (Lock, Shield, BadgeCheck).

## 6. Bottom Bar Mobile

- Background: `bg-gradient-to-t from-card via-card to-card/95 backdrop-blur-xl border-t border-primary/20 shadow-2xl shadow-primary/20`.
- Adicionar glow superior (linha gradient indigo→magenta de 1px no topo).
- Total maior (`text-xl gradient-text`), botão `h-12 px-6` com ícone.
- Safe area iOS: `pb-[env(safe-area-inset-bottom)]`.

## 7. Banner "Evento Encerrado"

- Visual mais premium: `bg-gradient-to-r from-destructive/15 to-destructive/5 border-b border-destructive/30 backdrop-blur` com ícone num container vermelho gradient.

## Detalhes técnicos

Arquivo único: `src/pages/EventDetails.tsx` (inclui `LotCard` interno).

Reuso de tokens existentes (`gradient-text`, `glass`, `card-glow`) e novos ícones lucide já no bundle (`Receipt`, `Crown`, `BadgeCheck`, `Info`, `ShieldCheck`).

Sem mudanças em:
- hooks (`useEvent`, `useEventLots`)
- lógica de likes, agrupamento de setores, checkout, auth
- estrutura de dados ou queries
- outros componentes (Header, Footer, modais)

## Fora do escopo
- Nova feature de "Compartilhar", reviews, mapa interativo (podem entrar depois).
- Mudanças no fluxo de checkout (já polido).
- Alterações em rotas ou navegação.
