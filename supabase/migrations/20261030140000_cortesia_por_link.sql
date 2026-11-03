-- Retirada de cortesia por link público (OS-313).
--
-- Duas coisas, e as duas nasceram de defeito achado na revisão de olho limpo:
--
-- 1) `event_lots.retirada_publica`: é ESTA coluna que abre o link de um evento, e não
--    o nome do lote. Com o gatilho no nome, bastava um produtor escrever "Cortesia pelo
--    link" no painel dele para abrir uma torneira de ingresso grátis no evento dele, sem
--    ninguém aprovar. E a coluna sozinha não bastava: a política de UPDATE de `event_lots`
--    deixa o produtor mudar o lote dele inteiro, então um PATCH na API ligaria a mesma
--    torneira. Por isso o gatilho abaixo: só a casa (service role ou admin logado) liga.
--
-- 2) O índice único: sem ele, "um CPF, uma cortesia" era só uma consulta antes do insert,
--    e duas chamadas ao mesmo tempo passavam as duas (uma pessoa sozinha esvaziava o lote
--    em paralelo). O índice é parcial de propósito: vale só para cortesia viva, para não
--    atrapalhar a venda normal nem o histórico de cortesia já cancelada.
--    ⚠️ Há cortesia antiga repetida no banco (lista do produtor com o mesmo CPF duas
--    vezes), por isso o índice cobre apenas as emitidas PELO LINK, marcadas na coluna
--    nova `orders.retirada_por_link`. O `sale_origin` continua 'courtesy' (e o
--    `manual_payment_method` continua nulo): os dois têm CHECK fechado no banco, e mexer
--    neles tiraria estas cortesias de todo relatório que já conta cortesia.

alter table public.event_lots
  add column if not exists retirada_publica boolean not null default false;

comment on column public.event_lots.retirada_publica is
  'Lote que pode ser retirado pelo link público /cortesia/<slug do evento> (OS-313). Só a casa liga.';

alter table public.orders
  add column if not exists retirada_por_link boolean not null default false;

comment on column public.orders.retirada_por_link is
  'Cortesia retirada pelo próprio convidado no link público do evento (OS-313).';

create unique index if not exists orders_cortesia_link_unica_por_cpf
  on public.orders (event_id, customer_cpf)
  where retirada_por_link and status in ('paid', 'pending');

comment on index public.orders_cortesia_link_unica_por_cpf is
  'Um CPF, uma cortesia por evento quando a retirada foi pelo link (OS-313). A edge trata o 23505 como "já retirou".';

-- Uma por PESSOA também, e não só por CPF: quando a OS-313 foi escrita, o CPF do perfil era
-- editável pelo dono da conta e bastava trocá-lo para retirar de novo. Desde a OS-267 o
-- gatilho `trg_perfil_guarda_identidade` recusa essa troca; o índice fica como segunda trava.
create unique index if not exists orders_cortesia_link_unica_por_conta
  on public.orders (event_id, user_id)
  where retirada_por_link and user_id is not null and status in ('paid', 'pending');

comment on index public.orders_cortesia_link_unica_por_conta is
  'Uma cortesia de link por conta por evento (OS-313). Segunda trava, além do CPF do perfil travado desde a OS-267.';

-- Quem liga a retirada pública é a casa, não o produtor. Sem isto a coluna seria só uma
-- caixinha a mais no PATCH que o produtor já pode fazer no lote dele.
create or replace function public.trava_retirada_publica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mudou boolean;
begin
  -- Vale para INSERT também: sem isso, o produtor abria a mesma torneira criando um lote
  -- novo já com a coluna ligada (a policy de INSERT de event_lots não restringe coluna).
  v_mudou := case when tg_op = 'INSERT'
                  then coalesce(new.retirada_publica, false)
                  else new.retirada_publica is distinct from old.retirada_publica end;
  -- `auth.uid()` nulo = chamada de servidor (service role), que é a casa agindo pela edge
  -- ou pelo comando. Usuário logado só pode mexer nisto se for admin.
  if v_mudou and auth.uid() is not null and not public.has_role(auth.uid(), 'admin') then
    raise exception 'retirada_publica só pode ser ligada pela FestPag';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trava_retirada_publica on public.event_lots;
create trigger trg_trava_retirada_publica
  before insert or update on public.event_lots
  for each row
  execute function public.trava_retirada_publica();
