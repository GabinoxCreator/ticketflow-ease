
# 🛠️ Refinos no fluxo de Login + Cadastro

## 1. OTP (etapa de código por email) — visibilidade e espaçamento

**Problema:** Os 6 slots do código estão quase invisíveis (borda muito apagada) e colados.

**Mudanças em `src/components/auth/signup-steps/StepEmail.tsx`:**
- Trocar o agrupamento atual `<InputOTPGroup>` único (slots colados) por **6 slots individuais com `gap-2`** entre eles, cada um com cantos arredondados próprios.
- Cada slot vai usar uma classe customizada premium:
  - Tamanho maior: `h-14 w-12` (era `h-10 w-10`)
  - Borda visível: `border-2 border-border/60` (clara no dark)
  - Background do slot: `bg-background/40`
  - Estado ativo com glow: `ring-2 ring-primary` + `border-primary` + `shadow-[0_0_20px_hsl(var(--primary)/0.3)]`
  - Estado preenchido: `border-primary/50 bg-primary/5`
  - Texto maior: `text-xl font-semibold`
- Centralizar o grupo e dar `autoFocus` no primeiro slot ao entrar na fase OTP.

Resultado: 6 quadrados nítidos, espaçados, fáceis de ver e digitar.

## 2. Separar a etapa 3 em duas etapas (WhatsApp / Senha)

**Hoje:** Etapa 3 = WhatsApp + Senha + Confirmar senha juntos. Total 4 etapas.
**Novo:** 5 etapas no wizard:
1. CPF + Nome
2. Email + verificação OTP
3. **WhatsApp** (sozinho)
4. **Senha + Confirmar senha** (sozinho, com força da senha)
5. Confirmar dados + criar conta

**Mudanças:**

### `src/components/auth/signup-steps/StepCredentials.tsx` → reaproveitar como **`StepWhatsApp.tsx`** (criar novo)
- Apenas o campo WhatsApp + título "Como podemos te chamar no zap?"
- Validação: mínimo 10 dígitos
- Botões Voltar / Continuar

### Criar `src/components/auth/signup-steps/StepPassword.tsx`
- Campos Senha + Confirmar senha + medidor de força
- Toggles de mostrar/ocultar
- Validações: ≥6 caracteres, score ≥2, senhas iguais
- Botões Voltar / Continuar

### `src/components/auth/SignupWizard.tsx`
- Atualizar `totalSteps` de 4 → **5**
- Atualizar labels do `StepIndicator`: `['CPF', 'Email', 'WhatsApp', 'Senha', 'Confirmar']`
- Adicionar etapa 4 (senha) entre as atuais 3 e 4, renumerando o `step` final para 5
- Passar handlers separados (sem trocar a forma como o state acumulado funciona)

### `src/components/auth/StepIndicator.tsx`
- Já é genérico (`totalSteps` + `labels`), só precisa receber 5. Verificar se o layout cabe bem no card — se necessário, reduzir o gap entre dots no mobile (responsivo: `gap-1` no mobile, `gap-2` no md+).

### Remover
- `StepCredentials.tsx` (substituído pelos dois novos)

## 3. Etapa de confirmação — termos pré-aceitos

**Mudanças em `src/components/auth/signup-steps/StepConfirm.tsx`:**
- Remover o `<Checkbox>` e o estado `acceptTerms`.
- Substituir por uma **nota legal abaixo dos dados** com texto:
  > "Ao clicar em **Criar minha conta**, você concorda com nossos [termos de uso](/termos) e [política de privacidade](/privacidade)."
- Estilo: `text-xs text-muted-foreground text-center` com os links em `text-primary hover:underline`.
- O botão "Criar minha conta" fica sempre habilitado (sem o `!acceptTerms`).
- Manter ícone Sparkles e card de resumo.

## 4. Tela "Entrar" — esqueci a senha + CTA cadastrar mais visível

**Mudanças em `src/pages/Auth.tsx` (formulário de login):**

### a) Link "Esqueci minha senha"
- Adicionar abaixo do campo de senha, alinhado à direita:
  ```
  <button type="button" onClick={...} className="text-sm text-primary hover:underline">
    Esqueci minha senha
  </button>
  ```
- Ao clicar, abrir um pequeno **modal/dialog** com input de email e botão "Enviar link de recuperação"
- Ação: chamar `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${window.location.origin}/reset-password\` })`
- Já existe a página `src/pages/ResetPassword.tsx` (vista no estrutura do projeto), então o fluxo já está pronto end-to-end.
- Toast de sucesso: "Email de recuperação enviado!"

### b) CTA "Cadastre-se" maior
- Trocar o atual texto pequeno `"Não tem conta? Cadastre-se"` no rodapé do formulário de login por um **botão secundário destacado**:
  - Layout: `<div>` com separador "ou" + um `<Button variant="outline">` largura total com texto "**Criar uma conta grátis**" e ícone `UserPlus` à esquerda
  - Borda animada com gradient sutil (igual aos botões sociais glass) pra dar destaque sem competir com o botão "Entrar"
  - Tamanho: `h-12` (mesmo dos sociais)
  - Ao clicar, faz `setActiveTab('cadastrar')` (já existe)
- Posição: logo após o bloco de "ou continue com" (Google/Apple), antes de qualquer texto pequeno residual

## 5. Sobre o botão de "Aprovar plano" não aparecer

**Causa identificada:** Nas últimas vezes, apresentei o plano como texto/markdown direto na conversa em vez de usar a ferramenta `plan--create`. O botão de aprovação só aparece quando o plano é entregue via essa ferramenta.

**Correção aplicada agora:** Estou enviando este plano através da ferramenta correta. A partir de agora, sempre que estiver no modo Plano, vou usar `plan--create` — assim o botão "Aprovar e implementar" aparece automaticamente pra você no painel.

---

## Arquivos impactados

| Arquivo | Ação |
|---|---|
| `src/components/auth/signup-steps/StepEmail.tsx` | Refazer slots OTP grandes, espaçados, com ring/glow |
| `src/components/auth/signup-steps/StepWhatsApp.tsx` | **Criar** (etapa 3 isolada) |
| `src/components/auth/signup-steps/StepPassword.tsx` | **Criar** (etapa 4 isolada) |
| `src/components/auth/signup-steps/StepCredentials.tsx` | **Excluir** (substituído) |
| `src/components/auth/signup-steps/StepConfirm.tsx` | Remover checkbox; adicionar nota legal abaixo dos dados |
| `src/components/auth/SignupWizard.tsx` | 5 etapas, novos labels, roteamento atualizado |
| `src/components/auth/StepIndicator.tsx` | Pequeno ajuste responsivo de gap pra caber 5 dots |
| `src/pages/Auth.tsx` | Adicionar "Esqueci senha" + dialog de reset; trocar link "Cadastre-se" por botão grande destacado |

## Sem mudanças

- Banco de dados, edge functions, RLS, AuthContext — nada disso muda.
- Página `/reset-password` já existe e continua funcionando.
