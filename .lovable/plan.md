
# Corrigir Centralizacao dos Cards no Mobile - Solucao Definitiva

## Problema
Mesmo com `overflow-x-hidden` no div raiz da pagina, os cards continuam deslocados para a esquerda no mobile. Isso indica que o overflow esta acontecendo em um nivel acima (body/html) ou que algum elemento absoluto/fixo esta empurrando o layout.

## Solucao

### 1. Arquivo: `src/index.css` - Forcar overflow-x hidden globalmente

Adicionar regras no `html` e `body` para impedir overflow horizontal em toda a aplicacao:

```css
html {
  scroll-behavior: smooth;
  overflow-x: hidden;
}

body {
  @apply bg-background text-foreground font-body antialiased;
  overflow-x: hidden;
  width: 100%;
  max-width: 100vw;
}
```

### 2. Arquivo: `src/pages/EventDetails.tsx` - Ajustar banner e conteudo

- Trocar a section do banner para usar `max-w-full` explicitamente
- Adicionar `w-full max-w-full` na `main` para garantir que nada extrapole

Alterar a `main` (linha 158):
```
<main className="pt-20 w-full max-w-full">
```

Essas mudancas resolvem o problema na raiz, impedindo que qualquer elemento cause overflow horizontal independentemente do dispositivo.
