

# Fase 6 — Backoffice Administrativo FestPag

## 1. Diagnóstico da Arquitetura Atual

**Auth**: O enum `app_role` já inclui `'admin'`. O `ProtectedRoute` já aceita `requiredRole='admin'` e concede acesso a rotas de produtor para admins (linha 30: `userRole !== 'admin'`). Porém, **não existe nenhuma rota, layout, ou página admin**.

**Tabelas existentes relevantes**:
- `producer_profiles` — dados da organização do produtor
- `producer_bank_accounts` — dados bancários (vinculados a `user_id`, não a `producer_profile_id`)
- `producer_members` — membros da organização
- `orders` — pedidos com `total_amount`
- `tickets` — ingressos vendidos
- `events` — eventos com `producer_id` e `producer_profile_id`

**O que NÃO existe**:
- Tabelas: `payouts`, `payout_items`, `producer_notes`, `audit_logs`, `platform_settings`
- Páginas: nenhuma rota `/admin/*`
- Layout: nenhum `AdminLayout` ou `AdminSidebar`
- Guard: o `ProtectedRoute` funciona mas redireciona para login do cliente/produtor, não para `/admin/login`

## 2. Proposta de Modelagem de Acesso Admin

- Reutilizar o role `'admin'` do enum `app_role` existente
- Admins são criados por convite de admin existente (edge function `invite-admin`)
- O primeiro admin será inserido manualmente via seed SQL
- Criar `AdminProtectedRoute` dedicado que redireciona para `/admin/login`
- Admin NÃO precisa de `producer_profile` — acesso é global

## 3. Proposta de Rotas

```text
/admin/login           → Login admin (mesma auth, validação de role)
/admin/dashboard       → Métricas globais da plataforma
/admin/produtores      → Lista de produtores com filtros
/admin/produtores/:id  → Detalhe do produtor (dados, eventos, financeiro, notas)
/admin/eventos         → [futuro] Todos os eventos
/admin/pedidos         → [futuro] Todos os pedidos
/admin/repasses        → Lista de repasses pendentes/pagos
/admin/financeiro      → [futuro] Visão financeira global
/admin/configuracoes   → Taxas, convites de admin
```

## 4. Proposta de Tabelas e Relacionamentos

### `platform_settings` — Configurações globais
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| key | text UNIQUE | ex: `default_platform_fee_percent` |
| value | jsonb | ex: `{"percent": 10, "fixed": 0}` |
| updated_by | uuid → auth.users | |
| updated_at | timestamptz | |

### `producer_fee_overrides` — Taxa personalizada por produtor
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| producer_profile_id | uuid | |
| fee_percent | numeric | ex: 8.5 |
| fee_fixed | numeric | ex: 0 |
| notes | text | motivo da negociação |
| created_by | uuid | admin que criou |
| created_at | timestamptz | |

### `payouts` — Repasses para produtores
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| producer_profile_id | uuid | |
| period_start | date | |
| period_end | date | |
| gross_amount | numeric | bruto vendido |
| platform_fee | numeric | taxa retida |
| net_amount | numeric | valor líquido |
| status | text | pending / approved / paid / blocked |
| bank_account_snapshot | jsonb | cópia dos dados bancários no momento |
| paid_at | timestamptz | |
| receipt_url | text | comprovante |
| notes | text | observações |
| created_by | uuid | admin |
| created_at / updated_at | timestamptz | |

### `producer_notes` — Observações internas sobre produtores
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| producer_profile_id | uuid | |
| author_id | uuid | admin que escreveu |
| content | text | |
| created_at | timestamptz | |

### `audit_logs` — Log de ações administrativas
| Coluna | Tipo | Notas |
|--------|------|-------|
| id | uuid PK | |
| actor_id | uuid | admin que executou |
| action | text | ex: `producer.approved`, `payout.paid` |
| target_type | text | ex: `producer_profile`, `payout` |
| target_id | uuid | |
| metadata | jsonb | detalhes extras |
| created_at | timestamptz | |

### Alteração em `producer_profiles`
- Adicionar coluna `admin_status` (text, default `'active'`): `pending_review`, `active`, `suspended`, `blocked`
- Adicionar coluna `platform_fee_percent` (numeric, default 10)

### RLS — Todas as novas tabelas
- SELECT/INSERT/UPDATE/DELETE: apenas `has_role(auth.uid(), 'admin')`
- `audit_logs`: INSERT only (nunca editar/deletar)

## 5. Proposta de Layout e Componentes

