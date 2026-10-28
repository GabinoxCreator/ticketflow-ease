-- ============================================================================
-- UM CPF, UMA CONTA: O PRIMEIRO CPF DA CONTA NÃO PODE SER O DE OUTRA PESSOA
-- OS-302 (no pacote OS-322) · 26/10/2026 · continua a OS-267
-- Número depois da 20261026220000 (OS-317): não toca nada dela. Precisa da
-- 20261021150000 (OS-267) aplicada antes (conferido no banco em 26/10: está).
-- ============================================================================
--
-- POR QUE
--   A OS-267 trancou a TROCA do CPF já gravado na conta. Mas o PRIMEIRO CPF
--   ainda aceitava qualquer CPF válido, inclusive o de outra conta. Com o CPF de
--   outra pessoa no perfil, a conta passa a abrir a carteira FestCashless dela
--   (federacao-emitir-token assina o CPF do perfil), a entrar pela facial dela
--   (o check-in pelo rosto casa o CPF do perfil com o do pedido) e, com contato
--   confirmado, a puxar os pedidos sem dono dela (claim_my_orphan_orders).
--   Quatro portas gravavam o primeiro CPF sem conferir isso:
--     · Minha Conta e checkout, pela definir_meu_cpf (OS-267);
--     · o cadastro direto pela API do Supabase (handle_new_user grava o CPF que
--       vier no cadastro; é o caminho do cadastro de produtor, e qualquer um
--       chega nele com a chave pública);
--     · o aceite de transferência (edge ticket-transfer-accept grava no perfil
--       sem CPF o CPF que o dono do ingresso apontou).
--   (O cadastro pela tela do cliente, edge auth-codigo, já recusava CPF com
--   conta: "cpf_ja_cadastrado". Continua igual; aqui vira também segunda trava,
--   inclusive para dois cadastros do mesmo CPF ao mesmo tempo.)
--
-- O QUE FAZ
--   1. Gatilho trg_perfil_um_cpf_por_conta, antes de gravar o CPF no perfil
--      (INSERT, ou UPDATE que mexe no cpf). Vale para TODO caminho: navegador,
--      edge com chave de serviço e função da casa. Quando o CPF (11 dígitos) já
--      está em OUTRA conta:
--        · cadastro (INSERT, que só o handle_new_user faz): a conta nasce SEM
--          CPF no perfil. O resto do cadastro segue igual, inclusive o
--          documento do produtor em producer_profiles. Fica na auditoria
--          (cpf_de_outra_conta_no_cadastro, só os 3 últimos dígitos). Recusar o
--          cadastro inteiro derrubaria o produtor que já tinha conta de cliente
--          com o mesmo CPF (é assim que nasceram 3 dos 16 CPFs repetidos de hoje).
--        · gravação depois (UPDATE), ou INSERT em perfil que JÁ existe (um
--          upsert, INSERT ... ON CONFLICT (id) DO UPDATE): recusa, com o erro
--          cpf_de_outra_conta. No upsert, zerar o CPF viraria "cpf = null" no
--          UPDATE e apagaria calado o CPF que a conta já tinha. O
--          aceite de transferência continua entregando o ingresso (a edge não
--          deixa o perfil derrubar o aceite); só o perfil fica sem esse CPF.
--      Exceção: a casa (admin_corrigir_cpf), que liga a chave
--      festpag.cpf_pela_casa só durante a própria gravação.
--      Fila: uma trava por CPF (pg_advisory_xact_lock(322, hashtext(cpf))), para
--      duas contas não gravarem o mesmo CPF no mesmo instante.
--   2. definir_meu_cpf: confere ANTES de gravar e responde
--      { ok:false, erro:'cpf_de_outra_conta' } (a tela lê e mostra o texto).
--      Limite de 5 tentativas de primeiro CPF em 15 minutos por conta (bloqueio
--      de 1 hora, resposta 'muitas_tentativas'): sem isso, uma conta sem CPF
--      viraria consulta ilimitada de "este CPF tem conta na FestPag?".
--   3. admin_corrigir_cpf: igual à da OS-267, só liga a chave da casa durante a
--      gravação (a casa, com o documento conferido, continua podendo gravar um
--      CPF que existe em outra conta; a resposta já diz quantas).
--
-- O QUE NÃO MUDA
--   Os 16 CPFs repetidos de hoje (40 contas, contados em 26/10/2026 às 22h50)
--   ficam como estão: o gatilho só olha CPF NOVO entrando numa conta. CNPJ no
--   perfil (14 dígitos, produtor PJ) não é conferido. Ler o perfil, o login
--   por CPF (que já lida com mais de uma conta no mesmo CPF), a facial, o
--   cadastro pela tela do cliente, pedidos e ingressos.
--   Nenhuma edge muda (sem redeploy).
--
-- PODE SUBIR SEM O PUBLISH? Pode. A tela antiga da Minha Conta, recebendo
--   'cpf_de_outra_conta', mostra "Erro ao atualizar perfil: cpf_de_outra_conta"
--   até o publish (feio, mas recusa certo). O checkout não muda: o CPF fica no
--   pedido e a compra segue; só o perfil não recebe o CPF de outra conta.
--
-- COMO VOLTAR ATRÁS: bloco "VOLTAR ATRÁS" comentado no fim deste arquivo.
-- ============================================================================


