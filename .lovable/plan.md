

# Corrigir Envio de Email de Verificação

## Problema

O email de verificação não está sendo enviado porque o remetente atual é `onboarding@resend.dev` (endereço de teste do Resend). Esse endereço só consegue enviar emails para o próprio dono da conta Resend, não para clientes.

## Solução

Alterar o campo `from` na edge function `send-verification-code` para usar o domínio verificado `ingressosrp.com.br`.

## Alteração

### Arquivo: `supabase/functions/send-verification-code/index.ts`

**Linha 69** - Trocar o remetente:

- De: `"IngressosRP <onboarding@resend.dev>"`
- Para: `"IngressosRP <contato@ingressosrp.com.br>"`

Essa é a única alteração necessária. O `RESEND_API_KEY` já está configurado como secret e o domínio `ingressosrp.com.br` já está verificado no Resend.

