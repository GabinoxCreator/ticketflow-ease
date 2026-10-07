-- OS-158 (06/10/2026): o relógio que confere o PIX ganha espera maior e alarme.
--
-- POR QUE EXISTE: a API do Marcel não tem webhook. Quem descobre que um PIX foi
-- pago, quando o comprador paga no app do banco e fecha a página, é o relógio
-- `marcel-reconcile-every-min` (de 1 em 1 minuto chama a edge `marcel-reconcile`,
-- que pergunta ao Marcel por cada pedido em dúvida das últimas 48 horas).
--
-- A OS-154 achou dois problemas nele:
--   1. o relógio chama a edge e só espera 5 segundos pela resposta (o padrão do
--      pg_net). A conferência leva de 6 a 14 segundos (15 pedidos na janela,
--      um por um no Marcel), então a resposta se perde. Em 06/10, das 20h às
--      02h (UTC), NENHUMA das 360 rodadas trouxe resposta: todas estouraram os
--      5 segundos. O trabalho é feito mesmo assim (a edge continua rodando
--      depois que o banco desiste de esperar), mas ninguém consegue saber se
--      ela funcionou. O mesmo acontece, menos, com a `health-snapshot` (4 s por
--      rodada, perde quase metade);
--   2. se um dia ele parar de verdade (Marcel fora, chave trocada, relógio
--      desligado), ninguém fica sabendo, e PIX pago fica sem confirmar.
--
-- O que muda:
--   1. espera de 60 s no relógio do PIX e de 30 s na `health-snapshot`. Só o
--      `timeout_milliseconds` muda; endereço, chave e corpo ficam iguais.
--      Esperar mais não segura nada: o pg_net 0.19 atende as chamadas em
--      paralelo, e os avisos de repasse e de reembolso já usam 25 s;
--   2. um vigia (`vigiar_relogio_do_pix`, de 5 em 5 minutos) olha as respostas
--      do relógio. Sem nenhuma resposta boa em 15 minutos, chama a edge
--      `aviso-relogio`, que manda WhatsApp e push para o Gabriel pelo mesmo
--      caminho do aviso de repasse (decisão dele, 06/10: só para ele, pelos
--      dois canais). Lembra a cada 3 horas enquanto continuar parado e avisa
--      quando voltar.
--
-- "RESPOSTA BOA" = a edge respondeu 200 com o resumo da conferência
-- ({"ok":true,"verificados":N,...,"indefinidos":M}) E conseguiu falar com o
-- Marcel (nada a conferir, ou pelo menos uma consulta respondida). Resposta com
-- todas as consultas sem resposta (indefinidos = verificados) é Marcel fora:
-- conta como ruim e o alarme diz isso.
-- ⚠️ O vigia reconhece a resposta pelo campo "verificados". Se a edge
-- `marcel-reconcile` mudar o formato da resposta, o alarme toca (falha que
-- grita, não que cala): ajustar `relogio_do_pix_saude` junto.
--
-- Ordem de aplicar: PRIMEIRO o deploy da edge `aviso-relogio`, DEPOIS esta
-- migration. (Se inverter, nada quebra: o vigia tenta de novo a cada 5 minutos.)
-- O vigia só começa a decidir 15 minutos depois de aplicado (carência), para
-- dar tempo de as respostas com a espera nova aparecerem.
--
-- Como voltar atrás:
--   select cron.unschedule('vigia-relogio-do-pix');
--   -- (ou só pausar: update public.relogio_vigia set ativo = false;)
--   -- espera de volta a 5 s: repetir o passo 1 sem a linha timeout_milliseconds.
--   drop function if exists public.vigiar_relogio_do_pix();
--   drop function if exists public.relogio_do_pix_saude(integer);
--   drop function if exists public.json_ou_nulo(text);
--   drop table if exists public.relogio_alarmes;
--   drop table if exists public.relogio_vigia;

