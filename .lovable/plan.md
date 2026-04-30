## Contexto

- Domínio `festpag.com.br` está **VERIFICADO** no Resend ✅
- Remetente definido: `naoresponda@festpag.com.br`
- Hoje, **só uma função usa Resend**: `send-verification-code` (OTP do checkout), com remetente antigo `contato@ingressosrp.com.br`
- A recuperação de senha hoje usa o sistema padrão do Supabase Auth (`supabase.auth.resetPasswordForEmail`) — que envia um **link mágico**, não um OTP. Quer trocar para o fluxo OTP via Resend.

---

## Plano de execução

### Etapa 1 — Atualizar o remetente da verificação de email do checkout

**Arquivo:** `supabase/functions/send-verification-code/index.ts` (linha 69)

Trocar:
```ts
from: "IngressosRP <contato@ingressosrp.com.br>",
```
Por:
```ts
from: "FestPag <naoresponda@festpag.com.br>",
```

Também atualizar o assunto (já está bom) e manter o template HTML como está (já usa branding FestPag).

---

### Etapa 2 — Criar fluxo de recuperação de senha por OTP via Resend

A ideia é trocar o "link mágico" do Supabase por um **OTP de 6 dígitos enviado via Resend**, igual ao do checkout. Isso dá controle total sobre o remetente e o template do email.

#### 2.1 — Tabela no banco

Criar tabela `password_reset_codes` (mesmo padrão da `email_verification_codes`):
- `id uuid PK`
- `email text not null`
- `code text not null` (6 dígitos)
- `expires_at timestamptz not null` (10 minutos)
- `verified boolean default false`
- `created_at timestamptz default now()`
- RLS habilitado, sem políticas públicas (só edge functions com service role acessam)
- Índice em `email`

#### 2.2 — Nova edge function: `send-password-reset-code`

Recebe `{ email }`. Verifica se o email existe em `auth.users` (via service role). Gera código de 6 dígitos, salva em `password_reset_codes`, envia email via Resend com template branded FestPag (gradiente roxo, mesmo estilo do código de verificação do checkout).

Importante: por segurança, **sempre retornar sucesso**, mesmo se o email não existir (evita enumeração de usuários). Só não envia o email se o usuário não existir.

`verify_jwt = false` no `config.toml`.

#### 2.3 — Nova edge function: `verify-password-reset-code`

Recebe `{ email, code, newPassword }`:
1. Valida o código em `password_reset_codes` (não expirado, não verificado).
2. Marca como `verified = true`.
3. Usa `supabase.auth.admin.updateUserById()` (service role) para alterar a senha do usuário.
4. Retorna sucesso.

`verify_jwt = false` no `config.toml`.

#### 2.4 — Atualizar UI da recuperação de senha

Os 3 lugares hoje chamam `supabase.auth.resetPasswordForEmail`:
- `src/pages/Auth.tsx` (login do cliente)
- `src/pages/ProducerAuth.tsx` (login do produtor)
- `src/components/auth/AuthModal.tsx` (modal de auth)
- `src/pages/MinhaConta.tsx` (botão "alterar senha" da área do cliente)

Criar um novo componente reutilizável `<PasswordResetOTPFlow />` com 3 passos:
1. **Email** → input do email + botão "Enviar código" (chama `send-password-reset-code`)
2. **OTP** → input dos 6 dígitos (mesmo `OTPInput` premium já usado no signup) + reenvio com cooldown
3. **Nova senha** → input nova senha + confirmar senha + botão "Redefinir" (chama `verify-password-reset-code` com email+code+newPassword)
4. **Sucesso** → mensagem "Senha alterada!" e redirect para login

Substituir os 4 pontos acima para usar esse novo componente em vez de `resetPasswordForEmail`.

#### 2.5 — Página `/reset-password` antiga

A página `src/pages/ResetPassword.tsx` (que processava o link mágico do Supabase) fica **obsoleta** com o novo fluxo. Posso:
- **Opção A:** Manter a rota mas redirecionar para a tela de login (caso algum email antigo de recuperação ainda esteja em uso)
- **Opção B:** Remover a rota e a página

Recomendo **Opção A** por 7 dias, depois remover. Mas posso fazer Opção B direto se preferir.

---

### Etapa 3 — Limpar referências textuais ao domínio antigo

Encontrei estas pendências fora do Resend:
- `src/utils/ticketPdf.ts:346` → rodapé do PDF: `'Gerado por FestPag · ingressosrp.com.br'` → trocar para `festpag.com.br`
- `src/pages/AreaDoProdutor.tsx:123` → `mailto:contato@ingressosrp.com.br` → trocar para `contato@festpag.com.br`
- `src/components/home/ProducerSolutionsSection.tsx:155` → mesmo `mailto:` → trocar para `contato@festpag.com.br`

---

### Etapa 4 — Teste de ponta a ponta

Após o deploy:
1. **Checkout OTP:** iniciar uma compra e conferir que o código chega de `naoresponda@festpag.com.br`.
2. **Recuperação de senha:** ir em login → "Esqueci minha senha" → digitar email → receber OTP → digitar OTP + nova senha → confirmar que consegue logar com a nova senha.
3. Verificar no painel do Resend → **Logs** se ambos os envios aparecem como `delivered`.

---

## Estrutura dos arquivos novos/alterados

```
supabase/
  functions/
    send-verification-code/index.ts        [editar — só remetente]
    send-password-reset-code/index.ts      [novo]
    verify-password-reset-code/index.ts    [novo]
  config.toml                              [editar — registrar 2 novas funções com verify_jwt=false]
  migrations/<timestamp>_password_reset.sql [nova tabela password_reset_codes]

src/
  components/auth/PasswordResetOTPFlow.tsx [novo — fluxo de 3 passos reutilizável]
  pages/Auth.tsx                           [editar — usar novo fluxo]
  pages/ProducerAuth.tsx                   [editar — usar novo fluxo]
  pages/MinhaConta.tsx                     [editar — usar novo fluxo]
  pages/ResetPassword.tsx                  [editar — virar redirect /login (Opção A)]
  components/auth/AuthModal.tsx            [editar — usar novo fluxo]
  utils/ticketPdf.ts                       [editar — domínio]
  pages/AreaDoProdutor.tsx                 [editar — mailto]
  components/home/ProducerSolutionsSection.tsx [editar — mailto]
```

---

## Pergunta antes de executar

Sobre a página `/reset-password` antiga (que recebia o link mágico do Supabase):

- **Opção A** — manter a rota como redirect para a tela de login (mais seguro caso algum link antigo esteja em circulação)
- **Opção B** — remover a página e rota completamente

Qual prefere? Se não responder, sigo com a **Opção A** por padrão.
