## Remover seção "Simples, rápido e premium"

Remover por completo da página `/area-do-produtor` a seção "Como funciona" — o badge "Comece em 3 passos", o título "Simples, rápido e premium", o subtítulo e os 3 cards (Passo 1: Crie sua conta, Passo 2: Configure seu evento, Passo 3: Comece a vender).

A página fica: Hero → Bento das 17 soluções → CTA final ("Pronto para começar?").

## Arquivos afetados

- **`src/pages/AreaDoProdutor.tsx`**:
  - Remover o bloco `{/* COMO FUNCIONA */}` inteiro (a `<section>` com a grade de passos).
  - Remover a constante `steps` no topo do arquivo (não será mais usada).
  - Remover os imports `UserPlus`, `Settings2`, `TrendingUp` do `lucide-react` (ficam órfãos).