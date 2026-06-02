## Diagnóstico
Olhando o /lp ao vivo: o problema não é mais escala — é **excesso de ênfase**. Tudo grita ao mesmo tempo: headline gigante em display Syne 800, cada section-title repete o mesmo tratamento "metade em itálico-gradiente", labels em roxo brilhante, cards quase transparentes, e o botão CTA gradiente compete com o título. Resultado: nenhum elemento tem peso real porque todos têm peso máximo.

Para parecer profissional preciso **hierarquizar e silenciar**: uma única fonte mais sóbria, gradiente usado com parcimônia (não em todo título), cards com superfície real, botões com hierarquia clara (primário/secundário).

## Mudanças

### 1. Fonte — trocar a família display
- Substituir **Syne** por **Space Grotesk** (heading) e **DM Sans** mantém no corpo.
  - Space Grotesk é a fonte usada por fintechs modernas (Nubank-like sobriedade + caráter geométrico). Syne tem caráter "designer/artístico" que destoa do posicionamento "banco oficial dos eventos".
- Pesos usados: 500 (corpo de destaque), 600 (h3/h4), 700 (h2 e display). Sem 800.

### 2. Escala tipográfica recalibrada (mais contida)
```
display    clamp(36px, 4.8vw, 56px)   weight 700, line 1.05, tracking -0.025em
h2         clamp(26px, 3vw, 36px)     weight 700, line 1.15, tracking -0.02em
h3         18px                       weight 600
h4         15px                       weight 600
lead       17px                       weight 400, color fg-soft
body       15px                       weight 400, color fg-mute
small      13px                       weight 400
label      11px                       weight 600, tracking 1.5px (não 3px)
```
Tudo cai um degrau. Display passa de 72px → 56px máx, h2 de 44 → 36, label de tracking 3px → 1.5px (mais legível, menos "tag de SaaS dos anos 2010").

### 3. Tratamento de ênfase — uma regra única
- Gradiente azul→pink é usado **somente** em:
  - 1 palavra/expressão-chave do headline do hero ("vender mais")
  - O wordmark do logo (já é PNG)
  - O CTA primário
- **Remover** o `<em>gradient italic</em>` de todos os section-titles. Section-titles ficam em branco sólido com 1 palavra-chave em pink sólido (`--fest-pink`) quando precisar de cor — sem itálico, sem gradiente.
- Labels deixam de ser roxo elétrico (`#B492FF`) e passam a um tom mais sóbrio (`rgba(255,255,255,0.5)` com 1.5px tracking).

### 4. Cards — superfície real
Hoje os cards são `rgba(255,255,255,0.025)` — quase invisíveis no preto. Trocar para:
- `background: #14082A` (superfície elevada visível)
- `border: 1px solid rgba(255,255,255,0.06)`
- Hover: border passa a `rgba(255,255,255,0.14)` + leve `translateY(-2px)`
- Padding interno reduzido para 22px (mais compacto, mais "card de produto" e menos "banner")
- Cantos: 12px (mais corporativo) em vez de 16px

### 5. Botões — hierarquia clara
- **Primário** (hero CTA, footer CTA, submit): gradiente, altura 52px, sem `transform: translateY(-2px)` no hover (só `opacity: .92`) — menos "balãozinho subindo".
- **Secundário** (nav, footer "ver mais"): outline com `border: 1px solid rgba(255,255,255,0.18)`, fundo transparente, hover preenche com `rgba(255,255,255,0.06)`. Mesma altura.
- Sombra reduzida — `0 8px 24px -12px rgba(224,64,160,0.4)` (era `0 12px 40px -12px ... .55` = "neon").

### 6. Hero — menos volume
- Logo: 56px de altura (era 64).
- Headline: passa pra `clamp(36px, 4.8vw, 56px)`, line-height 1.05, max-width 720px, tracking -0.025em. Vai caber em 2-3 linhas em vez de 5.
- Sub: 17px, color `fg-soft`, max-width 540px.
- Tag "O banco oficial dos eventos": passa de pink puro para `rgba(255,255,255,0.5)` com tracking 2px — vira eyebrow discreto.
- CTA primário no centro + secundário "Ver soluções" ao lado (scroll-link para a seção Ecossistema) — dá hierarquia.
- Min-height: 80vh (era 88).

### 7. Section titles — padrão único
Estrutura visual:
```
LABEL (sóbrio)
Título em branco. Palavra-chave em pink.
─── (divider mais fino: 32px × 2px)
[corpo da seção]
```
Sem itálico. Sem gradiente nos h2.

### 8. Ecossistema — substituir as setas "↓" por linha conectora
A seta emoji `↓` parece improvisada. Trocar por uma linha vertical fina (1px, gradiente blue→pink, 24px de altura) entre os cards do flow.

### 9. Métricas (totem) — alinhar com cards
Hoje têm border roxa e número em gradiente. Trocar para: mesmo `background: #14082A`, número em branco sólido peso 700 Space Grotesk, label embaixo em `--fg-mute`. Sem gradiente nos números.

### 10. Compare (modelo antigo vs novo) — equilibrar
- Box "antigo" e "novo" com mesma border base (`rgba(255,255,255,0.06)`).
- Diferenciação só no dot (vermelho vs azul) e no título (color discreto).
- Sem `border: 1px solid rgba(255,80,80,0.22)` competindo com a paleta principal.

### 11. Form — fundo mais discreto
- Remover o radial gigante embaixo do form.
- Card do form com mesmo `#14082A` + border 1px branco a 8%. Shadow muito mais sutil.
- Input height 48px mantido, mas border `rgba(255,255,255,0.08)` (não roxo).
- Submit button: gradiente, mesma sombra reduzida.

### 12. Footer
- Logo 36px (era 40). Tagline 14px em `fg-mute`. URL e CTA mantidos com mesma linguagem dos botões.

## Arquivo
- **Editado**: `src/pages/LandingLp.tsx` — reescrita do bloco `LP_CSS` (novos tokens, nova escala, nova superfície de cards), troca da fonte no `<link>` do Helmet (Space Grotesk + DM Sans), pequenos ajustes no JSX para:
  - remover os `<em>` dos section-titles que estavam sendo emfatizados em itálico-gradiente (sublinhando manualmente a palavra-chave em pink quando fizer sentido)
  - trocar as setas `↓` por `<div className="eco-link" />`
  - adicionar o botão secundário "Ver soluções" no hero

## Fora de escopo
- Sem mudança em conteúdo/copy (mesma narrativa, mesmos textos).
- Sem mudança no formulário, edge function, RLS ou navegação.
- Sem mudança no tema global do app — continua escopado em `.lp-root`.
