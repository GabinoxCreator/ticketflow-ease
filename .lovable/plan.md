# Fase 1 — Equipe FestPag com permissões por seção (v3 — proteção do último gestor)

## 1. Resumo do que vai ser criado/alterado

### Banco (1 migration)
`supabase/migrations/<timestamp>_admin_section_permissions.sql`:

**Tabela**
- `CREATE TABLE public.admin_section_permissions (id uuid PK default gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, section text NOT NULL, created_at timestamptz default now())`
- `UNIQUE(user_id, section)`
- `CHECK (section IN ('dashboard','produtores','repasses','checklist','saude','configuracoes','_manage_team'))`
- GRANTs: `SELECT, INSERT, DELETE` → `authenticated`; `ALL` → `service_role`. Sem `anon`.
- `ENABLE ROW LEVEL SECURITY`.

**Função SECURITY DEFINER (anti-recursão)**
```sql
CREATE OR REPLACE FUNCTION public.has_manage_team(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_section_permissions
    WHERE user_id = _user_id AND section = '_manage_team'
  )
$$;
```
`SECURITY DEFINER` roda como owner → bypassa RLS na leitura interna → sem recursão.

**Policies**
- `SELECT`: `has_role(auth.uid(),'admin')`.
- `INSERT`: `WITH CHECK has_manage_team(auth.uid())`.
- `DELETE`: `USING has_manage_team(auth.uid())`.
- Sem UPDATE.

**Trigger BEFORE DELETE — guarda dupla**
```sql
CREATE OR REPLACE FUNCTION public.guard_admin_section_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _remaining int;
BEGIN
  IF OLD.section = '_manage_team' THEN
    -- 1. bloqueia auto-remoção (mesmo via SQL direto)
    IF OLD.user_id = auth.uid() THEN
      RAISE EXCEPTION 'cannot_remove_own_manage_team'
        USING HINT = 'Você não pode remover seu próprio acesso de gestor.';
    END IF;
    -- 2. bloqueia remoção do ÚLTIMO gestor (cobre A remove B / B remove A)
    SELECT count(*) INTO _remaining
      FROM public.admin_section_permissions
     WHERE section = '_manage_team'
       AND user_id <> OLD.user_id;
    IF _remaining = 0 THEN
      RAISE EXCEPTION 'cannot_remove_last_manage_team'
        USING HINT = 'Não é possível remover o último gestor de equipe. Promova outro colaborador a gestor antes.';
    END IF;
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER trg_guard_admin_section_delete
BEFORE DELETE ON public.admin_section_permissions
FOR EACH ROW EXECUTE FUNCTION public.guard_admin_section_delete();
```
A função do trigger é `SECURITY DEFINER` + `search_path=public`, então o `count(*)` interno **não dispara RLS** da própria tabela (sem recursão). E como roda em cada linha do DELETE, cobre tanto o DELETE direto da tabela quanto o ON DELETE CASCADE de `auth.users` (se um gestor for apagado do Auth e era o último, a cascade falha — comportamento desejado: força promover outro antes).

**Seed admin primário**
`DO $$ DECLARE _uid uuid; BEGIN SELECT id INTO _uid FROM auth.users WHERE email='gabinox54037@gmail.com'; IF _uid IS NOT NULL THEN INSERT ... 7 seções ... ON CONFLICT DO NOTHING; ELSE RAISE NOTICE; END IF; END $$;`. Migration nunca falha.

### Edge functions novas
1. **`admin-invite-collaborator/index.ts`**
   - Valida JWT do chamador + `has_manage_team` server-side.
   - Body (Zod): `{ email, nome_completo, sections: string[] }`.
   - `supabase.auth.admin.inviteUserByEmail(email, { data: { nome_completo, tipo_conta: 'admin' } })` — trigger `handle_new_user` cria `profiles`+`user_roles`. Email via Resend SMTP do Supabase Auth.
   - INSERT em `admin_section_permissions` com service-role para cada seção pedida.
   - 409 se email já é admin.

