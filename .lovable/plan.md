## Tema claro escopado para /admin (FestPag)

Apenas visual. Sem mexer em lógica, hooks, queries, RLS, edge functions. Sem tocar em site público, /produtor ou /colaborador. Repasses fica como está ("Em breve").

### Estratégia de isolamento

Wrapper `.admin-theme` no `AdminLayout` (e no `AdminLogin`). Dentro do escopo, redefinir os tokens semânticos shadcn (`--background`, `--card`, `--primary`, `--sidebar-*`, etc.) para o tema claro. Componentes shadcn renderizam claro **apenas** sob o wrapper. Nenhum token global em `:root` é alterado.

**Portais (Dialog, AlertDialog, DropdownMenu, Select, Popover, etc.):** auditei o admin e só **4 arquivos / 5 imports** usam portais (`AdminEquipe`, `AdminLeads`, `AdminProdutores`, `AdminSaude`). Volume pequeno → **não** vou criar `src/components/admin/ui/*`. Em vez disso, adiciono `className="admin-theme"` direto no `*Content`/`SheetContent`/`DropdownMenuContent`/`PopoverContent`/`SelectContent`/`DialogContent`/`AlertDialogContent` desses 4 arquivos. Sem trocar imports.

**Toasts:**
- **Sonner**: manter o `<Toaster />` global único (dois Toasters duplicariam toasts). Editar `src/components/ui/sonner.tsx` (ou o ponto onde está montado) para alternar `theme`/`className` **condicionalmente pela rota** — quando `location.pathname.startsWith('/admin')`, aplicar `theme="light"` + `className="admin-theme"`; caso contrário, comportamento atual.
- **Legado (Radix `useToast`)**: no `Toaster` em `src/components/ui/toaster.tsx`, aplicar `className="admin-theme"` no `<ToastViewport>` apenas quando a rota for `/admin/*`. Resto do app inalterado.

### Tokens novos (escopados em `.admin-theme`)

```text
--background: 230 33% 97%       /* #F5F6FB */
--foreground: 252 35% 14%       /* #1B1733 */
--muted-foreground: 230 9% 47%  /* #6B6F82 */
--card / --popover: 0 0% 100%   /* #FFFFFF */
--border / --input: 232 18% 94% /* #ECEDF3 */
--primary: 233 93% 67%          /* #5F6EF9 */
--primary-foreground: 0 0% 100%
--accent: 232 92% 96%           /* #EEF0FE */
--ring: 233 93% 67%
--sidebar-background: 0 0% 100%
--sidebar-foreground: 252 35% 14%
--sidebar-accent: 232 92% 96%
--sidebar-border: 232 18% 94%
--sidebar-primary: 233 93% 67%

--gradient-brand: linear-gradient(135deg,#5F6EF9 0%,#B86AD9 55%,#F766C6 100%);
--font-display: 'Space Grotesk', sans-serif;
```

Utilitárias dentro do escopo: `.admin-gradient-bg`, `.admin-gradient-text`, `.admin-active-bar` (barra 3px à esquerda com gradiente).

### Arquivos a alterar

1. **`src/index.css`** — `@import` Space Grotesk. Bloco `.admin-theme { ... }` com tokens + utilitárias. Sem mudar `:root`.

2. **`src/components/admin/AdminLayout.tsx`** — root com `className="admin-theme"`. Topbar com placeholder de logo FestPag (quadrado `.admin-gradient-bg` + "F") + "ADMIN" + breadcrumb "Admin / {title}".

3. **`src/components/admin/AdminSidebar.tsx`** — header com logo placeholder + "ADMIN" em `.admin-gradient-text`. Item ativo: `bg-accent` + texto cor da marca + `.admin-active-bar`. Hover `bg-accent`. Substituir laranja pelos tokens novos. Sem mudar itens/permissões.

4. **`src/pages/admin/AdminDashboard.tsx`** — KPIs no novo estilo: card branco, borda fina, rótulo `muted-foreground`, número grande `font-display text-3xl font-semibold`, chip de ícone arredondado com `.admin-gradient-bg`. Sem tocar em `useAdminStats`.

5. **`src/pages/admin/AdminProdutores.tsx`** + **`AdminProdutorDetalhe.tsx`** — re-skin (cards/listas/tabela brancos, bordas `#ECEDF3`, títulos `font-display`, badges/buttons via tokens). Mesmo conteúdo, mesmos handlers. Em `AdminProdutores`, adicionar `className="admin-theme"` no Content do portal usado.

6. **`src/pages/admin/AdminLogin.tsx`** — envolver com `.admin-theme` (sem mexer em lógica).

7. **Portais nos 4 arquivos do admin** — adicionar `className="admin-theme"` (mesclando com classes existentes via `cn`) em:
   - `AdminEquipe.tsx` (2 imports de portal)
   - `AdminLeads.tsx`
   - `AdminProdutores.tsx`
   - `AdminSaude.tsx`

8. **`src/components/ui/sonner.tsx`** — usar `useLocation` para alternar `theme="light"` + `className="admin-theme"` quando `pathname.startsWith('/admin')`. Default (escuro) preservado fora do admin.

9. **`src/components/ui/toaster.tsx`** — `useLocation`; aplicar `className="admin-theme"` no `<ToastViewport>` só em `/admin/*`.

### Não tocar

- `AdminRepasses`, `AdminChecklist`, `AdminConfiguracoes` (herdam fundo claro, sem refinamento agora).
- `tailwind.config.ts`, qualquer hook/query/política/função/schema.
- Site público, `/produtor`, `/colaborador`.

### Validação

`/admin/dashboard` (KPIs novos), `/admin/produtores` (lista + detalhe + dropdown/dialog claros), disparar um toast no admin e fora (claro vs escuro, sem duplicação). Conferir `/`, `/produtor/*`, `/colaborador/*` inalterados.