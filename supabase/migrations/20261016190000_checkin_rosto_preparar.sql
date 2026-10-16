-- ============================================================
-- OS-246 (16/10/2026, noite): a assinatura das fotos do cadastro facial é
-- preparada ANTES, uma foto por chamada, e não na hora da porta.
--
-- No primeiro teste no totem, a `facial-checkin-rosto` tentava calcular na
-- mesma chamada a assinatura da foto do totem e a de todas as fotos do
-- cadastro que ainda não tinham. Nenhuma assinatura foi gravada e o totem
-- caiu na carteira: a chamada passava do limite de processamento da função.
-- Agora:
--   - `checkin_rostos_a_preparar`: as fotos do cadastro (com aceite) que
--     ainda não têm assinatura do modelo atual. TODAS, não só de quem tem
--     ingresso hoje (pedido do Gabriel em 16/10: "toda facial cadastrada tem
--     que ficar disponível para usar").
--   - Tarefa do banco a cada 2 minutos chama a edge no modo `preparar`, que
--     faz UMA foto por chamada (o mesmo peso de um reconhecimento da carteira).
--     Quem cadastrar a facial à noite fica pronto em minutos.
-- ============================================================

-- Foto sem rosto legível (ou que não baixa) não pode travar a fila: a edge
-- anota a falha aqui e a função abaixo pula quem falhou com a MESMA foto.
-- Trocou a foto, tenta de novo.
create table if not exists public.facial_descriptor_falhas (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  photo_path text not null,
  motivo text not null,
  created_at timestamptz not null default now()
);
alter table public.facial_descriptor_falhas enable row level security;
revoke all on public.facial_descriptor_falhas from public, anon, authenticated;

create or replace function public.checkin_rostos_a_preparar(_modelo text, _limite int default 1)
returns table (profile_id uuid, photo_path text, pendentes bigint)
language sql
stable
security definer
set search_path = public
as $$
  with falta as (
    select p.id, p.facial_photo_path
      from public.profiles p
      left join public.facial_descriptors d on d.profile_id = p.id
      left join public.facial_descriptor_falhas x on x.profile_id = p.id and x.photo_path = p.facial_photo_path
     where p.facial_photo_path is not null
       and p.facial_consent_at is not null
       and x.profile_id is null
       and (d.profile_id is null or d.modelo <> _modelo or d.photo_path <> p.facial_photo_path)
  )
  select f.id, f.facial_photo_path, (select count(*) from falta)
    from falta f
   -- aleatório: as chamadas da tarefa rodam juntas e não pegam a mesma foto
   order by random()
   limit greatest(_limite, 0);
$$;

revoke all on function public.checkin_rostos_a_preparar(text, int) from public, anon, authenticated;
grant execute on function public.checkin_rostos_a_preparar(text, int) to service_role;

-- A tarefa: a cada 2 minutos, até 5 fotos (5 chamadas separadas, uma foto
-- cada). O modo `preparar` não devolve nada pessoal e não precisa de chave.
select cron.unschedule('preparar-rostos-checkin')
 where exists (select 1 from cron.job where jobname = 'preparar-rostos-checkin');

select cron.schedule(
  'preparar-rostos-checkin',
  '*/2 * * * *',
  $cron$
  select net.http_post(
    url     := 'https://nsrromaqysgoxqvqagdm.supabase.co/functions/v1/facial-checkin-rosto',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('preparar', true),
    timeout_milliseconds := 30000
  )
  from generate_series(1, 5);
  $cron$
);
