-- ============================================================================
-- PEDIDO DE REPASSE SÓ PELA PORTA DA FRENTE (OS-107)
-- 02/10/2026
-- ============================================================================
--
-- POR QUE
--   `request_payout(p_event_id, p_user_id)` recebe "quem é o produtor" como
--   parâmetro e confia nele. A edge `request-payout` faz certo: tira o
--   produtor de dentro do token e chama a função com a chave de serviço. Só
--   que a função também estava liberada para `anon` e `authenticated`: quem
--   soubesse o código do evento e o do produtor abria um pedido de repasse em
--   nome dele direto pela API pública, sem login.
--
--   A migration de 09/06 já tinha feito `REVOKE ... FROM PUBLIC`, mas no
--   Supabase toda função nova do schema `public` nasce com permissão dada POR
--   NOME a `anon` e `authenticated` (privilégio padrão do projeto). Tirar de
--   PUBLIC não tira dessas duas.
--
-- O QUE FAZ
--   Tira a execução de `anon` e `authenticated`. Fica só `service_role`, que
--   é quem a edge usa. Não recria a função (nada de DROP + CREATE, que
--   devolveria a permissão ao público): a regra e a conta do repasse ficam
--   idênticas.
--
-- O QUE NÃO MUDA
--   A tela do produtor (ela chama a edge, nunca a função direto), o valor do
--   repasse, os pedidos já abertos. E as funções de checagem usadas nas regras
--   de acesso (`has_role`, `has_section`, `has_manage_team`,
--   `is_producer_admin`, `is_producer_member`) NÃO entram aqui: revogar essas
--   derruba o site.
--
-- COMO VOLTAR ATRÁS
--   GRANT EXECUTE ON FUNCTION public.request_payout(uuid, uuid)
--     TO anon, authenticated;
-- ============================================================================

REVOKE ALL ON FUNCTION public.request_payout(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_payout(uuid, uuid) TO service_role;

-- Conferência na própria migration: se a permissão não ficou como deveria,
-- a migration falha inteira em vez de passar calada.
DO $confere$
BEGIN
  IF has_function_privilege('anon', 'public.request_payout(uuid, uuid)', 'execute')
     OR has_function_privilege('authenticated', 'public.request_payout(uuid, uuid)', 'execute') THEN
    RAISE EXCEPTION 'request_payout continua executável por anon ou authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.request_payout(uuid, uuid)', 'execute') THEN
    RAISE EXCEPTION 'request_payout ficou sem execução para service_role: a edge request-payout pararia';
  END IF;
END;
$confere$;
