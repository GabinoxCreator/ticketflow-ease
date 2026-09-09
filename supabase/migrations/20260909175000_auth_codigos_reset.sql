-- ============================================================================
-- Login por CPF — BLOCO 2: o código também serve para recuperar a senha
-- Data: 09/09/2026 · Plano: _docs/plano-login-cpf-whatsapp.md
--
-- Quem só tem WhatsApp não tem como usar o "Esqueci minha senha" de hoje (que
-- manda código por e-mail). Entra o propósito 'reset' em `auth_codigos`: a edge
-- `auth-codigo` manda o código pelo canal da conta e, conferido, troca a senha.
-- ============================================================================

ALTER TABLE public.auth_codigos DROP CONSTRAINT IF EXISTS auth_codigos_proposito_check;
ALTER TABLE public.auth_codigos
  ADD CONSTRAINT auth_codigos_proposito_check
  CHECK (proposito IN ('cadastro', 'login', 'canal', 'reset'));

-- ROLLBACK: recriar a constraint sem 'reset' (depois de apagar linhas com esse propósito).
