-- Pulseiras do camarote: por PESSOA e por NOITE, e o valor da unidade.
--
-- Dois erros que a tela mostrou (Gabriel, 21/08):
--
-- 1) A contagem devolvia os INGRESSOS do camarote (10) como se fossem as
--    pulseiras. Mas o ingresso do camarote vale as cinco noites e a pulseira é
--    FÍSICA, de uma noite só: um camarote de 10 pessoas precisa de 10 pulseiras
--    por noite, 50 no total. A tela dizia "10 pulseiras" e o rodapé somava 40
--    quando o certo eram 200 — a gráfica imprimiria um quinto do necessário.
--
-- 2) O valor vinha de `orders.total_amount`, o total do PEDIDO, repetido em cada
--    linha: quatro camarotes de uma venda de R$ 22.000 apareciam como
--    "R$ 22.000" cada um, dando a impressão de R$ 88.000. O que interessa na
--    fila de entrega é quanto custou AQUELE camarote.
--
-- Passa a devolver `pessoas` e `noites` separados, além do total: é o que
-- permite a folha de impressão dizer quantas pulseiras são de cada noite, que é
-- como a operação separa o material.
--
-- Evento sem noites cadastradas (todos os outros clientes) conta como 1 noite —
-- o resultado fica idêntico ao de hoje, pulseira = pessoa.

-- ⚠️ DROP + CREATE, não CREATE OR REPLACE.
--
-- `CREATE OR REPLACE` NÃO muda o tipo de retorno de uma função que já existe.
-- Esta passa de 14 para 16 colunas (ganha `pessoas` e `noites`), e o Postgres
-- recusa com 42P13: "cannot change return type of existing function". A primeira
-- versão desta migration usava REPLACE e simplesmente não aplicava — foi barrada
-- no portão em 21/08.
--
-- ⚠️ E DROP LEVA OS PRIVILÉGIOS JUNTO. O CREATE devolve EXECUTE ao PUBLIC, o que
-- deixaria a função chamável por ANÔNIMO. Foi assim que cinco funções do produtor
-- ficaram três dias abertas em 17/08. Ela é SECURITY DEFINER e filtra por dono lá
-- dentro, então o dano seria contido — mas "contido por outra tranca" não é
-- fechado. Os dois comandos no fim deste arquivo repõem o estado exato de antes,
-- medido no banco: anon NÃO executa, authenticated executa.

DROP FUNCTION IF EXISTS public.get_camarote_wristbands(uuid);

CREATE FUNCTION public.get_camarote_wristbands(_event_id uuid)
 RETURNS TABLE(
   seat_id uuid, code text, label text, seat_type_name text,
   quantidade integer, pessoas integer, noites integer,
   order_id uuid, comprador text, comprador_email text, comprador_telefone text,
   pago_em timestamp with time zone, valor numeric,
   printed_at timestamp with time zone, delivered_at timestamp with time zone,
   delivered_to text
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH n AS (
    SELECT GREATEST(1, count(*)::int) AS noites
      FROM public.event_days d
     WHERE d.event_id = _event_id
  )
  SELECT
    s.id, s.code, s.label, s.seat_type_name,
    -- Total de pulseiras: uma por pessoa, em cada noite.
    ((SELECT count(*)::int FROM public.tickets t
       WHERE t.event_seat_id = s.id AND t.status <> 'cancelled') * n.noites),
    -- Quantas pessoas o camarote leva (ingressos emitidos, não a capacidade
    -- cadastrada: o comprador pode ter fechado com menos gente).
    (SELECT count(*)::int FROM public.tickets t
      WHERE t.event_seat_id = s.id AND t.status <> 'cancelled'),
    n.noites,
    o.id, o.customer_name, o.customer_email, o.customer_phone,
    o.updated_at,
    -- O que custou ESTE camarote, não o pedido inteiro.
    COALESCE(s.base_price, 0),
    s.wristbands_printed_at, s.wristbands_delivered_at, s.wristbands_delivered_to
  FROM public.event_seats s
  JOIN public.orders o ON o.id = s.order_id
  CROSS JOIN n
  WHERE s.event_id = _event_id
    AND s.status = 'sold'
    AND o.status = 'paid'
    -- Só o dono do evento enxerga: são dados de quem comprou.
    AND EXISTS (
      SELECT 1 FROM public.events e
       WHERE e.id = _event_id
         AND (e.producer_id = auth.uid()
              OR EXISTS (SELECT 1 FROM public.user_roles r
                          WHERE r.user_id = auth.uid() AND r.role = 'admin'))
    )
  ORDER BY s.wristbands_delivered_at NULLS FIRST, s.wristbands_printed_at NULLS FIRST, s.code;
$function$;

-- Repõe os privilégios que o DROP levou. Sem estas duas linhas a função nasce
-- aberta ao público — conferido antes com has_function_privilege, e a conferir
-- de novo depois de aplicar.
REVOKE EXECUTE ON FUNCTION public.get_camarote_wristbands(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_camarote_wristbands(uuid) TO authenticated;
