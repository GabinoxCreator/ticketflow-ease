-- ============================================================================
-- O PIN PROTEGE A CONTA DO REPASSE E O CPF/CNPJ DA PRODUTORA (OS-166)
-- 07/10/2026 · sobe DEPOIS da OS-157 (Doca 183): usa a coluna
-- producer_bank_accounts.account_holder_document e a função documento_valido.
-- ============================================================================
--
-- POR QUE
--   Quem entra com a senha de um produtor (senha vazada) trocava a conta que
--   recebe o repasse e o CPF/CNPJ da produtora, e o dinheiro saía para ele.
--   Medido em 07/10 no banco de produção:
--     · a conta e o documento eram gravados DIRETO pelo navegador (upsert e
--       update na tabela), sem passar por função nem edge;
--     · o PIN existia, mas o próprio usuário logado conseguia LER o pin_hash
--       (um PIN de 4 números em bcrypt se descobre em minutos fora do site) e
--       ATUALIZAR o pin_hash direto (apagar ou trocar);
--     · a edge set-producer-pin troca o PIN conferindo o atual SEM limite de
--       tentativas (dava para tentar os 10.000 PINs).
--
-- O QUE O GABRIEL DECIDIU (07/10, caixinha da Linha 3)
--   · Trocar conta ou documento pede o PIN. Sem PIN, cria o PIN antes (vale
--     também para o primeiro cadastro da conta e do documento).
--   · PIN esquecido: código no e-mail. O e-mail é o que estava na conta quando
--     o PIN foi criado ("e-mail guardado no PIN"); trocar o e-mail da conta
--     depois não muda para onde vai o código. Quem perdeu esse e-mail fala com
--     o suporte, e a casa zera o PIN por uma função só dela (sem tela nova).
--
-- O QUE FAZ
--   1. producer_stripe_accounts ganha pin_email e pin_definido_em. Um gatilho
--      guarda o e-mail da conta quando o PIN nasce, apaga os dois quando a
--      casa zera, e RECUSA trocar um PIN que já existe fora das funções desta
--      migration (isso desliga o caminho sem limite da set-producer-pin).
--   2. O navegador perde todo acesso a producer_stripe_accounts (nem lê o
--      pin_hash) e a escrita em producer_bank_accounts. Um gatilho em cada
--      tabela segura o mesmo, caso alguém devolva a permissão um dia.
--   3. producer_profiles: um gatilho recusa a troca do `document` feita direto
--      pelo navegador. A casa (admin) continua corrigindo, como hoje.
--   4. Funções para o painel (todas pelo usuário do token, nunca por id de fora):
--        meu_pin()                                  tem PIN? para onde vai o código?
--        conferir_meu_pin(pin)                      a trava do Financeiro
--        definir_meu_pin(novo, atual)               criar ou trocar o PIN
--        salvar_minha_conta_de_repasse(pin, conta)  a conta do repasse
--        salvar_documento_da_produtora(id, doc, pin) o CPF/CNPJ
--      E duas que o navegador não chama:
--        redefinir_pin_por_recuperacao(user, novo)  só a edge pin-recuperar
--        admin_zerar_pin(user, motivo)              só a casa
--   5. auth_codigos aceita o propósito 'pin' (código do PIN esquecido).
--
--   A conferência do PIN é feita aqui dentro (extensions.crypt, o mesmo bcrypt
--   $2a$ da edge: provado em 07/10 que um confere o hash do outro nos dois
--   sentidos), com o MESMO limite da edge verify-producer-pin (bucket
--   pin:user:<id>, 5 em 10 minutos, bloqueio de 30): quem erra numa não ganha
--   tentativa na outra. Acertar zera a contagem. O erro volta como resposta,
--   nunca como exceção, para a tentativa errada ficar contada.
--
-- O QUE NÃO MUDA
--   request_payout, valor do repasse, venda, checkout. As edges do PIN que já
--   existem ficam como estão (a verify-producer-pin continua valendo; a troca
--   pela set-producer-pin passa a ser recusada pelo gatilho, e o painel novo
--   não chama mais nenhuma das duas).
--
-- ⚠️ SUBIR JUNTO COM O PUBLISH DO SITE (migration e logo depois o publish):
--   o painel velho lê o pin_hash e grava a conta direto, e com este banco ele
--   não salva conta nem enxerga o PIN.
--
-- COMO VOLTAR ATRÁS (nesta ordem)
--   grant select, insert, update, delete on public.producer_stripe_accounts to authenticated;
--   grant select, insert, update, delete on public.producer_bank_accounts to authenticated;
--   drop trigger producer_stripe_accounts_guarda_pin on public.producer_stripe_accounts;
--   drop trigger producer_bank_accounts_so_com_pin on public.producer_bank_accounts;
--   drop trigger producer_profiles_documento_so_com_pin on public.producer_profiles;
--   drop function public.admin_zerar_pin(uuid, text), public.redefinir_pin_por_recuperacao(uuid, text),
--     public.salvar_documento_da_produtora(uuid, text, text), public.salvar_minha_conta_de_repasse(text, jsonb),
--     public.definir_meu_pin(text, text), public.conferir_meu_pin(text), public.meu_pin(),
--     public._conferir_pin(uuid, text), public._pin_email_da_conta(uuid),
--     public._guarda_pin(), public._conta_de_repasse_so_com_pin(), public._documento_so_com_pin();
--   (as colunas pin_email e pin_definido_em podem ficar; o propósito 'pin' também)
--   e voltar o site para a versão anterior.
-- ============================================================================