-- ── 1. Espera maior nos dois relógios ───────────────────────────────────────
-- Procura pelo nome (não pelo número), e para tudo se não achar: melhor a
-- migration falhar inteira do que mudar só metade.
do $esperas$
declare
  _pix   bigint;
  _saude bigint;
begin
  select jobid into _pix   from cron.job where jobname = 'marcel-reconcile-every-min';
  select jobid into _saude from cron.job where jobname = 'health-snapshot-every-minute';
  if _pix is null or _saude is null then
    raise exception 'OS-158: relógio não encontrado (marcel-reconcile: %, health-snapshot: %); nada foi mudado', _pix, _saude;
  end if;

  perform cron.alter_job(
    job_id  := _pix,
    command := $cmd$
  SELECT net.http_post(
    url := 'https://nsrromaqysgoxqvqagdm.supabase.co/functions/v1/marcel-reconcile',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-api-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='MARCEL_RECONCILE_KEY' LIMIT 1)
    ),
    body := jsonb_build_object('source','cron'),
    timeout_milliseconds := 60000
  );
  $cmd$
  );

  perform cron.alter_job(
    job_id  := _saude,
    command := $cmd$
  SELECT net.http_post(
    url := 'https://nsrromaqysgoxqvqagdm.supabase.co/functions/v1/health-snapshot',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cmd$
  );
end;
$esperas$;

-- ── 2. A régua do vigia ─────────────────────────────────────────────────────
-- Numa tabela, e não no código, para pausar ou mudar o tempo sem migration.
create table if not exists public.relogio_vigia (
  relogio              text primary key,
  ativo                boolean not null default true,
  -- quantos minutos sem nenhuma resposta boa até o alarme tocar
  minutos_para_alarme  integer not null default 15 check (minutos_para_alarme between 5 and 180),
  -- de quantas em quantas horas lembrar enquanto continuar parado
  horas_para_lembrete  integer not null default 3 check (horas_para_lembrete between 1 and 48),
  -- antes de vigiando_desde + minutos_para_alarme o vigia não decide (carência)
  vigiando_desde       timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.relogio_vigia is
  'Régua do vigia dos relógios (OS-158). ativo=false pausa o alarme sem apagar nada.';

insert into public.relogio_vigia (relogio) values ('marcel-reconcile')
on conflict (relogio) do update set vigiando_desde = now(), updated_at = now();

alter table public.relogio_vigia enable row level security;
drop policy if exists "admin le a regua do vigia" on public.relogio_vigia;
create policy "admin le a regua do vigia"
  on public.relogio_vigia for select
  using (public.has_role(auth.uid(), 'admin'));
revoke all on public.relogio_vigia from anon, authenticated;
grant select on public.relogio_vigia to authenticated;

drop trigger if exists update_relogio_vigia_updated_at on public.relogio_vigia;
create trigger update_relogio_vigia_updated_at
  before update on public.relogio_vigia
  for each row execute function public.update_updated_at_column();

-- ── 3. O registro dos alarmes ───────────────────────────────────────────────
-- Uma linha por mensagem. 'caiu' abre o incidente (incidente_id = o próprio id),
-- 'ainda' e 'voltou' apontam para ele. enviado_em nulo = o vigia tenta de novo.
create table if not exists public.relogio_alarmes (
  id                   uuid primary key default gen_random_uuid(),
  relogio              text not null,
  incidente_id         uuid not null,
  tipo                 text not null check (tipo in ('caiu', 'ainda', 'voltou')),
  -- retrato da saúde no momento (relogio_do_pix_saude) + datas do incidente
  dados                jsonb not null default '{}'::jsonb,
  whatsapp_enviado_em  timestamptz,
  gestao_enviado_em    timestamptz,
  -- número mascarado. NUNCA o número inteiro (LGPD).
  destino_whatsapp     text,
  tentativas           integer not null default 0,
  ultima_tentativa_em  timestamptz,
  ultimo_erro          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.relogio_alarmes is
  'Alarmes do relógio que confere o PIX (OS-158): o que foi mandado ao Gabriel, por onde, e o que falhou.';

create index if not exists idx_relogio_alarmes_relogio
  on public.relogio_alarmes (relogio, created_at desc);
create index if not exists idx_relogio_alarmes_pendentes
  on public.relogio_alarmes (created_at)
  where whatsapp_enviado_em is null or gestao_enviado_em is null;

alter table public.relogio_alarmes enable row level security;
drop policy if exists "admin le os alarmes do relogio" on public.relogio_alarmes;
create policy "admin le os alarmes do relogio"
  on public.relogio_alarmes for select
  using (public.has_role(auth.uid(), 'admin'));
-- Ninguém escreve pela chave pública: quem grava é o vigia (dono do banco) e a
-- edge (service role).
revoke all on public.relogio_alarmes from anon, authenticated;
grant select on public.relogio_alarmes to authenticated;

drop trigger if exists update_relogio_alarmes_updated_at on public.relogio_alarmes;
create trigger update_relogio_alarmes_updated_at
  before update on public.relogio_alarmes
  for each row execute function public.update_updated_at_column();

-- ── 4. Ler a resposta sem quebrar ───────────────────────────────────────────
-- Resposta de edge pode vir em HTML (erro do servidor). Um cast direto para
-- jsonb derrubaria o vigia inteiro, e vigia que cai em silêncio é o buraco que
-- esta ordem fecha.
create or replace function public.json_ou_nulo(_texto text)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $fn$
begin
  return _texto::jsonb;
exception when others then
  return null;
end;
$fn$;

revoke all on function public.json_ou_nulo(text) from public, anon, authenticated;

-- ── 5. A saúde do relógio do PIX (só leitura) ───────────────────────────────
-- Serve ao vigia e a quem quiser conferir na mão:
--   select public.relogio_do_pix_saude();
create or replace function public.relogio_do_pix_saude(p_minutos integer default 15)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  _jobid        bigint;
  _ativo        boolean;
  _exec_em      timestamptz;
  _exec_status  text;
  _ultima_boa   timestamptz;
  _boas         integer := 0;
  _boas_5min    integer := 0;
  _marcel_fora  integer := 0;
  _perdidas     integer := 0;
  _janela       interval := make_interval(mins => greatest(coalesce(p_minutos, 15), 1));
  _motivo       text;
begin
  select j.jobid, j.active into _jobid, _ativo
    from cron.job j where j.jobname = 'marcel-reconcile-every-min';

  if _jobid is not null then
    -- Quando rodou por último (qualquer situação) e como terminou a última
    -- rodada que já terminou: o vigia roda no mesmo minuto que o relógio, e a
    -- rodada daquele instante ainda pode estar 'running'.
    select max(d.start_time) into _exec_em
      from cron.job_run_details d
     where d.jobid = _jobid
       and d.start_time > now() - interval '1 day';
    select d.status into _exec_status
      from cron.job_run_details d
     where d.jobid = _jobid
       and d.status in ('succeeded', 'failed')
       and d.start_time > now() - interval '1 day'
     order by d.start_time desc
     limit 1;
  end if;

  -- As respostas do relógio do PIX. O pg_net guarda só as últimas 6 horas.
  with r as (
    select h.created, public.json_ou_nulo(h.content) as j
      from net._http_response h
     where h.status_code = 200
       and h.content like '%"verificados":%'
       and h.created > now() - interval '6 hours'
  ), c as (
    select created,
           (j->>'ok') = 'true' as ok,
           case when jsonb_typeof(j->'verificados') = 'number' then (j->>'verificados')::numeric end as verificados,
           case when jsonb_typeof(j->'indefinidos') = 'number' then (j->>'indefinidos')::numeric else 0 end as indefinidos
      from r
     where j is not null
  ), d as (
    select created,
           ok and verificados is not null and (verificados = 0 or indefinidos < verificados) as boa,
           ok and verificados > 0 and indefinidos >= verificados as marcel_fora
      from c
  )
  select max(created) filter (where boa),
         count(*) filter (where boa and created > now() - _janela),
         count(*) filter (where boa and created > now() - interval '5 minutes'),
         count(*) filter (where marcel_fora and created > now() - _janela)
    into _ultima_boa, _boas, _boas_5min, _marcel_fora
    from d;

  -- Respostas perdidas na janela, de TODOS os relógios (o pg_net não diz de
  -- quem era a chamada que estourou o tempo). Só contexto, não decide nada.
  select count(*) into _perdidas
    from net._http_response h
   where h.created > now() - _janela
     and (h.timed_out is true or h.error_msg is not null);

  _motivo := case
    when _jobid is null                                         then 'relogio_apagado'
    when not _ativo                                             then 'relogio_desligado'
    when _exec_em is null or _exec_em < now() - interval '5 minutes' then 'relogio_nao_roda'
    when _exec_status is distinct from 'succeeded'              then 'relogio_com_erro'
    when _marcel_fora > 0                                       then 'marcel_sem_resposta'
    else 'sem_resposta'
  end;

  return jsonb_build_object(
    'relogio',                   'marcel-reconcile',
    'medido_em',                 now(),
    'janela_min',                extract(epoch from _janela)::integer / 60,
    'saudavel',                  _boas > 0,
    'recuperado',                _boas_5min >= 3,
    'respostas_boas_janela',     _boas,
    'respostas_boas_5min',       _boas_5min,
    'marcel_sem_resposta_janela', _marcel_fora,
    'respostas_perdidas_janela', _perdidas,
    'ultima_boa_em',             _ultima_boa,
    'minutos_sem_resposta_boa',  case when _ultima_boa is null then null
                                      else floor(extract(epoch from now() - _ultima_boa) / 60)::integer end,
    'motivo',                    case when _boas > 0 then null else _motivo end,
    'job_ativo',                 _ativo,
    'ultima_execucao_em',        _exec_em,
    'ultima_execucao_status',    _exec_status
  );
end;
$fn$;

comment on function public.relogio_do_pix_saude(integer) is
  'Saúde do relógio que confere o PIX (OS-158): respostas boas na janela, última resposta boa e o motivo provável quando não há nenhuma. Só leitura.';

revoke all on function public.relogio_do_pix_saude(integer) from public, anon, authenticated;
grant execute on function public.relogio_do_pix_saude(integer) to service_role;

-- ── 6. O vigia ──────────────────────────────────────────────────────────────
-- Decide se abre, lembra ou fecha um incidente e manda para a edge o que ainda
-- não saiu. Quem manda a mensagem é a edge `aviso-relogio` (WhatsApp + push),
-- o mesmo caminho do aviso de repasse.
--
-- Insistência, igual à régua dos avisos da casa: a cada rodada (5 min) nas
-- primeiras 12 tentativas, depois de hora em hora, até 48 horas. Mensagem
-- velha de um incidente que já tem mensagem mais nova não é reenviada (não faz
-- sentido chegar "parou" depois de "voltou").
create or replace function public.vigiar_relogio_do_pix()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  _cfg       public.relogio_vigia%rowtype;
  _s         jsonb;
  _ult       public.relogio_alarmes%rowtype;
  _abertura  public.relogio_alarmes%rowtype;
  _aberto    boolean := false;
  _id        uuid;
  _acao      text := 'nada';
  _segredo   text;
  _chamados  integer := 0;
  _r         record;
begin
  select * into _cfg from public.relogio_vigia where relogio = 'marcel-reconcile';
  if not found or not _cfg.ativo then
    return jsonb_build_object('vigiando', false);
  end if;

  -- Duas rodadas ao mesmo tempo (uma lenta e a seguinte) abririam dois
  -- incidentes. A segunda simplesmente não faz nada.
  if not pg_try_advisory_xact_lock(hashtext('vigia-relogio-do-pix')) then
    return jsonb_build_object('vigiando', true, 'acao', 'outra_rodada_em_andamento');
  end if;

  _s := public.relogio_do_pix_saude(_cfg.minutos_para_alarme);

  select * into _ult
    from public.relogio_alarmes
   where relogio = _cfg.relogio
   order by created_at desc
   limit 1;
  if found and _ult.tipo <> 'voltou' then
    _aberto := true;
    select * into _abertura from public.relogio_alarmes where id = _ult.incidente_id;
  end if;

  if now() < _cfg.vigiando_desde + make_interval(mins => _cfg.minutos_para_alarme) then
    _acao := 'carencia';

  elsif not _aberto and not (_s->>'saudavel')::boolean then
    _id := gen_random_uuid();
    insert into public.relogio_alarmes (id, relogio, incidente_id, tipo, dados)
    values (_id, _cfg.relogio, _id, 'caiu', _s);
    _acao := 'caiu';

  elsif _aberto and (_s->>'recuperado')::boolean then
    insert into public.relogio_alarmes (relogio, incidente_id, tipo, dados)
    values (_cfg.relogio, _ult.incidente_id, 'voltou',
            _s || jsonb_build_object(
              'incidente_aberto_em', _abertura.created_at,
              'incidente_desde',     _abertura.dados->'ultima_boa_em'));
    _acao := 'voltou';

  elsif _aberto and not (_s->>'saudavel')::boolean
        and _ult.created_at <= now() - make_interval(hours => _cfg.horas_para_lembrete) then
    insert into public.relogio_alarmes (relogio, incidente_id, tipo, dados)
    values (_cfg.relogio, _ult.incidente_id, 'ainda',
            _s || jsonb_build_object(
              'incidente_aberto_em', _abertura.created_at,
              'incidente_desde',     _abertura.dados->'ultima_boa_em'));
    _acao := 'ainda';
  end if;

  -- Manda o que ainda não saiu (inclusive o que acabou de nascer).
  for _r in
    select a.id
      from public.relogio_alarmes a
     where (a.whatsapp_enviado_em is null or a.gestao_enviado_em is null)
       and a.created_at > now() - interval '48 hours'
       and (a.tentativas < 12 or a.ultima_tentativa_em is null
            or a.ultima_tentativa_em <= now() - interval '55 minutes')
       and not exists (
             select 1 from public.relogio_alarmes b
              where b.incidente_id = a.incidente_id
                and b.created_at > a.created_at)
     order by a.created_at
     limit 5
  loop
    if _segredo is null then
      select decrypted_secret into _segredo
        from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1;
      if _segredo is null then
        raise warning '[VIGIA-RELOGIO] CRON_SECRET nao encontrado no Vault; alarme % nao foi mandado', _r.id;
        exit;
      end if;
    end if;

    perform net.http_post(
      url     := 'https://nsrromaqysgoxqvqagdm.supabase.co/functions/v1/aviso-relogio',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'X-Cron-Secret', _segredo
                 ),
      body    := jsonb_build_object('alarme_id', _r.id, 'origem', 'vigia'),
      timeout_milliseconds := 30000
    );

    update public.relogio_alarmes
       set tentativas = tentativas + 1,
           ultima_tentativa_em = now()
     where id = _r.id;
    _chamados := _chamados + 1;
  end loop;

  return jsonb_build_object('vigiando', true, 'acao', _acao, 'mandados', _chamados, 'saude', _s);
end;
$fn$;

comment on function public.vigiar_relogio_do_pix() is
  'Vigia do relógio que confere o PIX (OS-158): sem resposta boa por 15 min, alarme ao Gabriel pela edge aviso-relogio; lembra a cada 3 h e avisa quando volta.';

revoke all on function public.vigiar_relogio_do_pix() from public, anon, authenticated;
grant execute on function public.vigiar_relogio_do_pix() to service_role;

-- ── 7. O relógio do vigia ───────────────────────────────────────────────────
do $cron$
begin
  perform cron.unschedule('vigia-relogio-do-pix');
exception when others then
  null; -- não existia ainda
end;
$cron$;

select cron.schedule(
  'vigia-relogio-do-pix',
  '*/5 * * * *',
  $job$ select public.vigiar_relogio_do_pix(); $job$
);
