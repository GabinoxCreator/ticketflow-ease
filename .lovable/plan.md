## 1. Lista de ingressos (aba Check-in) — fundo claro

No `ColaboradorQRTab.tsx`, os cards de ingresso herdam o `bg-card` do tema (renderizando escuro nesse contexto). Trocar por estilo claro explícito, consistente com o card "Lista de ingressos" acima:

- Card do ingresso: `bg-white border border-slate-200 shadow-sm` (em vez de `Card` padrão + `dark:` classes).
- Texto do nome: `text-slate-900`.
- Email/lote/código: `text-slate-500`.
- Card validado (`used`): `bg-slate-50` + `opacity-70` para indicar concluído sem virar preto.
- Badges de status: manter as cores atuais (verde/cinza/laranja/vermelho em opacidade 10), garantindo contraste no fundo branco.
- Botão "Check-in": manter primário (já está bom no claro).

Sem mudanças de lógica/funcionalidade — só visual.

## 2. Feed Ao Vivo mostrando "Cliente" genérico

Causa confirmada no banco: alguns pedidos `paid` têm `customer_name` vazio (checkout autenticado que não preencheu o nome do comprador), mas têm `user_id`. Hoje o edge function `collaborator-live-stats` cai no fallback `'Cliente'`.

Correção no `supabase/functions/collaborator-live-stats/index.ts`:

1. Coletar `user_id` dos pedidos cujo `customer_name` está vazio/nulo.
2. Buscar `profiles` (`id, nome_completo`) em lote para esses ids.
3. Fallback adicional: se o profile não tiver nome, usar `holder_name` do primeiro ticket pago do pedido (já temos os tickets carregados — incluir `holder_name` no select).
4. Ordem de prioridade ao montar o feed:
   `orders.customer_name` → `profiles.nome_completo` → `tickets.holder_name` (primeiro do pedido) → `'Cliente'`.

Apenas o edge function muda. UI do `ColaboradorAoVivoTab` permanece igual (já renderiza `customer_name`).

## Arquivos

- `src/components/colaborador/ColaboradorQRTab.tsx` — estilo claro da lista de ingressos.
- `supabase/functions/collaborator-live-stats/index.ts` — resolver nome real do cliente via profiles + holder_name.

## Validação

- Aba Check-in: lista renderiza em fundo claro, validados com tom suave de cinza.
- Aba Ao Vivo: feed mostra nome do profile (ou do titular do ingresso) no lugar de "Cliente" genérico.
