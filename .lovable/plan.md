## Objetivo

Resolver o "corte feio" entre o hero gradiente (roxo/magenta) e a seção "Tudo que você precisa…" na página `/area-do-produtor`, criando uma transição premium e fluida entre as áreas.

## Diagnóstico

Hoje o hero termina abruptamente — o gradiente roxo/magenta corta direto no preto chapado da próxima seção. Visualmente parece "duas páginas coladas", sem hierarquia.

## Solução de design (sutil, premium, sem mudar o conteúdo)

1. **Fade-out gradiente do hero**
   Adicionar uma camada absoluta na base do hero (`bg-gradient-to-b from-transparent to-background`, altura ~160px) para o gradiente roxo/magenta morrer suavemente no `background` em vez de cortar.

2. **Linha luminosa divisória ("light beam")**
   Inserir na borda inferior do hero uma linha horizontal fina com gradiente (`from-transparent via-primary/60 to-transparent`, ~60% de largura, centralizada) + um halo difuso (`blur-2xl` com `bg-primary/30`) logo abaixo. Resultado: um filete de luz premium estilo Apple/Linear separando as seções.

3. **Respiro generoso**
   Trocar `py-16 md:py-24` do hero para `pt-16 md:pt-24` + `pb-32 md:pb-44`, dando espaço para o fade-out + light beam respirarem sem encostar nos botões.

4. **Continuidade de glow**
   A seção `ProducerSolutionsBento` já tem glows roxo/rosa nos cantos — com o fade-out alinhado, o olho percebe continuidade visual em vez de quebra.

## ASCII (antes / depois)

```text
ANTES                          DEPOIS
┌──────────────────┐          ┌──────────────────┐
│  HERO GRADIENTE  │          │  HERO GRADIENTE  │
│  [Botões]        │          │  [Botões]        │
│                  │          │     ⋮ fade ⋮     │
├──────────────────┤  ← corte │  ──── ✨ ────    │ ← light beam
│ TUDO QUE VOCÊ…   │          │ TUDO QUE VOCÊ…   │
└──────────────────┘          └──────────────────┘
```

## Arquivos afetados

- **`src/pages/AreaDoProdutor.tsx`** — apenas a `<section>` do hero (alteração de padding + 3 elementos decorativos novos `pointer-events-none` na borda inferior). Sem mexer em conteúdo, botões ou tipografia. Sem novas dependências.

Nada mais é tocado — o bento, o "Como funciona" e o CTA final continuam idênticos.