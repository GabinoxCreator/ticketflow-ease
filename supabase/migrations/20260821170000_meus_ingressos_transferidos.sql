-- Os ingressos que EU transferi continuam aparecendo para mim — como registro.
--
-- Hoje o ingresso simplesmente some da conta de quem transferiu: a lista busca
-- por `tickets.user_id`, e o aceite troca esse dono. Para quem enviou, um
-- ingresso pago que desaparece da tela sem deixar rastro gera dúvida na hora
-- errada — "será que foi mesmo? para quem?" (Gabriel, 21/08).
--
-- ⚠️ SEM `ticket_code`, de propósito. O QR é do novo dono e só dele. Aqui vai o
-- suficiente para a pessoa reconhecer o que enviou e para quem: evento, data,
-- lote/assento, os 3 últimos dígitos do CPF de destino e quando foi aceito.
-- Devolver o código transformaria o registro numa segunda via do ingresso.
--
-- Também não devolve nome nem e-mail de quem recebeu: quem enviou já sabe para
-- qual CPF mandou, e o resto é dado de outra pessoa.

CREATE OR REPLACE FUNCTION public.meus_ingressos_transferidos()
 RETURNS TABLE(
   ticket_id uuid,
   event_id uuid,
   event_title text,
   event_date date,
   event_time time,
   event_venue text,
   event_city text,
   event_image text,
   lot_name text,
   seat_label text,
   para_cpf_final text,
   transferido_em timestamptz
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.id, e.id, e.title, e.date, e.time, e.venue, e.city, e.image_url,
    l.name, t.seat_label,
    right(tr.to_cpf, 3),
    tr.accepted_at
  FROM public.ticket_transfers tr
  JOIN public.tickets t ON t.id = tr.ticket_id
  JOIN public.events  e ON e.id = tr.event_id
  LEFT JOIN public.event_lots l ON l.id = t.lot_id
  WHERE tr.status = 'aceita'
    -- Só as MINHAS: quem enviou sou eu, e a sessão é quem diz isso.
    AND tr.from_user_id = auth.uid()
    -- E o ingresso saiu mesmo da minha conta (defesa contra estado estranho).
    AND t.user_id IS DISTINCT FROM auth.uid()
  ORDER BY tr.accepted_at DESC;
$function$;

-- A função é SECURITY DEFINER e se apoia em auth.uid(): sem sessão não devolve
-- nada. Anônimo não precisa executar.
REVOKE EXECUTE ON FUNCTION public.meus_ingressos_transferidos() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.meus_ingressos_transferidos() TO authenticated;