-- ── 1. O gatilho: CPF de outra conta não entra ────────────────────────────────
create or replace function public._perfil_um_cpf_por_conta()
returns trigger
language plpgsql
security definer
set search_path = public
as $uc$
DECLARE
  -- SECURITY DEFINER: precisa enxergar TODOS os perfis (a regra de leitura do
  -- navegador só mostra o próprio) e gravar a auditoria. Não devolve nada de
  -- outra conta para quem gravou: só recusa ou deixa passar.
  _novo  text := regexp_replace(coalesce(NEW.cpf, ''), '\D', '', 'g');
  _antes text := CASE WHEN TG_OP = 'UPDATE'
                      THEN regexp_replace(coalesce(OLD.cpf, ''), '\D', '', 'g')
                      ELSE '' END;
  _existe boolean := false;
BEGIN
  -- INSERT em perfil que já existe é um upsert (INSERT ... ON CONFLICT (id) DO
  -- UPDATE): o "antes" é o CPF que o perfil já tem, e CPF de outra conta é
  -- recusado, nunca zerado (zerar viraria "cpf = null" no UPDATE do upsert e
  -- apagaria calado o CPF da conta, mesmo um CPF que ela já divide com outra).
  IF TG_OP = 'INSERT' THEN
    SELECT true, regexp_replace(coalesce(p.cpf, ''), '\D', '', 'g')
      INTO _existe, _antes
      FROM public.profiles p WHERE p.id = NEW.id;
    _existe := coalesce(_existe, false);
    _antes  := coalesce(_antes, '');
  END IF;

  -- Só CPF (11 dígitos) e só quando ele muda. CNPJ, vazio e o mesmo valor de
  -- antes passam direto.
  IF length(_novo) <> 11 OR _novo = _antes THEN
    RETURN NEW;
  END IF;

  -- A casa (admin_corrigir_cpf) grava com o documento conferido.
  IF coalesce(current_setting('festpag.cpf_pela_casa', true), '') = 'sim' THEN
    RETURN NEW;
  END IF;

  -- Fila por CPF: quem chega segundo espera o primeiro terminar e já enxerga
  -- o CPF gravado por ele (cada consulta da função vê o que já foi confirmado).
  PERFORM pg_advisory_xact_lock(322, hashtext(_novo));

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.cpf = _novo AND p.id <> NEW.id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NOT _existe THEN
    -- Cadastro (perfil novo): a conta nasce, sem CPF no perfil.
    NEW.cpf := NULL;
    BEGIN
      INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
      VALUES (NEW.id, 'cpf_de_outra_conta_no_cadastro', 'profile', NEW.id,
              jsonb_build_object('cpf_final', right(_novo, 3)));
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- auditoria é acessória: não pode custar o cadastro
    END;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'cpf_de_outra_conta'
    USING ERRCODE = '23505',
          HINT = 'Este CPF já está em outra conta. Só a casa grava, pela admin_corrigir_cpf, com o documento conferido (OS-302).';
