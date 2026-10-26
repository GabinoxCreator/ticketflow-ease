-- ============================================================================
-- O PERFIL DO CLIENTE DEIXA DE SER A PORTA PARA CARTEIRA, INGRESSO E FACIAL (OS-267)
-- 21/10/2026 · varredura do banco do site de 17/10 (achados B3 e E4)
-- Número depois da 20261021100000 (OS-297) e da 20261021130000 (OS-265): não
-- toca nenhuma das duas (só `profiles` e a função claim_my_orphan_orders).
-- ============================================================================
--
-- POR QUE
--   A regra "Usuários podem atualizar seu próprio perfil" deixava a pessoa
--   mudar QUALQUER coluna do próprio perfil pelo navegador: cpf, email,
--   whatsapp_confirmado_em, email_confirmado_em, facial_photo_path,
--   facial_consent_at. Com o CPF e o contato de outra pessoa no perfil:
--     · claim_my_orphan_orders() passava para a conta os pedidos sem dono
--       daquela pessoa (cortesia, venda manual, maquininha), com os ingressos;
--     · federacao-emitir-token assina o CPF do perfil e o FestCashless entrega
--       a carteira daquele CPF;
--     · facial-enroll manda o rosto ao Marcel com o CPF do perfil, e o
--       check-in pelo rosto casa o CPF do perfil com o CPF do pedido.
--   E o e-mail do perfil nunca foi prova: o Supabase confirma o e-mail na hora
--   do cadastro (sem código), então uma conta criada direto com o e-mail de
--   outra pessoa casava os pedidos dela pelo e-mail.
--
-- O QUE O GABRIEL DECIDIU (17/10/2026)
--   O CPF da conta não muda mais sozinho depois de gravado. Quem errou corrige
--   pelo atendimento: a casa confere o documento e corrige.
--
-- O QUE FAZ
--   1. Navegador (anon e authenticated) só escreve no perfil: nome, WhatsApp,
--      foto (avatar_url) e o consentimento de marketing (marketing_consent*,
--      fbp, fbc), que é o que as telas gravam hoje. Não escreve mais email,
--      carimbos de confirmação, facial_*, canal_preferido, id nem created_at.
--      O cpf continua na permissão só para a tela antiga mandar o MESMO CPF
--      junto com o nome; mudar o CPF, o gatilho recusa (item 2a). E não cria
--      perfil: o perfil nasce no cadastro (handle_new_user, que roda como dono
--      e não é afetado).
--   2. Gatilho trg_perfil_guarda_identidade (antes de gravar), em duas partes:
--      a) gravação do navegador que mude cpf, email, carimbos, facial,
--         canal_preferido, id ou created_at, ou que crie perfil, é recusada
--         (para o cpf é a trava; para o resto, a segunda trava, caso alguém
--         devolva a permissão um dia);
--      b) para todo mundo (navegador, edges, funções): trocar o WhatsApp sem
--         carimbo novo na mesma gravação apaga o carimbo do WhatsApp; idem
--         para o e-mail. O carimbo quer dizer "este contato foi provado por
--         código"; contato novo não foi. As edges que confirmam por código
--         (auth-canal, auth-codigo) gravam contato e carimbo juntos e passam.
--   3. definir_meu_cpf(cpf): o PRIMEIRO CPF da conta, para quem ainda não tem
--      CPF válido no perfil (Minha Conta e o checkout). Depois disso, não muda.
--   4. admin_corrigir_cpf(user, cpf, motivo): a casa corrige, com o documento
--      conferido. Admin logado, service role ou a casa direto no SQL sem login
--      nenhum (a porta do admin_zerar_pin, mais apertada: cliente logado nunca
--      passa). Fica na auditoria (cpf_corrigido_pela_casa,
--      só os 3 últimos dígitos). Se a conta tem foto facial, ela fica marcada
--      como "não enviada" (facial_synced_at = null) e a resposta diz o passo
--      seguinte: a casa chama a edge facial-resync com aquele user_id (comando
--      no topo da função). Nenhuma rotina chama a facial-resync sozinha.
--   5. claim_my_orphan_orders: para casar o PEDIDO, o e-mail só vale se a
--      conta confirmou o e-mail por código (email_confirmado_em). O WhatsApp
--      já exigia o carimbo. Quais ingressos do pedido vêm junto segue igual
--      (sem titular, ou titular com o e-mail da conta), para quem casou pelo
--      WhatsApp não deixar o próprio ingresso para trás.
--
-- O QUE NÃO MUDA
--   Ler o perfil, as edges (todas escrevem no perfil com a chave de serviço),
--   o cadastro (auth-codigo e handle_new_user), a facial (facial-enroll), a
--   aceitação de transferência (grava o CPF só em perfil sem CPF), pedidos,
--   ingressos e o que a pessoa já tem na conta.
--
-- ⚠️ SUBIR JUNTO COM O PUBLISH DO SITE (migration e logo depois o publish):
--   a tela antiga grava o primeiro CPF direto na tabela. Entre os dois, quem
--   não tem CPF e tenta salvar um em Minha Conta vê erro (são 33 contas sem
--   CPF), e o checkout não guarda o CPF no perfil (a compra segue normal: o
--   CPF vai no pedido). Salvar o nome segue funcionando nas duas telas.
--
-- COMO VOLTAR ATRÁS: bloco "VOLTAR ATRÁS" comentado no fim deste arquivo.
-- ============================================================================


