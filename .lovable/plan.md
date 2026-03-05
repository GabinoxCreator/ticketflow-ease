

# Exigir PIN ao Abrir Página Financeiro

## Solução

**Arquivo: `src/pages/Financeiro.tsx`**

Adicionar lógica de gate com PIN na página:

1. Ao montar, verificar se o usuário tem PIN configurado (query em `producer_stripe_accounts.pin_hash`)
2. Se **tem PIN**: mostrar `PinVerificationDialog` bloqueando o conteúdo até digitar o PIN correto
3. Se **não tem PIN**: mostrar o conteúdo normalmente (o `PinSetupCard` já está lá para configurar)
4. Enquanto não verificado, o conteúdo financeiro fica oculto -- só aparece o layout com o dialog

Estado:
- `isUnlocked` (boolean) -- começa `false`, vira `true` após PIN verificado
- `hasPin` (boolean) -- resultado da query
- `isLoading` (boolean) -- enquanto verifica se tem PIN

Fluxo:
- Se `isLoading`: spinner
- Se `hasPin && !isUnlocked`: mostra `PinVerificationDialog`
- Se `!hasPin || isUnlocked`: mostra conteúdo normal (BankAccountCard + PinSetupCard)

