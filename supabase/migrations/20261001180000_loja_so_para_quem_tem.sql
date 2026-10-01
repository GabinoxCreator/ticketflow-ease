-- ============================================================================
-- A LOJA FICA ESCONDIDA, MENOS PARA QUEM FOI LIBERADO
-- 01/10/2026
-- ============================================================================
--
-- POR QUE
--   Decisão do Gabriel em 01/10: a aba Produtos "fica oculta em outros
--   produtores, a gente só deixa ativo aqui na Porcada do Amor, para evitar
--   esse tipo de trabalho, porque não é legal, não faz sentido, confunde
--   muito". A loja nasceu para atender uma ação beneficente; enquanto ela não
--   amadurecer, aparecer no painel de todo mundo só gera dúvida e suporte.
--
-- O QUE FAZ
--   Uma chave por produtor (`loja_habilitada`, padrão FALSO) e uma função que
--   o painel pergunta: "este usuário vê a loja?". Ligar para mais alguém é um
--   UPDATE — não é deploy.
--
-- O QUE NÃO MUDA
--   A página pública. Lá a loja já só aparece quando o evento tem produto
--   ativo, e isso continua valendo: quem não tem produto não mostra nada.
--
-- COMO VOLTAR ATRÁS
--   DROP da função e da coluna. O painel volta a mostrar a aba para todos
--   (é o front que lê esta função).
-- ============================================================================

ALTER TABLE public.producer_profiles
  ADD COLUMN IF NOT EXISTS loja_habilitada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.producer_profiles.loja_habilitada IS
  'Mostra a aba Produtos no painel deste produtor. Padrão falso: a loja foi feita para a Porcada do Amor e só aparece para quem foi liberado (decisão do Gabriel, 01/10/2026).';

-- O painel pergunta por aqui. SECURITY DEFINER porque o produtor não precisa
-- (nem deve) ler a tabela de perfis inteira para saber de si mesmo.
CREATE OR REPLACE FUNCTION public.loja_habilitada()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT bool_or(pp.loja_habilitada)
       FROM public.producer_profiles pp
      WHERE pp.owner_user_id = auth.uid()),
    false)
  OR public.has_role(auth.uid(), 'admin'::app_role);
$function$;

COMMENT ON FUNCTION public.loja_habilitada() IS
  'Este usuário vê a aba Produtos? Verdadeiro para quem tem loja_habilitada em algum perfil, e para admin.';

REVOKE ALL ON FUNCTION public.loja_habilitada() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loja_habilitada() TO authenticated, service_role;

-- Liberado só para a Almire Produções, dona da 3ª Porcada do Amor.
UPDATE public.producer_profiles
   SET loja_habilitada = true
 WHERE owner_user_id = 'b412e30e-6013-4495-abe3-d3cdd7c2a29a';