-- ── 1. O navegador só escreve o que é dele ────────────────────────────────────
-- O `cpf` fica na lista só por compatibilidade: a tela antiga da Minha Conta
-- (aberta antes do publish, em cache) manda o MESMO CPF junto com o nome toda
-- vez que salva. Sem a coluna aqui, salvar o nome daria erro de permissão.
-- Mudar o CPF quem segura é o gatilho abaixo (navegador nunca muda o CPF).
revoke insert, update on table public.profiles from anon, authenticated;
grant update (nome_completo, whatsapp, avatar_url, cpf,
              marketing_consent, marketing_consent_at, marketing_consent_version, fbp, fbc)
  on table public.profiles to authenticated;


-- ── 2. O gatilho: segunda trava e carimbo que segue o contato ─────────────────
create or replace function public._perfil_guarda_identidade()
returns trigger
language plpgsql
set search_path = public
as $pg$
DECLARE
  -- Sem SECURITY DEFINER de propósito: current_user é quem está gravando.
  -- Função da casa (definer) roda como postgres e passa; edge com a chave de
  -- serviço roda como service_role e passa.
  _navegador boolean := current_user IN ('anon', 'authenticated');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF _navegador THEN
      RAISE EXCEPTION 'perfil_nasce_no_cadastro'
        USING ERRCODE = '42501',
              HINT = 'O perfil nasce no cadastro (handle_new_user), nunca pelo navegador (OS-267).';
    END IF;
    RETURN NEW;
  END IF;

  -- a) Segunda trava: o navegador não muda identidade, carimbo nem facial.
  IF _navegador AND (
       NEW.id                     IS DISTINCT FROM OLD.id
    OR NEW.cpf                    IS DISTINCT FROM OLD.cpf
    OR NEW.email                  IS DISTINCT FROM OLD.email
    OR NEW.whatsapp_confirmado_em IS DISTINCT FROM OLD.whatsapp_confirmado_em
    OR NEW.email_confirmado_em    IS DISTINCT FROM OLD.email_confirmado_em
    OR NEW.facial_photo_path      IS DISTINCT FROM OLD.facial_photo_path
    OR NEW.facial_consent_at      IS DISTINCT FROM OLD.facial_consent_at
    OR NEW.facial_synced_at       IS DISTINCT FROM OLD.facial_synced_at
    OR NEW.canal_preferido        IS DISTINCT FROM OLD.canal_preferido
    OR NEW.created_at             IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'perfil_campo_protegido'
      USING ERRCODE = '42501',
            HINT = 'CPF, e-mail, carimbos e facial só mudam pelo caminho que prova: código (contato), definir_meu_cpf (primeiro CPF), admin_corrigir_cpf (a casa), facial-enroll (facial). OS-267.';
  END IF;

  -- b) O carimbo segue o contato: contato trocado sem carimbo novo na mesma
  --    gravação perde o carimbo. Vale para todo mundo.
  IF coalesce(public.normalizar_whatsapp(NEW.whatsapp), regexp_replace(coalesce(NEW.whatsapp, ''), '\D', '', 'g'))
     IS DISTINCT FROM
     coalesce(public.normalizar_whatsapp(OLD.whatsapp), regexp_replace(coalesce(OLD.whatsapp, ''), '\D', '', 'g'))
     AND NEW.whatsapp_confirmado_em IS NOT DISTINCT FROM OLD.whatsapp_confirmado_em THEN
    NEW.whatsapp_confirmado_em := NULL;
  END IF;

  IF lower(btrim(coalesce(NEW.email, ''))) IS DISTINCT FROM lower(btrim(coalesce(OLD.email, '')))
     AND NEW.email_confirmado_em IS NOT DISTINCT FROM OLD.email_confirmado_em THEN
    NEW.email_confirmado_em := NULL;
  END IF;

  RETURN NEW;
