## Ajustar header da tela de cadastro do produtor

Na tela `/area-do-produtor/cadastro` (componente `ProducerAuth.tsx`), o cabeçalho com a logo + chip "Área do Produtor" está esquisito: a logo e o chip aparecem lado a lado (em vez de empilhados), porque ambos são `inline` dentro do mesmo bloco `text-center`, fazendo o chip "colar" na lateral da logo.

## Solução (mudança visual mínima e premium)

1. **Empilhar logo + chip verticalmente**, centralizados, com gap consistente:
   - Trocar o wrapper `text-center` por `flex flex-col items-center gap-3`.
   - Logo um pouco menor (`h-12` em vez de `h-14`) pra não brigar com o chip.
2. **Refinar o chip** "Área do Produtor":
   - Fundo `bg-primary/10` (em vez de `bg-card/40`) — fica como tag de marca premium, mais coerente com os badges do site.
   - Mantém borda `primary/30`, ícone Sparkles e cor primary.

Sobre a logo aparecer "embaralhada" no screenshot: é a própria arte do PNG (`logo-festpag.png`) — não dá pra corrigir via código. Se quiser, pode subir uma versão limpa do logo que eu troco o asset.

## Arquivo afetado

- **`src/pages/ProducerAuth.tsx`** — apenas o bloco "Logo + chip" (linhas 120–129). Sem novos componentes.