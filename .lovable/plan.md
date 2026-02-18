
# Corrigir Centralizacao dos Cards no Mobile

## Problema
A pagina tem overflow horizontal (barra de rolagem horizontal visivel na captura de tela). Isso faz com que todo o conteudo pareja deslocado para a esquerda, porque a pagina fica mais larga que a viewport.

O `container` do Tailwind ja esta configurado com `center: true` no `tailwind.config.ts`, entao o problema nao e a centralizacao em si, mas sim o overflow horizontal que cria uma barra de scroll e desloca tudo.

## Solucao

### Arquivo: `src/pages/EventDetails.tsx`

Adicionar `overflow-x-hidden` no div raiz da pagina (linha 155) para impedir que qualquer elemento interno cause overflow horizontal:

```
// De:
<div className="min-h-screen bg-background">

// Para:
<div className="min-h-screen bg-background overflow-x-hidden">
```

Isso vai:
- Eliminar a barra de rolagem horizontal
- Manter todos os cards centralizados corretamente
- Nao afetar o scroll vertical
