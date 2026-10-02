-- ============================================================================
-- OS-112 · O João dá a baixa do reembolso na própria gestão, sem conta no site
-- ============================================================================
-- Decisão do Gabriel (02/10/2026): "eu não queria que ele criasse conta no site
-- de ingresso, queria que ele desse a baixa no próprio sistema da gestão".
--
-- É a ÚNICA exceção à regra "a gestão nunca grava no banco do site". A porta é
-- estreita de propósito: só marca um reembolso `aprovado` como `pago`, junto com
-- o comprovante (obrigatório, decisão do Gabriel na mesma data). Não aprova, não
-- recusa, não mexe em pedido nem em ingresso.
--
-- Quem chama é a edge `gestao-reembolso-baixa` (service role), depois que o
-- proxy da gestão conferiu que o usuário logado lá é o João ou o Gabriel. Quem
-- deu a baixa não tem usuário no site, então fica gravado pelo lado da gestão
-- em `pago_por_gestao` (nome e e-mail), e `pago_por` (uuid do site) fica vazio.
--
-- Depende da migration 20261002070000_reembolso_pela_conta.sql (OS-103).
-- ============================================================================

alter table public.reembolsos
  add column if not exists pago_por_gestao text;

comment on column public.reembolsos.pago_por_gestao is
  'Quem deu a baixa pela gestão interna (nome e e-mail do usuário logado lá). Vazio quando a baixa foi dada no painel do site (aí vale pago_por).';

create or replace function public.gestao_reembolso_dar_baixa(
  p_reembolso_id     uuid,
  p_quem             text,
  p_comprovante_path text,
  p_observacao       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $baixa$
declare
  _quem text := nullif(left(btrim(coalesce(p_quem, '')), 200), '');
  _path text := nullif(btrim(coalesce(p_comprovante_path, '')), '');
  _r    record;
begin
  if _quem is null then
    return jsonb_build_object('ok', false, 'error', 'quem_obrigatorio');
  end if;
  if _path is null then
    return jsonb_build_object('ok', false, 'error', 'comprovante_obrigatorio');
  end if;

  select r.id, r.status, r.order_id, r.numero, r.valor_a_devolver into _r
    from public.reembolsos r where r.id = p_reembolso_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'reembolso_nao_encontrado');
  end if;
  if _r.status <> 'aprovado' then
    return jsonb_build_object('ok', false, 'error', 'invalid_status', 'current_status', _r.status);
  end if;

  update public.reembolsos
     set status = 'pago', pago_em = now(), pago_por = null, pago_por_gestao = _quem,
         observacao_pagamento = nullif(left(btrim(coalesce(p_observacao, '')), 500), ''),
         comprovante_path = _path
   where id = p_reembolso_id;

  -- Mesma ação de quando a baixa é dada no site, para a auditoria contar as duas
  -- juntas. `actor_id` é obrigatório e quem deu a baixa não tem usuário aqui:
  -- vai o uuid zero, e o nome de verdade vai no metadata.
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values ('00000000-0000-0000-0000-000000000000'::uuid, 'refund_paid', 'order', _r.order_id,
          jsonb_build_object('reembolso_id', p_reembolso_id, 'numero', _r.numero, 'valor', _r.valor_a_devolver,
                             'via', 'gestao', 'quem', _quem, 'comprovante_path', _path));

  return jsonb_build_object('ok', true, 'status', 'pago', 'pago_em', now(), 'numero', _r.numero);
end;
$baixa$;

comment on function public.gestao_reembolso_dar_baixa(uuid, text, text, text) is
  'Baixa do reembolso dada pela gestão interna (OS-112): aprovado → pago, com comprovante obrigatório e quem foi. Só o servidor (service role) chama.';

-- Só o servidor. ⚠️ REVOKE FROM PUBLIC não tira anon/authenticated (grant por nome): revogar dos três.
revoke all on function public.gestao_reembolso_dar_baixa(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.gestao_reembolso_dar_baixa(uuid, text, text, text) to service_role;
