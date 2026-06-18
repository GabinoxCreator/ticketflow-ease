## Contexto
Corrigir a agregação do hook `useAdminStats.ts` e os cards do `AdminDashboard.tsx`.

## Arquivos
- `src/hooks/useAdminStats.ts`
- `src/pages/admin/AdminDashboard.tsx`

## Mudanças em `useAdminStats.ts`

1. **Orders — status correto**
   - Trocar `.select('total_amount')` para `.select('total_amount, service_fee_amount')`.
   - Trocar `.eq('status', 'completed')` para `.eq('status', 'paid')`.

2. **Orders — duas métricas**
   - `gmv`: soma de `total_amount` (bruto).
   - `platformRevenue`: soma de `service_fee_amount` com `COALESCE(0)` por item (`Number(o.service_fee_amount || 0)`).

3. **Payouts — status correto**
   - Manter `.select('net_amount, status')`.
   - Trocar filtro `.filter(p => p.status === 'pending')` para `'requested'`.
   - Manter soma de `net_amount`.

4. **Retorno do hook**
   - `{ totalProducers, totalEvents, gmv, platformRevenue, pendingPayouts }`
   - Remover `totalRevenue`.

## Mudanças em `AdminDashboard.tsx`

1. **Duas linhas de cards:**
   - **Linha 1 (financeiro, destaque):** GMV · Receita da Plataforma · Repasses Pendentes → `lg:grid-cols-3`
   - **Linha 2 (contexto):** Produtores · Eventos → cards menores/discretos (`grid-cols-2` com max-width)

2. **Destaque no card "Receita da Plataforma"**
   - Aplicar `admin-gradient` no ícone/chip ou na borda do card (usar o padrão já existente, sem inventar cor nova).

## Fora de escopo
- RLS, edge functions, schema, orders já pagos.