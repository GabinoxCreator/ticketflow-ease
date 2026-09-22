-- O aceite na hora de PAGAR também passa a ficar guardado.
--
-- Fecha a lacuna que o maestro pegou ao subir o item 110 (21/09/2026): o aviso
-- apareceu no checkout, mas nenhuma porta de pagamento gravava o aceite — só o
-- cadastro gravava. Duas consequências:
--   1. o aceite da Política de REEMBOLSO (o documento que o comprador mais vai
--      contestar, porque fixa prazo e regra de devolução) não tinha registro;
--   2. quem já tinha conta antes de 21/09 nunca aceitou nada, e a compra era a
--      única chance de gerar registro para essa pessoa.
--
-- Por que uma função nova em vez de ligar `registrar_aceite` nas portas de
-- pagamento: são SETE (create-mercadopago-pix, marcel-create-pix,
-- marcel-process-card, create-seat-pix, marcel-create-seat-pix, charge-seat-card,
-- marcel-charge-seat-card). Ligar em sete lugares é esquecer em um — e a oitava,
-- quando nascer, já nasceria sem.
--
-- A regra "o navegador não escreve" continua valendo onde importa: esta função
-- NÃO recebe usuario_id. Ela usa `auth.uid()`, o dono do token. O pior que
-- alguém consegue é registrar um aceite para si mesmo, que é um registro CONTRA
-- quem o criou — não há o que forjar a favor.

create or replace function public.registrar_meu_aceite(
  _versoes   jsonb,
  _contexto  text,
  _pedido_id uuid default null
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    return 0;  -- sem sessão não há aceite a registrar; nunca é erro
  end if;

  -- Contexto vem do cliente, então é preso a uma lista: sem isto alguém poderia
  -- gravar um aceite com contexto inventado e sujar o registro.
  if _contexto not in ('checkout', 'checkout_mesa') then
    return 0;
  end if;

  -- O pedido, quando vem, tem de ser DESTE usuário. Caso contrário o aceite é
  -- gravado sem pedido em vez de mentir sobre a que compra ele pertence.
  if _pedido_id is not null and not exists (
    select 1 from public.orders o where o.id = _pedido_id and o.user_id = _uid
  ) then
    _pedido_id := null;
  end if;

  return public.registrar_aceite(_uid, _versoes, _contexto, null, null, _pedido_id);
end;
$$;

comment on function public.registrar_meu_aceite(jsonb, text, uuid) is
  'Registra o aceite do PRÓPRIO usuário logado (auth.uid()) no momento da compra. Não aceita usuario_id — ver o comentário da migration 20260921180000.';

-- Só quem tem sessão. O `REVOKE FROM PUBLIC` não tira o que o Supabase concede
-- direto a anon na criação, então anon vai nomeado (lição de 17/09).
revoke execute on function public.registrar_meu_aceite(jsonb, text, uuid) from public;
revoke execute on function public.registrar_meu_aceite(jsonb, text, uuid) from anon;
grant  execute on function public.registrar_meu_aceite(jsonb, text, uuid) to authenticated;
