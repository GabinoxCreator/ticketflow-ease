## Plano: Adicionar Receita Líquida (após MP) na Linha 1 do Admin Dashboard

Escopo: apenas `src/hooks/useAdminPlatformNet.ts` (novo) e `src/pages/admin/AdminDashboard.tsx`. Os gráficos, Bloco 2 (Mix/Top 5) e demais seções permanecem intactos.

---

### 1) Novo hook `src/hooks/useAdminPlatformNet.ts`

- Criar hook que faz `useQuery({ queryKey: ['admin-platform-net'], queryFn: ... })`.
- Chamar `supabase.rpc('admin_platform_net')` — a RPC já existe e retorna um objeto único `jsonb { gross, mpCost, net }`.
- Tratar resposta nula como `{ gross: 0, mpCost: 0, net: 0 }`.
- Retornar objeto tipado `{ gross: number; mpCost: number; net: number }`.

---

### 2) `src/pages/admin/AdminDashboard.tsx` — ajustar Linha 1 financeira

Mudanças na grid da Linha 1 (passa de 3 para 4 cards):

| Posição | Título | Valor | Destaque | Observações |
|---------|--------|-------|----------|-------------|
| 1 | GMV | `stats.gmv` | — | sem alteração |
| 2 | Receita de Taxas (bruta) | `stats.platformRevenue` | — | **renomeado** de "Receita da Plataforma"; **remove** `.admin-gradient` |
| 3 | Receita Líquida (após MP) | `net` da RPC | `.admin-gradient` | **novo card**; subtítulo "− R$X,XX em taxas Mercado Pago" usando `mpCost`; se `net < 0`, valor em `text-destructive` |
| 4 | Repasses Pendentes | `stats.pendingPayouts` | — | sem alteração |

- Ajustar a grid de `grid-cols-1 md:grid-cols-3` para `md:grid-cols-4` na Linha 1.
- Usar `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` para todos os valores monetários (já existe helper `formatCurrency`).
- Enquanto `seriesLoading` (ou novo estado de loading do hook), o card "Receita Líquida" exibe `<Skeleton className="h-10 w-24" />` no lugar do valor.
- Não tocar em Bloco 2 (Mix de pagamento / Top 5 eventos) nem em Bloco 3 (gráficos de séries temporais).

---

### Resumo de arquivos

- **Criar:** `src/hooks/useAdminPlatformNet.ts`
- **Editar:** `src/pages/admin/AdminDashboard.tsx` (Linha 1: 4 cards, renomear, mover gradiente, adicionar card novo)