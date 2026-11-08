-- ============================================================================
-- OS-403 · O site avisa o Gabriel quando o e-mail para de sair (07/11/2026)
--
-- POR QUE EXISTE: todo cadastro novo depende do código que só chega por e-mail
-- (OS-285) e toda compra manda a confirmação por e-mail. Se o Resend recusar
-- (limite do plano, chave errada, fora do ar) ou o e-mail começar a atrasar ou
-- cair no spam, a pessoa fica presa no cadastro ou acha que não comprou, e
-- ninguém fica sabendo. Decisão do Gabriel, 07/11: o aviso vai para o WhatsApp
-- pessoal dele.
--
-- O QUE ELE OLHA (de 5 em 5 minutos, `vigiar_envio_de_email()`), só no banco:
--   1. CÓDIGO QUE NÃO SAIU: quando o Resend recusa, `_shared/codigoAcesso.ts`
--      queima o desafio logo depois da resposta (`usado_em` preenchido, sem
--      `provado_em`, sem tentativa, e sem um pedido novo do mesmo destino que o
--      tenha substituído). No CADASTRO, o código que deu certo sempre ganha
--      `provado_em` antes de ser queimado: então todo código de cadastro queimado
--      assim é recusa, em qualquer tempo (pega também o Resend que demora para
--      recusar). No entrar, canal e recuperar senha, o código que deu certo é
--      queimado SEM `provado_em`, então só conta como recusa o queimado em menos
--      de 5 s: gente de verdade nunca usa o código tão rápido (o mais rápido em
--      30 dias: 7,6 s). Em 30 dias (08/10 a 07/11), zero linhas de e-mail nessas
--      condições; no WhatsApp, centenas (é o canal travado).
--   2. CONFIRMAÇÃO QUE NÃO SAIU: `order_email_notifications` com `resend_error`,
--      `missing_resend_key` ou `unhandled` (o `no_recipient` é conta só de
--      WhatsApp, não é falha do e-mail). Em 30 dias, zero.
--      A confirmação PRESA em `sending` (de 10 min a 1 dia atrás) é outra coisa:
--      avisa UMA vez por presa nova (aviso "presa") e não muda o estado do vigia,
--      para uma presa velha não segurar o alerta, nem esconder uma recusa nova,
--      nem dar um "voltou" com ela ainda presa (revisão 3). A única presa do
--      banco em 07/11 é de 28/07, fora da janela.
--   3. CÓDIGO PEDIDO E NÃO USADO ACIMA DO NORMAL: na última hora (pedidos de 70
--      a 10 min atrás, o código vale 10), quantas pessoas pediram código por
--      e-mail e não usaram nenhum. Régua: 4 pessoas ou mais E 20% ou mais de quem
--      pediu. O normal é 5% a 9% (8% em 30 dias). 20% é o caso provável de um
--      evento grande: só Hotmail/Outlook/Live/MSN (20% das pessoas) indo para o
--      spam dá ~26% (0,8 × 8% + 20%). Em 30 dias, a pior hora teve 3 de 10 e
--      outra 2 de 2: nenhuma passa do mínimo de 4. Rodando a régua inteira para
--      trás, de 5 em 5 min nos 30 dias (8.641 rodadas): zero alarme (com mínimo
--      de 3, seriam 12 rodadas). Pega o e-mail que sai mas atrasa ou cai no
--      spam, que o Resend não acusa como erro.
--
-- O QUE NÃO COBRE (escrito na Doca): o e-mail aceito pelo Resend que depois
-- volta (bounce) ou é marcado como spam (isso só o Resend sabe: leitura pela
-- chave guardada na gestão, quando o Gabriel colar); o convite do acompanhante
-- da cortesia (a `cortesia-link` não anota se o e-mail saiu); o Resend que
-- demora mais de 5 s para recusar um código de ENTRAR, canal ou recuperar senha
-- (no cadastro, pega em qualquer tempo). No pico de um evento grande, a régua do
-- item 3 a 20% pega Hotmail/Outlook indo inteiro para o spam (~26%), mas não
-- uma caixa menor sozinha (ex.: só o Yahoo, ~5% das pessoas). O limite do plano
-- e o limite por segundo do Resend são recusa: os itens 1 e 2 pegam na 1ª rodada.
--
-- COMO AVISA: pela Arya (instância `FestPag-Atendimento`; decisão do Gabriel,
-- 07/11: "mesmo esquema o vigia me manda pela arya"), WhatsApp direto pela
-- Evolution (segredo `evolution` do Vault, o
-- mesmo do aviso de repasse e do vigia da gestão) para o número do segredo
-- `AVISO_REPASSE_WHATSAPP` (o do Gabriel). Abre com "caiu", lembra a cada 6 h
-- enquanto continuar, e fecha com "voltou" depois de 30 min sem problema novo.
-- Já em alerta só por "sem uso", uma RECUSA nova (código ou confirmação) avisa
-- NA HORA, sem esperar o lembrete (revisão 3: presa ou "sem uso" no domingo à
-- noite não pode calar a recusa da abertura de segunda).
-- Nada disso muda texto nem remetente de e-mail de cliente.
--
-- Como voltar atrás:
--   select cron.unschedule('vigia-do-email');
--   -- (ou só pausar: update public.vigia_do_email set ativo = false;)
--   drop function if exists public.vigiar_envio_de_email(timestamptz, boolean);
--   drop function if exists public.vigia_email_texto(text, jsonb, timestamptz, timestamptz);
--   drop function if exists public.envio_de_email_saude(timestamptz);
--   drop table if exists public.vigia_do_email_avisos;
--   drop table if exists public.vigia_do_email;
-- ============================================================================

