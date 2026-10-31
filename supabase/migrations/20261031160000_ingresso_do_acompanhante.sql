-- Ingresso do acompanhante (OS-357, 31/10/2026, Festival Canto do Mato).
--
-- O link de retirada (OS-313/OS-356) dava um ingresso por CPF. O Canto do Mato quer dois:
-- quem retira e um acompanhante. O 2º ingresso nasce no CPF, no nome e no e-mail do
-- acompanhante (`tickets.holder_cpf`), e ele recebe um link para criar a conta e cadastrar
-- a facial. Pedido do Gabriel: "apontar o segundo ingresso no cpf + email da pessoa para
-- enviar o link de cadastro e que já nasce vinculado ao ingresso".
--
-- Três coisas:
--
-- 1) `event_lots.retirada_max_por_cpf`: quantos ingressos cada CPF retira pelo link (1 ou 2).
--    Padrão 1, para nada mudar onde ninguém pediu. Quem muda é a casa (o mesmo gatilho que
--    guarda `retirada_publica`), senão o produtor dobrava o próprio link.
--
-- 2) O gatilho `trava_retirada_publica` passa a guardar também essa coluna.
--
-- 3) `checkin_rostos_candidatos` (a portaria pela facial do NOSSO totem, OS-246) procurava
--    os rostos só pelo CPF de quem COMPROU. Ingresso que tem titular próprio (o do
--    acompanhante, ou um transferido e aceito) ficava com o rosto errado: quem comprou
--    passava duas vezes e o titular era barrado. Agora vale o CPF do titular do ingresso
--    e, sem titular, o de quem comprou. A `facial-checkin` (a do Marcel) muda junto, na edge.

alter table public.event_lots
  add column if not exists retirada_max_por_cpf smallint not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_lots_retirada_max_por_cpf_check') then
    alter table public.event_lots
      add constraint event_lots_retirada_max_por_cpf_check check (retirada_max_por_cpf between 1 and 2);
  end if;
end $$;

comment on column public.event_lots.retirada_max_por_cpf is
  'Link de retirada (OS-357): quantos ingressos cada CPF retira, contando o do acompanhante (1 ou 2). Só a casa muda.';

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
                  then coalesce(new.retirada_publica, false) or coalesce(new.retirada_max_por_cpf, 1) <> 1
                  else new.retirada_publica is distinct from old.retirada_publica
                       or new.retirada_max_por_cpf is distinct from old.retirada_max_por_cpf end;
  -- `auth.uid()` nulo = chamada de servidor (service role), que é a casa agindo pela edge
  -- ou pelo comando. Usuário logado só pode mexer nisto se for admin.
  if v_mudou and auth.uid() is not null and not public.has_role(auth.uid(), 'admin') then
    raise exception 'retirada_publica só pode ser ligada pela FestPag';
  end if;
  return new;
end;
$$;

create or replace function public.checkin_rostos_candidatos(_modelo text, _event_id uuid default null::uuid)
returns table(profile_id uuid, cpf text, nome text, photo_path text, descritor real[])
language sql
stable security definer
set search_path to 'public'
as $function$
  with eventos_abertos as (
    select e.id
      from public.events e
     where (_event_id is null or e.id = _event_id)
       and e.date between (now() at time zone 'America/Sao_Paulo')::date - 2
                      and (now() at time zone 'America/Sao_Paulo')::date + 1
       and (select w.is_open from public.is_event_checkin_open(e.id) w limit 1)
  ),
  cpfs as (
    -- O dono do ROSTO é o titular do ingresso; sem titular gravado, quem comprou (OS-357).
    select distinct coalesce(nullif(t.holder_cpf, ''), o.customer_cpf) as cpf
      from public.tickets t
      join public.orders o on o.id = t.order_id
     where t.event_id in (select id from eventos_abertos)
       and t.status = 'valid'
       and o.status = 'paid'
       and coalesce(nullif(t.holder_cpf, ''), o.customer_cpf, '') <> ''
  )
  select p.id,
         p.cpf,
         p.nome_completo,
         p.facial_photo_path,
         case when d.modelo = _modelo and d.photo_path = p.facial_photo_path then d.descritor end
    from public.profiles p
    join cpfs c on c.cpf = p.cpf
    left join public.facial_descriptors d on d.profile_id = p.id
   where p.facial_photo_path is not null
     and p.facial_consent_at is not null;
$function$;

-- 4) Um ingresso grátis por CPF no evento, como quem retira, acompanhante ou quem recebeu
--    por transferência. A edge confere antes de gravar, mas consulta não segura corrida:
--    João e Pedro apontando a Maria ao mesmo tempo deixavam a Maria com 2 ingressos (e a
--    portaria pela facial queima um por passada). A trava mora aqui, com um lock por
--    evento+CPF para a segunda gravação esperar a primeira. Só vale para lote de retirada
--    pública: cortesia antiga com o mesmo CPF várias vezes continua como está.
--    Vale só para ingresso de pedido do LINK (`orders.retirada_por_link`): a cortesia que a
--    casa ou o produtor geram pelo botão, mesmo dentro do lote de retirada, continua como
--    sempre (vários ingressos no mesmo CPF), e não conta para a trava.
create or replace function public.trava_um_ingresso_gratis_por_cpf()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_do_link boolean;
  v_cpf text;
  v_comprador text;
begin
  if new.status not in ('valid', 'pending') then return new; end if;
  select o.retirada_por_link, o.customer_cpf into v_do_link, v_comprador from public.orders o where o.id = new.order_id;
  if not coalesce(v_do_link, false) then return new; end if;
  v_cpf := coalesce(nullif(new.holder_cpf, ''), v_comprador);
  if coalesce(v_cpf, '') = '' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('ingresso_gratis:' || new.event_id::text || ':' || v_cpf));
  if exists (
    select 1
      from public.tickets t
      join public.orders o on o.id = t.order_id
     where t.event_id = new.event_id
       and t.id <> new.id
       and o.retirada_por_link
       and t.status in ('valid', 'pending')
       -- Pedido morto não tranca o CPF: a portaria e a catraca só contam pedido vivo.
       and o.status in ('paid', 'pending')
       and coalesce(nullif(t.holder_cpf, ''), o.customer_cpf) = v_cpf
  ) then
    raise exception 'cpf_ja_tem_ingresso' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_um_ingresso_gratis_por_cpf on public.tickets;
create trigger trg_um_ingresso_gratis_por_cpf
  before insert or update of holder_cpf, status on public.tickets
  for each row
  execute function public.trava_um_ingresso_gratis_por_cpf();
