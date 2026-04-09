

# Migração IngressosRP → FestPag — Diagnóstico e Plano

---

## 1. Diagnóstico da Arquitetura Atual

**Autenticação**: Um único `AuthContext` com role (`cliente`/`produtor`/`admin`) via tabela `user_roles`. O cadastro público permite escolher "tipo de conta" (cliente ou produtor). O `ProtectedRoute` verifica role para rotas do produtor.

**Rotas atuais**:
- Públicas: `/`, `/evento/:id`, `/checkout`, `/auth`, `/reset-password`
- Cliente autenticado: `/meus-ingressos`, `/minha-conta`
- Produtor: `/dashboard`, `/dashboard/eventos`, `/dashboard/evento/:id`, `/criar-evento`, `/editar-evento/:id`, `/dashboard/financeiro`, `/dashboard/colaboradores`
- Colaborador: `/colaborador/*`

**Branding**: "IngressosRP" aparece em 11 arquivos. "IngressoFácil" aparece no sidebar e no login do colaborador.

**Layout do produtor**: `ProducerLayout` + `ProducerSidebar` com sidebar navigation. Rotas sob `/dashboard/*`.

---

## 2. Problemas Atuais

- Cliente e produtor compartilham o mesmo fluxo de auth (`/auth`) com seletor "tipo de conta"
- Botão "Criar Evento" aparece na navbar pública
- Branding inconsistente (IngressosRP, IngressoFácil)
- Produtor e cliente usam as mesmas rotas de auth
- Não existe landing page para produtores
- Rotas do produtor estão sob `/dashboard/*` em vez de `/produtor/*`

---

## 3. Estratégia de Separação Cliente vs Produtor

**Princípio**: Mesmo sistema de auth (Supabase Auth), mas fluxos de UI completamente separados.

- O cadastro público (`/login`) cria sempre com `tipo_conta: 'cliente'`
- O cadastro do produtor (`/area-do-produtor/cadastro`) cria com `tipo_conta: 'produtor'`
- `AuthContext` permanece inalterado — a role continua sendo lida de `user_roles`
- Nenhuma mudança de banco de dados necessária na Fase 1/2

---

## 4. Estratégia de Rotas (Fase 1+2)

```text
PÚBLICAS:
  /                          → Home (Index)
  /evento/:id                → Detalhes do evento
  /checkout                  → Checkout
  /login                     → Login/Cadastro do cliente
  /reset-password            → Reset de senha
  /meus-ingressos            → Ingressos do cliente (protegida)
  /minha-conta               → Conta do cliente (protegida)
  /area-do-produtor          → Landing page institucional do produtor
  /area-do-produtor/login    → Login do produtor
  /area-do-produtor/cadastro → Cadastro do produtor

PRODUTOR (protegidas com role 'produtor'):
  /produtor/dashboard        → Dashboard
  /produtor/eventos          → Lista de eventos
  /produtor/eventos/:id      → Dashboard do evento
  /produtor/criar-evento     → Criar evento
  /produtor/editar-evento/:id→ Editar evento
  /produtor/financeiro       → Financeiro
  /produtor/equipe           → Colaboradores

LEGADO (redirect):
  /auth → /login
  /dashboard → /produtor/dashboard
  /dashboard/* → /produtor/*
```

---

## 5. Estratégia de Componentes/Layouts

- `Header.tsx`: Rebranding FestPag, trocar "Criar Evento" por "Área do Produtor", "Entrar" → `/login`
- `Footer.tsx`: Rebranding FestPag
- `ProducerSidebar.tsx`: Rebranding, atualizar rotas para `/produtor/*`
- `ProducerLayout.tsx`: Atualizar breadcrumbs para novas rotas
- **Nova página**: `AreaDoProdutor.tsx` — landing page institucional
- **Nova página**: `ProducerLogin.tsx` — login exclusivo do produtor
- **Nova página**: `ProducerSignup.tsx` — cadastro exclusivo do produtor (sempre `tipo_conta: 'produtor'`)
- `Auth.tsx` → renomear para `ClientLogin.tsx`, remover seletor de tipo de conta

---

## 6. Tabelas e Modelagem Impactadas (Fase 1+2)

**Nenhuma alteração no banco de dados.** A tabela `user_roles` com enum `app_role` já suporta a separação. O trigger `handle_new_user` já lê `tipo_conta` do metadata. Basta cada fluxo de cadastro enviar o `tipo_conta` correto.

Fases futuras (3+) criarão `producer_profiles`, `producer_members`, etc.

---

## 7. Lista de Arquivos Impactados

