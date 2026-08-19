-- Transferência de ingresso (§4 do framework do Rodeio de Novo Horizonte).
--
-- A REGRA, em uma frase: quem comprou pode passar o ingresso para outra pessoa
-- UMA vez, e só enquanto o ingresso não foi usado.
--
-- Por que "até o primeiro uso" e não um horário fixo: a noite começa ao
-- meio-dia. Com corte às 19h, a pessoa entrava às 13h, curtia, e ainda repassava
-- o ingresso às 18h para outra entrar. Cortando no uso, o buraco não existe —
-- não depende de relógio (decisão do Gabriel, 14/08).
--
-- COMO FUNCIONA (desenho fechado com o Gabriel em 19/08):
--   1. no "Meus Ingressos", o dono informa CPF, e-mail e telefone de quem vai receber;
--   2. sai um link, que ele manda pelo WhatsApp (ou mandamos por ele);
--   3. quem recebe cria a conta e aceita informando o próprio CPF;
--   4. no aceite: QR antigo morre, QR novo nasce, o ingresso muda de dono.
--   · prazo do link: 24 horas · o dono pode cancelar enquanto ninguém aceitou.
--
-- ⚠️ O CPF É A TRAVA DO LINK. Quem aceita precisa informar exatamente o CPF que
-- o dono apontou. Link vazado no grupo do WhatsApp não vira ingresso na mão de
-- outra pessoa.
--
-- ⚠️ NADA É APAGADO (invariante da casa): o ingresso original continua sendo a
-- mesma linha, muda de titular. A trilha fica em `ticket_transfers` e em
-- `audit_logs`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O titular atual do ingresso
-- ─────────────────────────────────────────────────────────────────────────────
-- Nasce nulo: enquanto ninguém transferir, quem manda é o CPF do comprador
-- (comportamento de hoje, para todos os clientes). Depois de uma transferência,
-- é este campo que vale — senão a trava de 1 CPF/noite passaria a olhar a pessoa
-- errada: bloquearia quem passou o ingresso adiante e liberaria quem recebeu a
-- comprar outro da mesma noite.
alter table public.tickets add column if not exists holder_cpf text;

comment on column public.tickets.holder_cpf is
  'CPF do titular atual do ingresso. NULL = o titular é o comprador (orders.customer_cpf). Preenchido pela transferência.';

create index if not exists idx_tickets_holder_cpf on public.tickets (holder_cpf) where holder_cpf is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A transferência
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ticket_transfers (
  id                  uuid primary key default gen_random_uuid(),
  ticket_id           uuid not null references public.tickets(id) on delete cascade,
  event_id            uuid not null references public.events(id) on delete cascade,
  from_user_id        uuid,
  from_holder_name    text,
  to_cpf              text not null,
  to_email            text,
  to_phone            text,
  token               text not null unique,
  status              text not null default 'pendente',
  expires_at          timestamptz not null,
  accepted_at         timestamptz,
  accepted_by_user_id uuid,
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  constraint ticket_transfers_status_chk
    check (status in ('pendente','aceita','cancelada','expirada'))
);

comment on table public.ticket_transfers is
  'Transferência de ingresso (§4 do framework do Rodeio). Uma por ingresso na vida: quem recebe não repassa adiante.';

create unique index if not exists uq_ticket_transfer_pendente
  on public.ticket_transfers (ticket_id) where status = 'pendente';
create index if not exists idx_ticket_transfers_ticket on public.ticket_transfers (ticket_id);
create index if not exists idx_ticket_transfers_token on public.ticket_transfers (token);

alter table public.ticket_transfers enable row level security;

