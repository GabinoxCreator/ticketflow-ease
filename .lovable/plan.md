
# Reformular fluxo de autenticação do Produtor

Vou alinhar a área do produtor (`/area-do-produtor/login` e `/area-do-produtor/cadastro`) ao mesmo padrão premium do cadastro de cliente: layout transparente (Aurora), abas internas **Entrar / Cadastrar** e wizard multietapas com OTP de email.

---

## 1. Nova página unificada `ProducerAuth.tsx`

Substitui as duas telas atuais (`ProducerLogin.tsx` e `ProducerSignup.tsx`) por uma página única em `/area-do-produtor/login` **e** `/area-do-produtor/cadastro`, ambas renderizando o mesmo componente — controlando a aba inicial pela rota:

- `/area-do-produtor/login` → aba **Entrar** ativa
- `/area-do-produtor/cadastro` → aba **Cadastrar** ativa

**Layout:**
- `AuroraBackground` (mesmo do `AuthModal` cliente) para o vidro/transparência
- Card central `bg-card/40 backdrop-blur-xl border-border/50` arredondado
- Logo FestPag + chip "Área do Produtor" no topo
- `Tabs` (shadcn) com duas abas: **Entrar** | **Cadastrar conta de produtor**
- Botão "Voltar" para `/area-do-produtor`

**Aba Entrar:** reaproveita o conteúdo atual do `ProducerLogin` (email + senha, esqueci minha senha, divider, Google, Apple). Apenas re-estilizado para casar com o fundo transparente.

**Aba Cadastrar:** renderiza o novo `<ProducerSignupWizard />`.

---

## 2. Novo `ProducerSignupWizard.tsx`

Mesma arquitetura do `SignupWizard` de cliente (`AnimatePresence` + `StepIndicator` + steps isolados), mas com fluxo específico de produtor.

**Etapas dinâmicas conforme tipo de pessoa:**

| # | Etapa | Pessoa Física | Pessoa Jurídica |
|---|---|---|---|
| 1 | **Tipo de conta** | Pessoal × Empresarial | Pessoal × Empresarial |
| 2 | **Documento** | CPF + Nome completo | CNPJ + Razão social |
| 3 | **Email + OTP** | Confirmação via código de 6 dígitos | Igual |
| 4 | **WhatsApp** | Telefone com máscara | Igual |
| 5 | **Senha** | Senha + Confirmar + botão "Criar conta" | Igual |

`StepIndicator` com 5 bolinhas e labels: `['Tipo', 'Dados', 'Email', 'WhatsApp', 'Senha']`.

**Persistência ao chamar `signUp`:**
- `tipo_conta: 'produtor'`
- `nome_completo`: nome (PF) **ou** razão social (PJ)
- `cpf`: documento (CPF ou CNPJ — campo já reutilizado pelo trigger)
- `whatsapp`, `email`, `password`

O trigger `handle_new_user` continua criando `producer_profile` automaticamente. Em uma segunda fase poderemos persistir `legal_name` e o tipo PF/PJ — para esta entrega manteremos o trigger atual (sem migration de banco), gravando o documento (CPF/CNPJ) em `profiles.cpf` e o nome/razão social em `profiles.nome_completo`. Isso já alimenta corretamente `producer_profiles.brand_name`.

---

## 3. Novos step components

Criar em `src/components/auth/producer-signup-steps/`:

### `StepAccountType.tsx`
Dois cards grandes lado-a-lado com ícones:
- 👤 **Pessoa Física** — "Sou um profissional autônomo / produtor individual"
- 🏢 **Pessoa Jurídica** — "Tenho CNPJ, casa de show ou empresa de eventos"

Seleção destaca borda em primary + glow. Botão "Continuar" abaixo.

### `StepDocument.tsx`
Renderiza inputs condicionais conforme `accountType`:
- **PF:** reaproveita lógica do `StepCPF` (CPF + Nome completo, validação `validateCPF`, ícone de check verde)
- **PJ:** CNPJ (com máscara `00.000.000/0000-00` + validação dígitos verificadores) + Razão social

Vou criar `src/utils/cnpjValidator.ts` espelhando `cpfValidator.ts` (`formatCNPJ`, `validateCNPJ`).

### `StepEmailProducer.tsx`
**Reutilizar** o `StepEmail.tsx` existente — mesma fase email → OTP via `send-verification-code` / `verify-email-code`. Só adapta props (passa `nomeCompleto` ou `razaoSocial` como name no email).

### `StepWhatsAppProducer.tsx`
**Reutilizar** o `StepWhatsApp.tsx` existente.

### `StepPasswordProducer.tsx`
**Reutilizar** o `StepPassword.tsx` existente — já tem botão "Criar minha conta" e disclaimer de termos/privacidade.

---

## 4. Limpeza

- **Deletar** `src/pages/ProducerSignup.tsx` (substituído pelo wizard)
- **Deletar** `src/pages/ProducerLogin.tsx` (mesclado em `ProducerAuth.tsx`)
- **App.tsx:** ambas as rotas `/area-do-produtor/login` e `/area-do-produtor/cadastro` apontam para `<ProducerAuth />`
- **AreaDoProdutor.tsx:** botões "Começar agora" e "Já tenho conta" continuam funcionando (apenas mudam a aba ativa)

---

## Arquivos a criar

- `src/pages/ProducerAuth.tsx`
- `src/components/auth/ProducerSignupWizard.tsx`
- `src/components/auth/producer-signup-steps/StepAccountType.tsx`
- `src/components/auth/producer-signup-steps/StepDocument.tsx`
- `src/utils/cnpjValidator.ts`

## Arquivos a modificar

- `src/App.tsx` (rotas)

## Arquivos a deletar

- `src/pages/ProducerSignup.tsx`
- `src/pages/ProducerLogin.tsx`

---

## Resultado visual

O produtor abrirá uma tela com o mesmo refino visual do cliente (Aurora glass), poderá alternar entre **Entrar** e **Cadastrar** sem trocar de página, e o cadastro terá fluxo guiado em 5 etapas com OTP de email — consistente com o resto do sistema.
