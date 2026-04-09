

# Fase 4 — Modelagem de Auth, Perfis, Equipe e Segurança

---

## 1. Diagnóstico da Modelagem Atual

**Auth**: Supabase Auth + tabela `user_roles` com enum `app_role` (cliente/produtor/admin). O trigger `handle_new_user` cria profile + role no signup. O `AuthContext` lê role de `user_roles` e expõe `isProdutor`.

**Profiles**: Tabela `profiles` vinculada a `auth.users(id)` com nome, email, cpf, whatsapp, avatar.

**Vínculo produtor-evento**: `events.producer_id` aponta diretamente para `auth.users.id` (o user_id do produtor). Não existe conceito de "organização".

**Equipe**: Sistema de `collaborators` separado do auth — são usuários com login próprio (username/password com bcrypt), não têm conta Supabase Auth. Vinculados a eventos via `collaborator_events`.

**Dados existentes**: 3 produtores, 2 clientes, 7 eventos (6 de um produtor, 1 de outro), 20 pedidos.

---

## 2. Lógica Atual de Cliente vs Produtor

- Determinada pela role na tabela `user_roles` (inserida no signup via trigger)
- `AuthContext.isProdutor` = `role === 'produtor' || role === 'admin'`
- `ProtectedRoute` verifica `requiredRole` contra `userRole`
- Todas as queries do produtor filtram por `events.producer_id = user.id`
- RLS policies usam `auth.uid()` e `events.producer_id = auth.uid()`

---

## 3. Proposta de Nova Modelagem

### Estratégia Incremental

Introduzir `producer_profiles` e `producer_members` sem remover `events.producer_id` imediatamente. Manter compatibilidade dual durante a transição.

### Novas Tabelas

**`producer_profiles`** — organização produtora
```sql
CREATE TABLE producer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  legal_name TEXT,
  document TEXT,          -- CNPJ ou CPF
  email TEXT,
  phone TEXT,
  slug TEXT UNIQUE,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**`producer_members`** — membros da organização
```sql
CREATE TYPE producer_member_role AS ENUM ('owner', 'admin', 'manager', 'checkin', 'viewer');

CREATE TABLE producer_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_profile_id UUID NOT NULL REFERENCES producer_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role producer_member_role NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'active',
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(producer_profile_id, user_id)
);
```

**Alteração em `events`** — adicionar vínculo com organização
```sql
ALTER TABLE events ADD COLUMN producer_profile_id UUID REFERENCES producer_profiles(id);
```

**`event_staff`** — NÃO criar agora. Complexidade desnecessária. Os `producer_members` + `collaborators` existentes cobrem o cenário. Criar apenas quando houver necessidade real de permissão por evento.

---

## 4. Migração de Dados Existentes

Cenário: 2 produtores com eventos. Migração 100% automática.

```sql
-- 1. Criar producer_profile para cada produtor existente
INSERT INTO producer_profiles (owner_user_id, brand_name, email)
SELECT p.id, p.nome_completo, p.email
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id
WHERE ur.role = 'produtor';

-- 2. Criar producer_member (owner) para cada
INSERT INTO producer_members (producer_profile_id, user_id, role)
SELECT pp.id, pp.owner_user_id, 'owner'
FROM producer_profiles pp;

-- 3. Vincular eventos existentes
UPDATE events SET producer_profile_id = pp.id
FROM producer_profiles pp
WHERE events.producer_id = pp.owner_user_id;
```

---

## 5. RLS Policies

**producer_profiles**:
- SELECT: `owner_user_id = auth.uid()` OR membro ativo via `producer_members`
- INSERT: `owner_user_id = auth.uid()` AND `has_role(auth.uid(), 'produtor')`
- UPDATE: owner ou membro admin
- DELETE: apenas owner

**producer_members**:
- SELECT: membro da mesma organização
- INSERT: owner ou admin da organização
- UPDATE: owner ou admin da organização
- DELETE: owner ou admin da organização

**events** (ajuste):
- Manter policies existentes (funcionam via `producer_id = auth.uid()`)
- Adicionar policy para membros: `EXISTS (SELECT 1 FROM producer_members pm JOIN producer_profiles pp ON ... WHERE pm.user_id = auth.uid() AND pm.status = 'active')`
- Usar security definer function para evitar recursão

---

## 6. Guards e Redirects

**Sem mudança estrutural nos guards.** O `ProtectedRoute` continua verificando `userRole` de `user_roles`. A role `produtor` continua válida.

**Evolução futura**: O `AuthContext` pode expor `producerProfile` e `memberRole` para guards mais granulares. Mas na Fase 4 não é necessário mudar o guard — a role base é suficiente.

**Ajuste no AuthContext**: Adicionar fetch de `producer_profiles` e `producer_members` para o produtor logado, expondo `producerProfileId`.

---

## 7. Impacto em Hooks, Queries e Páginas

| Componente | Impacto | Urgência |
|---|---|---|
| `useEvents` | Adicionar `producer_profile_id` no create. Manter `producer_id` por compatibilidade | Bloco 4 |
| `useProducerStats` | Pode filtrar por `producer_profile_id` em vez de `user.id` | Bloco 4 |
| `useEventOrders` | Sem mudança — filtra por `event_id` | Nenhum |
| `useEventParticipants` | Sem mudança — filtra por `event_id` | Nenhum |
| `useCollaborators` | Sem mudança imediata — usa `producer_id = auth.uid()` | Futuro |
| `AuthContext` | Expor `producerProfileId` | Bloco 3 |
| `Dashboard.tsx` | Pode mostrar brand_name | Bloco 4 |
| `ProducerSettings.tsx` | Editar dados da organização | Bloco 4 |
| `CriarEvento.tsx` | Enviar `producer_profile_id` junto com `producer_id` | Bloco 4 |

---

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Queries existentes usam `producer_id = user.id` | Manter `producer_id` preenchido — dual-write |
| RLS existente depende de `events.producer_id` | Não remover coluna — adicionar `producer_profile_id` em paralelo |
| Login existente pode quebrar | Não alterar `user_roles` nem trigger — apenas adicionar novas tabelas |
| Colaboradores atuais (sistema separado) | Não tocar — migrar para `producer_members` apenas em fase futura |
| Complexidade excessiva no AuthContext | Fetch de producer_profile é lazy, só para produtores |

---

## 9. Plano em Blocos

### Bloco 1 — Schema + Migração (SQL apenas)
- Criar `producer_profiles` e `producer_members` com RLS
- Criar helper function `is_producer_member(user_id, producer_profile_id)`
- Adicionar `producer_profile_id` em `events`
- Migrar dados existentes (backfill)
- **0 arquivos de código alterados**

### Bloco 2 — Types auto-update + AuthContext
- Aguardar types.ts atualizar automaticamente
- Adicionar `producerProfileId` ao `AuthContext` (fetch de `producer_members` para produtores)
- **1 arquivo**: `AuthContext.tsx`

### Bloco 3 — Hooks do produtor
- `useEvents`: dual-write `producer_id` + `producer_profile_id` no create
- `useProducerStats`: usar `producer_profile_id` (com fallback)
- **2-3 arquivos**: hooks

### Bloco 4 — UI do produtor
- `ProducerSettings.tsx`: editar dados da organização (brand_name, document, etc.)
- `Dashboard.tsx`: mostrar nome da organização
- **2 arquivos**: páginas

### Bloco 5 — Validação e cleanup
- Verificar RLS end-to-end
- Testar login cliente, login produtor, compra, painel
- Documentar o que fica para Fase 5 (migração de collaborators, event_staff, permissões granulares)

