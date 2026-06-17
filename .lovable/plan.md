## Admin — Console do Evento, PASSO 1 (somente leitura)

### Arquivos

1. **Editar `src/App.tsx`** — adicionar rota:
   - `import AdminEventoDetalhe from "./pages/admin/AdminEventoDetalhe";`
   - `<Route path="/admin/eventos/:eventId" element={<AdminProtectedRoute><SectionProtectedRoute section="produtores"><AdminEventoDetalhe /></SectionProtectedRoute></AdminProtectedRoute>} />` (mesma seção `produtores` que já gateia a ficha do produtor).

2. **Editar `src/pages/admin/AdminProdutorDetalhe.tsx`** — só na aba "Eventos":
   - Envolver o `<Card>` de cada evento em um `onClick={() => navigate(`/admin/eventos/${ev.id}`)}` + `cursor-pointer` + `hover:border-primary/40` + `role="button"`.
   - Nenhuma outra alteração na página.

3. **Criar `src/pages/admin/AdminEventoDetalhe.tsx`** — nova página, somente leitura.

### Página `AdminEventoDetalhe` — leituras (4 useQuery em paralelo via react-query)

Tudo direto via `supabase` (admin bypassa RLS). Sem RPC nova, sem edge.

- `['admin-event', eventId]` → `events` por `id`, com join `producer_profiles(id, brand_name)`.
- `['admin-event-lots', eventId]` → `event_lots` por `event_id`, ordenado por `display_order` (campos: `id, name, price, total_quantity, sold_quantity, reserved_quantity`).
- `['admin-event-fees', eventId]` → `event_fee_overrides` por `event_id` (`payment_method, fee_percent, fee_fixed`).
- `['admin-event-orders-kpi', eventId]` → `orders` por `event_id` com `status in ('paid','completed')`, selecionando só `total_amount, service_fee_amount`. Agregação no client:
  - **Receita bruta** = Σ `total_amount`.
  - **Receita da plataforma** = Σ `service_fee_amount` (coalesce 0).
  - **Líquido do produtor** = bruta − plataforma.
  - Sem invenção: se vier vazio, mostra `R$ 0,00` exatamente como hoje no dashboard. O conserto fica para a frente D.

### Layout (admin-theme, claro, reaproveitando shadcn já usado em AdminProdutorDetalhe)

- `AdminLayout title="Evento"`.
- **Breadcrumb** topo: `Admin / {brand_name do produtor (link p/ /admin/produtores/:producer_profile_id)} / {título do evento}` + botão "voltar" (`ArrowLeft`) p/ a ficha do produtor.
- **Cabeçalho do evento**: título grande (`font-display`), linha com data formatada (`formatEventDate`, regra `T12:00:00`), `city · venue_name`, `Badge` de status (mesmo mapa de cores já usado: published/draft/etc).
- **Selo**: `Badge variant="outline"` âmbar — "Visão administrativa — somente leitura nesta etapa".
- **KPIs** — 4 `Card`s em grid `md:grid-cols-4`:
  - Ingressos vendidos = Σ `sold_quantity` dos lotes.
  - Receita bruta · Receita da plataforma · Líquido do produtor — `Intl.NumberFormat pt-BR` BRL.
  - Cada card com ícone (`Ticket`, `Banknote`, `Percent`, `Wallet`) no estilo dos cards existentes.
- **Card "Ingressos (lotes)"** — `Table` shadcn: Lote / Preço (BRL) / Vendidos / Disponíveis.
  - Disponíveis = `total_quantity - sold_quantity - reserved_quantity`; se `<= 0`, exibir `Badge` "Esgotado".
  - Loading → skeleton de 3 linhas. Vazio → "Nenhum lote cadastrado".
- **Card "Taxas do evento"** — listar UMA linha para cada registro existente em `event_fee_overrides` do evento:
  - Exibir o `payment_method` EXATAMENTE como está no banco (sem renomear/normalizar).
  - Formato: `{payment_method} — {fee_percent}% + R$ {fee_fixed}`.
  - Se NÃO houver nenhum override para o evento, exibir uma única linha:
    "Sem taxa configurada — usando 10% padrão (todos os métodos)".
  - Não assumir quais métodos existem; apenas refletir os dados.
  - Botão `Editar taxa` (`Button variant="outline" disabled`) com tooltip "Em breve (passo 2)".
- **Card "Mapa de mesa"**:
  - `events.table_map_id` truthy → texto "Este evento usa um mapa de mesas." + nota "Pré-visualização disponível em breve."
  - Caso contrário → "Evento sem mapa (venda por lote)."
- **Estados globais**: enquanto qualquer query principal carrega, skeletons nos cards correspondentes. Se `events` não encontrar → estado vazio "Evento não encontrado" + botão voltar. Erro de query → mensagem inline + toast `sonner`.

### Helpers internos ao arquivo

- `formatMoneyBRL(n: number)`.
- Reutilizar `formatEventDate` de `@/lib/eventTime` (já trata fuso/data string).
- Mapa de cores/labels de status reaproveitado do estilo da página do produtor (cópia local pequena, sem extrair componente).

### Fora do escopo

- Nenhuma escrita, RPC, edge function, bucket, RLS, migration.
- Sem mexer no `AdminSidebar` (a navegação acontece via clique no card de evento dentro da ficha do produtor; rota direta funciona).
- Sem tocar em produtor/colaborador/site público.
- Sem corrigir a agregação financeira — os valores aparecem como vierem do banco hoje.
