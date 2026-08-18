-- quote_seat_total — quanto custaria esta reserva de mesa, SEM criar nada.
--
-- POR QUE ISTO EXISTE (18/08/2026): a rota do Marcel precisa mostrar as opções
-- de parcelamento ANTES de cobrar, e o parcelamento é calculado sobre o total
-- (mesa + taxa administrativa). Até aqui esse total só existia como efeito
-- colateral de `create_seat_order`, que CRIA pedido e prende assento — caro
-- demais para uma tela que o cliente pode abrir e fechar.
--
-- A alternativa seria refazer a soma no TypeScript da edge. Foi justamente uma
-- conta duplicada entre tela e servidor que fez o cupom ser ignorado no
-- checkout de ingresso (o cliente via o desconto e pagava o valor cheio), e a
-- regra da casa é preço no banco. Então a conta continua num lugar só: aqui,
-- espelhando LINHA A LINHA o trecho de `create_seat_order` que soma as linhas
-- e aplica a taxa.
--
-- ⚠️ Se `create_seat_order` mudar a fórmula, ESTA função muda junto. Elas
-- precisam responder o mesmo número — se divergirem, o cliente vê um valor na
-- tela e é cobrado outro.
--
-- Não escreve nada: sem INSERT, sem UPDATE, sem FOR UPDATE. É só leitura.

CREATE OR REPLACE FUNCTION public.quote_seat_total(
  _event_id     uuid,
  _user_id      uuid,
  _hold_token   text,
  _seats        jsonb,
  _fee_percent  numeric,
  _fee_fixed    numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _now         timestamptz := now();
  _subtotal    numeric := 0;
  _service_fee numeric := 0;
  _total       numeric := 0;
  _seat_row    RECORD;
  _seat_id     uuid;
  _addons      int;
  _line_price  numeric;
BEGIN
  IF _event_id IS NULL OR _user_id IS NULL OR _hold_token IS NULL THEN
    RAISE EXCEPTION 'missing_arg' USING ERRCODE = '22023';
  END IF;
  IF _seats IS NULL OR jsonb_array_length(_seats) = 0 THEN
    RAISE EXCEPTION 'no_seats' USING ERRCODE = '22023';
  END IF;

  FOR _seat_id, _addons IN
    SELECT (s->>'seat_id')::uuid, GREATEST(0, COALESCE((s->>'addons')::int, 0))
      FROM jsonb_array_elements(_seats) s
  LOOP
    SELECT es.* INTO _seat_row
      FROM public.event_seats es
     WHERE es.id = _seat_id AND es.event_id = _event_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'seat_not_found:%', _seat_id USING ERRCODE = 'P0002';
    END IF;

    -- Mesmas travas da criação, para a cotação não virar uma porta de leitura
    -- do mapa de preços de assento que não é meu. Sem `FOR UPDATE`: cotar não
    -- pode segurar linha nem brigar com quem está comprando de verdade.
    IF _seat_row.status <> 'held' THEN
      RAISE EXCEPTION 'seat_not_held:%', _seat_id USING ERRCODE = 'P0001';
    END IF;
    IF _seat_row.hold_token IS DISTINCT FROM _hold_token THEN
      RAISE EXCEPTION 'invalid_hold_token:%', _seat_id USING ERRCODE = 'P0001';
    END IF;
    IF _seat_row.held_by_user_id IS DISTINCT FROM _user_id THEN
      RAISE EXCEPTION 'seat_not_yours:%', _seat_id USING ERRCODE = 'P0001';
    END IF;
    IF _seat_row.hold_expires_at IS NULL OR _seat_row.hold_expires_at < _now THEN
      RAISE EXCEPTION 'hold_expired:%', _seat_id USING ERRCODE = 'P0001';
    END IF;
    IF _addons > (COALESCE(_seat_row.max_capacity,0) - COALESCE(_seat_row.base_capacity,0)) THEN
      RAISE EXCEPTION 'addons_exceed_max:%', _seat_id USING ERRCODE = '22023';
    END IF;

    -- Espelho de create_seat_order: base + (adicionais × preço do adicional).
    _line_price := COALESCE(_seat_row.base_price, 0)
                 + (_addons * COALESCE(_seat_row.extra_price, 0));
    _subtotal   := _subtotal + _line_price;
  END LOOP;

  _service_fee := round((_subtotal * COALESCE(_fee_percent,0)/100
                       + COALESCE(_fee_fixed,0))::numeric, 2);
  _total       := GREATEST(0.01, _subtotal + _service_fee);

  RETURN jsonb_build_object(
    'subtotal',    _subtotal,
    'service_fee', _service_fee,
    'total',       _total
  );
END;$function$;

-- Só o servidor cota (as edges usam service_role). Deixar o cliente chamar
-- direto seria devolver a conta pronta para quem quisesse comparar preço de
-- mesa alheia — e a tela nunca precisa: ela recebe o número já calculado.
REVOKE ALL ON FUNCTION public.quote_seat_total(uuid, uuid, text, jsonb, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quote_seat_total(uuid, uuid, text, jsonb, numeric, numeric) FROM anon, authenticated;
