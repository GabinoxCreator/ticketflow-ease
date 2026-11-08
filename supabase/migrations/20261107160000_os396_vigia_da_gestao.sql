-- ============================================================================
-- OS-396 · O site vigia a gestão (07/11/2026)
--
-- POR QUE EXISTE: o vigia dos sistemas mora na gestão (edge `vigia-sistemas` +
-- pg_cron, migration 20261107140000 do festpag-admin-hub) e avisa o Gabriel quando
-- qualquer sistema cai. Mas se a PRÓPRIA gestão cair (banco dormindo, agendamento ou
-- edge parados), ele cala junto. Decisão do Gabriel, 07/11: o aviso "tem que chegar
-- pramim sem depender do computador ta ligado". Então quem vigia a gestão é outro
-- banco: este, o do site, que fica de pé com venda todo dia e já manda WhatsApp
-- sozinho (aviso de repasse, de reembolso e do relógio do PIX). E a gestão vigia o
-- site de volta (alvos `ingressos-tela` e `ingressos-banco`): um cobre o outro.
--
-- COMO: de 10 em 10 minutos `vigiar_gestao()`:
--   1. lê a resposta do pulso que pediu na rodada anterior (o `pg_net` é assíncrono)
--      e apaga a resposta depois de ler;
--   2. decide: no ar = o pulso respondeu 200 e a última rodada BOA do vigia da gestão
--      (sem erro) tem menos de 35 min. Fora = erro, sem resposta, endereço sumido (banco da
--      gestão dormindo) ou rodada parada;
--   3. a mesma régua da gestão: "caiu" depois de 2 testes falhando com pelo menos
--      5 min entre eles; lembrete a cada 6 h; "voltou" uma vez;
--   4. manda o WhatsApp DIRETO pela Evolution (o segredo `evolution` do Vault, o
--      mesmo do aviso de repasse) para o número do `AVISO_REPASSE_WHATSAPP` (o do
--      Gabriel). Sem push: o push sai pela gestão, que é justamente quem caiu;
--   5. pede o pulso da próxima rodada.
--
-- O QUE NÃO COBRE (escrito na Doca 372): a gestão E o servidor do WhatsApp fora ao
-- mesmo tempo (o site não tem outro canal); e a falta de crédito no Lovable, que
-- derruba este banco junto com a gestão (02/11).
--
-- CUSTO: 144 chamadas por dia ao pulso da gestão (resposta de menos de 200 bytes),
-- nenhuma consulta a banco de cliente, nenhuma linha em tabela que já existe.
--
-- ⚠️ ORDEM: sobe DEPOIS da migration e do deploy da edge `vigia-sistemas` na gestão.
-- Antes disso o pulso responde 404 e, passada a carência de 20 min, viria um "caiu".
--
-- Como voltar atrás:
--   select cron.unschedule('vigia-da-gestao');
--   -- (ou só pausar: update public.vigia_da_gestao set ativo = false;)
--   drop function if exists public.vigiar_gestao();
--   drop function if exists public.vigia_gestao_texto(text, text, text, timestamptz, timestamptz);
--   drop table if exists public.vigia_da_gestao_avisos;
--   drop table if exists public.vigia_da_gestao;
-- ============================================================================

-- ── 1. O estado (uma linha só) e a régua ────────────────────────────────────
create table if not exists public.vigia_da_gestao (
  alvo             text primary key default 'gestao' check (alvo = 'gestao'),
  ativo            boolean not null default true,
  vigiando_desde   timestamptz not null default now(),   -- carência de 20 min
  pulso_url        text not null default 'https://dszxldomodyvtbrbzkel.supabase.co/functions/v1/vigia-sistemas?pulso=1',
  parado_min       integer not null default 35 check (parado_min between 15 and 240),
  confirmar_min    integer not null default 5  check (confirmar_min between 1 and 60),
  lembrete_horas   integer not null default 6  check (lembrete_horas between 1 and 48),
  pedido_id        bigint,             -- o GET do pulso que está no ar
  pedido_em        timestamptz,
  estado           text not null default 'ok' check (estado in ('ok', 'suspeita', 'fora')),
  motivo           text,
  detalhe          text,
  desde            timestamptz,
  ultimo_teste     timestamptz,
  ultimo_ok        timestamptz,
  ultimo_aviso_em  timestamptz,
  updated_at       timestamptz not null default now()
);

comment on table public.vigia_da_gestao is
  'OS-396: o site vigia o pulso do vigia dos sistemas da gestão e avisa o Gabriel no WhatsApp se a gestão cair. ativo=false pausa sem apagar nada.';

