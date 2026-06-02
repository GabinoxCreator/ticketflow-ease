# Plano — Landing /lp + Leads no admin

## 1. Arquivos & migrations

### Migration única
`supabase/migrations/<ts>_landing_leads_and_section.sql`:

**a) Tabela `landing_leads`**
```sql
CREATE TABLE public.landing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cidade text NOT NULL,
  tipo_evento text NOT NULL,
  telefone text NOT NULL,
  status text NOT NULL DEFAULT 'novo'
    CHECK (status IN ('novo','contatado','convertido','descartado')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.landing_leads TO authenticated;
GRANT ALL ON public.landing_leads TO service_role;
-- sem grant pra anon; INSERT só via service-role na edge
ALTER TABLE public.landing_leads ENABLE ROW LEVEL SECURITY;
```

**b) Função `has_section` (SECURITY DEFINER)**
```sql
CREATE OR REPLACE FUNCTION public.has_section(_user_id uuid, _section text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_section_permissions
    WHERE user_id = _user_id AND (section = _section OR section = '_manage_team')
  )
$$;
```

**c) Policies `landing_leads`**
- SELECT: `public.has_section(auth.uid(),'leads')`
- UPDATE: `USING/WITH CHECK public.has_section(auth.uid(),'leads')`
- Sem policy de INSERT/DELETE → bloqueado para `authenticated`; service-role bypassa RLS.

**d) Atualizar CHECK de `admin_section_permissions`**
Nome real: `admin_section_permissions_section_check`.
```sql
ALTER TABLE public.admin_section_permissions
  DROP CONSTRAINT admin_section_permissions_section_check;
ALTER TABLE public.admin_section_permissions
  ADD CONSTRAINT admin_section_permissions_section_check
  CHECK (section IN ('dashboard','produtores','repasses','leads','checklist','saude','configuracoes','_manage_team'));
```

**e) Seed admin primário**
```sql
DO $$ DECLARE _uid uuid;
BEGIN
  SELECT id INTO _uid FROM auth.users WHERE email='gabinox54037@gmail.com';
  IF _uid IS NOT NULL THEN
    INSERT INTO public.admin_section_permissions (user_id, section)
    VALUES (_uid, 'leads') ON CONFLICT DO NOTHING;
  END IF;
END $$;
```

### Edge function (nova)
- `supabase/functions/submit-landing-lead/index.ts` — pública (sem JWT), Zod, rate-limit por IP usando `_shared/rateLimit.ts`, INSERT via service-role e envio de email via Resend (mesmo padrão de `send-verification-code`: `new Resend(Deno.env.get("RESEND_API_KEY"))` com `from: "FestPag <naoresponda@festpag.com.br>"`, `to:` lista da equipe). Assunto: `Novo lead FestPag — {nome}, {cidade}`.

### Frontend (novos)
- `src/pages/LandingLp.tsx` — porte fiel do `festpag-landpage.html`. CSS escopado via `<style>` inline na própria rota (tag `<style>` no JSX) + `<link>` Google Fonts (Syne + DM Sans) injetado via `react-helmet-async` (já no projeto). Logo SVG inline. Máscara de telefone preservada. Submit chama `supabase.functions.invoke('submit-landing-lead', ...)`. Mensagem de sucesso idêntica.
- `src/pages/admin/AdminLeads.tsx` — `AdminLayout` + tabela (shadcn `Table`), filtro por status (`Select`), busca por nome/telefone (`Input`), badge contagem `novo`, dropdown de status por linha com update otimista + rollback (`@tanstack/react-query`).

### Frontend (editados)
- `src/App.tsx` — rota pública `/lp` → `<LandingLp />`; rota `/admin/leads` envolta em `<AdminProtectedRoute><SectionProtectedRoute section="leads"><AdminLeads /></SectionProtectedRoute></AdminProtectedRoute>`.
- `src/components/admin/AdminSidebar.tsx` — novo item `{ title:'Leads', url:'/admin/leads', icon: Inbox, section:'leads' }` inserido após Repasses.
- `src/hooks/useAdminPermissions.ts` — adicionar `'leads'` ao tipo `AdminSection`.
- `src/components/admin/SectionProtectedRoute.tsx` — incluir `'leads'` na ordem de fallback após `'repasses'`.

## 2. CHECK constraint atual
Consulta em `pg_constraint`:
- **Nome:** `admin_section_permissions_section_check`
- **Definição:** `CHECK ((section = ANY (ARRAY['dashboard','produtores','repasses','checklist','saude','configuracoes','_manage_team'])))`
DROP + ADD com a lista nova incluindo `'leads'`.

## 3. Helper de email Resend
Não existe helper genérico reutilizável — `_shared/orderConfirmationEmail.ts` é específico de pedido. O padrão limpo usado em `send-verification-code` é `import { Resend } from "npm:resend@..."` direto. **Vou seguir esse mesmo padrão inline** na edge `submit-landing-lead` (sem criar novo helper compartilhado, pra não inflar a base — pode virar helper depois se surgir 3ª função). Email vai para lista fixa (sugestão: `gabinox54037@gmail.com`; me confirme se quer adicionar outros destinatários no momento de codar).

## 4. Pontos do anexo que não portam 1:1
- **CSS global escopado**: o HTML usa `body { overflow-x: hidden }` e fontes globais. Como a memória do projeto proíbe `overflow-x:hidden` global, vou aplicar via classe wrapper `.lp-root` na página (`<div className="lp-root">`) com escopo local — visualmente idêntico, sem vazar pro resto do app.
- **Fontes Syne/DM Sans**: carregadas via `<link>` injetado por `Helmet` só nessa rota — não vão pro `index.html` global.
- **Scripts inline do HTML** (smooth scroll, máscara de telefone, submit fake): reescritos em React (`useEffect`/handlers). Máscara `(00) 00000-0000` mantida idêntica.
- **Form de sucesso**: mesma string "Recebemos seu contato!", mesmo visual — só troca o backend (fake → edge real).
- **`<noscript>` / pixels**: não há no anexo, nada a portar.
- **Tema do app**: a página NÃO usa `index.css` do projeto — fica standalone como pedido.

Tudo o mais (copy, cores, gradientes, raios, breakpoint 600px, seções) é 1:1.

Aguardando OK para implementar.