```text
src/components/admin/
  AdminLayout.tsx        → SidebarProvider + AdminSidebar (reutiliza padrão ProducerLayout)
  AdminSidebar.tsx       → Menu: Dashboard, Produtores, Repasses, Configurações
  AdminProtectedRoute.tsx → Guard: user + role='admin' → redireciona /admin/login

src/pages/admin/
  AdminLogin.tsx
  AdminDashboard.tsx
  AdminProdutores.tsx
  AdminProdutorDetalhe.tsx
  AdminRepasses.tsx
  AdminConfiguracoes.tsx

src/hooks/
  useAdminStats.ts
  useAdminProdutores.ts
  useAdminPayouts.ts
  useAdminAuditLogs.ts
```

- Visual: mesmo tema dark, sidebar com cor de destaque diferente (vermelho/laranja) para distinguir visualmente do painel produtor

## 6. Impacto em Auth, Guards e Roles

- **AuthContext**: já suporta role `'admin'`, sem alteração
- **ProtectedRoute**: sem alteração (continua funcionando para produtor)
- **Novo**: `AdminProtectedRoute` que verifica `userRole === 'admin'` e redireciona para `/admin/login`
- **App.tsx**: adicionar bloco de rotas `/admin/*`
- **Login admin**: reutiliza `supabase.auth.signInWithPassword`, apenas valida role após login

## 7. Impacto em Eventos, Pedidos e Produtor

- **Zero impacto** no fluxo público do cliente
- **Zero impacto** no painel do produtor
- Admin lê tabelas existentes (`events`, `orders`, `tickets`, `producer_profiles`) via queries com RLS baseado no role admin
- Necessário adicionar RLS policies de SELECT em `events`, `orders`, `tickets` para role admin (atualmente admin só acessa via bypass de produtor)

## 8. Plano em Fases Pequenas

### Bloco 1 — Infraestrutura (migração + auth)
- Migração SQL: criar tabelas `platform_settings`, `producer_fee_overrides`, `payouts`, `producer_notes`, `audit_logs`
- Migração SQL: adicionar `admin_status` e `platform_fee_percent` a `producer_profiles`
- Migração SQL: RLS policies para todas as novas tabelas
- Migração SQL: RLS policies de SELECT admin em `events`, `orders`, `tickets`, `producer_profiles`, `producer_bank_accounts`
- Seed do primeiro admin (manual)
- Criar `AdminProtectedRoute.tsx`

### Bloco 2 — Layout e Login
- `AdminLayout.tsx` + `AdminSidebar.tsx`
- `AdminLogin.tsx` — login com validação de role
- Registrar rotas no `App.tsx`

### Bloco 3 — Dashboard Admin
- `AdminDashboard.tsx` — cards: total produtores, total eventos, total vendido, repasses pendentes
- `useAdminStats.ts` — queries globais

### Bloco 4 — Gestão de Produtores
- `AdminProdutores.tsx` — listagem com filtros (status, busca)
- `AdminProdutorDetalhe.tsx` — dados, eventos, pedidos, conta bancária, notas, ações (aprovar/suspender/bloquear)
- `useAdminProdutores.ts`
- Registro de `audit_logs` nas ações

### Bloco 5 — Repasses
- `AdminRepasses.tsx` — criar, revisar, aprovar, marcar como pago
- `useAdminPayouts.ts`
- Cálculo semi-automático de valores por período

### Bloco 6 — Configurações + Convite
- `AdminConfiguracoes.tsx` — taxa padrão, convite de admin
- Edge function `invite-admin` — cria conta com role admin

## 9. Riscos Técnicos

- **RLS admin**: as tabelas existentes (`events`, `orders`, `tickets`) não têm policy para admin. Precisamos adicionar sem quebrar as existentes — políticas permissivas se somam com OR, sem risco.
- **Primeiro admin**: precisa ser inserido manualmente no banco (seed). Sem isso, ninguém acessa o painel.
- **producer_bank_accounts** está vinculada a `user_id` e não a `producer_profile_id` — o admin precisará fazer join via `producer_members` para encontrar a conta bancária do produtor.
- **Types auto-gerados**: após cada migração, o `types.ts` será regenerado automaticamente.

## 10. Primeira Fase de Implementação

A primeira fase cobre os **Blocos 1 a 4**:
- Tabelas + RLS + seed admin
- Layout admin + login admin
- Dashboard com métricas globais
- Listagem e detalhe de produtores com ações e notas

**Arquivos novos**: ~12 arquivos
**Arquivos editados**: `App.tsx` (rotas), 1 migração SQL
**Zero arquivos existentes quebrados**

