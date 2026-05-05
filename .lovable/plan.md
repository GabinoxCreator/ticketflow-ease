## Problema

Ao logar em `/admin/login` com `gabinox54037@gmail.com`, você é jogado para a home — mesmo tendo role `admin` no banco (confirmado via query).

## Causa raiz

Race condition entre `AuthContext` e `AdminProtectedRoute`:

1. `AdminLogin.handleSubmit` chama `signIn()` e imediatamente faz `navigate('/admin/dashboard')`.
2. O `onAuthStateChange` no `AuthContext` dispara `SIGNED_IN`, define `user` na hora, mas o `fetchProfile` (que carrega `userRole`) é diferido com `setTimeout(0)` e faz duas queries assíncronas no Supabase.
3. Quando `AdminProtectedRoute` renderiza, `isLoading` já é `false` (foi setado uma vez no mount inicial) e `user` existe, mas `userRole` ainda é `null`.
4. A guarda `if (userRole !== 'admin') return <Navigate to="/" replace />` dispara → redireciona para home.

Quem tem role `produtor` provavelmente teria o mesmo problema na rota de produtor, mas a guarda do produtor pode tolerar `null`. No admin, a comparação estrita derruba o acesso.

## Correção

Em `src/components/admin/AdminProtectedRoute.tsx`:

- Enquanto `user` existir mas `userRole` ainda for `null`, mostrar o spinner de loading em vez de redirecionar.
- Só redirecionar para `/` quando `userRole` estiver carregado e for diferente de `admin`.

```text
if (isLoading) -> spinner
if (!user) -> /admin/login
if (user && userRole === null) -> spinner   // <-- novo
if (userRole !== 'admin') -> /
```

Sem mudanças em banco, edge functions ou outros arquivos. Mudança isolada e segura.

## Arquivo afetado

- `src/components/admin/AdminProtectedRoute.tsx` (ajustar guarda)
