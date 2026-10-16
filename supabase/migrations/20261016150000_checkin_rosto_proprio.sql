-- ============================================================
-- OS-246 (16/10/2026): o NOSSO check-in reconhece a facial do cadastro do site.
--
-- Até aqui a foto que a pessoa manda no cadastro facial do site ia para o
-- cofre (bucket `facial-photos`) e para a portaria do Marcel, e mais nada: o
-- nosso totem de check-in só procurava o rosto na carteira FaceCashless.
-- Decisão do Gabriel em 16/10: a portaria passa a ser só a nossa, com facial,
-- usando a foto que a pessoa já cadastrou.
--
-- O que nasce aqui:
--   1. `facial_descriptors`: a ASSINATURA do rosto de cada foto do cadastro
--      (128 números, o mesmo modelo da carteira, OS-194). Nunca a imagem.
--      Calculada pela edge `facial-checkin-rosto` na primeira vez que o
--      rosto é preciso, e reaproveitada nas seguintes.
--   2. `checkin_rostos_candidatos`: quem pode ser reconhecido AGORA. Só quem
--      tem ingresso válido, de pedido pago, num evento com a entrada aberta.
--      A busca nunca roda contra a base inteira (pedido do advogado no
--      parecer de 02/10: procurar o rosto só entre quem está no evento).
--   3. Gatilho em `profiles`: trocou ou apagou a foto, a assinatura antiga
--      morre junto. Excluir a conta apaga por cascata.
-- ============================================================

create table if not exists public.facial_descriptors (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  -- A foto de onde a assinatura saiu. Se `profiles.facial_photo_path` mudar,
  -- a assinatura não vale mais (o gatilho abaixo apaga; a função confere).
  photo_path text not null,
  -- Assinatura de um modelo não se compara com a de outro.
  modelo text not null,
  descritor real[] not null check (array_length(descritor, 1) = 128),
  created_at timestamptz not null default now()
);

comment on table public.facial_descriptors is
  'OS-246: assinatura (128 números) do rosto da foto do cadastro facial, para o check-in do nosso totem. Nunca a imagem. Só a service role lê e escreve.';

-- Dado biométrico: RLS ligado e NENHUMA política. Só a service role (edge).
alter table public.facial_descriptors enable row level security;
revoke all on public.facial_descriptors from public, anon, authenticated;

-- ---------- a foto mudou ou saiu: a assinatura vai junto ----------
create or replace function public.facial_descriptor_segue_a_foto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.facial_photo_path is distinct from old.facial_photo_path then
    delete from public.facial_descriptors where profile_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_facial_descriptor_segue_a_foto on public.profiles;
create trigger trg_facial_descriptor_segue_a_foto
  after update of facial_photo_path on public.profiles
  for each row execute function public.facial_descriptor_segue_a_foto();

revoke all on function public.facial_descriptor_segue_a_foto() from public, anon, authenticated;

-- ---------- quem pode ser reconhecido agora ----------
-- Uma linha por pessoa com foto facial e aceite, que tenha ao menos um
-- ingresso VÁLIDO de pedido PAGO num evento com a entrada aberta neste
-- instante (`is_event_checkin_open`, a mesma régua do `facial-checkin`).
-- Com `_event_id`, só aquele evento. A assinatura vem só se for do modelo
-- pedido e da foto atual; senão vem nula e a edge calcula.
create or replace function public.checkin_rostos_candidatos(_modelo text, _event_id uuid default null)
returns table (
  profile_id uuid,
  cpf text,
  nome text,
  photo_path text,
  descritor real[]
)
language sql
stable
security definer
set search_path = public
as $$
  with eventos_abertos as (
    select e.id
      from public.events e
     where (_event_id is null or e.id = _event_id)
       -- recorte barato antes da régua: a janela vai da meia-noite do dia do
       -- evento até algumas horas depois do início; 2 dias de folga cobrem tudo.
       and e.date between (now() at time zone 'America/Sao_Paulo')::date - 2
                      and (now() at time zone 'America/Sao_Paulo')::date + 1
       and (select w.is_open from public.is_event_checkin_open(e.id) w limit 1)
  ),
  cpfs as (
    select distinct o.customer_cpf as cpf
      from public.tickets t
      join public.orders o on o.id = t.order_id
     where t.event_id in (select id from eventos_abertos)
       and t.status = 'valid'
       and o.status = 'paid'
       and coalesce(o.customer_cpf, '') <> ''
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
$$;

revoke all on function public.checkin_rostos_candidatos(text, uuid) from public, anon, authenticated;
grant execute on function public.checkin_rostos_candidatos(text, uuid) to service_role;
