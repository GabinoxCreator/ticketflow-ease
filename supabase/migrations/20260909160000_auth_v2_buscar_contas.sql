-- ============================================================================
-- Login por CPF/WhatsApp/e-mail — BLOCO 1: achar a(s) conta(s) por um identificador
-- Data: 09/09/2026 · Plano: _docs/plano-login-cpf-whatsapp.md
--
-- A RLS de `profiles` só deixa cada um ler o próprio perfil — certo para o site,
-- mas o login precisa responder "existe conta com este CPF? quais canais?" ANTES
-- de haver sessão. Esta RPC faz essa pergunta com privilégio, e só o SERVICE ROLE
-- (as edges `auth-identificar` e `auth-codigo`) pode chamá-la. Pela API pública,
-- anon e authenticated tomam "permission denied".
--
-- Devolve em ordem de criação, porque há CPFs com mais de uma conta (14 em 09/09)
-- e a edge escolhe pelo índice — a ordem tem de ser a mesma nas duas chamadas.
-- `whatsapp` já sai normalizado (55DDDN) e `email` sai NULL quando vazio.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.buscar_contas_por_identificador(_tipo text, _valor text)
RETURNS TABLE (
  user_id uuid,
  nome_completo text,
  whatsapp text,
  email text,
  papeis text,
  criado_em timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    p.nome_completo,
    public.normalizar_whatsapp(p.whatsapp),
    NULLIF(lower(trim(p.email)), ''),
    (SELECT string_agg(r.role::text, ',' ORDER BY r.role) FROM public.user_roles r WHERE r.user_id = p.id),
    p.created_at
  FROM public.profiles p
  WHERE CASE _tipo
    WHEN 'cpf'      THEN regexp_replace(coalesce(p.cpf, ''), '\D', '', 'g') = _valor
    WHEN 'whatsapp' THEN public.normalizar_whatsapp(p.whatsapp) = _valor
    WHEN 'email'    THEN lower(trim(p.email)) = lower(trim(_valor))
    ELSE false
  END
  ORDER BY p.created_at NULLS LAST, p.id;
$$;

REVOKE EXECUTE ON FUNCTION public.buscar_contas_por_identificador(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_contas_por_identificador(text, text) TO service_role;

-- ROLLBACK: DROP FUNCTION IF EXISTS public.buscar_contas_por_identificador(text, text);
