## Peça 4 — UI Admin de Repasses

Substituir o placeholder de `src/pages/admin/AdminRepasses.tsx` por uma tela funcional. Nenhum outro arquivo é alterado (sem mexer em backend, bucket, produtor, colaborador ou site público).

### Arquivos
- **Editar:** `src/pages/admin/AdminRepasses.tsx` (única alteração).
- Mantém `AdminLayout`, tema `.admin-theme` (claro), shadcn/ui, `sonner` para toasts, Space Grotesk em números/títulos via classes já existentes do tema admin.

### Estrutura da tela
- Título `Repasses financeiros`.
- `Tabs` shadcn: `Solicitados` / `Pagos` / `Todos`, cada um com contagem em badge.
  - Aba controla o filtro passado ao RPC: `requested` / `paid` / `null`.
- Para contagens, faço 1 `useQuery` por aba (3 queries: `['admin-payouts','requested'|'paid'|'all']`) com `staleTime` curto. Cada aba renderiza sua própria tabela a partir da sua query (simples, evita filtragem client-side e mantém contagem coerente).

### Tabela (colunas)
1. **Produtor / evento** — `produtor` em destaque, `evento` em muted abaixo.
2. **Conta de destino** — render adaptativo de `bank_account_snapshot`:
   - Se `pix_key` truthy → linha 1 `PIX · {pix_key}`, linha 2 `{bank_name} · {account_holder_name}` (cada campo omitido sem quebrar; separador `·` só entre campos presentes).
   - Senão → linha 1 `{bank_name}`, linha 2 `Ag {agency} · Conta {account_number}`, linha 3 `{account_holder_name}`.
   - Helper puro `formatDestino(snapshot)` retorna `string[]` de linhas não vazias.
3. **Solicitado em** — `period_start` formatado `dd/mm/aaaa` (string `YYYY-MM-DD` + `T12:00:00` antes do `new Date`, conforme regra do projeto).
4. **Valor** — `net_amount` formatado em `R$` (`Intl.NumberFormat pt-BR`), classe Space Grotesk.
5. **Status / ação** — depende do status:
   - `requested` → `Badge` "Solicitado" + botão `Marcar como pago`.
   - `paid` → texto `Pago em {paid_at dd/mm/aaaa}` + bloco de comprovante (ver abaixo).

### Marcar como pago (requested)
- Botão abre `AlertDialog` com resumo: Valor + linhas de destino (titular/PIX ou banco/conta).
- Confirmar dispara `useMutation` → `supabase.rpc('admin_mark_payout_paid', { p_payout_id })`.
- `isPending` desabilita o botão (evita duplo clique).
- Resposta:
  - `ok: true` → `toast.success('Repasse marcado como pago')` + `invalidateQueries(['admin-payouts'])`.
  - `ok: false` mapeado:
    - `invalid_status` → "Este repasse não está mais como solicitado."
    - `payout_not_found` → "Repasse não encontrado."
    - outros / exception (inclui `not_admin`, rede) → "Não foi possível concluir. Tente novamente."

### Comprovante (paid)
- Sem `receipt_url` → `Badge` "Sem comprovante" + botão `Anexar comprovante`.
- Com `receipt_url` → `Badge` "Comprovante anexado" + botão `Ver`.

**Anexar:**
- `<input type="file" accept="application/pdf,image/*" hidden>` disparado pelo botão.
- `useMutation`:
  1. `path = ${payout_id}/${Date.now()}-${sanitize(file.name)}`
  2. `supabase.storage.from('payout-proofs').upload(path, file, { upsert: false })`.
  3. Em sucesso → `supabase.rpc('admin_attach_payout_receipt', { p_payout_id, p_path: path })`.
  4. `ok: true` → `toast.success('Comprovante anexado')` + invalidate.
- Botão em estado `Enviando…` enquanto pendente (evita duplo clique).
- Erros de upload / RPC → `toast.error("Não foi possível concluir. Tente novamente.")`.

**Ver:**
- `onClick` → `supabase.storage.from('payout-proofs').createSignedUrl(receipt_url, 60)`; `window.open(data.signedUrl, '_blank', 'noopener')`. Nunca `getPublicUrl`.
- Erro → toast genérico.

### Estados auxiliares
- Loading da query → skeleton de algumas linhas.
- Lista vazia → estado vazio "Nenhum repasse neste filtro" (ícone `Banknote` muted).
- Erro da query → toast + mensagem inline.

### Helpers internos ao arquivo
- `formatDateBR(dateStr | timestamptz)` (com fix `T12:00:00` apenas para `period_start` em formato `YYYY-MM-DD`).
- `formatMoneyBRL(n)`.
- `formatDestino(snapshot)` → `{ lines: string[] }`.
- `mapMarkPaidError(payload | error)` → string.

### Fora do escopo
- Nenhuma mudança em migrations, RLS, edge functions, bucket, ou outras páginas/admin sections.
- Sem mexer em `AdminSidebar`, rotas, ou permissões (a rota `/admin/repasses` já existe e o gating é feito pelo `SectionProtectedRoute`).