insert into public.vigia_da_gestao (alvo) values ('gestao')
on conflict (alvo) do update set vigiando_desde = now(), updated_at = now();

create table if not exists public.vigia_da_gestao_avisos (
  id                 uuid primary key default gen_random_uuid(),
  tipo               text not null check (tipo in ('caiu', 'lembrete', 'voltou')),
  texto              text not null,
  created_at         timestamptz not null default now(),
  pedido_id          bigint,          -- o sendText que está no ar
  tentativas         integer not null default 0,
  enviado_em         timestamptz,
  ultimo_erro        text,
  destino_whatsapp   text             -- só o final do número (LGPD)
);
create index if not exists idx_vigia_da_gestao_avisos_pendentes
  on public.vigia_da_gestao_avisos (created_at) where enviado_em is null;

alter table public.vigia_da_gestao        enable row level security;
alter table public.vigia_da_gestao_avisos enable row level security;
drop policy if exists "admin le o vigia da gestao" on public.vigia_da_gestao;
create policy "admin le o vigia da gestao"
  on public.vigia_da_gestao for select using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "admin le os avisos do vigia da gestao" on public.vigia_da_gestao_avisos;
create policy "admin le os avisos do vigia da gestao"
  on public.vigia_da_gestao_avisos for select using (public.has_role(auth.uid(), 'admin'));
-- Ninguém escreve pela chave pública: quem grava é o vigia (dono do banco).
revoke all on public.vigia_da_gestao, public.vigia_da_gestao_avisos from anon, authenticated;
grant select on public.vigia_da_gestao, public.vigia_da_gestao_avisos to authenticated;

-- ── 2. O texto que ele lê no celular ────────────────────────────────────────
create or replace function public.vigia_gestao_texto(
  _tipo text, _motivo text, _detalhe text, _desde timestamptz, _agora timestamptz)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $fn$
declare
  _hora text := to_char(_desde at time zone 'America/Sao_Paulo', 'HH24"h"MI "de" DD/MM');
  _seg  integer := greatest(0, floor(extract(epoch from _agora - _desde)))::integer;
  _dur  text;
  _corpo text;
begin
  _dur := case
    when _seg < 3600  then greatest(1, _seg / 60) || ' min'
    when _seg < 86400 then (_seg / 3600) || ' h' || case when (_seg % 3600) / 60 > 0 then ' e ' || ((_seg % 3600) / 60) || ' min' else '' end
    else (_seg / 86400) || case when _seg / 86400 = 1 then ' dia' else ' dias' end
         || case when (_seg % 86400) / 3600 > 0 then ' e ' || ((_seg % 86400) / 3600) || ' h' else '' end
  end;

  if _tipo = 'voltou' then
    return '✅ A gestão e o vigia dos sistemas voltaram. Ficaram fora ' || _dur || ' (desde ' || _hora || ').';
  end if;

  _corpo := case _motivo
    when 'dormindo' then
      '😴 O banco da gestão dormiu, e com ele o vigia dos sistemas: nenhum outro aviso de queda sai até ele voltar.'
      || E'\nPara acordar, abra: lovable.dev/projects/9163b320-f909-4709-ae99-18655f1b2691'
    when 'parado' then
      '🔴 O vigia dos sistemas não roda há ' || coalesce(_detalhe, '?') || ' min (a gestão responde, mas o agendamento, a edge ou a rodada falharam). Enquanto isso, nenhum aviso de queda pode sair.'
    when 'http' then
      '🔴 A gestão caiu: respondeu com erro ' || coalesce(_detalhe, '?') || '. Com ela, o vigia dos sistemas parou: nenhum outro aviso de queda sai até ela voltar.'
    else
      '🔴 A gestão caiu: não respondeu em 20 segundos. Com ela, o vigia dos sistemas parou: nenhum outro aviso de queda sai até ela voltar.'
  end;

  if _tipo = 'lembrete' then
    return _corpo || E'\nContinua assim há ' || _dur || '.';
  end if;
  return _corpo || E'\nDesde ' || _hora || '. Aviso quando voltar. (Este aviso sai do site de ingressos.)';
end;
$fn$;
revoke all on function public.vigia_gestao_texto(text, text, text, timestamptz, timestamptz) from public, anon, authenticated;

