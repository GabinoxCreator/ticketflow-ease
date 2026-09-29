-- ============================================================================
-- O convite da facial passa a deixar rastro
-- ----------------------------------------------------------------------------
-- 28/09/2026. O convite para cadastrar o rosto sumiu do site em 01/09 e só foi
-- descoberto em 26/09 — 18 dias, 152 contas, zero rostos. O banco não tinha
-- como avisar: "a tela não apareceu" e "apareceu e a pessoa recusou" gravavam
-- a mesma coisa, que era nada.
--
-- Não nasce tabela nova: `audit_logs` já existe e é exatamente isto. O que
-- falta é uma porta estreita para o cliente comum escrever lá — a política de
-- insert de `audit_logs` é só de admin, e abri-la para todo mundo seria trocar
-- um buraco por outro. Então entra uma função que escreve no lugar dele,
-- sempre em nome de quem está logado e só com as três ações previstas.
--
-- Como perguntar ao banco se o convite está vivo:
--   select action, count(*) from audit_logs
--    where action like 'facial_convite_%' and created_at > now() - interval '7 days'
--    group by 1;
--   Contas nascendo e zero 'mostrado' = o convite sumiu de novo.
--
-- Como voltar atrás: drop function public.registrar_convite_facial(text, text);
-- Nada mais é tocado — nenhuma tabela, nenhuma política, nenhum dado.
-- ============================================================================

create or replace function public.registrar_convite_facial(
  p_evento text,
  p_origem text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sem sessão não há o que registrar (e não se aceita ator anônimo).
  if auth.uid() is null then
    return;
  end if;

  -- Lista fechada: a função não vira porta para escrever o que se quiser.
  if p_evento not in ('mostrado', 'recusado', 'concluido') then
    return;
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'facial_convite_' || p_evento,
    'profile',
    auth.uid(),
    jsonb_build_object(
      'origem', coalesce(nullif(p_origem, ''), 'desconhecida')
    )
  );
exception
  when others then
    -- Registro nunca derruba cadastro. Se falhar, falhou em silêncio.
    return;
end;
$$;

-- ⚠️ `create or replace` mantém os grants, mas `drop` + `create` (se alguém
-- refizer isto um dia) devolve a execução ao público — já aconteceu aqui em
-- 17/08 com cinco funções do produtor. Por isso as trancas vêm explícitas, e
-- `anon` é revogado por nome: revogar de PUBLIC não fecha a porta do anônimo.
revoke all on function public.registrar_convite_facial(text, text) from public;
revoke all on function public.registrar_convite_facial(text, text) from anon;
grant execute on function public.registrar_convite_facial(text, text) to authenticated;

comment on function public.registrar_convite_facial(text, text) is
  'Registra em audit_logs o convite da facial (mostrado/recusado/concluido) em nome do próprio usuário logado. Criada em 28/09/2026 para que o sumiço do convite não volte a passar 18 dias despercebido.';
