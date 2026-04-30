## Objetivo

Atualizar o token do Resend (`RESEND_API_KEY`) com o novo valor e concluir as pendências da migração para o domínio `festpag.com.br`.

## Importante sobre o token

Por segurança, **não devo armazenar a chave do Resend escrita diretamente no chat** dentro do código. Vou abrir o fluxo seguro de atualização de secret para você colar a nova chave (`re_KeNo5Dn3_...`) no campo apropriado. Isso garante que ela fique criptografada e disponível para as Edge Functions.

Recomendo também que, depois de atualizada aqui, você **revogue essa chave no painel do Resend e gere uma nova**, já que ela foi exposta no chat.

## Passos

### 1. Atualizar o secret RESEND_API_KEY
Abrir o modal seguro de atualização de secret para você inserir o novo token.

### 2. Atualizar `MinhaConta.tsx`
Substituir o fluxo antigo de redefinição de senha (`supabase.auth.resetPasswordForEmail` ou similar) pelo novo componente `<PasswordResetOTPFlow />`, mantendo a UX consistente com `Auth.tsx` e `ProducerAuth.tsx`.

### 3. Transformar `/reset-password` em redirect
Converter a página `src/pages/ResetPassword.tsx` (rota de magic link antiga) em um redirect para `/login`, evitando que links antigos quebrem.

### 4. Limpeza de referências ao domínio antigo
- `src/utils/ticketPdf.ts` — atualizar rodapé do PDF de `ingressosrp.com.br` para `festpag.com.br`.
- `src/pages/AreaDoProdutor.tsx` — atualizar `mailto:contato@ingressosrp.com.br` para `contato@festpag.com.br`.
- `src/components/home/ProducerSolutionsSection.tsx` — mesmo ajuste.
- Buscar com `rg` outras ocorrências remanescentes de `ingressosrp.com.br` no código.

### 5. Validar Edge Functions
- Confirmar que `send-verification-code`, `send-password-reset-code` e `verify-password-reset-code` estão usando `naoresponda@festpag.com.br` como remetente.
- As funções são re-deployadas automaticamente pela Lovable após edição.

### 6. Teste recomendado (após implementação)
- Solicitar um OTP de checkout (verificação de email) e verificar se o email chega de `naoresponda@festpag.com.br`.
- Solicitar uma redefinição de senha em `/login`, `/produtor/login` e na conta logada (`MinhaConta`) e validar o fluxo OTP.

## Arquivos que serão modificados

- `src/pages/MinhaConta.tsx`
- `src/pages/ResetPassword.tsx`
- `src/utils/ticketPdf.ts`
- `src/pages/AreaDoProdutor.tsx`
- `src/components/home/ProducerSolutionsSection.tsx`

## Confirmação necessária

Posso prosseguir com:
1. Abrir o modal para você atualizar o `RESEND_API_KEY` com o novo token, **e**
2. Aplicar todas as alterações de código descritas acima?