-- ── 1. O estado (uma linha só) e a régua ────────────────────────────────────
create table if not exists public.vigia_do_email (
  alvo              text primary key default 'email' check (alvo = 'email'),
  ativo             boolean not null default true,
  janela_falha_min  integer not null default 15 check (janela_falha_min between 5 and 120),
  travadas_min      integer not null default 4  check (travadas_min between 2 and 100),
  travadas_pct      integer not null default 20 check (travadas_pct between 10 and 100),
  calma_min         integer not null default 30 check (calma_min between 10 and 240),
  lembrete_horas    integer not null default 6  check (lembrete_horas between 1 and 48),
  estado            text not null default 'ok' check (estado in ('ok', 'fora')),
  motivo            text,
  retrato           jsonb,
  desde             timestamptz,
  ultimo_problema_em timestamptz,
  ultimo_aviso_em   timestamptz,
  ultima_rodada_em  timestamptz,
  avisou_recusa     boolean not null default false,   -- o alerta aberto já avisou uma recusa?
  ultima_presa_avisada_em timestamptz,                -- presa avisada até aqui (cada uma, uma vez)
  updated_at        timestamptz not null default now()
);
insert into public.vigia_do_email (alvo) values ('email') on conflict (alvo) do nothing;

create table if not exists public.vigia_do_email_avisos (
  id                 uuid primary key default gen_random_uuid(),
  tipo               text not null check (tipo in ('caiu', 'lembrete', 'voltou', 'teste', 'presa')),
  texto              text not null,
  created_at         timestamptz not null default now(),
  pedido_id          bigint,          -- o sendText que está no ar
  tentativas         integer not null default 0,
  enviado_em         timestamptz,
  ultimo_erro        text,
  destino_whatsapp   text             -- só o final do número (LGPD)
);
create index if not exists idx_vigia_do_email_avisos_pendentes
  on public.vigia_do_email_avisos (created_at) where enviado_em is null;

alter table public.vigia_do_email        enable row level security;
alter table public.vigia_do_email_avisos enable row level security;
drop policy if exists "admin le o vigia do email" on public.vigia_do_email;
create policy "admin le o vigia do email"
  on public.vigia_do_email for select using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "admin le os avisos do vigia do email" on public.vigia_do_email_avisos;
create policy "admin le os avisos do vigia do email"
  on public.vigia_do_email_avisos for select using (public.has_role(auth.uid(), 'admin'));
-- Ninguém escreve pela chave pública: quem grava é o vigia (dono do banco).
revoke all on public.vigia_do_email, public.vigia_do_email_avisos from anon, authenticated;
grant select on public.vigia_do_email, public.vigia_do_email_avisos to authenticated;

