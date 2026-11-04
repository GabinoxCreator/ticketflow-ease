-- Convidado do pedido (OS-372, 03/11/2026).
--
-- Quem compra vários ingressos ficava com todos na própria conta, e a portaria pela facial
-- só reconhece o dono do ingresso. Para cada convidado entrar, o comprador tinha que achar
-- o Transferir ingresso por ingresso e mandar o link ele mesmo: quase ninguém fazia.
-- Pedido do Gabriel: "a gente apontar cada ingresso para seu convidado e ele ter o link da
-- facial, a gente mandar pelo email ou whatsapp".
--
-- COMO FUNCIONA: logo depois de pagar (ou depois, em Meus Ingressos), o comprador diz para
-- quem é cada ingresso a mais (nome, CPF, e-mail e celular). É a transferência de sempre
-- (`iniciar_transferencia_ingresso`, mesmas recusas, mesmo aceite pelo CPF em
-- `/transferencia/<token>`), com três diferenças decididas pelo Gabriel em 03/11:
--   · nós mandamos o e-mail ao convidado (a edge `ingresso-convidado`); o comprador pode
--     mandar também pelo WhatsApp dele, com um toque;
--   · o link vale até o dia seguinte ao evento (o Transferir de sempre continua 24 h);
--   · só pedido pago do site com 2 ou mais ingressos, menos lista de alunos (Balé) e
--     retirada grátis (essa já tem o acompanhante, OS-357);
--   · um CPF, um ingresso por evento: CPF que já tem ingresso ou convite aberto daquele
--     evento é recusado (decisão do Gabriel, 03/11, caixinha da OS-372).
--
-- ⚠️ NADA É APAGADO: o ingresso continua do comprador até o convidado aceitar, e o
-- comprador pode cancelar enquanto isso (`cancelar_transferencia_ingresso`, de sempre).
-- Só se ACRESCENTA: três colunas que nascem vazias e uma função nova. Nenhuma função
-- existente muda.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O que a transferência de sempre não guardava
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.ticket_transfers
  add column if not exists origem text,
  add column if not exists to_name text,
  add column if not exists aviso_enviado_em timestamptz;

comment on column public.ticket_transfers.origem is
  'De onde veio a transferência. NULL = o Transferir do dono (24 h, link pelo WhatsApp dele); ''convidado'' = convidado do pedido (OS-372: nós mandamos o e-mail, vale até o dia seguinte ao evento).';
comment on column public.ticket_transfers.to_name is
  'Nome do convidado como o comprador escreveu (OS-372). Só para o e-mail e para a tela do comprador; quem vale no ingresso é o nome que o convidado informa no aceite.';
comment on column public.ticket_transfers.aviso_enviado_em is
  'Último e-mail do convite que saiu de verdade (OS-372). Também segura o reenvio: um por vez a cada 10 minutos.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Apontar o convidado
-- ─────────────────────────────────────────────────────────────────────────────
-- Só o servidor chama (a edge `ingresso-convidado`, com service role e o usuário tirado da
-- sessão, nunca de um id vindo do navegador).
create or replace function public.apontar_convidado_ingresso(
  _ticket_id uuid, _user_id uuid, _to_cpf text, _to_nome text, _to_email text, _to_phone text, _token text)
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
  -- Só o dono, e ANTES de tudo: senão quem tem o id de um ingresso alheio descobriria, pela
  -- recusa, se um CPF tem ingresso naquele evento. A `iniciar` confere de novo.
  if _t.user_id is distinct from _user_id then
    raise exception 'ingresso_nao_e_seu' using errcode = 'P0001';
  end if;

  -- Quais pedidos têm convidado (decisão do Gabriel, 03/11): compra do site com 2 ou mais
  -- ingressos válidos. Cortesia, venda manual, maquininha e retirada grátis seguem como estão;
  -- a lista de alunos (Balé) também, porque ali o ingresso é da família da criança.
  if _t.sale_origin is distinct from 'online' or _t.retirada
     or (select count(*) from public.tickets x where x.order_id = _t.order_id and x.status = 'valid') < 2
     or exists (select 1 from public.listas_alunos_eventos l where l.event_id = _t.event_id) then
    raise exception 'pedido_sem_convidado' using errcode = 'P0001';
  end if;

  -- Um CPF, um ingresso por evento (decisão do Gabriel, 03/11). O lock por evento+CPF faz a
  -- segunda gravação esperar a primeira: sem ele, o mesmo convidado apontado em duas abas ao
  -- mesmo tempo passava nas duas conferências.
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

  -- A transferência de sempre: é ela que confere dono, ingresso válido, pago, não usado,
  -- não transferido, sem transferência aberta e CPF que não é o do próprio dono.
  _r := public.iniciar_transferencia_ingresso(_ticket_id, _user_id, _cpf, _to_email, _to_phone, _token);

  -- Até o dia seguinte ao evento, 23h59 de Brasília (igual ao acompanhante, OS-357), contando
  -- o último dia do evento. Nunca menos que as 24 h de sempre: evento de hoje ou já passado
  -- não ganha um link que nasce vencido.
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

comment on function public.apontar_convidado_ingresso(uuid, uuid, text, text, text, text, text) is
  'OS-372: o comprador aponta o convidado de um ingresso do pedido. Confere o pedido e o CPF (um por evento) e abre a transferência de sempre, com prazo até o dia seguinte ao evento. Só service role.';

-- Conferência depois de aplicar (esperado: 3 colunas, a função, e nenhuma linha antiga mexida):
--   select count(*) filter (where column_name in ('origem','to_name','aviso_enviado_em')) as colunas
--     from information_schema.columns where table_schema='public' and table_name='ticket_transfers';      -- 3
--   select count(*) from pg_proc where proname = 'apontar_convidado_ingresso';                             -- 1
--   select count(*) from public.ticket_transfers where origem is not null;                                 -- 0
--   select proacl::text from pg_proc where proname = 'apontar_convidado_ingresso';
--     -- {postgres=X/postgres,service_role=X/postgres}  (igual à `iniciar` no ar: SECURITY DEFINER que confia
--     -- no `_user_id` recebido; se anon ou authenticated aparecer aqui, revogar ANTES de deployar a edge)