-- ── 0. A OS-157 tem que estar aplicada ─────────────────────────────────────
DO $pre$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'producer_bank_accounts'
       AND column_name = 'account_holder_document'
  ) OR to_regprocedure('public.documento_valido(text)') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes a migration da OS-157 (20261006230000_repasse_exige_documento_do_titular.sql).';
  END IF;
END;
$pre$;


-- ── 1. O e-mail guardado no PIN ────────────────────────────────────────────
alter table public.producer_stripe_accounts
  add column if not exists pin_email text,
  add column if not exists pin_definido_em timestamptz;

comment on column public.producer_stripe_accounts.pin_email is
  'E-mail da conta no momento em que o PIN foi criado. É para onde vai o código do PIN esquecido; trocar o e-mail da conta depois não muda este. Só some quando a casa zera o PIN (OS-166).';

-- E-mail da conta que pode receber o código: o de verdade, em minúsculas. O
-- e-mail interno de quem só tem WhatsApp (<cpf>@sem-email.festpag.digital)
-- nunca recebe mensagem, então vira vazio.
create or replace function public._pin_email_da_conta(_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $pe$
  select nullif(lower(trim(u.email)), '')
    from auth.users u
   where u.id = _user_id
     and coalesce(u.email, '') !~* '@sem-email\.festpag\.digital$';
$pe$;

revoke all on function public._pin_email_da_conta(uuid) from public, anon, authenticated;
-- O gatilho do PIN chama esta função com o papel de quem grava: a edge
-- set-producer-pin grava como service_role.
grant execute on function public._pin_email_da_conta(uuid) to service_role;

-- Os dois PINs que já existem guardam o e-mail de hoje.
update public.producer_stripe_accounts s
   set pin_email = public._pin_email_da_conta(s.user_id),
       pin_definido_em = coalesce(s.pin_definido_em, s.updated_at, now())
 where s.pin_hash is not null
   and s.pin_email is null;


-- ── 2. Gatilho do PIN ──────────────────────────────────────────────────────
-- Só as funções desta migration ligam a chave `festpag.pin_troca` (vale só até
-- o fim da transação). A edge set-producer-pin grava pelo PostgREST e não tem
-- como ligá-la: criar o primeiro PIN continua passando, trocar um que existe não.
create or replace function public._guarda_pin()
returns trigger
language plpgsql
set search_path = public
as $gp$
DECLARE
  _chave text := coalesce(current_setting('festpag.pin_troca', true), '');
BEGIN
  IF TG_OP = 'UPDATE' AND _chave <> 'ok' THEN
    IF OLD.pin_hash IS NOT NULL AND NEW.pin_hash IS DISTINCT FROM OLD.pin_hash THEN
      RAISE EXCEPTION 'pin_troca_exige_conferencia'
        USING ERRCODE = '42501',
              HINT = 'Trocar ou zerar um PIN que existe só pelas funções definir_meu_pin, redefinir_pin_por_recuperacao ou admin_zerar_pin.';
    END IF;
    IF NEW.pin_email IS DISTINCT FROM OLD.pin_email AND OLD.pin_email IS NOT NULL THEN
      RAISE EXCEPTION 'pin_email_nao_muda'
        USING ERRCODE = '42501',
              HINT = 'O e-mail do PIN só some quando a casa zera o PIN (admin_zerar_pin).';
    END IF;
  END IF;

  IF NEW.pin_hash IS NULL THEN
    -- PIN zerado: o e-mail vai junto. O próximo PIN guarda o e-mail da vez.
    NEW.pin_email := NULL;
    NEW.pin_definido_em := NULL;
  ELSIF TG_OP = 'INSERT' OR OLD.pin_hash IS NULL THEN
    -- PIN nasceu agora.
    NEW.pin_definido_em := now();
    IF NEW.pin_email IS NULL THEN
      NEW.pin_email := public._pin_email_da_conta(NEW.user_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$gp$;

drop trigger if exists producer_stripe_accounts_guarda_pin on public.producer_stripe_accounts;
create trigger producer_stripe_accounts_guarda_pin
  before insert or update on public.producer_stripe_accounts
  for each row execute function public._guarda_pin();


-- ── 3. O navegador perde o acesso direto ───────────────────────────────────
-- PIN: nem leitura. O painel pergunta "tenho PIN?" pela meu_pin().
revoke all on table public.producer_stripe_accounts from anon, authenticated;
revoke select (pin_hash), insert (pin_hash), update (pin_hash), references (pin_hash)
  on public.producer_stripe_accounts from anon, authenticated;

-- Conta do repasse: o dono continua LENDO a dele (e a casa, todas), pela RLS.
-- Gravar, só pela salvar_minha_conta_de_repasse.
revoke all on table public.producer_bank_accounts from anon;
revoke insert, update, delete, truncate on table public.producer_bank_accounts from authenticated;

-- Os gatilhos olham o papel de quem chama (current_user). Por isso NÃO são
-- security definer: dentro de uma função security definer o papel é o dono
-- dela, e é exatamente assim que as funções desta migration passam.
create or replace function public._conta_de_repasse_so_com_pin()
returns trigger
language plpgsql
set search_path = public
as $cr$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'conta_exige_pin'
      USING ERRCODE = '42501',
            HINT = 'A conta do repasse só se grava pela função salvar_minha_conta_de_repasse, com o PIN.';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$cr$;

drop trigger if exists producer_bank_accounts_so_com_pin on public.producer_bank_accounts;
create trigger producer_bank_accounts_so_com_pin
  before insert or update or delete on public.producer_bank_accounts
  for each row execute function public._conta_de_repasse_so_com_pin();

create or replace function public._documento_so_com_pin()
returns trigger
language plpgsql
set search_path = public
as $dp$
BEGIN
  IF NEW.document IS DISTINCT FROM OLD.document
     AND current_user IN ('anon', 'authenticated')
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'documento_exige_pin'
      USING ERRCODE = '42501',
            HINT = 'O CPF/CNPJ da produtora só se troca pela função salvar_documento_da_produtora, com o PIN.';
  END IF;
  RETURN NEW;
END;
$dp$;

drop trigger if exists producer_profiles_documento_so_com_pin on public.producer_profiles;
create trigger producer_profiles_documento_so_com_pin
  before update of document on public.producer_profiles
  for each row execute function public._documento_so_com_pin();


-- ── 4. A conferência do PIN (por dentro) ───────────────────────────────────
-- Devolve {ok:true} ou {ok:false, error:...}. Códigos: pin_invalido (não são
-- 4 números; não gasta tentativa), sem_pin, pin_refazer (formato antigo),
-- bloqueado (+ retry_after_seconds), pin_incorreto.
create or replace function public._conferir_pin(_user_id uuid, _pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $cp$
DECLARE
  _hash    text;
  _livre   boolean;
  _espera  integer;
BEGIN
  IF _pin IS NULL OR _pin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pin_invalido');
  END IF;

  SELECT s.pin_hash INTO _hash
    FROM public.producer_stripe_accounts s
   WHERE s.user_id = _user_id;

  IF _hash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sem_pin');
  END IF;
  IF left(_hash, 2) <> '$2' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pin_refazer');
  END IF;

  -- O mesmo balde e os mesmos números da edge verify-producer-pin.
  SELECT r.allowed, r.retry_after_seconds INTO _livre, _espera
    FROM public.check_rate_limit('pin:user:' || _user_id::text, 5, 600, 1800) r;
  IF NOT coalesce(_livre, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bloqueado', 'retry_after_seconds', coalesce(_espera, 1800));
  END IF;

  IF extensions.crypt(_pin, _hash) = _hash THEN
    -- Acertou: as tentativas erradas de antes deixam de contar.
    DELETE FROM public.auth_rate_limits WHERE bucket_key = 'pin:user:' || _user_id::text;
    RETURN jsonb_build_object('ok', true);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'pin_incorreto');
END;
$cp$;

revoke all on function public._conferir_pin(uuid, text) from public, anon, authenticated;


-- ── 5. As funções do painel ────────────────────────────────────────────────

-- Tem PIN? Para onde vai o código? (o e-mail volta mascarado: g•••@gmail.com)
create or replace function public.meu_pin()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $mp$
DECLARE
  _uid   uuid := auth.uid();
  _hash  text;
  _email text;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT s.pin_hash, s.pin_email INTO _hash, _email
    FROM public.producer_stripe_accounts s
   WHERE s.user_id = _uid;

  RETURN jsonb_build_object(
    'ok', true,
    'tem_pin', _hash IS NOT NULL,
    'refazer', _hash IS NOT NULL AND left(_hash, 2) <> '$2',
    'email_recuperacao', CASE
      WHEN _hash IS NULL OR _email IS NULL OR position('@' in _email) < 2 THEN NULL
      ELSE left(_email, 1) || '•••' || substr(_email, position('@' in _email))
    END,
    'dono_de_produtora', EXISTS (SELECT 1 FROM public.producer_profiles pp WHERE pp.owner_user_id = _uid),
    'admin', public.has_role(_uid, 'admin'::public.app_role)
  );
END;
$mp$;

-- A trava do Financeiro.
create or replace function public.conferir_meu_pin(_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $cm$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  RETURN public._conferir_pin(auth.uid(), _pin);
END;
$cm$;

-- Criar o primeiro PIN (sem PIN atual) ou trocar (com o PIN atual).
create or replace function public.definir_meu_pin(_pin_novo text, _pin_atual text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $dm$
DECLARE
  _uid      uuid := auth.uid();
  _hash     text;
  _conf     jsonb;
  _tinha    boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF _pin_novo IS NULL OR _pin_novo !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pin_invalido');
  END IF;

  SELECT s.pin_hash INTO _hash FROM public.producer_stripe_accounts s WHERE s.user_id = _uid;
  _tinha := _hash IS NOT NULL;

  -- Trocar exige o PIN atual. O formato antigo (anterior ao bcrypt) não tem
  -- como ser conferido: refaz sem o atual, como a edge sempre fez.
  IF _tinha AND left(_hash, 2) = '$2' THEN
    IF _pin_atual IS NULL OR _pin_atual = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'pin_atual_obrigatorio');
    END IF;
    _conf := public._conferir_pin(_uid, _pin_atual);
    IF NOT (_conf->>'ok')::boolean THEN
      RETURN _conf;
    END IF;
  END IF;

  PERFORM set_config('festpag.pin_troca', 'ok', true);
  INSERT INTO public.producer_stripe_accounts (user_id, pin_hash)
  VALUES (_uid, extensions.crypt(_pin_novo, extensions.gen_salt('bf', 10)))
  ON CONFLICT (user_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash;
  PERFORM set_config('festpag.pin_troca', '', true);

  INSERT INTO public.audit_logs (actor_id, target_type, target_id, action, metadata)
  VALUES (_uid, 'producer_pin', _uid, CASE WHEN _tinha THEN 'pin_changed' ELSE 'pin_set' END,
          jsonb_build_object('via', 'definir_meu_pin'));

  RETURN jsonb_build_object('ok', true, 'criado', NOT _tinha);
END;
$dm$;

-- A conta do repasse. `_conta` traz os campos do cartão Dados Bancários.
create or replace function public.salvar_minha_conta_de_repasse(_pin text, _conta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $sc$
DECLARE
  _uid       uuid := auth.uid();
  _titular   text := trim(coalesce(_conta->>'account_holder_name', ''));
  _doc       text := regexp_replace(coalesce(_conta->>'account_holder_document', ''), '[^0-9]', '', 'g');
  _banco     text := trim(coalesce(_conta->>'bank_name', ''));
  _agencia   text := trim(coalesce(_conta->>'agency', ''));
  _numero    text := trim(coalesce(_conta->>'account_number', ''));
  _tipo      text := coalesce(nullif(_conta->>'account_type', ''), 'corrente');
  _chave     text := trim(coalesce(_conta->>'pix_key', ''));
  _tipo_pix  text := coalesce(nullif(_conta->>'pix_key_type', ''), 'cpf');
  _conf      jsonb;
  _tinha     boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Conferir os dados antes do PIN: dado errado não gasta tentativa.
  IF _titular = '' OR _doc = '' OR _banco = '' OR _agencia = '' OR _numero = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campos_obrigatorios');
  END IF;
  IF NOT public.documento_valido(_doc) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'documento_titular_invalido');
  END IF;
  IF _tipo NOT IN ('corrente', 'poupanca') OR _tipo_pix NOT IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campos_obrigatorios');
  END IF;

  _conf := public._conferir_pin(_uid, _pin);
  IF NOT (_conf->>'ok')::boolean THEN
    RETURN _conf;
  END IF;

  SELECT true INTO _tinha FROM public.producer_bank_accounts b WHERE b.user_id = _uid;

  INSERT INTO public.producer_bank_accounts (
    user_id, bank_name, account_holder_name, account_holder_document,
    agency, account_number, account_type, pix_key, pix_key_type, updated_at
  ) VALUES (
    _uid, _banco, _titular, _doc, _agencia, _numero, _tipo, _chave, _tipo_pix, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    bank_name               = EXCLUDED.bank_name,
    account_holder_name     = EXCLUDED.account_holder_name,
    account_holder_document = EXCLUDED.account_holder_document,
    agency                  = EXCLUDED.agency,
    account_number          = EXCLUDED.account_number,
    account_type            = EXCLUDED.account_type,
    pix_key                 = EXCLUDED.pix_key,
    pix_key_type            = EXCLUDED.pix_key_type,
    updated_at              = now();

  -- Só o pedaço que ajuda a casa a conferir (nada de documento inteiro).
  INSERT INTO public.audit_logs (actor_id, target_type, target_id, action, metadata)
  VALUES (_uid, 'producer_bank_account', _uid,
          CASE WHEN _tinha THEN 'bank_account_changed' ELSE 'bank_account_created' END,
          jsonb_build_object('banco', _banco, 'conta_final', right(_numero, 4),
                             'titular_doc_final', right(_doc, 3), 'pix_tipo', _tipo_pix));

  RETURN jsonb_build_object('ok', true);
END;
$sc$;

-- O CPF/CNPJ da produtora. Vazio apaga (e o repasse fica travado pela OS-157).
create or replace function public.salvar_documento_da_produtora(_producer_profile_id uuid, _documento text, _pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $sd$
DECLARE
  _uid    uuid := auth.uid();
  _dono   uuid;
  _antes  text;
  _doc    text := nullif(regexp_replace(coalesce(_documento, ''), '[^0-9]', '', 'g'), '');
  _conf   jsonb;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT pp.owner_user_id, pp.document INTO _dono, _antes
    FROM public.producer_profiles pp
   WHERE pp.id = _producer_profile_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'produtora_nao_encontrada');
  END IF;
  IF _dono IS DISTINCT FROM _uid AND NOT public.is_producer_admin(_uid, _producer_profile_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sem_permissao');
  END IF;

  IF _doc IS NOT NULL AND NOT public.documento_valido(_doc) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'documento_invalido');
  END IF;

  -- Igual ao que já está: nada a trocar, não pede PIN.
  IF _doc IS NOT DISTINCT FROM nullif(regexp_replace(coalesce(_antes, ''), '[^0-9]', '', 'g'), '') THEN
    RETURN jsonb_build_object('ok', true, 'mudou', false);
  END IF;

  _conf := public._conferir_pin(_uid, _pin);
  IF NOT (_conf->>'ok')::boolean THEN
    RETURN _conf;
  END IF;

  UPDATE public.producer_profiles SET document = _doc WHERE id = _producer_profile_id;

  INSERT INTO public.audit_logs (actor_id, target_type, target_id, action, metadata)
  VALUES (_uid, 'producer_profile', _producer_profile_id, 'producer_document_changed',
          jsonb_build_object('antes_final', right(coalesce(_antes, ''), 3), 'agora_final', right(coalesce(_doc, ''), 3)));

  RETURN jsonb_build_object('ok', true, 'mudou', true);
END;
$sd$;

-- PIN novo depois do código no e-mail. Só a edge pin-recuperar chama (service
-- role), depois de conferir o código mandado para o pin_email. O e-mail fica.
create or replace function public.redefinir_pin_por_recuperacao(_user_id uuid, _pin_novo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $rr$
BEGIN
  IF _pin_novo IS NULL OR _pin_novo !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pin_invalido');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.producer_stripe_accounts s WHERE s.user_id = _user_id AND s.pin_hash IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sem_pin');
  END IF;

  PERFORM set_config('festpag.pin_troca', 'ok', true);
  UPDATE public.producer_stripe_accounts
     SET pin_hash = extensions.crypt(_pin_novo, extensions.gen_salt('bf', 10))
   WHERE user_id = _user_id;
  PERFORM set_config('festpag.pin_troca', '', true);

  -- Quem provou o e-mail sai do bloqueio de tentativas.
  DELETE FROM public.auth_rate_limits WHERE bucket_key = 'pin:user:' || _user_id::text;

  INSERT INTO public.audit_logs (actor_id, target_type, target_id, action, metadata)
  VALUES (_user_id, 'producer_pin', _user_id, 'pin_reset_by_email', jsonb_build_object('via', 'pin-recuperar'));

  RETURN jsonb_build_object('ok', true);
END;
$rr$;

-- A casa zera o PIN de quem perdeu o acesso ao e-mail guardado. Sem tela:
-- roda pelo SQL (ou por admin logado). Na próxima entrada o painel pede PIN novo.
create or replace function public.admin_zerar_pin(_user_id uuid, _motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $az$
DECLARE
  _quem  uuid := auth.uid();
  _tinha boolean;
BEGIN
  -- Admin logado, service role, ou a casa direto no SQL (fora do PostgREST).
  IF NOT (
       public.has_role(_quem, 'admin'::public.app_role)
       OR coalesce(auth.role(), '') = 'service_role'
       OR session_user <> 'authenticator'
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sem_permissao');
  END IF;

  SELECT s.pin_hash IS NOT NULL INTO _tinha FROM public.producer_stripe_accounts s WHERE s.user_id = _user_id;

  PERFORM set_config('festpag.pin_troca', 'ok', true);
  UPDATE public.producer_stripe_accounts SET pin_hash = NULL WHERE user_id = _user_id;
  PERFORM set_config('festpag.pin_troca', '', true);

  DELETE FROM public.auth_rate_limits WHERE bucket_key = 'pin:user:' || _user_id::text;

  INSERT INTO public.audit_logs (actor_id, target_type, target_id, action, metadata)
  VALUES (coalesce(_quem, '95628c4a-8040-44ed-83c5-d6a5b8793926'::uuid), 'producer_pin', _user_id,
          'pin_zerado_pela_casa', jsonb_build_object('motivo', _motivo, 'tinha_pin', coalesce(_tinha, false)));

  RETURN jsonb_build_object('ok', true, 'tinha_pin', coalesce(_tinha, false));
END;
$az$;

-- Permissões: o painel só chama as do usuário logado; as duas últimas, não.
revoke all on function public.meu_pin() from public, anon;
revoke all on function public.conferir_meu_pin(text) from public, anon;
revoke all on function public.definir_meu_pin(text, text) from public, anon;
revoke all on function public.salvar_minha_conta_de_repasse(text, jsonb) from public, anon;
revoke all on function public.salvar_documento_da_produtora(uuid, text, text) from public, anon;
grant execute on function public.meu_pin() to authenticated, service_role;
grant execute on function public.conferir_meu_pin(text) to authenticated, service_role;
grant execute on function public.definir_meu_pin(text, text) to authenticated, service_role;
grant execute on function public.salvar_minha_conta_de_repasse(text, jsonb) to authenticated, service_role;
grant execute on function public.salvar_documento_da_produtora(uuid, text, text) to authenticated, service_role;

revoke all on function public.redefinir_pin_por_recuperacao(uuid, text) from public, anon, authenticated;
grant execute on function public.redefinir_pin_por_recuperacao(uuid, text) to service_role;

revoke all on function public.admin_zerar_pin(uuid, text) from public, anon;
grant execute on function public.admin_zerar_pin(uuid, text) to authenticated, service_role;

revoke all on function public._guarda_pin() from public, anon, authenticated;
revoke all on function public._conta_de_repasse_so_com_pin() from public, anon, authenticated;
revoke all on function public._documento_so_com_pin() from public, anon, authenticated;


-- ── 6. Código do PIN esquecido ─────────────────────────────────────────────
alter table public.auth_codigos drop constraint if exists auth_codigos_proposito_check;
alter table public.auth_codigos add constraint auth_codigos_proposito_check
  check (proposito = any (array['cadastro'::text, 'login'::text, 'canal'::text, 'reset'::text, 'pin'::text]));


-- ── Conferência na própria migration ────────────────────────────────────────
DO $confere$
DECLARE
  _h text := extensions.crypt('4821', extensions.gen_salt('bf', 10));
BEGIN
  -- O navegador não lê nem grava o PIN.
  IF has_table_privilege('authenticated', 'public.producer_stripe_accounts', 'select')
     OR has_column_privilege('authenticated', 'public.producer_stripe_accounts', 'pin_hash', 'select')
     OR has_column_privilege('authenticated', 'public.producer_stripe_accounts', 'pin_hash', 'update')
     OR has_table_privilege('anon', 'public.producer_stripe_accounts', 'select') THEN
    RAISE EXCEPTION 'producer_stripe_accounts continua aberta para o navegador';
  END IF;
  -- O navegador não grava a conta, mas o dono continua lendo a dele.
  IF has_table_privilege('authenticated', 'public.producer_bank_accounts', 'insert')
     OR has_table_privilege('authenticated', 'public.producer_bank_accounts', 'update')
     OR has_table_privilege('authenticated', 'public.producer_bank_accounts', 'delete') THEN
    RAISE EXCEPTION 'producer_bank_accounts continua gravável pelo navegador';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.producer_bank_accounts', 'select') THEN
    RAISE EXCEPTION 'o dono deixou de ler a própria conta';
  END IF;
  -- Quem não é edge não chama a redefinição nem as peças internas.
  IF has_function_privilege('authenticated', 'public.redefinir_pin_por_recuperacao(uuid, text)', 'execute')
     OR has_function_privilege('anon', 'public.redefinir_pin_por_recuperacao(uuid, text)', 'execute')
     OR has_function_privilege('authenticated', 'public._conferir_pin(uuid, text)', 'execute')
     OR has_function_privilege('anon', 'public.meu_pin()', 'execute')
     OR has_function_privilege('anon', 'public.salvar_minha_conta_de_repasse(text, jsonb)', 'execute') THEN
    RAISE EXCEPTION 'função do PIN ficou aberta para quem não devia';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.salvar_minha_conta_de_repasse(text, jsonb)', 'execute')
     OR NOT has_function_privilege('service_role', 'public.redefinir_pin_por_recuperacao(uuid, text)', 'execute')
     OR NOT has_function_privilege('service_role', 'public._pin_email_da_conta(uuid)', 'execute') THEN
    RAISE EXCEPTION 'função do PIN ficou sem a permissão de quem usa';
  END IF;
  -- O bcrypt daqui é o mesmo da edge.
  IF left(_h, 7) <> '$2a$10$' OR extensions.crypt('4821', _h) <> _h OR extensions.crypt('4822', _h) = _h THEN
    RAISE EXCEPTION 'extensions.crypt não confere o PIN como a edge';
  END IF;
END;
$confere$;
