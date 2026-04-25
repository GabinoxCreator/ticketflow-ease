
# 🪄 Simplificar wizard: 4 etapas (sem tela de confirmação)

## Objetivo
Eliminar a etapa 5 "Confirmar dados". A etapa 4 (Senha) passa a ser a final, contendo o botão **"Criar minha conta"** e a nota legal sobre aceite de termos.

---

## Mudanças

### 1. `src/components/auth/SignupWizard.tsx`
- `totalSteps` de **5 → 4**
- Labels do `StepIndicator`: `['CPF', 'Email', 'WhatsApp', 'Senha']`
- Remover renderização do bloco `step === 5` (StepConfirm)
- Passar `submitting`, `onSubmit={handleSubmit}` direto para `StepPassword` (substituindo `onNext`)
- Remover import de `StepConfirm`

### 2. `src/components/auth/signup-steps/StepPassword.tsx`
- Trocar prop `onNext` por `onSubmit` + `submitting: boolean`
- Trocar texto do botão "Continuar" → **"Criar minha conta"** (com loading `Loader2` quando `submitting`)
- Após validar senha (≥6, força ≥2, senhas iguais), chamar `onSubmit()` em vez de `onNext()`
- Adicionar **nota legal** abaixo do botão:
  > "Ao clicar em **Criar minha conta**, você concorda com nossos [termos de uso](/termos) e [política de privacidade](/privacidade)."
- Estilo: `text-xs text-muted-foreground text-center` com links `text-primary hover:underline`

### 3. `src/components/auth/signup-steps/StepConfirm.tsx`
- **Excluir** (não é mais usado)

---

## Arquivos impactados

| Arquivo | Ação |
|---|---|
| `src/components/auth/SignupWizard.tsx` | Reduzir para 4 etapas, remover StepConfirm |
| `src/components/auth/signup-steps/StepPassword.tsx` | Virar etapa final: botão "Criar conta" + nota legal |
| `src/components/auth/signup-steps/StepConfirm.tsx` | Excluir |

## Sem mudanças
- Banco, edge functions, AuthContext, validações.
