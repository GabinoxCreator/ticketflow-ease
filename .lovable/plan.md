## Objetivo
Encaixar a imagem do totem de reconhecimento facial FestPag no hero da `/lp`, de forma harmoniosa com o layout atual (Space Grotesk, fundo escuro, paleta indigo→magenta).

## Layout do hero (split assimétrico)
Reorganizar o `.lp-hero` em duas colunas em desktop, mantendo stack em mobile:

```
┌─────────────────────────┬──────────────────┐
│ eyebrow                 │                  │
│ Headline grande         │   [TOTEM IMG]    │
│ Subtítulo               │   com glow       │
│ [CTA primário] [sec.]   │   atrás          │
└─────────────────────────┴──────────────────┘
```

- Desktop (≥900px): grid `1.1fr 0.9fr`, gap 48px, alinhamento `center`.
- Mobile: coluna única, imagem abaixo do bloco de texto, max-width 320px centralizada.

## Tratamento visual da imagem
A foto tem fundo branco/claro que destoa do tema escuro. Para integrar:

1. **Upload** via `lovable-assets` (foto enviada em `/mnt/user-uploads/`), salvar pointer em `src/assets/festpag-totem.jpg.asset.json`.
2. **Container** `.lp-hero-visual`:
   - `position: relative`, `aspect-ratio: 3/4`, `max-width: 460px`.
   - **Glow atrás**: pseudo `::before` com radial-gradient indigo→magenta a 40% opacidade, `filter: blur(80px)`, escala 1.15 — funde a foto no fundo escuro.
   - **Máscara de fade**: `mask-image: radial-gradient(ellipse at center, black 55%, transparent 95%)` para suavizar bordas brancas da foto e dissolver no fundo.
   - **Overlay**: gradiente sutil `linear-gradient(180deg, transparent 60%, rgba(10,5,20,0.5) 100%)` por cima para escurecer a base.
   - `border-radius: 20px`, sem border visível (a máscara já dissolve).
   - `box-shadow: 0 30px 80px -20px rgba(99,102,241,0.4)` para profundidade.
3. **Animação de entrada** opcional: `opacity 0→1` + `translateY(20px→0)` em 600ms.

## Ajustes no texto do hero
- Diminuir `max-width` do bloco de texto para `560px` (antes era centralizado em 720px).
- Manter alinhamento à esquerda (em vez do centralizado atual) para combinar com o split.
- CTAs alinhados à esquerda em desktop, centralizados em mobile.

## Arquivo
- **Editado**: `src/pages/LandingLp.tsx`
  - Adicionar import do pointer `festpag-totem.jpg.asset.json`.
  - Substituir layout interno de `.lp-hero` por `.lp-hero-grid` com duas colunas (texto + visual).
  - Adicionar regras CSS no `LP_CSS`: `.lp-hero-grid`, `.lp-hero-copy`, `.lp-hero-visual`, `.lp-hero-visual img`, `.lp-hero-visual::before` (glow), media query mobile.
- **Criado**: `src/assets/festpag-totem.jpg.asset.json` (via CLI).

## Fora de escopo
- Sem mudança em outras seções, formulário, edge function, copy, rotas ou tema global.