END;
$pg$;

drop trigger if exists trg_perfil_guarda_identidade on public.profiles;
create trigger trg_perfil_guarda_identidade
  before insert or update on public.profiles
  for each row execute function public._perfil_guarda_identidade();

revoke all on function public._perfil_guarda_identidade() from public, anon, authenticated;


-- ── 3. O primeiro CPF da conta (Minha Conta e checkout) ───────────────────────
-- Só para perfil sem CPF válido (vazio, ou um valor que não é CPF, como a tela
-- já tratava). Depois de gravado, não muda: quem errou fala com o atendimento.
create or replace function public.definir_meu_cpf(_cpf text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $dc$
DECLARE
  _uid   uuid := auth.uid();
  _novo  text := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g');
  _atual text;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_autenticado');
  END IF;
  IF length(_novo) <> 11 OR NOT public.documento_valido(_novo) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'cpf_invalido');
  END IF;

  SELECT regexp_replace(coalesce(p.cpf, ''), '\D', '', 'g') INTO _atual
    FROM public.profiles p WHERE p.id = _uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'perfil_nao_encontrado');
  END IF;

  IF _atual = _novo THEN
    RETURN jsonb_build_object('ok', true, 'ja_era', true);
  END IF;
  IF length(_atual) = 11 AND public.documento_valido(_atual) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'cpf_ja_salvo');
  END IF;

  UPDATE public.profiles SET cpf = _novo WHERE id = _uid;

  -- Rastro de quem pôs qual CPF (só os 3 últimos dígitos). Acessório: falhar
  -- aqui não pode custar o CPF da pessoa.
  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (_uid, 'cliente_definiu_cpf', 'profile', _uid,
            jsonb_build_object('cpf_final', right(_novo, 3), 'tinha_valor', _atual <> ''));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('ok', true);
END;
$dc$;

revoke all on function public.definir_meu_cpf(text) from public, anon;
grant execute on function public.definir_meu_cpf(text) to authenticated, service_role;