2. **`admin-deactivate-collaborator/index.ts`**
   - Valida JWT + `has_manage_team` do chamador.
   - Rejeita `target_user_id === caller_id` (auto-desativação).
   - **Checagem do último gestor**: se o alvo tem `_manage_team` E `count(*) WHERE section='_manage_team' AND user_id<>alvo = 0` → 409 `cannot_remove_last_manage_team` com a mensagem definida.
   - DELETE `admin_section_permissions WHERE user_id=alvo` + DELETE `user_roles WHERE user_id=alvo AND role='admin'` (service-role).
   - Audita em `audit_logs`.
   - (Mesmo se o front esquecer a checagem, o trigger do banco rejeita a tentativa de remover o `_manage_team` do último; a edge faz a checagem antes só pra dar mensagem amigável.)

### Frontend
- **`src/hooks/useAdminPermissions.ts`**: react-query → `{ sections: Set, hasSection, isManager, isLoading }`.
- **`src/components/admin/SectionProtectedRoute.tsx`**: `{ section }`. Se `isManager` ou `hasSection(section)` → render; senão redireciona pra 1ª seção permitida (ordem fixa); senão "Sem acesso".
- **`src/App.tsx`**: cada rota `/admin/*` (exceto `/login`) ganha `<SectionProtectedRoute>`. Nova rota `/admin/equipe` gated por `_manage_team`.
- **`AdminSidebar.tsx`**: menu filtrado por permissão. Item "Equipe" (`Users2`) só se `isManager`.
- **`src/pages/admin/AdminEquipe.tsx`** (em `AdminLayout`):
  - Lista admins (`user_roles` × `profiles`) + badges de seções.
  - Modal "Convidar": email + nome + checkboxes → `admin-invite-collaborator`.
  - Toggles por linha (INSERT/DELETE via client; RLS exige `_manage_team`). Optimistic + rollback. Toast amigável para `cannot_remove_own_manage_team` e `cannot_remove_last_manage_team`.
  - "Desativar" → confirma → `admin-deactivate-collaborator`. Trata `cannot_remove_last_manage_team` com a mensagem padronizada.
  - Travas UX: toggle `_manage_team` próprio desabilitado; "Desativar" próprio desabilitado; toggle `_manage_team` de outros gestores **fica habilitado** (a checagem do último gestor protege), mas se for o último na lista visível, frontend já mostra dica "Único gestor — promova outro antes de remover".

### Arquivos
- Novos: 1 migration, 2 edge functions, `useAdminPermissions.ts`, `SectionProtectedRoute.tsx`, `AdminEquipe.tsx`.
- Editados: `src/App.tsx`, `src/components/admin/AdminSidebar.tsx`.

## 2. Convite — fluxo
`auth.admin.inviteUserByEmail` em edge function gated por `_manage_team`. Email via Resend SMTP do Supabase Auth. Não reuso OTP de auto-signup. Trigger `handle_new_user` trata `tipo_conta:'admin'`.

## 3. Resposta direta às exigências da correção 2
- ✅ Trigger `BEFORE DELETE` agora cobre **dois cenários**: auto-remoção E remoção do último `_manage_team` (qualquer que seja a vítima). Cobre o ataque "A remove B, B remove A".
- ✅ Cascade de `auth.users` também passa pelo trigger → se apagar último gestor do Auth, o DELETE falha, forçando promover outro antes.
- ✅ Edge `admin-deactivate-collaborator` faz a mesma checagem antes do DELETE pra retornar mensagem amigável (não só o RAISE cru do banco).
- ✅ Mensagem padronizada: "Não é possível remover o último gestor de equipe. Promova outro colaborador a gestor antes."
- ✅ Sem recursão de RLS: trigger function é `SECURITY DEFINER` com `search_path=public` → `count(*)` interno bypassa as policies da própria tabela.

## 4. Conflitos com código atual
1. `handle_new_user` aceita `tipo_conta:'admin'` → compatível.
2. `AdminProtectedRoute` continua porta 1; `SectionProtectedRoute` é porta 2.
3. Admin primário: seed seguro com fallback NOTICE.
4. Memória `admin-global-permissions` ficou imprecisa após esta migration (admins não bypassam mais `admin_section_permissions` para escrita) — atualizo no final.

Aguardando OK para implementar.
