## PASSO 2 — UI: editor de taxa no console do evento (admin)

### Escopo
Mudar **apenas** `src/pages/admin/AdminEventoDetalhe.tsx`. Sem backend, sem outras telas.

### O que vai ser construído

**1. Novo componente `EditEventFeeDialog`** (mesmo arquivo, abaixo da página — só usado aqui)
- Props: `eventId: string`, `open: boolean`, `onOpenChange: (v: boolean) => void`, `currentPix: { percent: number; fixed: number }`, `currentCard: { percent: number; fixed: number }`.
- Estado local com 4 campos string controlados (para permitir digitação livre): `pixPercent`, `pixFixed`, `cardPercent`, `cardFixed`. Inicializados via `useEffect` quando `open` vira `true` (resync se overrides mudarem no banco).
- Parsing: `Number(v.replace(',', '.'))`.

**2. Validação client-side (antes de submeter)**
- Percentuais: número finito, `>= 0` e `<= 100`.
- Fixos: número finito, `>= 0`.
- Erro por campo exibido como `<p className="text-xs text-destructive">` abaixo do `<Input>`.
- Botão **Salvar** fica `disabled` enquanto houver erro ou enquanto a mutation estiver `isPending`.

**3. Aviso 0% (inline, informativo)**
- Quando `pixPercent === 0`: abaixo do par PIX, `<p className="text-xs text-amber-600">Taxa zerada: a plataforma não cobra nada neste método para vendas novas.</p>`.
- Mesma regra para `cardPercent === 0`.
- Não bloqueia o submit.

**4. Aviso geral fixo no rodapé do Dialog**
- `<p className="text-xs text-muted-foreground">Vale para vendas novas. Pedidos já pagos mantêm a taxa congelada.</p>`.

**5. Mutation `useMutation`** chamando:
```ts
supabase.rpc('admin_set_event_fee', {
  p_event_id: eventId,
  p_pix_percent, p_pix_fixed,
  p_card_percent, p_card_fixed,
})
```
- `onSuccess(data)`:
  - `data` é tratado como objeto único (não array). Se `!data`, cai no genérico.
  - Se `data.ok === true`: `toast.success('Taxas atualizadas')`, `queryClient.invalidateQueries({ queryKey: ['admin-event-fees', eventId] })`, fechar dialog.
  - Se `data.ok === false`:
    - `data.error === 'event_not_found'` → `"Evento não encontrado."`
    - `data.error === 'invalid_value'` → `"Confira os valores: percentual de 0 a 100 e fixo não-negativo."`
    - fallback (inclui `not_admin`) → `"Não foi possível salvar. Tente novamente."`
    - `toast.error(msg)`. Dialog continua aberto.
  - Se `data` for null/undefined → `toast.error('Não foi possível salvar. Tente novamente.')`.
- `onError`: `toast.error('Não foi possível salvar. Tente novamente.')` (cobre rede, exceções).

**6. Wire-up no card "Taxas do evento"**
- Adicionar `useState` `feeDialogOpen`.
- Calcular `currentPix` / `currentCard` a partir de `fees` já carregados (linha 113): `find(f => f.payment_method === 'pix')` → `{ percent: Number(row.fee_percent), fixed: Number(row.fee_fixed) }`, com fallback `{ percent: 10, fixed: 0 }`. Mesma coisa para `card`.
- Remover o `disabled` do botão "Editar taxa" e adicionar `onClick={() => setFeeDialogOpen(true)}`. Manter `disabled` apenas enquanto `feesLoading`.
- Renderizar `<EditEventFeeDialog ... />` no final do `return`.

### Layout do Dialog (shadcn)
```text
┌──────────────────────────────────────────────┐
│ Editar taxas do evento                       │
│ {brand_name} · {event.title}                 │
├──────────────────────────────────────────────┤
│ PIX                                          │
│  [Percentual %] [Valor fixo R$]              │
│  ↳ aviso 0% (condicional)                    │
│                                              │
│ Cartão                                       │
│  [Percentual %] [Valor fixo R$]              │
│  ↳ aviso 0% (condicional)                    │
├──────────────────────────────────────────────┤
│ Vale para vendas novas. Pedidos já pagos…   │
│                       [Cancelar] [Salvar]    │
└──────────────────────────────────────────────┘
```
- `Input type="number"` com `step="0.01"` e `min="0"`; `max="100"` nos percentuais.
- Cancelar fecha sem salvar.

### Imports a adicionar
`Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter` de `@/components/ui/dialog`; `Label` de `@/components/ui/label`; `Input` de `@/components/ui/input`; já temos `Button`, `toast`, `useMutation`, `useQueryClient`.

### Fora de escopo
- RPC, edges, schema, outras telas, get_event_fee, orders, service_fee_amount. Pedidos pagos permanecem com taxa congelada.
