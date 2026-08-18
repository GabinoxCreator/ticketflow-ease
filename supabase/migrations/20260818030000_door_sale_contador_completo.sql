-- Venda na porta: o contador de vendidos passa a acompanhar TAMBÉM a edição e a
-- exclusão do registro — antes ele só somava quando a venda nascia.
--
-- O PROBLEMA (achado em 18/08/2026, na investigação do descompasso de estoque):
-- `handle_door_sale_lot_update` rodava só em AFTER INSERT. Então:
--
--   · o produtor registra 10 na porta por engano (era 1) → contador sobe 10;
--   · ele corrige o registro para 1                      → contador CONTINUA 10;
--   · ele apaga o registro                               → contador CONTINUA 10.
--
-- Resultado: 9 lugares somem da venda sem ninguém ter comprado, e o lote pode
-- fechar antes da hora. Hoje nenhuma tela edita ou apaga venda de porta, então
-- isso era risco teórico — mas uma correção feita direto no banco, ou uma tela
-- criada amanhã sem lembrar disso, bastaria para criar um desvio silencioso.
--
-- Agora o gatilho cobre os três momentos, e trata o caso de a venda ser movida
-- de um lote para outro (tira de um, põe no outro).
--
-- ⚠️ Nunca deixa o contador negativo: `GREATEST(0, ...)`. Um contador negativo
-- é pior que o desvio — ele faz o lote parecer ter mais vagas do que existe.

CREATE OR REPLACE FUNCTION public.handle_door_sale_lot_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Saída do valor antigo: vale para exclusão e para edição.
  IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') AND OLD.lot_id IS NOT NULL THEN
    UPDATE public.event_lots
       SET sold_quantity = GREATEST(0, sold_quantity - COALESCE(OLD.quantity, 0))
     WHERE id = OLD.lot_id;
  END IF;

  -- Entrada do valor novo: vale para criação e para edição. Quando a venda muda
  -- de lote, o bloco de cima já tirou do lote antigo e este põe no novo.
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.lot_id IS NOT NULL THEN
    UPDATE public.event_lots
       SET sold_quantity = sold_quantity + COALESCE(NEW.quantity, 0)
     WHERE id = NEW.lot_id;
  END IF;

  -- Editar ou apagar venda de porta é evento raro e mexe em estoque: fica
  -- registrado para quem for conferir a contagem depois entender o movimento.
  -- Criação não é auditada aqui — é o fluxo normal, e viraria ruído.
  IF TG_OP <> 'INSERT' THEN
    BEGIN
      INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
      VALUES ('95628c4a-8040-44ed-83c5-d6a5b8793926',
              'door_sale_' || lower(TG_OP),
              'event_lot',
              COALESCE(NEW.lot_id, OLD.lot_id),
              jsonb_build_object(
                'quantidade_antes', OLD.quantity,
                'quantidade_depois', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.quantity END,
                'lote_antes', OLD.lot_id,
                'lote_depois', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.lot_id END
              ));
    EXCEPTION WHEN OTHERS THEN
      -- Falha ao registrar NÃO pode derrubar a correção do contador: o número
      -- certo importa mais que o registro de quem mexeu.
      NULL;
    END;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_door_sale_insert ON public.door_sales;

CREATE TRIGGER on_door_sale_change
AFTER INSERT OR UPDATE OR DELETE ON public.door_sales
FOR EACH ROW EXECUTE FUNCTION public.handle_door_sale_lot_update();