drop policy if exists "dono ve suas transferencias" on public.ticket_transfers;
create policy "dono ve suas transferencias" on public.ticket_transfers
  for select using (
    from_user_id = auth.uid()
    or exists (select 1 from public.tickets t where t.id = ticket_id and t.user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Higiene: link que ninguém aceitou em 24h vira "expirada"
-- ─────────────────────────────────────────────────────────────────────────────
-- Sem isto o dono ficaria preso: o índice único só admite uma transferência
-- pendente por ingresso, então um link abandonado bloquearia qualquer nova
-- tentativa para sempre. Chamada no início do "iniciar" e por cron diário.
CREATE OR REPLACE FUNCTION public.expirar_transferencias_vencidas(_ticket_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _n int;
BEGIN
  UPDATE public.ticket_transfers
     SET status = 'expirada'
   WHERE status = 'pendente'
     AND expires_at < now()
     AND (_ticket_id IS NULL OR ticket_id = _ticket_id);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Iniciar a transferência
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.iniciar_transferencia_ingresso(
  _ticket_id uuid, _user_id uuid, _to_cpf text, _to_email text, _to_phone text, _token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _t       RECORD;
  _cpf     text;
  _dono    text;
  _id      uuid;
  _expira  timestamptz := now() + interval '24 hours';
BEGIN
  _cpf := NULLIF(regexp_replace(COALESCE(_to_cpf,''), '\D', '', 'g'), '');
  IF _cpf IS NULL OR length(_cpf) <> 11 THEN
    RAISE EXCEPTION 'cpf_invalido' USING ERRCODE = '22023';
  END IF;

  -- Limpa link vencido deste ingresso ANTES de checar "em andamento".
  PERFORM public.expirar_transferencias_vencidas(_ticket_id);

  SELECT t.*, o.customer_cpf, o.status AS order_status
    INTO _t
    FROM public.tickets t
    JOIN public.orders o ON o.id = t.order_id
   WHERE t.id = _ticket_id
   FOR UPDATE OF t;

  IF NOT FOUND THEN RAISE EXCEPTION 'ingresso_nao_encontrado' USING ERRCODE = 'P0002'; END IF;
  -- Só o dono transfere.
  IF _t.user_id IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'ingresso_nao_e_seu' USING ERRCODE = 'P0001';
  END IF;
  IF _t.status <> 'valid' THEN
    RAISE EXCEPTION 'ingresso_indisponivel' USING ERRCODE = 'P0001';
  END IF;
  IF _t.order_status <> 'paid' THEN
    RAISE EXCEPTION 'compra_nao_confirmada' USING ERRCODE = 'P0001';
  END IF;
  -- ⚠️ CUTOFF POR USO (§4a/§4b): o primeiro check-in encerra a transferência
  -- para sempre. É por uso, não por relógio.
  IF _t.validated_at IS NOT NULL THEN
    RAISE EXCEPTION 'ingresso_ja_utilizado' USING ERRCODE = 'P0001';
  END IF;
  -- Uma vez só: quem recebeu não repassa adiante.
  IF EXISTS (SELECT 1 FROM public.ticket_transfers
              WHERE ticket_id = _ticket_id AND status = 'aceita') THEN
    RAISE EXCEPTION 'ingresso_ja_transferido' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ticket_transfers
              WHERE ticket_id = _ticket_id AND status = 'pendente') THEN
    RAISE EXCEPTION 'transferencia_em_andamento' USING ERRCODE = 'P0001';
  END IF;

  -- Passar para si mesmo não é transferência.
  _dono := regexp_replace(COALESCE(_t.holder_cpf, _t.customer_cpf, ''), '\D', '', 'g');
  IF _dono = _cpf THEN
    RAISE EXCEPTION 'cpf_do_proprio_dono' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.ticket_transfers
    (ticket_id, event_id, from_user_id, from_holder_name, to_cpf, to_email, to_phone, token, expires_at)
  VALUES
    (_ticket_id, _t.event_id, _user_id, _t.holder_name, _cpf,
     NULLIF(btrim(COALESCE(_to_email,'')),''),
     NULLIF(regexp_replace(COALESCE(_to_phone,''), '\D','','g'),''),
     _token, _expira)
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (_user_id, 'ticket_transfer_started', 'ticket', _ticket_id,
          jsonb_build_object('transfer_id', _id, 'to_cpf_final', right(_cpf,3), 'expires_at', _expira));

  RETURN jsonb_build_object('transfer_id', _id, 'expires_at', _expira);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Cancelar (enquanto ninguém aceitou)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancelar_transferencia_ingresso(_transfer_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _tr RECORD;
BEGIN
  SELECT * INTO _tr FROM public.ticket_transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transferencia_nao_encontrada' USING ERRCODE = 'P0002'; END IF;
  IF _tr.from_user_id IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'transferencia_nao_e_sua' USING ERRCODE = 'P0001';
  END IF;
  IF _tr.status <> 'pendente' THEN
    RAISE EXCEPTION 'transferencia_ja_encerrada' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.ticket_transfers
     SET status = 'cancelada', cancelled_at = now()
   WHERE id = _transfer_id;

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (_user_id, 'ticket_transfer_cancelled', 'ticket', _tr.ticket_id,
          jsonb_build_object('transfer_id', _transfer_id));

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Aceitar: o QR antigo morre, um novo nasce, o ingresso muda de dono
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.aceitar_transferencia_ingresso(
  _token text, _novo_user_id uuid, _cpf_informado text, _nome text, _email text, _telefone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tr   RECORD;
  _t    RECORD;
  _cpf  text;
  _novo_code text;
BEGIN
  _cpf := NULLIF(regexp_replace(COALESCE(_cpf_informado,''), '\D', '', 'g'), '');

  SELECT * INTO _tr FROM public.ticket_transfers WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'link_invalido' USING ERRCODE = 'P0002'; END IF;

  IF _tr.status = 'aceita' THEN RAISE EXCEPTION 'ja_aceita' USING ERRCODE = 'P0001'; END IF;
  IF _tr.status = 'cancelada' THEN RAISE EXCEPTION 'transferencia_cancelada' USING ERRCODE = 'P0001'; END IF;
  IF _tr.status = 'expirada' OR _tr.expires_at < now() THEN
    UPDATE public.ticket_transfers SET status='expirada' WHERE id=_tr.id AND status='pendente';
    RAISE EXCEPTION 'link_expirado' USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ O CPF É A TRAVA DO LINK: quem aceita tem que ser quem o dono apontou.
  -- Link vazado no grupo não vira ingresso na mão de outra pessoa.
  IF _cpf IS DISTINCT FROM _tr.to_cpf THEN
    RAISE EXCEPTION 'cpf_nao_confere' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO _t FROM public.tickets WHERE id = _tr.ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ingresso_nao_encontrado' USING ERRCODE = 'P0002'; END IF;
  IF _t.status <> 'valid' THEN RAISE EXCEPTION 'ingresso_indisponivel' USING ERRCODE = 'P0001'; END IF;

  -- O dono pode ter usado o ingresso enquanto a transferência estava pendente.
  IF _t.validated_at IS NOT NULL THEN
    UPDATE public.ticket_transfers SET status='cancelada', cancelled_at=now() WHERE id=_tr.id;
    RAISE EXCEPTION 'ingresso_ja_utilizado' USING ERRCODE = 'P0001';
  END IF;

  -- QR ANTIGO MORRE, QR NOVO NASCE: quem ficou com print do velho não entra.
  _novo_code := gen_random_uuid()::text;

  UPDATE public.tickets
     SET user_id      = _novo_user_id,
         holder_name  = COALESCE(NULLIF(btrim(_nome),''), holder_name),
         holder_email = COALESCE(NULLIF(btrim(_email),''), holder_email),
         holder_phone = COALESCE(NULLIF(regexp_replace(COALESCE(_telefone,''),'\D','','g'),''), holder_phone),
         holder_cpf   = _cpf,
         ticket_code  = _novo_code
   WHERE id = _tr.ticket_id;

  UPDATE public.ticket_transfers
     SET status='aceita', accepted_at=now(), accepted_by_user_id=_novo_user_id
   WHERE id = _tr.id;

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (_novo_user_id, 'ticket_transfer_accepted', 'ticket', _tr.ticket_id,
          jsonb_build_object('transfer_id', _tr.id, 'de_usuario', _tr.from_user_id,
                             'para_cpf_final', right(_cpf,3)));

  RETURN jsonb_build_object('ok', true, 'ticket_id', _tr.ticket_id, 'event_id', _tr.event_id);
END;
$function$;

-- Só o servidor chama (as edges usam service-role).
REVOKE ALL ON FUNCTION public.expirar_transferencias_vencidas(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.iniciar_transferencia_ingresso(uuid,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancelar_transferencia_ingresso(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aceitar_transferencia_ingresso(text,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. A trava de 1 CPF/noite passa a seguir o titular ATUAL
-- ─────────────────────────────────────────────────────────────────────────────
-- Sem isto, transferir um ingresso deixaria a trava olhando a pessoa errada:
-- bloquearia quem passou adiante e liberaria quem recebeu a comprar outro da
-- mesma noite. Testado nos dois sentidos.
CREATE OR REPLACE FUNCTION public.dias_ocupados_por_cpf(_event_id uuid, _cpf text)
RETURNS TABLE(event_day_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH cpf_norm AS (
    SELECT NULLIF(regexp_replace(COALESCE(_cpf, ''), '\D', '', 'g'), '') AS cpf
  ),
  meus AS (
    SELECT t.lot_id
      FROM public.tickets t
      JOIN public.orders o ON o.id = t.order_id
      CROSS JOIN cpf_norm c
     WHERE o.event_id = _event_id
       AND c.cpf IS NOT NULL
       -- Titular atual: o do ingresso se foi transferido, senão o comprador.
       AND regexp_replace(COALESCE(t.holder_cpf, o.customer_cpf, ''), '\D', '', 'g') = c.cpf
       AND t.status <> 'cancelled'
       AND (
             o.status = 'paid'
          OR (o.status = 'pending' AND o.expires_at IS NOT NULL AND o.expires_at > now())
       )
  ),
  tem_permanente AS (
    SELECT EXISTS (
      SELECT 1 FROM meus m
        JOIN public.event_lots l ON l.id = m.lot_id
       WHERE l.covers_all_days IS TRUE
    ) AS sim
  )
  SELECT d.id
    FROM public.event_days d, tem_permanente p
   WHERE d.event_id = _event_id AND p.sim
  UNION
  SELECT l.event_day_id
    FROM meus m
    JOIN public.event_lots l ON l.id = m.lot_id
   WHERE l.event_day_id IS NOT NULL;
$function$;
