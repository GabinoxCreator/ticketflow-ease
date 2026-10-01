-- Código de retirada só com NÚMEROS (pedido do Gabriel, 01/10/2026).
--
-- O código nasceu com letras e números (ex.: K2639UAT). Na prática ele é ditado
-- em voz alta no balcão e digitado no celular de quem atende: só número é mais
-- fácil de falar, de ouvir e de digitar (teclado numérico).
--
-- 6 dígitos = 1 milhão de combinações. O código não é senha: quem atende vê o
-- nome do comprador e os itens antes de entregar, e a busca é sempre dentro do
-- evento. A unicidade continua valendo para a tabela inteira.
--
-- Códigos já emitidos com letras continuam funcionando: a baixa compara texto.
--
-- CREATE OR REPLACE com a mesma assinatura: os grants ficam como estão.
-- Para voltar atrás: recriar a função com o alfabeto antigo
-- ('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8 posições).

CREATE OR REPLACE FUNCTION public.gerar_codigo_retirada()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $function$
DECLARE
  _codigo text;
  _tentativa int := 0;
BEGIN
  LOOP
    -- lpad garante os 6 dígitos mesmo quando o sorteio começa com zero.
    _codigo := lpad((floor(random() * 1000000))::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.product_claims WHERE claim_code = _codigo);
    _tentativa := _tentativa + 1;
    IF _tentativa > 50 THEN
      RAISE EXCEPTION 'Não foi possível gerar código de retirada';
    END IF;
  END LOOP;
  RETURN _codigo;
END $function$;