-- ── 4. A casa corrige o CPF (atendimento, com o documento conferido) ─────────
-- Sem tela: roda pelo SQL (ou por admin logado), como o admin_zerar_pin.
-- Exemplo: select public.admin_corrigir_cpf('<id da conta>', '<cpf>', 'RG conferido por <quem> em dd/mm');
-- Se a resposta trouxer "facial_volta_para_a_fila": true, a foto facial da
-- conta subiu ao Marcel com o CPF antigo. NADA reenvia sozinho (nenhuma rotina
-- chama a facial-resync): a casa chama a edge para aquela conta, no mesmo SQL:
--   select net.http_post(
--     url     := 'https://nsrromaqysgoxqvqagdm.supabase.co/functions/v1/facial-resync',
--     headers := jsonb_build_object('Content-Type', 'application/json',
--                  'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1)),
--     body    := jsonb_build_object('user_id', '<id da conta>'),
--     timeout_milliseconds := 30000);  -- a edge espera o Marcel até 20 s; com o padrão do pg_net (5 s) a resposta volta timed_out
--   -- e confere: select status_code, content from net._http_response where id = <o número que voltou>;
--   -- e select facial_synced_at from public.profiles where id = '<id da conta>';  (deixa de ser nulo)
-- O cadastro antigo no Marcel, com o CPF errado, não é apagado por isso (Fila, achados da OS-267).
create or replace function public.admin_corrigir_cpf(_user_id uuid, _cpf text, _motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $ac$
DECLARE
  _quem    uuid := auth.uid();
  _novo    text := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g');
  _antes   text;
  _facial  boolean;
  _outras  integer;
BEGIN
  -- Admin logado, service role, ou a casa direto no SQL: fora do PostgREST e
  -- sem login nenhum no pedido. (Mais apertado que o admin_zerar_pin, que só
  -- olha o session_user: aqui um login de cliente nunca passa, nem numa
  -- conexão direta que simule o cliente, como o ensaio faz.)
  IF NOT (
       public.has_role(_quem, 'admin'::public.app_role)
       OR coalesce(auth.role(), '') = 'service_role'
       OR (session_user <> 'authenticator' AND coalesce(auth.role(), '') = '' AND _quem IS NULL)
     ) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;
  IF coalesce(btrim(_motivo), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'motivo_obrigatorio');
  END IF;
  IF length(_novo) <> 11 OR NOT public.documento_valido(_novo) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'cpf_invalido');
  END IF;

  SELECT regexp_replace(coalesce(p.cpf, ''), '\D', '', 'g'), p.facial_photo_path IS NOT NULL
    INTO _antes, _facial
    FROM public.profiles p WHERE p.id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'perfil_nao_encontrado');
  END IF;
  IF _antes = _novo THEN
    RETURN jsonb_build_object('ok', true, 'sem_mudanca', true);
  END IF;

  -- Informativo: o mesmo CPF em outra conta (hoje há CPF repetido; não trava).
  SELECT count(*) INTO _outras FROM public.profiles WHERE cpf = _novo AND id <> _user_id;

  UPDATE public.profiles
     SET cpf = _novo,
         -- A foto facial subiu ao Marcel com o CPF antigo: marca como "não
         -- enviada", que é o que a facial-resync procura. Quem chama a
         -- facial-resync é a casa (comando no topo desta função).
         facial_synced_at = CASE WHEN facial_photo_path IS NOT NULL THEN NULL ELSE facial_synced_at END
   WHERE id = _user_id;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (coalesce(_quem, '95628c4a-8040-44ed-83c5-d6a5b8793926'::uuid), 'cpf_corrigido_pela_casa', 'profile', _user_id,
          jsonb_build_object('motivo', _motivo,
                             'cpf_antes_final', nullif(right(_antes, 3), ''),
                             'cpf_novo_final', right(_novo, 3),
                             'facial_volta_para_a_fila', _facial,
                             'outras_contas_com_este_cpf', _outras));

  RETURN jsonb_build_object('ok', true, 'facial_volta_para_a_fila', _facial, 'outras_contas_com_este_cpf', _outras)
         || CASE WHEN _facial THEN jsonb_build_object('proximo_passo',
              'Chamar a edge facial-resync com este user_id (comando no topo da função admin_corrigir_cpf): nada reenvia a facial sozinho.')
            ELSE '{}'::jsonb END;
END;
$ac$;

revoke all on function public.admin_corrigir_cpf(uuid, text, text) from public, anon;
grant execute on function public.admin_corrigir_cpf(uuid, text, text) to authenticated, service_role;


-- ── 5. Pedido sem dono só vem com contato provado ────────────────────────────
-- Igual à função no ar até 21/10, com uma mudança: para casar o PEDIDO, o
-- e-mail só vale se a conta confirmou o e-mail por código (email_confirmado_em).
-- O WhatsApp já exigia. A escolha dos INGRESSOS dentro do pedido que casou
-- segue igual (sem titular, ou titular com o e-mail da conta): quem casou pelo
-- WhatsApp confirmado continua levando o ingresso que está no e-mail dele.
CREATE OR REPLACE FUNCTION public.claim_my_orphan_orders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _email_provado text;
  _cpf text;
  _whatsapp text;
  _order_ids uuid[];
  _tickets int := 0;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authenticated');
  END IF;

  SELECT NULLIF(lower(email), ''),
         CASE WHEN email_confirmado_em IS NOT NULL THEN NULLIF(lower(email), '') END,
         NULLIF(cpf, ''),
         CASE WHEN whatsapp_confirmado_em IS NOT NULL THEN public.normalizar_whatsapp(whatsapp) END
    INTO _email, _email_provado, _cpf, _whatsapp
    FROM public.profiles WHERE id = _uid;

  IF _cpf IS NULL OR (_email_provado IS NULL AND _whatsapp IS NULL) THEN
    RETURN jsonb_build_object('ok', true, 'orders_claimed', 0, 'tickets_claimed', 0, 'code', 'profile_incomplete');
  END IF;

  WITH upd AS (
    UPDATE public.orders o
       SET user_id = _uid
     WHERE o.user_id IS NULL
       AND o.customer_cpf = _cpf
       AND (
         (_email_provado IS NOT NULL AND lower(o.customer_email) = _email_provado)
         OR (_whatsapp IS NOT NULL AND public.normalizar_whatsapp(o.customer_phone) = _whatsapp)
       )
    RETURNING o.id
  )
  SELECT array_agg(id) INTO _order_ids FROM upd;

  IF _order_ids IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'orders_claimed', 0, 'tickets_claimed', 0);
  END IF;

  UPDATE public.tickets t
     SET user_id = _uid
   WHERE t.user_id IS NULL
     AND t.order_id = ANY(_order_ids)
     AND (t.holder_email IS NULL OR t.holder_email = '' OR (_email IS NOT NULL AND lower(t.holder_email) = _email));
  GET DIAGNOSTICS _tickets = ROW_COUNT;

  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (
      _uid,
      'orphan_orders_claimed',
      'order',
      _order_ids[1],
      jsonb_build_object('order_ids', to_jsonb(_order_ids), 'tickets_claimed', _tickets, 'por_whatsapp', _email_provado IS NULL)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'orders_claimed', coalesce(array_length(_order_ids, 1), 0),
    'tickets_claimed', _tickets
  );