END;
$uc$;

revoke all on function public._perfil_um_cpf_por_conta() from public, anon, authenticated;

-- O nome começa depois de "trg_perfil_guarda_identidade" (OS-267) de propósito:
-- o Postgres roda os gatilhos BEFORE em ordem alfabética, então a guarda da
-- OS-267 (navegador não muda CPF) responde primeiro, e este vem depois.
drop trigger if exists trg_perfil_um_cpf_por_conta on public.profiles;
create trigger trg_perfil_um_cpf_por_conta
  before insert or update of cpf on public.profiles
  for each row execute function public._perfil_um_cpf_por_conta();


-- ── 2. O primeiro CPF da conta (Minha Conta e checkout) ───────────────────────
-- Igual à da OS-267, com duas coisas novas antes de gravar: o limite de
-- tentativas e a conferência de outra conta. O resto (não autenticado, CPF
-- inválido, "já era este", "já tem CPF") segue igual e na mesma ordem.
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
  _rl    record;
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

  -- (OS-302) Limite: 5 tentativas de primeiro CPF em 15 minutos por conta,
  -- bloqueio de 1 hora. Sem ele, a recusa abaixo viraria consulta ilimitada de
  -- "este CPF tem conta?". Quem acerta grava na primeira; depois disso a
  -- resposta é sempre 'cpf_ja_salvo' (acima) e o limite nem é consultado.
  SELECT * INTO _rl FROM public.check_rate_limit('definir_meu_cpf:' || _uid::text, 5, 900, 3600);
  IF NOT coalesce(_rl.allowed, false) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'muitas_tentativas',
                              'tente_em_segundos', _rl.retry_after_seconds);
  END IF;

  -- (OS-302) CPF de outra conta não entra. Mesma fila do gatilho, para a
  -- resposta daqui valer até o fim da gravação.
  PERFORM pg_advisory_xact_lock(322, hashtext(_novo));
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.cpf = _novo AND p.id <> _uid) THEN
    BEGIN
      INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
      VALUES (_uid, 'cpf_de_outra_conta_recusado', 'profile', _uid,
              jsonb_build_object('cpf_final', right(_novo, 3), 'caminho', 'definir_meu_cpf'));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN jsonb_build_object('ok', false, 'erro', 'cpf_de_outra_conta');
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


-- ── 3. A casa corrige o CPF (igual à da OS-267, mais a chave da casa) ────────
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
-- (OS-302) O gatilho trg_perfil_um_cpf_por_conta recusa CPF de outra conta;
-- a casa passa porque liga a chave festpag.cpf_pela_casa só durante o UPDATE.
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

  -- (OS-302) A chave da casa: o gatilho deixa passar CPF de outra conta só
  -- nesta gravação. Desligada logo depois, na mesma transação.
  PERFORM set_config('festpag.cpf_pela_casa', 'sim', true);
  UPDATE public.profiles
     SET cpf = _novo,
         -- A foto facial subiu ao Marcel com o CPF antigo: marca como "não
         -- enviada", que é o que a facial-resync procura. Quem chama a
         -- facial-resync é a casa (comando no topo desta função).
         facial_synced_at = CASE WHEN facial_photo_path IS NOT NULL THEN NULL ELSE facial_synced_at END
   WHERE id = _user_id;
  PERFORM set_config('festpag.cpf_pela_casa', '', true);

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


-- ============================================================================
-- VOLTAR ATRÁS (nesta ordem; a tela nova continua funcionando com a função
-- antiga: ela só deixa de receber 'cpf_de_outra_conta' e 'muitas_tentativas')
-- ============================================================================
-- drop trigger if exists trg_perfil_um_cpf_por_conta on public.profiles;
-- drop function if exists public._perfil_um_cpf_por_conta();
-- e rodar de novo as seções "3. O primeiro CPF da conta" e "4. A casa corrige
-- o CPF" do arquivo 20261021150000_perfil_cpf_travado.sql (OS-267), que
-- devolvem definir_meu_cpf e admin_corrigir_cpf exatamente como estavam.
-- ============================================================================
