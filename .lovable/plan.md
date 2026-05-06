
# B4 — Limpeza técnica do FestPag (v2 ajustado)

Plano revisado conforme feedback. Ainda em modo plan, nada implementado.

## Verificação prévia (Ajuste 2)

Inspeção do `src/pages/Auth.tsx` mostra que **`Auth.tsx` NÃO suporta `?mode=forgot`** atualmente:
- Lê apenas `searchParams.get('redirect')`.
- O modal "Esqueci minha senha" só abre via clique no botão (`setForgotOpen(true)`).
- Não há `useEffect` que observe `mode` ou abra o `Dialog` automaticamente.

Conclusão: o B4.4 muda de forma — primeiro precisamos ensinar `Auth.tsx` a abrir o fluxo de OTP quando vier `?mode=forgot`, só então o redirect direto faz sentido.

## Blocos finais

### B4.1 — Remover páginas órfãs do colaborador (sem mudanças)
- **Deletar**:
  - `src/pages/colaborador/ColaboradorDashboard.tsx`
  - `src/pages/colaborador/ColaboradorEventoMenu.tsx`
  - `src/pages/colaborador/ColaboradorParticipantes.tsx`
  - `src/pages/colaborador/ColaboradorConvidados.tsx`
  - `src/pages/colaborador/QRCodeScanner.tsx`
- **Manter** todos os redirects legacy em `App.tsx`.
- **Validação manual**:
  1. Login colaborador em `/colaborador` ok.
  2. `/colaborador/eventos` lista eventos.
  3. `/colaborador/dashboard` redireciona para `/colaborador/eventos`.
  4. `/colaborador/evento/:id/scanner` redireciona para `/colaborador/evento/:id`.
  5. QR scan + lista + validação seguem funcionando.

### B4.2 — Remover `TestePagamento` e função fantasma (sem mudanças)
- **Deletar** `src/pages/TestePagamento.tsx`.
- **Editar `App.tsx`**: remover import e rota `/teste-pagamento`.
- **Editar `supabase/config.toml`**: remover bloco `[functions.create-checkout-session]`.
- **Não tocar** em nenhuma Edge Function.
- **Validação manual**:
  1. `/teste-pagamento` cai em NotFound.
  2. Build limpo.

### B4.3 — Remover `Checkout.tsx` legado (ajustado)
- **Deletar apenas** `src/pages/Checkout.tsx`.
- **Manter** `src/pages/CheckoutSuccess.tsx`, seu import e a rota `/checkout/sucesso` exatamente como hoje (preserva `back_url` antigo do MP e contexto pós-pagamento).
- **Editar `App.tsx`**:
  - Remover `import Checkout from "./pages/Checkout";`.
  - Trocar `<Route path="/checkout" element={<Checkout />} />` por `<Route path="/checkout" element={<Navigate to="/" replace />} />`.
- **Não remover** `supabase/functions/create-mercadopago-preference` — fica como follow-up depois de confirmar 0 invocações em logs.
- **Validação manual**:
  1. Compra real PIX via `CheckoutModal` (em `EventDetails`) funciona ponta a ponta.
  2. Compra real cartão via `CheckoutModal` funciona.
  3. `/checkout?evento=X` redireciona para `/`.
  4. `/checkout/sucesso?order_id=X&payment_id=Y` ainda renderiza `CheckoutSuccess`, confirma pagamento e mostra o botão para `/meus-ingressos`.

### B4.4 — Consolidar reset de senha (faseado, conforme Ajuste 2)
Como `Auth.tsx` ainda não suporta `?mode=forgot`, dividimos em dois micro-passos:

**B4.4a — Adicionar suporte a `?mode=forgot` em `Auth.tsx`**
- Em `Auth.tsx`, ler `searchParams.get('mode')` e, quando igual a `forgot`, abrir o `Dialog` de OTP automaticamente (`setForgotOpen(true)` em `useEffect`, com `forgotEmail` pré-preenchido por `searchParams.get('email')` se vier).
- Sem mudar o modal nem o componente `PasswordResetOTPFlow`.
- **Validação manual**:
  1. Acessar `/login?mode=forgot` abre o dialog de recuperação direto.
  2. Acessar `/login` normal continua mostrando login sem dialog.
  3. Fluxo OTP completo continua funcional.

**B4.4b — Apontar `/reset-password` para o novo fluxo**
Somente após B4.4a validado:
- **Deletar** `src/pages/ResetPassword.tsx`.
- **Editar `App.tsx`**:
  - Remover `import ResetPassword from "./pages/ResetPassword";`.
  - Trocar `/reset-password` para `<Navigate to="/login?mode=forgot" replace />`.
  - Manter `/auth` → `/login` como está (o redirect existente já é simples; não tentar preservar query string aqui para não introduzir parsing desnecessário).
- **Validação manual**:
  1. `/reset-password` cai em `/login?mode=forgot` em 1 hop e abre o dialog.
  2. `/auth` ainda redireciona para `/login`.
  3. Fluxo OTP segue ok.

### B4.5 — Auditoria final dos redirects legacy (sem deleção)
- Manter redirects legacy de produtor (`/dashboard*`, `/criar-evento`, `/editar-evento/:id`) e colaborador.
- Adicionar comentário curto em `App.tsx` indicando que existem para preservar bookmarks.
- **Validação manual**: smoke test rápido de cada URL legacy → equivalente novo.

## Arquivos impactados (resumo final)

```text
DELETE  src/pages/Checkout.tsx
DELETE  src/pages/ResetPassword.tsx                     (em B4.4b)
DELETE  src/pages/TestePagamento.tsx
DELETE  src/pages/colaborador/ColaboradorDashboard.tsx
DELETE  src/pages/colaborador/ColaboradorEventoMenu.tsx
DELETE  src/pages/colaborador/ColaboradorParticipantes.tsx
DELETE  src/pages/colaborador/ColaboradorConvidados.tsx
DELETE  src/pages/colaborador/QRCodeScanner.tsx

EDIT    src/App.tsx                  (remover imports mortos, trocar rotas por <Navigate>)
EDIT    src/pages/Auth.tsx           (suporte a ?mode=forgot — B4.4a)
EDIT    supabase/config.toml         (remover bloco create-checkout-session)

KEEP    src/pages/CheckoutSuccess.tsx
KEEP    rota /checkout/sucesso
KEEP    supabase/functions/create-mercadopago-preference  (follow-up depois)
KEEP    redirects legacy de produtor e colaborador
```

## Riscos residuais

- `back_url` antigo MP → mantido `/checkout/sucesso` funcional, risco neutralizado.
- Bookmarks `/checkout?evento=...` → redirecionam para `/`, perda apenas do cart serializado (volátil).
- `/reset-password` antigo → continua funcionando via redirect com 1 hop (depois de B4.4b).

## Parecer

**Aprovado com ajustes incorporados.** Ordem sugerida: B4.1 → B4.2 → B4.3 → B4.4a → B4.4b → B4.5. Cada bloco em commit separado.

Aguardando aprovação para implementar.
