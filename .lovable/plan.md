## Objetivo
Recortar o totem da imagem (remover o fundo branco/clean da loja e a pessoa de costas), deixar só o kiosk FestPag flutuando com sombra, e no mobile encaixá-lo **sobreposto ao título** ao invés de ficar empilhado acima.

## 1. Nova versão da imagem (fundo transparente)
- Gerar via `imagegen` (premium, `transparent_background: true`) um totem FestPag de reconhecimento facial estilizado, fiel ao da foto original (tela vertical mostrando "RECONHECIMENTO FACIAL ATIVO", base roxa com logo "festpag digital", impressora de cupom + leitor NFC).
- Salvar em `src/assets/festpag-totem-cutout.png` como asset Lovable (`.asset.json`).
- Substituir o import em `LandingLp.tsx` para o novo pointer.
- Deletar o asset antigo (`festpag-totem.jpg.asset.json` → CDN cleanup).

Por que gerar e não recortar a foto original: a foto tem a moça de costas e a base do display ofuscada; um cutout PNG limpo encaixa bem melhor sobreposto a texto e sombra fica realista.

## 2. Tratamento visual (desktop)
Reescrever `.hero-visual` para PNG transparente:
- Remover `mask-image`, `border-radius`, `aspect-ratio` fixo e overlay `::after` (não faz sentido com PNG recortado).
- `img { object-fit: contain; filter: drop-shadow(0 30px 60px rgba(99,102,241,0.45)) drop-shadow(0 10px 30px rgba(236,72,153,0.35)); }` — sombra colorida real seguindo o contorno do totem.
- `::before` mantém o glow radial indigo→magenta atrás, com `blur(80px)` e `opacity 0.7`.
- `max-width: 440px`, `min-height: 520px`.
- Sutil `float` animation (translateY ±6px, 6s ease-in-out infinite) pra dar vida.

## 3. Mobile (< 900px) — sobrepondo o título
Layout proposto (viewport 390px):

```text
┌───────────────────────────────┐
│   O banco oficial dos eventos │
│   [logo festpag]              │
│                       ╭─────╮ │
│   A operação         │     │ │
│   inteligente para   │TOTEM│ │
│   eventos que        │     │ │
│   querem vender mais ╰─────╯ │
│                               │
│   Reduzir filas e operar...   │
│   [Falar com a equipe]        │
└───────────────────────────────┘
```

Técnica:
- Hero volta para layout de coluna única (sem grid split no mobile).
- `.hero-copy` recebe `position: relative`.
- `.hero-visual` no mobile: `position: absolute; top: 30%; right: -20px; width: 180px; height: auto; z-index: 0; opacity: 0.85;` — flutua sobre o lado direito da headline.
- `.hero-headline` ganha `position: relative; z-index: 1` e o `<span>` colorido fica visível por cima quando há overlap.
- Drop-shadow mantida pra dar profundidade quando overlap acontece sobre texto.
- Remover `order: 1/2` que tínhamos; agora é overlay absoluto.
- CTAs e sub-texto permanecem no fluxo normal sem serem cobertos (totem fica no terço superior direito).

Alternativa de fallback se ficar bagunçado: `right: -30px; width: 200px; top: 40%; transform: rotate(-3deg)` pra dar dinamismo estilo "produto in-situ".

## 4. Animação
Adicionar `@keyframes heroFloat` (translateY 0 → -8px → 0, 6s, infinite, ease-in-out). Aplicada via wrapper para não brigar com drop-shadow.

## Arquivos
- **Editado**: `src/pages/LandingLp.tsx` (import novo asset, CSS do `.hero-visual` reescrito, media query mobile).
- **Criado**: `src/assets/festpag-totem-cutout.png.asset.json` (via imagegen + lovable-assets, transparente).
- **Deletado**: `src/assets/festpag-totem.jpg.asset.json` (asset antigo).

## Fora de escopo
Sem mudanças em copy, formulário, outras seções, rotas ou tema global.
