## Objetivo
Substituir a imagem do hero da `/lp` pela nova foto enviada (`foto_land.png`) e garantir que no mobile ela apareça inteira logo no início (acima da dobra), sem cortar e sem empurrar o texto pra fora da tela. No desktop, manter o layout split atual.

## Mudanças

### 1. Asset
- Upload de `/mnt/user-uploads/foto_land.png` via `lovable-assets` CLI → `src/assets/festpag-totem.jpg.asset.json` (substitui o pointer atual, mesma key usada no import).
- Deletar o asset antigo para não deixar lixo no CDN.

### 2. Mobile (< 900px) — caber no início
Hoje no mobile a imagem fica abaixo do texto. Vou inverter a ordem e reduzir altura pra caber acima da dobra:

- `.hero-grid` em mobile: `grid-template-columns: 1fr`, `gap: 24px` (era 40px).
- `.hero-visual` aparece **antes** do `.hero-copy` no mobile via `order: -1`.
- `.hero-visual` mobile: `max-width: 220px` (era 320px), `aspect-ratio: 9/16` (era 3/4) — combina com a proporção vertical da nova foto.
- Reduzir padding-top do `.hero` em mobile: `padding: 80px 20px 60px` (era ~120px) pra dar mais espaço.
- Headline mobile: reduzir `clamp` mínimo de fonte se necessário pra equilibrar.

### 3. Desktop (≥ 900px) — manter
- Grid `1.1fr 0.9fr` permanece.
- Ajustar `aspect-ratio` da `.hero-visual` para `9/16` e `max-width: 380px` (era 460px com 3/4) pra acomodar melhor a nova foto vertical sem dominar a coluna.
- Manter glow, máscara radial e overlay.

### 4. Máscara/glow
- Manter o tratamento atual (radial mask, glow indigo→magenta, box-shadow). A nova imagem já tem fundo escuro/roxo, então a máscara dissolve naturalmente — sem precisar de ajustes pesados.

## Arquivos
- **Editado**: `src/pages/LandingLp.tsx` (apenas CSS no `LP_CSS` + ordem do JSX se necessário via `order`).
- **Substituído**: `src/assets/festpag-totem.jpg.asset.json` (novo upload).
- **Deletado**: asset antigo no CDN.

## Fora de escopo
Nenhuma mudança em copy, formulário, outras seções, rotas ou tema global.
