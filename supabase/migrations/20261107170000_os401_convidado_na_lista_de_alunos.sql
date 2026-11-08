-- Convidado do pedido também no evento com lista de alunos (OS-401, 07/11/2026, Balé da Bruna).
--
-- Decisão do Gabriel em 07/11 (caixinha da OS-401): "a gente tem que pensar uma forma de
-- apontar os ingressos ou não, ser opcional no final da compra". No Balé a família compra
-- até 4 convites numa conta; com isto, no fim da compra ela PODE (não é obrigada) dizer
-- para quem é cada convite, e cada pessoa entra no teatro pela facial ou pelo CPF dela.
-- É o "Para quem são os outros ingressos?" da OS-372, que nasceu desligado para evento com
-- lista de alunos. A tela da compra de poltrona já mostra o quadro (`ConvidadosDaCompra` no
-- `SeatCheckout`): quem esconde é a edge `ingresso-convidado` (muda junto, redeploy) e esta
-- função.
--
-- O QUE MUDA: só sai a linha `or exists (... listas_alunos_eventos ...)` da recusa
-- `pedido_sem_convidado`. O resto é o corpo que está no ar em 07/11 (md5 conferido
-- d3675d42ffb2ba9f5c9d5b8d4672749e, sem comentários e com espaços juntados), letra por letra.
-- O limite de 4 convites por criança não muda: ele conta os ingressos do PEDIDO, e apontar
-- um convidado não tira o ingresso do pedido. Nada é apagado; nenhuma linha muda.
--
-- Volta: o mesmo `create or replace` com a linha de volta (`_docs/os401/volta-convidado-lista.sql`).

create or replace function public.apontar_convidado_ingresso(_ticket_id uuid, _user_id uuid, _to_cpf text, _to_nome text, _to_email text, _to_phone text, _token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _cpf    text;
  _t      record;
  _r      jsonb;
  _ultimo date;
  _ate    timestamptz;
begin
  _cpf := nullif(regexp_replace(coalesce(_to_cpf, ''), '\D', '', 'g'), '');
  if _cpf is null or length(_cpf) <> 11 then
    raise exception 'cpf_invalido' using errcode = '22023';
  end if;

  select t.event_id, t.order_id, t.user_id, o.sale_origin, coalesce(o.retirada_por_link, false) as retirada,
         e.date, e.end_date
    into _t
    from public.tickets t
    join public.orders o on o.id = t.order_id
    join public.events e on e.id = t.event_id
   where t.id = _ticket_id;
  if not found then raise exception 'ingresso_nao_encontrado' using errcode = 'P0002'; end if;
  if _t.user_id is distinct from _user_id then
    raise exception 'ingresso_nao_e_seu' using errcode = 'P0001';
  end if;

  if _t.sale_origin is distinct from 'online' or _t.retirada
     or (select count(*) from public.tickets x where x.order_id = _t.order_id and x.status = 'valid') < 2 then
    raise exception 'pedido_sem_convidado' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('convidado:' || _t.event_id::text || ':' || _cpf));
  if exists (
    select 1
      from public.tickets x
      join public.orders o on o.id = x.order_id
     where x.event_id = _t.event_id
       and x.status <> 'cancelled'
       and (o.status = 'paid' or (o.status = 'pending' and o.expires_at > now()))
       and regexp_replace(coalesce(nullif(x.holder_cpf, ''), o.customer_cpf, ''), '\D', '', 'g') = _cpf
  ) or exists (
    select 1 from public.ticket_transfers tr
     where tr.event_id = _t.event_id and tr.status = 'pendente'
       and tr.expires_at > now() and tr.to_cpf = _cpf
  ) then
    raise exception 'cpf_ja_tem_ingresso' using errcode = 'P0001';
  end if;

  _r := public.iniciar_transferencia_ingresso(_ticket_id, _user_id, _cpf, _to_email, _to_phone, _token);

  select greatest(_t.date, _t.end_date, (select max(d.day_date) from public.event_days d where d.event_id = _t.event_id))
    into _ultimo;
  _ate := greatest(now() + interval '24 hours',
                   coalesce(((_ultimo + 1)::timestamp + time '23:59') at time zone 'America/Sao_Paulo',
                            now() + interval '24 hours'));

  update public.ticket_transfers
     set expires_at = _ate,
         origem     = 'convidado',
         to_name    = nullif(btrim(coalesce(_to_nome, '')), '')
   where id = (_r->>'transfer_id')::uuid;

  return _r || jsonb_build_object('expires_at', _ate);
end;
$function$;

revoke all on function public.apontar_convidado_ingresso(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;

-- Conferência depois de aplicar:
--   select position('listas_alunos' in pg_get_functiondef('public.apontar_convidado_ingresso(uuid,uuid,text,text,text,text,text)'::regprocedure)); -- 0
--   select proacl::text from pg_proc where proname = 'apontar_convidado_ingresso';  -- {postgres=X/postgres,service_role=X/postgres}
