-- ============================================================================
-- TRANSFERÊNCIA DE INGRESSO: SE O CPF APONTADO JÁ TEM CONTA, SÓ ESSA CONTA ACEITA
-- OS-399 · 07/11/2026 · achado da revisão da OS-322 (decisão do Gabriel, 06/11: "só o dono do CPF")
-- ============================================================================
--
-- POR QUE
--   Ao transferir, o dono do ingresso aponta o CPF de quem vai receber. A função
--   conferia se o CPF digitado no aceite era o apontado, mas não olhava QUEM
--   estava aceitando: quem tivesse o link e soubesse o CPF levava o ingresso na
--   conta que estivesse logada, mesmo quando esse CPF já pertence a outra conta
--   da FestPag. (8 transferências até 07/11, nenhuma nesse caso.)
--
-- O QUE FAZ
--   Uma trava nova, logo depois da conferência do CPF digitado: se existe conta
--   com o CPF apontado (`profiles.cpf`) e a conta que está aceitando não é uma
--   delas, recusa com o erro `transferido_para_outro_cpf`. A edge
--   `ticket-transfer-accept` traduz o erro para o texto aprovado pelo Gabriel
--   ("Este ingresso foi transferido para outro CPF. Para aceitar, entre na
--   conta desse CPF."). O TEXTO não diz se o CPF tem conta: é a mesma frase para
--   conta sem CPF e conta de outro CPF. Mas o dado em si não é segredo para quem
--   chegou até aqui: a edge `ticket-transfer-info` já entrega `jaTemConta` a
--   quem tem o link, e a frase só aparece depois de o CPF digitado ser o apontado.
--   · CPF apontado SEM conta na FestPag: o fluxo de hoje segue igual (a pessoa
--     cria a conta no aceite e o CPF vai para o perfil dela).
--   · Conta sem CPF no perfil e CPF apontado com dono: recusa (ela não pode
--     "pegar" o CPF de outra conta; o gatilho da OS-322 já impede gravá-lo).
--   · CPF repetido em mais de uma conta (15 CPFs, 38 contas, contados em 07/11):
--     qualquer uma delas aceita.
--   O único chamador da função é a edge `ticket-transfer-accept`.
--   A trava confere `profiles.cpf` SEM o advisory lock 322 do gatilho da OS-322
--   (aquele fecha a corrida de DUAS contas gravando o mesmo CPF). Aqui só se
--   LÊ: a única janela é o instante em que a dona do CPF está acabando de
--   gravá-lo no perfil enquanto outra conta aceita; nesse caso a trava ainda
--   não vê a dona e o fluxo cai no de hoje (CPF sem conta). Janela mínima, aceita.
--
-- O QUE NÃO MUDA
--   Assinatura, retorno e privilégios (CREATE OR REPLACE com o mesmo tipo).
--   Todas as outras conferências e a ordem delas: a nova vem DEPOIS de
--   `cpf_nao_confere`, então a frase nova só aparece para quem digitou o CPF
--   certo (nada a mais é revelado a quem só tem o link). Ingresso de retirada
--   grátis: a edge já exigia a conta do mesmo CPF; continua igual.
--
-- PODE SUBIR SEM A EDGE? Pode. Sem o redeploy da edge, a recusa existe, mas a
--   pessoa vê "Não foi possível aceitar o ingresso. Tente novamente." em vez da
--   frase aprovada (a edge cai no texto genérico).
--
-- COMO VOLTAR ATRÁS: bloco "VOLTAR ATRÁS" no fim (a função de 21/08, sem a trava).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.aceitar_transferencia_ingresso(
  _token text, _novo_user_id uuid, _cpf_informado text,
  _nome text, _email text, _telefone text)
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

  -- Transferir é passar para OUTRA pessoa (21/08): aceitar o próprio link queima a
  -- única transferência do ingresso sem transferir nada.
  IF _novo_user_id IS NOT DISTINCT FROM _tr.from_user_id THEN
    RAISE EXCEPTION 'nao_pode_aceitar_para_si' USING ERRCODE = 'P0001';
  END IF;

  IF _cpf IS DISTINCT FROM _tr.to_cpf THEN
    RAISE EXCEPTION 'cpf_nao_confere' USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ A trava nova (OS-399): o CPF apontado já tem conta na FestPag e quem aceita não
  -- é uma delas. O ingresso fica com o dono, o link continua valendo para a conta certa.
  -- Compara com `profiles.cpf` por igualdade (só dígitos: 0 de 1.276 CPFs gravados têm
  -- outro caractere, conferido em 07/11; usa o índice idx_profiles_cpf).
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.cpf = _tr.to_cpf)
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.cpf = _tr.to_cpf AND p.id = _novo_user_id) THEN
    RAISE EXCEPTION 'transferido_para_outro_cpf' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO _t FROM public.tickets WHERE id = _tr.ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ingresso_nao_encontrado' USING ERRCODE = 'P0002'; END IF;
  IF _t.status <> 'valid' THEN RAISE EXCEPTION 'ingresso_indisponivel' USING ERRCODE = 'P0001'; END IF;

  IF _t.validated_at IS NOT NULL THEN
    UPDATE public.ticket_transfers SET status='cancelada', cancelled_at=now() WHERE id=_tr.id;
    RAISE EXCEPTION 'ingresso_ja_utilizado' USING ERRCODE = 'P0001';
  END IF;

  -- QR ANTIGO MORRE, QR NOVO NASCE: quem ficou com print do ingresso velho não entra.
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

-- ── VOLTAR ATRÁS ─────────────────────────────────────────────────────────────
-- Rodar de novo a função de `20260821150000_transferencia_nao_para_si_mesmo.sql`
-- (é a mesma, sem o bloco "A trava nova (OS-399)"). Nada de dado a desfazer:
-- a função não grava nada novo, só recusa.