-- ── 2. O retrato do envio (só leitura) ──────────────────────────────────────
create or replace function public.envio_de_email_saude(_agora timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  _t      timestamptz := coalesce(_agora, now());
  _v      public.vigia_do_email%rowtype;
  _jan    interval;
  _fc     integer;
  _fc_ult timestamptz;
  _fo     integer;
  _fo_ult timestamptz;
  _presas integer;
  _erro   text;
  _pes    integer;
  _trav   integer;
  _trav_alarme boolean;
begin
  select * into _v from public.vigia_do_email where alvo = 'email';
  _jan := make_interval(mins => coalesce(_v.janela_falha_min, 15));

  -- 1. Código que não saiu (o Resend recusou e o desafio foi queimado sem prova).
  --    Cadastro: em qualquer tempo. Os outros: só em menos de 5 s (ver o topo).
  select count(*), max(a.criado_em) into _fc, _fc_ult
    from public.auth_codigos a
   where a.canal = 'email'
     and a.criado_em > _t - _jan and a.criado_em <= _t
     and a.usado_em is not null
     and (a.proposito = 'cadastro' or a.usado_em - a.criado_em < interval '5 seconds')
     and a.provado_em is null
     and coalesce(a.tentativas, 0) = 0
     and not exists (
           select 1 from public.auth_codigos b
            where b.destino = a.destino and b.proposito = a.proposito and b.id <> a.id
              and b.criado_em between a.usado_em - interval '3 seconds' and a.usado_em + interval '3 seconds');

  -- 2. Confirmação de compra que não saiu, ou presa no meio do envio.
  select count(*), max(n.created_at) into _fo, _fo_ult
    from public.order_email_notifications n
   where n.status = 'failed'
     and n.error_code in ('resend_error', 'missing_resend_key', 'unhandled')
     and n.created_at > _t - _jan and n.created_at <= _t;

  select count(*) into _presas
    from public.order_email_notifications n
   where n.status = 'sending'
     and coalesce(n.claimed_at, n.created_at) between _t - interval '1 day' and _t - interval '10 minutes';

  -- O recado do Resend, sem endereço de e-mail nem link (vai para o WhatsApp).
  select left(regexp_replace(regexp_replace(coalesce(n.error_message, n.error_code),
           '[^[:space:]<>"'']+@[^[:space:]<>"'']+', '<e-mail>', 'g'),
           'https?://[^[:space:])"]+', '<endereço>', 'g'), 90)
    into _erro
    from public.order_email_notifications n
   where n.status = 'failed'
     and n.error_code in ('resend_error', 'missing_resend_key', 'unhandled')
     and n.created_at > _t - _jan and n.created_at <= _t
   order by n.created_at desc
   limit 1;

  -- 3. Pessoas que pediram código por e-mail (70 a 10 min atrás) e não usaram nenhum.
  with c as (
    select a.destino,
           (a.provado_em is not null
            or (a.proposito <> 'cadastro'
                and a.usado_em is not null
                and a.usado_em - a.criado_em >= interval '5 seconds'
                and not exists (
                      select 1 from public.auth_codigos b
                       where b.destino = a.destino and b.proposito = a.proposito and b.id <> a.id
                         and b.criado_em between a.usado_em - interval '3 seconds' and a.usado_em + interval '3 seconds'))) as usou
      from public.auth_codigos a
     where a.canal = 'email'
       and a.criado_em > _t - interval '70 minutes'
       and a.criado_em <= _t - interval '10 minutes'
  ), p as (
    select destino, bool_or(usou) as usou from c group by destino
  )
  select count(*), count(*) filter (where not usou) into _pes, _trav from p;

  _trav_alarme := _trav >= coalesce(_v.travadas_min, 4)
                  and _trav * 100 >= coalesce(_v.travadas_pct, 20) * greatest(_pes, 1);

  return jsonb_build_object(
    'em', _t,
    'janela_min', extract(epoch from _jan)::integer / 60,
    'codigos_nao_sairam', _fc,
    'confirmacoes_nao_sairam', _fo,
    'confirmacoes_presas', _presas,
    'erro_resend', _erro,
    'pessoas_pediram', _pes,
    'pessoas_sem_usar', _trav,
    'travadas_alarme', _trav_alarme,
    'ultima_falha_em', greatest(_fc_ult, _fo_ult),
    'recusas', _fc + _fo,
    'problema', (_fc + _fo) > 0 or _trav_alarme,   -- presa não entra: avisa à parte, uma vez
    'motivo', case
                when (_fc + _fo) > 0 then 'falha'
                when _trav_alarme then 'sem_uso'
              end
  );
end;
$fn$;
revoke all on function public.envio_de_email_saude(timestamptz) from public, anon, authenticated;
grant execute on function public.envio_de_email_saude(timestamptz) to service_role;

-- ── 3. O texto que ele lê no celular ────────────────────────────────────────
create or replace function public.vigia_email_texto(
  _tipo text, _s jsonb, _desde timestamptz, _agora timestamptz)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $fn$
declare
  _hora  text := to_char(_desde at time zone 'America/Sao_Paulo', 'HH24"h"MI "de" DD/MM');
  _seg   integer := greatest(0, floor(extract(epoch from _agora - _desde)))::integer;
  _dur   text;
  _fc    integer := coalesce((_s ->> 'codigos_nao_sairam')::integer, 0);
  _fr    integer := coalesce((_s ->> 'confirmacoes_nao_sairam')::integer, 0);  -- o Resend recusou
  _fp    integer := coalesce((_s ->> 'presas_novas')::integer, 0);             -- só no aviso "presa"
  _pes   integer := coalesce((_s ->> 'pessoas_pediram')::integer, 0);
  _trav  integer := coalesce((_s ->> 'pessoas_sem_usar')::integer, 0);
  _jan   text := coalesce(_s ->> 'janela_min', '15');
  _l     text[] := '{}';
  _o     text;
begin
  _dur := case
    when _seg < 3600  then greatest(1, _seg / 60) || ' min'
    when _seg < 86400 then (_seg / 3600) || ' h' || case when (_seg % 3600) / 60 > 0 then ' e ' || ((_seg % 3600) / 60) || ' min' else '' end
    else (_seg / 86400) || case when _seg / 86400 = 1 then ' dia' else ' dias' end
         || case when (_seg % 86400) / 3600 > 0 then ' e ' || ((_seg % 86400) / 3600) || ' h' else '' end
  end;

  -- No "voltou", `_agora` é a hora do ÚLTIMO problema visto: a duração não soma
  -- os 30 min de calma.
  if _tipo = 'voltou' then
    return '✅ *E-MAIL DO SITE VOLTOU AO NORMAL* (ingressos)' || E'\n\n'
        || case
             when _seg < 300 then 'Teve problema às ' || _hora || ' (numa rodada só do vigia).'
             else 'Teve problema de ' || _hora || ' a '
                  || to_char(_agora at time zone 'America/Sao_Paulo', 'HH24"h"MI') || ' (' || _dur || ').'
           end
        || ' Nenhuma falha nova há ' || coalesce(_s ->> 'calma_min', '30') || ' min.';
  end if;

  -- Confirmação presa: aviso à parte, uma vez por presa nova (revisão 3).
  if _tipo = 'presa' then
    return '⚠️ *CONFIRMAÇÃO DE COMPRA PRESA* (ingressos)' || E'\n\n'
        || case when _fp = 1 then '1 confirmação de compra ficou presa no envio'
                else _fp || ' confirmações de compra ficaram presas no envio' end
        || ' há mais de 10 min (a mais antiga desde ' || _hora || ') e não saiu. Quem comprou pode não ter recebido o e-mail com o ingresso; o ingresso está na conta dele.'
        || E'\n\n👉 Abra um chat e peça: "investigar os envios de e-mail do site (OS-403)". Este aviso não se repete para a mesma confirmação.';
  end if;

  -- O que está acontecendo, em números (só recusa; presa tem aviso próprio).
  if _fc > 0 then
    _l := _l || (case when _fc = 1 then '1 código de acesso não saiu' else _fc || ' códigos de acesso não saíram' end);
  end if;
  if _fr > 0 then
    _l := _l || (case when _fr = 1 then '1 confirmação de compra não saiu' else _fr || ' confirmações de compra não saíram' end);
  end if;

  _o := case _tipo
          when 'lembrete' then '⏰ *E-MAIL DO SITE CONTINUA COM PROBLEMA* (ingressos)'
          else '🚨 *E-MAIL DO SITE FALHANDO* (ingressos)'
        end || E'\n\n';

  if array_length(_l, 1) > 0 then
    _o := _o || 'Nos últimos ' || _jan || ' min: ' || array_to_string(_l, ' e ') || '. O Resend recusou o envio.';
    if coalesce(_s ->> 'erro_resend', '') <> '' then
      _o := _o || E'\nRecado do Resend: "' || rtrim(_s ->> 'erro_resend', '. ') || '".';
    end if;
    if _fc > 0 then
      _o := _o || E'\nQuem pede o código (para criar conta ou entrar) não recebe e fica preso.';
    end if;
  end if;
  if coalesce((_s ->> 'travadas_alarme')::boolean, false) then
    _o := _o || case when array_length(_l, 1) > 0 then E'\n' else '' end
        || 'Na última hora, ' || _trav || ' de ' || _pes || ' pessoas ('
        || round(100.0 * _trav / greatest(_pes, 1)) || '%) pediram o código por e-mail e não usaram; o normal é perto de 8%. Pode ser e-mail atrasando ou caindo no spam.';
  end if;

  if _tipo = 'lembrete' then
    return _o || E'\nAssim desde ' || _hora || ' (' || _dur || ').';
  end if;
  return _o || E'\n\n👉 Abra um chat e peça: "investigar os envios de e-mail do site (OS-403)". Aviso aqui quando voltar ao normal.';
end;
$fn$;
revoke all on function public.vigia_email_texto(text, jsonb, timestamptz, timestamptz) from public, anon, authenticated;

-- ── 4. O vigia ──────────────────────────────────────────────────────────────
-- `_agora` só existe para o ensaio simular o relógio; `_teste` manda um aviso
-- marcado TESTE (para conferir que o WhatsApp chega) sem mudar o estado.
-- O agendamento chama sem nada.
create or replace function public.vigiar_envio_de_email(_agora timestamptz default null, _teste boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  _t        timestamptz := coalesce(_agora, now());
  _v        public.vigia_do_email%rowtype;
  _s        jsonb;
  _prob     boolean;
  _tipo     text;
  _r        record;
  _a        record;
  _evo      jsonb;
  _para     text;
  _mandados integer := 0;
  _rec      boolean;
  _np       integer;
  _np_min   timestamptz;
  _np_max   timestamptz;
  _presa    boolean := false;
begin
  select * into _v from public.vigia_do_email where alvo = 'email';
  if not found or not _v.ativo then
    return jsonb_build_object('vigiando', false);
  end if;
  -- Duas rodadas juntas dariam dois avisos: a segunda não faz nada.
  if not pg_try_advisory_xact_lock(hashtext('vigia-do-email')) then
    return jsonb_build_object('vigiando', true, 'acao', 'outra_rodada_em_andamento');
  end if;

  _s := public.envio_de_email_saude(_t);
  _prob := coalesce((_s ->> 'problema')::boolean, false);
  _rec  := coalesce((_s ->> 'recusas')::integer, 0) > 0;

  -- 0. Confirmação presa: um aviso por presa NOVA, à parte do estado (revisão 3).
  --    Não abre nem segura o alerta: uma presa velha não esconde recusa nova nem
  --    dá "voltou" com ela ainda presa.
  if not _teste then
    select count(*), min(coalesce(n.claimed_at, n.created_at)), max(coalesce(n.claimed_at, n.created_at))
      into _np, _np_min, _np_max
      from public.order_email_notifications n
     where n.status = 'sending'
       and coalesce(n.claimed_at, n.created_at) between _t - interval '1 day' and _t - interval '10 minutes'
       and coalesce(n.claimed_at, n.created_at) > coalesce(_v.ultima_presa_avisada_em, '-infinity'::timestamptz);
    if _np > 0 then
      _presa := true;
      insert into public.vigia_do_email_avisos (tipo, texto, created_at)
      values ('presa', public.vigia_email_texto('presa', jsonb_build_object('presas_novas', _np), _np_min, _t), _t);
      update public.vigia_do_email set ultima_presa_avisada_em = _np_max where alvo = 'email';
    end if;
  end if;

  -- 1. A régua.
  if _teste then
    _tipo := 'teste';
    insert into public.vigia_do_email_avisos (tipo, texto, created_at)
    values ('teste',
            '🧪 TESTE do aviso de e-mail do site (pode ignorar). Se o e-mail falhar de verdade, a mensagem chega assim:' || E'\n\n'
            || public.vigia_email_texto('caiu',
                 jsonb_build_object('janela_min', 15, 'codigos_nao_sairam', 3, 'confirmacoes_nao_sairam', 1,
                                    'confirmacoes_presas', 0, 'erro_resend', 'You have reached your daily email sending quota.',
                                    'pessoas_pediram', 0, 'pessoas_sem_usar', 0, 'travadas_alarme', false),
                 _t, _t)
            || E'\n\n(Agora, de verdade: ' || coalesce(_s ->> 'codigos_nao_sairam', '?') || ' código(s) e '
            || coalesce(_s ->> 'confirmacoes_nao_sairam', '?') || ' confirmação(ões) sem sair nos últimos '
            || coalesce(_s ->> 'janela_min', '?') || ' min; ' || coalesce(_s ->> 'pessoas_sem_usar', '?') || ' de '
            || coalesce(_s ->> 'pessoas_pediram', '?') || ' pessoas sem usar o código na última hora.)',
            _t);
  elsif _v.estado = 'ok' then
    if _prob then
      _tipo := 'caiu';
      insert into public.vigia_do_email_avisos (tipo, texto, created_at)
      values ('caiu', public.vigia_email_texto('caiu', _s, _t, _t), _t);
      update public.vigia_do_email
         set estado = 'fora', motivo = _s ->> 'motivo', retrato = _s, desde = _t,
             ultimo_problema_em = _t, ultimo_aviso_em = _t, avisou_recusa = _rec
       where alvo = 'email';
    end if;
  else  -- fora
    if _prob then
      if _rec and not _v.avisou_recusa then
        -- Em alerta só por "sem uso" e chegou RECUSA: avisa na hora (revisão 3).
        _tipo := 'caiu';
        insert into public.vigia_do_email_avisos (tipo, texto, created_at)
        values ('caiu', public.vigia_email_texto('caiu', _s, _t, _t), _t);
      elsif _v.ultimo_aviso_em is null or _t - _v.ultimo_aviso_em >= make_interval(hours => _v.lembrete_horas) then
        _tipo := 'lembrete';
        insert into public.vigia_do_email_avisos (tipo, texto, created_at)
        values ('lembrete', public.vigia_email_texto('lembrete', _s, _v.desde, _t), _t);
      end if;
      update public.vigia_do_email
         set motivo = _s ->> 'motivo', retrato = _s, ultimo_problema_em = _t,
             ultimo_aviso_em = case when _tipo is not null then _t else ultimo_aviso_em end,
             avisou_recusa = avisou_recusa or (_rec and _tipo is not null)
       where alvo = 'email';
    elsif _t - coalesce(_v.ultimo_problema_em, _v.desde, _t) >= make_interval(mins => _v.calma_min) then
      _tipo := 'voltou';
      insert into public.vigia_do_email_avisos (tipo, texto, created_at)
      values ('voltou',
              public.vigia_email_texto('voltou', _s || jsonb_build_object('calma_min', _v.calma_min), _v.desde,
                                       coalesce(_v.ultimo_problema_em, _v.desde)),
              _t);
      update public.vigia_do_email
         set estado = 'ok', motivo = null, retrato = _s, desde = null, ultimo_aviso_em = _t,
             avisou_recusa = false
       where alvo = 'email';
    end if;
  end if;
  update public.vigia_do_email set ultima_rodada_em = _t, updated_at = now() where alvo = 'email';

  -- 2. O WhatsApp: confere o envio da rodada anterior e manda o que falta (mesmo
  --    desenho do vigia da gestão, OS-396). Ler a resposta vale até 1 dia; reenviar,
  --    só nos primeiros 30 min, até 3 tentativas. Aviso que já tem um mais novo não
  --    sai (não faz sentido chegar "caiu" depois de "voltou"); teste e presa não
  --    contam nessa regra (são avisos à parte).
  for _a in
    select a.* from public.vigia_do_email_avisos a
     where a.enviado_em is null
       and (a.created_at > _t - interval '30 minutes'
            or (a.pedido_id is not null and a.created_at > _t - interval '1 day'))
     order by a.created_at
  loop
    if _a.pedido_id is not null then
      select h.status_code, h.error_msg, left(h.content, 160) as content into _r
        from net._http_response h where h.id = _a.pedido_id;
      if not found then
        continue;  -- ainda no ar
      end if;
      if _r.status_code between 200 and 299 then
        update public.vigia_do_email_avisos set enviado_em = now(), ultimo_erro = null, pedido_id = null where id = _a.id;
        delete from net._http_response where id = _a.pedido_id;
        continue;
      end if;
      -- Erro guardado sem endereço nem número de telefone.
      update public.vigia_do_email_avisos
         set ultimo_erro = left(regexp_replace(regexp_replace(
               coalesce('Evolution ' || _r.status_code || ': ' || _r.content, _r.error_msg, 'sem resposta'),
               'https?://[^ )"]+', '<endereço>', 'g'), '[0-9]{8,}', '<número>', 'g'), 200),
             pedido_id = null
       where id = _a.id;
      delete from net._http_response where id = _a.pedido_id;
    end if;
    if _a.tentativas >= 3
       or _a.created_at <= _t - interval '30 minutes'
       or (_a.tipo not in ('teste', 'presa') and exists (
             select 1 from public.vigia_do_email_avisos b
              where b.tipo not in ('teste', 'presa') and b.created_at > _a.created_at)) then
      continue;
    end if;

    if _evo is null then
      select public.json_ou_nulo(decrypted_secret) into _evo from vault.decrypted_secrets where name = 'evolution' limit 1;
      select regexp_replace(split_part(decrypted_secret, ',', 1), '\D', '', 'g') into _para
        from vault.decrypted_secrets where name = 'AVISO_REPASSE_WHATSAPP' limit 1;
      if length(_para) in (10, 11) then _para := '55' || _para; end if;
    end if;
    if _evo is null or coalesce(_evo ->> 'base_url', '') = '' or coalesce(_para, '') = '' then
      update public.vigia_do_email_avisos
         set ultimo_erro = 'sem configuração do WhatsApp no Vault (evolution ou AVISO_REPASSE_WHATSAPP)', tentativas = tentativas + 1
       where id = _a.id;
      continue;
    end if;

    update public.vigia_do_email_avisos
       set pedido_id = net.http_post(
             url := rtrim(_evo ->> 'base_url', '/') || '/message/sendText/' || (_evo ->> 'instance'),
             headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', _evo ->> 'api_key'),
             body := jsonb_build_object('number', _para, 'text', _a.texto),
             timeout_milliseconds := 20000),
           tentativas = tentativas + 1,
           destino_whatsapp = '…' || right(_para, 4)
     where id = _a.id;
    _mandados := _mandados + 1;
  end loop;

  return jsonb_build_object('vigiando', true, 'aviso', _tipo, 'presa', _presa, 'mandados', _mandados, 'saude', _s);
end;
$fn$;

comment on function public.vigiar_envio_de_email(timestamptz, boolean) is
  'OS-403: avisa o Gabriel no WhatsApp quando o e-mail do site para de sair (Resend recusou código ou confirmação) ou quando os códigos por e-mail pedidos e não usados passam do normal. Lembrete 6 h; voltou depois de 30 min sem problema.';

revoke all on function public.vigiar_envio_de_email(timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.vigiar_envio_de_email(timestamptz, boolean) to service_role;

-- ── 5. O relógio do vigia (minuto 2 de cada cinco: longe do minuto cheio do vigia do PIX
--       e do minuto 3 do vigia da gestão) ──
do $cron$
begin
  perform cron.unschedule('vigia-do-email');
exception when others then
  null; -- não existia ainda
end;
$cron$;

select cron.schedule('vigia-do-email', '2-59/5 * * * *', $job$ select public.vigiar_envio_de_email(); $job$);

-- ── Conferência (maestro, logo depois de aplicar) ──
-- select jobname, schedule, active from cron.job where jobname = 'vigia-do-email';     -- 2-59/5 * * * * | true
-- select has_function_privilege('anon','public.vigiar_envio_de_email(timestamptz,boolean)','execute'),
--        has_function_privilege('authenticated','public.vigiar_envio_de_email(timestamptz,boolean)','execute'),
--        has_function_privilege('anon','public.envio_de_email_saude(timestamptz)','execute');   -- false | false | false
-- select public.vigiar_envio_de_email(null, true);  -- manda 1 WhatsApp "🧪 TESTE" ao Gabriel
-- (5 min depois) select tipo, enviado_em, ultimo_erro, destino_whatsapp from public.vigia_do_email_avisos order by created_at desc limit 1;
--   -- teste | enviado_em preenchido | null | …<4 últimos do Gabriel>
-- select estado, ultima_rodada_em from public.vigia_do_email;  -- ok | menos de 5 min atrás