-- ── 3. O vigia ──────────────────────────────────────────────────────────────
-- `_agora` só existe para o ensaio simular o relógio; o agendamento chama sem nada.
create or replace function public.vigiar_gestao(_agora timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  _t        timestamptz := coalesce(_agora, now());
  _v        public.vigia_da_gestao%rowtype;
  _r        record;
  _ok       boolean;            -- null = não deu para concluir nesta rodada
  _motivo   text;
  _detalhe  text;
  _j        jsonb;
  _ultima   timestamptz;
  _tipo     text;
  _evo      jsonb;
  _para     text;
  _a        record;
  _mandados integer := 0;
begin
  select * into _v from public.vigia_da_gestao where alvo = 'gestao';
  if not found or not _v.ativo then
    return jsonb_build_object('vigiando', false);
  end if;
  -- Duas rodadas juntas dariam dois avisos: a segunda não faz nada.
  if not pg_try_advisory_xact_lock(hashtext('vigia-da-gestao')) then
    return jsonb_build_object('vigiando', true, 'acao', 'outra_rodada_em_andamento');
  end if;

  -- 1. A resposta do pulso pedido na rodada anterior.
  if _v.pedido_id is not null then
    select h.status_code, h.content, h.timed_out, h.error_msg, h.created
      into _r
      from net._http_response h where h.id = _v.pedido_id;
    if found then
      if _r.timed_out is true or _r.error_msg is not null then
        _ok := false;
        _motivo := case when _r.error_msg ilike '%resolve host%' then 'dormindo' else 'sem_resposta' end;
        _detalhe := left(regexp_replace(coalesce(_r.error_msg, 'tempo esgotado'), 'https?://[^ )"]+', '<endereço>', 'g'), 120);
      elsif _r.status_code is distinct from 200 then
        _ok := false; _motivo := 'http'; _detalhe := coalesce(_r.status_code::text, '?');
      else
        _j := public.json_ou_nulo(_r.content);
        begin
          _ultima := (_j ->> 'ultima_rodada')::timestamptz;
        exception when others then
          _ultima := null;
        end;
        if _ultima is null then
          _ok := false; _motivo := 'parado'; _detalhe := 'sem rodada';
        elsif _r.created - _ultima > make_interval(mins => _v.parado_min) then
          _ok := false; _motivo := 'parado';
          _detalhe := floor(extract(epoch from _r.created - _ultima) / 60)::integer::text;
        else
          _ok := true;
        end if;
      end if;
      delete from net._http_response where id = _v.pedido_id;
    end if;
    -- Sem resposta guardada: o pg_net ainda não atendeu (ou perdeu). Não conclui nada.
  end if;

  -- 2. A régua (depois da carência de 20 min).
  if _ok is not null and _t >= _v.vigiando_desde + interval '20 minutes' then
    if _ok then
      if _v.estado = 'fora' then
        _tipo := 'voltou';
        insert into public.vigia_da_gestao_avisos (tipo, texto, created_at)
        values ('voltou', public.vigia_gestao_texto('voltou', _v.motivo, _v.detalhe, _v.desde, _t), _t);
      end if;
      update public.vigia_da_gestao
         set estado = 'ok', motivo = null, detalhe = null, desde = null,
             ultimo_teste = _t, ultimo_ok = _t,
             ultimo_aviso_em = case when _tipo is not null then _t else ultimo_aviso_em end,
             updated_at = now()
       where alvo = 'gestao';
    elsif _v.estado = 'ok' then
      update public.vigia_da_gestao
         set estado = 'suspeita', motivo = _motivo, detalhe = _detalhe, desde = _t, ultimo_teste = _t, updated_at = now()
       where alvo = 'gestao';
    elsif _v.estado = 'suspeita' then
      if _t - _v.desde >= make_interval(mins => _v.confirmar_min) then
        _tipo := 'caiu';
        insert into public.vigia_da_gestao_avisos (tipo, texto, created_at)
        values ('caiu', public.vigia_gestao_texto('caiu', _motivo, _detalhe, _v.desde, _t), _t);
        update public.vigia_da_gestao
           set estado = 'fora', motivo = _motivo, detalhe = _detalhe, ultimo_teste = _t,
               ultimo_aviso_em = _t, updated_at = now()
         where alvo = 'gestao';
      else
        update public.vigia_da_gestao
           set motivo = _motivo, detalhe = _detalhe, ultimo_teste = _t, updated_at = now()
         where alvo = 'gestao';
      end if;
    else  -- fora
      if _v.ultimo_aviso_em is null or _t - _v.ultimo_aviso_em >= make_interval(hours => _v.lembrete_horas) then
        _tipo := 'lembrete';
        insert into public.vigia_da_gestao_avisos (tipo, texto, created_at)
        values ('lembrete', public.vigia_gestao_texto('lembrete', _motivo, _detalhe, _v.desde, _t), _t);
      end if;
      update public.vigia_da_gestao
         set motivo = _motivo, detalhe = _detalhe, ultimo_teste = _t,
             ultimo_aviso_em = case when _tipo is not null then _t else ultimo_aviso_em end,
             updated_at = now()
       where alvo = 'gestao';
    end if;
  end if;

  -- 3. O WhatsApp: confere o envio da rodada anterior e manda o que falta.
  --    LER a resposta de um envio vale sempre (até 1 dia), fora da janela de reenvio;
  --    REENVIAR só nos primeiros 30 min, até 3 tentativas: na mesma rodada em que lê o
  --    erro (T, T+10, T+20). Tempo esgotado conta como erro e MANDA DE NOVO (decisão do
  --    encarregado na revisão 2: aqui não há push, e mensagem repetida custa menos que
  --    silêncio no único canal). Aviso que já tem um mais novo não sai (não faz sentido
  --    chegar "caiu" depois de "voltou").
  for _a in
    select a.* from public.vigia_da_gestao_avisos a
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
        update public.vigia_da_gestao_avisos set enviado_em = now(), ultimo_erro = null, pedido_id = null where id = _a.id;
        delete from net._http_response where id = _a.pedido_id;
        continue;
      end if;
      -- Erro guardado sem endereço nem número de telefone (a Evolution e o pg_net podem
      -- devolver os dois no texto).
      update public.vigia_da_gestao_avisos
         set ultimo_erro = left(regexp_replace(regexp_replace(
               coalesce('Evolution ' || _r.status_code || ': ' || _r.content, _r.error_msg, 'sem resposta'),
               'https?://[^ )"]+', '<endereço>', 'g'), '[0-9]{8,}', '<número>', 'g'), 200),
             pedido_id = null
       where id = _a.id;
      delete from net._http_response where id = _a.pedido_id;
      -- segue para o reenvio, se ainda couber
    end if;
    if _a.tentativas >= 3
       or _a.created_at <= _t - interval '30 minutes'
       or exists (select 1 from public.vigia_da_gestao_avisos b where b.created_at > _a.created_at) then
      continue;
    end if;

    if _evo is null then
      select public.json_ou_nulo(decrypted_secret) into _evo from vault.decrypted_secrets where name = 'evolution' limit 1;
      select regexp_replace(split_part(decrypted_secret, ',', 1), '\D', '', 'g') into _para
        from vault.decrypted_secrets where name = 'AVISO_REPASSE_WHATSAPP' limit 1;
      if length(_para) in (10, 11) then _para := '55' || _para; end if;
    end if;
    if _evo is null or coalesce(_evo ->> 'base_url', '') = '' or coalesce(_para, '') = '' then
      update public.vigia_da_gestao_avisos
         set ultimo_erro = 'sem configuração do WhatsApp no Vault (evolution ou AVISO_REPASSE_WHATSAPP)', tentativas = tentativas + 1
       where id = _a.id;
      continue;
    end if;

    update public.vigia_da_gestao_avisos
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

  -- 4. O pulso da próxima rodada (resposta de menos de 200 bytes).
  update public.vigia_da_gestao
     set pedido_id = net.http_get(url := _v.pulso_url, timeout_milliseconds := 20000),
         pedido_em = _t
   where alvo = 'gestao';

  return jsonb_build_object('vigiando', true, 'no_ar', _ok, 'aviso', _tipo, 'mandados', _mandados);
end;
$fn$;

comment on function public.vigiar_gestao(timestamptz) is
  'OS-396: o site vigia o pulso do vigia dos sistemas da gestão; se ela cair, avisa o Gabriel no WhatsApp direto pela Evolution. Caiu = 2 testes com 5 min; lembrete 6 h; voltou.';

revoke all on function public.vigiar_gestao(timestamptz) from public, anon, authenticated;
grant execute on function public.vigiar_gestao(timestamptz) to service_role;

-- ── 4. O relógio do vigia (minuto 3 de cada dezena: longe do minuto cheio da gestão) ──
do $cron$
begin
  perform cron.unschedule('vigia-da-gestao');
exception when others then
  null; -- não existia ainda
end;
$cron$;

select cron.schedule('vigia-da-gestao', '3-59/10 * * * *', $job$ select public.vigiar_gestao(); $job$);

-- ── Conferência (maestro, logo depois de aplicar) ──
-- select jobname, schedule, active from cron.job where jobname = 'vigia-da-gestao';   -- 3-59/10 * * * * true
-- (20 min depois) select estado, ultimo_ok, ultimo_teste from public.vigia_da_gestao;  -- ok, ultimo_ok recente
-- Prova do aviso: Doca 372 (apontar pulso_url para um endereço que responde erro, 2 rodadas,
-- ler o WhatsApp; voltar o endereço, 1 rodada, ler o "voltou").
