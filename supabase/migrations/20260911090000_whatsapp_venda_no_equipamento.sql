-- O ingresso vendido NO EQUIPAMENTO passa a poder chegar pelo WhatsApp.
-- Pedido do Gabriel em 10/09/2026: "no equipamento a gente pede o e-mail... tem que
-- colocar uma função pedir o celular da pessoa, WhatsApp". Decisão dele em 11/09:
-- WhatsApp obrigatório com DUPLA DIGITAÇÃO na tela, e-mail opcional, ingresso enviado.
--
-- O QUE MUDA, e só isso: até aqui o gatilho recusava toda venda sem conta
-- (`user_id IS NULL`), que é o caso de 100% das vendas de totem/maquininha. Agora
-- ele aceita ESSAS vendas, lendo o número de `orders.customer_phone`.
--
-- ⚠️ POR QUE `sale_origin = 'smartpos'` E NÃO "qualquer pedido sem conta":
-- conferido no banco em 11/09, existem outros pedidos sem conta COM telefone
-- preenchido — 21 cortesias e 15 vendas manuais de produtor. Abrir o gatilho para
-- "sem conta + tem telefone" faria essas vendas passarem a disparar WhatsApp sozinhas,
-- para clientes de outros produtores, sem ninguém ter pedido. O portão é a ORIGEM da
-- venda, não a ausência de conta. `smartpos` é a origem que o totem E a maquininha
-- gravam (`collaborator-reserve-order`).
--
-- ⚠️ A DIFERENÇA DE CONFIANÇA, registrada de propósito: o número de quem tem conta foi
-- confirmado por código; o do equipamento é digitado na tela. A trava contra o dígito
-- errado — que mandaria o QR para um estranho — mora na TELA (dupla digitação), não aqui.
-- Se alguma tela passar a chamar isso sem essa dupla conferência, a trava se perde.
--
-- Nada muda para quem tem conta: aquele caminho está idêntico. Pedidos antigos não são
-- tocados — o gatilho só corre quando um pedido vira 'paid' daqui para frente.

CREATE OR REPLACE FUNCTION public.agendar_entrega_whatsapp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _destino text;
BEGIN
  IF new.status <> 'paid' THEN RETURN new; END IF;
  IF TG_OP = 'UPDATE' AND old.status = 'paid' THEN RETURN new; END IF;

  IF new.user_id IS NOT NULL THEN
    -- Caminho de sempre: só conta com WhatsApp CONFIRMADO por código.
    SELECT public.normalizar_whatsapp(p.whatsapp)
      INTO _destino
      FROM public.profiles p
     WHERE p.id = new.user_id
       AND p.whatsapp_confirmado_em IS NOT NULL;
  ELSIF new.sale_origin = 'smartpos' THEN
    -- Venda no equipamento (totem e maquininha): não há conta nem código. O número
    -- vem do que a pessoa digitou duas vezes na tela do aparelho.
    _destino := public.normalizar_whatsapp(new.customer_phone);
  END IF;

  IF _destino IS NULL THEN RETURN new; END IF;

  INSERT INTO public.entregas_whatsapp (order_id, user_id, destino)
  VALUES (new.id, new.user_id, _destino)
  ON CONFLICT (order_id) DO NOTHING;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'agendar_entrega_whatsapp falhou para % : %', new.id, SQLERRM;
  RETURN new;
END;
$function$;
