-- Transferência: quem envia não pode ser quem aceita.
--
-- O Gabriel testou em 21/08 informando um CPF diferente do dele e aceitando o
-- link na aba do lado, logado na própria conta. O sistema deixou — a trava era
-- só o CPF, e o CPF conferia.
--
-- O resultado é um estado que não faz sentido: o ingresso continua na conta de
-- quem enviou, mas com o `holder_cpf` de outra pessoa. Na portaria isso é uma
-- pessoa que não bate com o documento, e o ingresso "já foi transferido uma
-- vez" — a transferência de verdade, para alguém de fato, não pode mais
-- acontecer. O dono queima a única transferência sem ter transferido nada.
--
-- ⚠️ `CREATE OR REPLACE` aqui é seguro: o tipo de retorno não muda (jsonb), e
-- REPLACE preserva os privilégios. Foi o `DROP` da migration das pulseiras que
-- exigiu repor os grants — a diferença é essa, e vale lembrar antes de copiar
-- um padrão do outro.

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

  -- ⚠️ A trava nova: transferir é passar para OUTRA pessoa. Aceitar o próprio
  -- link queima a única transferência do ingresso sem transferir nada, e deixa
  -- o ingresso com o CPF de um terceiro na conta de quem enviou.
  IF _novo_user_id IS NOT DISTINCT FROM _tr.from_user_id THEN
    RAISE EXCEPTION 'nao_pode_aceitar_para_si' USING ERRCODE = 'P0001';
  END IF;

  IF _cpf IS DISTINCT FROM _tr.to_cpf THEN
    RAISE EXCEPTION 'cpf_nao_confere' USING ERRCODE = 'P0001';
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