END;
$function$;


-- ============================================================================
-- VOLTAR ATRÁS (nesta ordem; depois, voltar o site para a versão anterior)
-- ============================================================================
-- drop trigger if exists trg_perfil_guarda_identidade on public.profiles;
-- drop function if exists public._perfil_guarda_identidade();
-- drop function if exists public.definir_meu_cpf(text);
-- drop function if exists public.admin_corrigir_cpf(uuid, text, text);
-- revoke update (nome_completo, whatsapp, avatar_url, cpf, marketing_consent, marketing_consent_at,
--                marketing_consent_version, fbp, fbc) on table public.profiles from authenticated;
-- grant insert, update on table public.profiles to anon, authenticated;
-- CREATE OR REPLACE FUNCTION public.claim_my_orphan_orders()
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   _uid uuid := auth.uid();
--   _email text;
--   _cpf text;
--   _whatsapp text;
--   _order_ids uuid[];
--   _tickets int := 0;
-- BEGIN
--   IF _uid IS NULL THEN
--     RETURN jsonb_build_object('ok', false, 'code', 'not_authenticated');
--   END IF;
--
--   SELECT NULLIF(lower(email), ''),
--          NULLIF(cpf, ''),
--          CASE WHEN whatsapp_confirmado_em IS NOT NULL THEN public.normalizar_whatsapp(whatsapp) END
--     INTO _email, _cpf, _whatsapp
--     FROM public.profiles WHERE id = _uid;
--
--   IF _cpf IS NULL OR (_email IS NULL AND _whatsapp IS NULL) THEN
--     RETURN jsonb_build_object('ok', true, 'orders_claimed', 0, 'tickets_claimed', 0, 'code', 'profile_incomplete');
--   END IF;
--
--   WITH upd AS (
--     UPDATE public.orders o
--        SET user_id = _uid
--      WHERE o.user_id IS NULL
--        AND o.customer_cpf = _cpf
--        AND (
--          (_email IS NOT NULL AND lower(o.customer_email) = _email)
--          OR (_whatsapp IS NOT NULL AND public.normalizar_whatsapp(o.customer_phone) = _whatsapp)
--        )
--     RETURNING o.id
--   )
--   SELECT array_agg(id) INTO _order_ids FROM upd;
--
--   IF _order_ids IS NULL THEN
--     RETURN jsonb_build_object('ok', true, 'orders_claimed', 0, 'tickets_claimed', 0);
--   END IF;
--
--   UPDATE public.tickets t
--      SET user_id = _uid
--    WHERE t.user_id IS NULL
--      AND t.order_id = ANY(_order_ids)
--      AND (t.holder_email IS NULL OR t.holder_email = '' OR (_email IS NOT NULL AND lower(t.holder_email) = _email));
--   GET DIAGNOSTICS _tickets = ROW_COUNT;
--
--   BEGIN
--     INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
--     VALUES (
--       _uid,
--       'orphan_orders_claimed',
--       'order',
--       _order_ids[1],
--       jsonb_build_object('order_ids', to_jsonb(_order_ids), 'tickets_claimed', _tickets, 'por_whatsapp', _email IS NULL)
--     );
--   EXCEPTION WHEN OTHERS THEN
--     NULL;
--   END;
--
--   RETURN jsonb_build_object(
--     'ok', true,
--     'orders_claimed', coalesce(array_length(_order_ids, 1), 0),
--     'tickets_claimed', _tickets
--   );
-- END;
-- $function$;
-- ============================================================================
