## Objetivo
Refatorar `src/pages/LandingLp.tsx` para corrigir os problemas de harmonia visual: escala tipográfica inconsistente, SVGs de logo "festpag.digital" feitos à mão (que não batem com a marca), espaçamentos irregulares entre seções e cartões com pesos visuais desencontrados.

O HTML original era inspiração — vou manter a estrutura narrativa (hero → o que é → como funciona → ROI → Facepag → modelo antigo vs novo → para quem → formulário) mas reconstruir a camada visual de forma coerente.

## O que muda

### 1. Logo
- Trocar os 3 SVGs inline (nav, formulário, footer) pela logo oficial `src/assets/logo-festpag.png`.
- Tamanhos coerentes: 32px no nav, 56px no hero, 48px no card do formulário, 40px no footer.

### 2. Escala tipográfica (uma única escala harmônica)
Sistema modular baseado em 1.25 (major third), Syne para títulos, DM Sans para corpo:

```
display   clamp(40px, 6vw, 72px)   hero headline
h2        clamp(28px, 4vw, 44px)   section titles
h3        22px                     card titles
h4        16px                     sub-cards
body-lg   18px                     hero sub, intro
body      15px                     corpo padrão
label     11px / tracking 2.5px    section labels
micro     13px                     legendas
```

Hoje tem `clamp(28,5vw,52)` no hero, `28px` em section-title, `15px` em corpo, `13/14/16` misturados em cards — vou unificar.

### 3. Ritmo vertical
- Padding de seção único: `clamp(80px, 10vw, 120px) 24px`.
- `section-inner` max-width 1040px (hoje 900px, aperta em desktop).
- Gap interno consistente entre label → title → divider → conteúdo: 16 / 24 / 40.
- Remover o alternado `nth-of-type(even)` agressivo; usar fundo sutil só em 2 seções-chave para criar respiração, não zebra.

### 4. Cards e componentes
- Unificar border-radius (16px cards, 24px CTAs, 40px pills).
- Unificar border (`1px solid hsl(var(--border) / 0.15)`) e hover.
- Grid de "como funciona" / "Facepag" / ROI com mesmo tamanho de ícone (48px), mesmo padding (28px), mesma altura mínima.
- "Modelo antigo vs novo": colunas com mesma altura, divisor central sutil.

### 5. Hero
- Reduzir altura para `min-height: 88vh` e centralizar melhor.
- Glow radial mais sutil, grid de fundo opacidade 0.03.
- Espaço entre logo / headline / sub / tag / CTA padronizado (24/20/12/32).

### 6. Formulário
- Card do formulário com mesma linguagem dos demais (mesmo radius, border, shadow).
- Logo PNG no topo no lugar do SVG. Inputs com mesma altura (48px), mesmo radius (10px).

### 7. Mobile
- Mesma escala via `clamp()`, sem media queries adicionais.
- Padding lateral de 20px em <640px.
- Garantir que cards empilhem em 1 coluna < 768px.

## Arquivos
- **Editado**: `src/pages/LandingLp.tsx` — reescrita do bloco `LP_CSS` (sistema de design único) e troca dos 3 SVGs inline pelo `<img src={logoFestpag}>`. JSX da estrutura permanece igual (mesmo conteúdo, mesmas seções, mesmo formulário e mesma chamada à edge `submit-landing-lead`).

## Fora de escopo
- Nada de mudanças no backend, edge functions, RLS ou tabela `landing_leads`.
- Nada de mudança no fluxo de submissão, validação ou em outras rotas.
- Não toca no tema global do app (continua escopado em `.lp-root`).