**Fase 1 — Rebranding + Navbar:**
| Arquivo | Ação |
|---|---|
| `index.html` | Rebranding meta tags |
| `src/components/Header.tsx` | Rebranding + trocar botões |
| `src/components/Footer.tsx` | Rebranding |
| `src/components/TicketCard.tsx` | Rebranding |
| `src/pages/Index.tsx` | Rebranding Helmet |
| `src/pages/EventDetails.tsx` | Rebranding Helmet |
| `src/pages/MeusIngressos.tsx` | Rebranding Helmet |
| `src/pages/MinhaConta.tsx` | Rebranding Helmet |
| `src/pages/Financeiro.tsx` | Rebranding Helmet |
| `src/components/producer/ProducerSidebar.tsx` | Rebranding |
| `src/pages/colaborador/ColaboradorLogin.tsx` | Rebranding |
| `src/components/auth/AuthModal.tsx` | Rebranding (se houver) |
| `supabase/functions/send-verification-code/index.ts` | Rebranding email |
| **Novo**: `src/pages/AreaDoProdutor.tsx` | Landing page do produtor |

**Fase 2 — Separação de Auth + Rotas:**
| Arquivo | Ação |
|---|---|
| `src/App.tsx` | Novas rotas, redirects legados |
| `src/pages/Auth.tsx` | Refatorar para login de cliente apenas (rota `/login`) |
| **Novo**: `src/pages/ProducerLogin.tsx` | Login exclusivo do produtor |
| **Novo**: `src/pages/ProducerSignup.tsx` | Cadastro exclusivo do produtor |
| `src/components/ProtectedRoute.tsx` | Suportar redirect para `/login` ou `/area-do-produtor/login` |
| `src/components/producer/ProducerLayout.tsx` | Atualizar rotas |
| `src/components/producer/ProducerSidebar.tsx` | Atualizar rotas para `/produtor/*` |
| `src/pages/Dashboard.tsx` | Mover para rota `/produtor/dashboard` |
| `src/pages/DashboardEventos.tsx` | Mover para rota `/produtor/eventos` |
| `src/pages/EventDashboard.tsx` | Mover para rota `/produtor/eventos/:id` |
| `src/pages/CriarEvento.tsx` | Mover para `/produtor/criar-evento` |
| `src/pages/EditarEvento.tsx` | Mover para `/produtor/editar-evento/:id` |
| `src/pages/Financeiro.tsx` | Mover para `/produtor/financeiro` |
| `src/pages/ColaboradoresManager.tsx` | Mover para `/produtor/equipe` |

---

## 8. Plano em Fases

**Fase 1** (esta implementacao): Rebranding visual completo + landing page do produtor + ajuste da navbar
**Fase 2** (esta implementacao): Separacao de auth + novas rotas + guards
**Fase 3** (futura): Evolucao do painel do produtor
**Fase 4** (futura): Modelagem de perfis, producer_profiles, RLS avancado
**Fase 5** (futura): QR Code refinado, portaria, relatorios

---

## 9. Riscos e Plano de Migração

| Risco | Mitigação |
|---|---|
| URLs antigas quebram (`/auth`, `/dashboard`) | Adicionar redirects no router |
| Usuários existentes com role `produtor` | Continuam funcionando — a role na tabela `user_roles` não muda |
| Links internos hardcoded no sidebar/breadcrumbs | Atualizar todos na Fase 2 |
| AuthModal do checkout usa `signUp` com `tipo_conta` | Manter como `cliente` — já está assim |
| Edge function de email ainda manda como IngressosRP | Atualizar na Fase 1 |

---

## 10. Implementação Proposta — Fase 1 + Fase 2

### Fase 1 (Rebranding):
1. Atualizar `index.html` — meta tags, title, OG para FestPag
2. Atualizar `Header.tsx` — logo "FestPag", remover "Criar Evento", adicionar "Área do Produtor" linkando para `/area-do-produtor`
3. Atualizar `Footer.tsx` — logo, textos, email
4. Atualizar `TicketCard.tsx` — label no ticket
5. Atualizar Helmet em `Index.tsx`, `EventDetails.tsx`, `MeusIngressos.tsx`, `MinhaConta.tsx`, `Financeiro.tsx`
6. Atualizar `ProducerSidebar.tsx` — logo "FestPag"
7. Atualizar `ColaboradorLogin.tsx` — logo
8. Atualizar `send-verification-code/index.ts` — from/subject
9. Criar `src/pages/AreaDoProdutor.tsx` — landing page institucional com CTA para login/cadastro

### Fase 2 (Separação de Auth + Rotas):
1. Refatorar `Auth.tsx` → login de cliente apenas (sem tipo de conta), rota `/login`
2. Criar `ProducerLogin.tsx` — login exclusivo em `/area-do-produtor/login`
3. Criar `ProducerSignup.tsx` — cadastro exclusivo em `/area-do-produtor/cadastro` (sempre `tipo_conta: 'produtor'`)
4. Atualizar `App.tsx` — novas rotas (`/login`, `/area-do-produtor/*`, `/produtor/*`), redirects legados
5. Atualizar `ProducerSidebar.tsx` — rotas `/produtor/*`
6. Atualizar `ProducerLayout.tsx` — rotas e breadcrumbs
7. Atualizar `ProtectedRoute.tsx` — redirect para `/login` (cliente) ou `/area-do-produtor/login` (produtor)
8. Atualizar `Header.tsx` — "Entrar" aponta para `/login`, dropdown produtor aponta para `/produtor/dashboard`

