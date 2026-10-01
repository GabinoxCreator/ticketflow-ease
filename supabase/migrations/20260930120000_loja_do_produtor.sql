-- ============================================================================
-- LOJA DO PRODUTOR — produtos, combos e retirada na ticketeira
-- 30/09/2026 · plano em _docs/plano-produtos-ticketeira.md §10
-- ============================================================================
--
-- POR QUE EXISTE
--   Hoje a única coisa vendável no site é `event_lots` (lote de ingresso), e o
--   pedido não tem linhas: quem materializa a compra são os `tickets`, um por
--   ingresso. Vender camiseta como lote faria a camiseta nascer com QR válido —
--   a portaria (`collaborator-validate-ticket`) só olha `tickets.status` e
--   marcaria a camiseta como entrada usada, além de somar copo e camiseta na
--   contagem de público. Produto precisa ser outra coisa.
--
-- O DESENHO (decisão do Gabriel, 25/09)
--   O produto é cadastro do PRODUTOR, não do evento — mesmo caminho que
--   `venues` e `seat_types` já seguem: `producer_id`, preço base no cadastro e
--   o valor real definido na hora de usar. Ele cadastra a camiseta uma vez e
--   ATIVA em cada evento, com preço e estoque daquele evento.
--
--       producer_products ──< producer_product_variants   (catálogo e a grade)
--               │
--               └──< event_products ──< event_product_stock  (a ativação)
--                          │
--                          └──< event_bundle_items >── event_bundles
--
--       orders ──< order_product_items                       (venda)
--       orders ──── product_claims (um código por pedido)    (retirada)
--
-- ⚠️ POR QUE `order_product_items` E NÃO `order_items`
--   Esta tabela guarda SÓ as linhas de PRODUTO do pedido. O ingresso continua
--   vivendo em `tickets` (entrega) e `order_line_face` (dinheiro), intocados.
--   Se ela se chamasse `order_items`, quem chegasse depois somaria o pedido
--   inteiro a partir dela e acharia que o ingresso está faltando — erro caro num
--   relatório de repasse. O nome diz o escopo.
--
-- O QUE NÃO MUDA
--   `tickets`, a validação de entrada, o check-in facial, a contagem de
--   participantes e a fórmula `order_producer_value()`. O dinheiro do produto
--   entra no repasse pelo caminho que já existe: a venda grava uma linha em
--   `order_line_face` com `lot_id` NULO e o nome do produto, e a fórmula soma
--   face por face sem saber o que é ingresso e o que é camiseta.
--
-- ⚠️ A ÚNICA MUDANÇA EM PEÇA VIVA: `apply_order_approved`
--   Ela recusa promover pedido sem ingresso (trava que nasceu do incidente de
--   pago-sem-ticket). Pedido só de produto não tem ingresso, então a trava passa
--   a ser "sem ingresso E sem produto". Para pedido sem produto, o caminho é
--   byte a byte o de antes.
--
-- COMO VOLTAR ATRÁS
--   1. Desfazer as 3 trocas de texto em `apply_order_approved` (seção 11 traz
--      o bloco inverso pronto, comentado).
--   2. DROP dos 2 gatilhos (em `orders` e em `order_product_items`), das 8
--      tabelas e das funções criadas aqui.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CATÁLOGO DO PRODUTOR
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.producer_products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id   uuid NOT NULL,
  -- 'camiseta' abre grade de tamanhos e cor; 'copo' não pede variação;
  -- 'outro' deixa o produtor nomear as próprias variações. É DADO, não código:
  -- tipo novo (boné, caneca, kit) entra por linha, sem subir versão.
  kind          text NOT NULL DEFAULT 'outro',
  name          text NOT NULL,
  color         text,
  description   text,
  image_url     text,
  -- Sugestão. O preço que vale é o de `event_products.price`, como em seat_types.
  base_price    numeric(10,2),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producer_products_kind_ck CHECK (kind IN ('camiseta','copo','outro')),
  CONSTRAINT producer_products_name_ck CHECK (length(btrim(name)) > 0),
  CONSTRAINT producer_products_base_price_ck CHECK (base_price IS NULL OR base_price >= 0)
);

CREATE INDEX IF NOT EXISTS producer_products_producer_idx
  ON public.producer_products (producer_id) WHERE is_active;

COMMENT ON TABLE public.producer_products IS
  'Catálogo de produtos do produtor (camiseta, copo, outro). Reusado entre eventos, como venues e seat_types. O preço real é o da ativação em event_products.';

-- A grade. NÃO tem estoque: estoque é por evento (event_product_stock).
CREATE TABLE IF NOT EXISTS public.producer_product_variants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.producer_products(id) ON DELETE CASCADE,
  label         text NOT NULL,
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producer_product_variants_label_ck CHECK (length(btrim(label)) > 0),
  CONSTRAINT producer_product_variants_uq UNIQUE (product_id, label)
);

CREATE INDEX IF NOT EXISTS producer_product_variants_product_idx
  ON public.producer_product_variants (product_id, sort_order);

COMMENT ON TABLE public.producer_product_variants IS
  'Variações do produto (PP..EG). Sem estoque de propósito — o estoque é de cada evento.';

-- ----------------------------------------------------------------------------
-- 2. A ATIVAÇÃO NO EVENTO
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES public.producer_products(id) ON DELETE RESTRICT,
  price             numeric(10,2),
  -- Espelha event_lots.modo_taxa. 'herda' = mesma taxa do ingresso do evento
  -- (padrão, e é o que Sympla e Eventbrite fazem). A decisão do Gabriel sobre
  -- cobrar ou não os 10% sobre produto é ESTE CAMPO — configuração, não deploy.
  modo_taxa         text NOT NULL DEFAULT 'herda',
  -- Como o comprador recebe. Obrigatório para ativar: sem isso a pessoa compra
  -- e ninguém sabe onde ela pega.
  fulfillment       text,
  fulfillment_info  text,
  status            text NOT NULL DEFAULT 'draft',
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_products_uq UNIQUE (event_id, product_id),
  CONSTRAINT event_products_status_ck CHECK (status IN ('draft','active','paused')),
  CONSTRAINT event_products_modo_taxa_ck CHECK (modo_taxa IN ('herda','cliente_paga','absorve')),
  CONSTRAINT event_products_fulfillment_ck
    CHECK (fulfillment IS NULL OR fulfillment IN ('retirada_evento','retirada_antes','entrega')),
  CONSTRAINT event_products_price_ck CHECK (price IS NULL OR price >= 0)
);

CREATE INDEX IF NOT EXISTS event_products_event_idx
  ON public.event_products (event_id, sort_order);

COMMENT ON TABLE public.event_products IS
  'Ativação de um produto do catálogo em um evento: preço, taxa, forma de entrega e estado. status=active só passa pela trava de event_products_validar_ativacao().';

-- Estoque daquele evento. variant_id NULL = estoque único do produto inteiro
-- (o modo "1.000 camisetas, tanto faz o tamanho" que o RunSignup oferece, e o
-- que a Porcada usa: a camiseta é feita sob encomenda, o tamanho é escolha e
-- não limite).
CREATE TABLE IF NOT EXISTS public.event_product_stock (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_product_id   uuid NOT NULL REFERENCES public.event_products(id) ON DELETE CASCADE,
  variant_id         uuid REFERENCES public.producer_product_variants(id) ON DELETE RESTRICT,
  total_quantity     integer NOT NULL DEFAULT 0,
  sold_quantity      integer NOT NULL DEFAULT 0,
  reserved_quantity  integer NOT NULL DEFAULT 0,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_product_stock_qty_ck CHECK (
    total_quantity >= 0 AND sold_quantity >= 0 AND reserved_quantity >= 0
  )
);

-- Uma linha por variação, e no máximo uma linha "global" por ativação.
CREATE UNIQUE INDEX IF NOT EXISTS event_product_stock_variant_uq
  ON public.event_product_stock (event_product_id, variant_id) WHERE variant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS event_product_stock_global_uq
  ON public.event_product_stock (event_product_id) WHERE variant_id IS NULL;

COMMENT ON TABLE public.event_product_stock IS
  'Estoque do produto NESTE evento. variant_id NULL = estoque único (tamanho é escolha, não limite).';

-- ----------------------------------------------------------------------------
-- 3. COMBOS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_bundles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  price        numeric(10,2) NOT NULL,
  status       text NOT NULL DEFAULT 'draft',
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_bundles_name_ck CHECK (length(btrim(name)) > 0),
  CONSTRAINT event_bundles_price_ck CHECK (price >= 0),
  CONSTRAINT event_bundles_status_ck CHECK (status IN ('draft','active','paused'))
);

CREATE INDEX IF NOT EXISTS event_bundles_event_idx
  ON public.event_bundles (event_id, sort_order);

COMMENT ON TABLE public.event_bundles IS
  'Combo com preço próprio (NÃO é a soma das partes: convite 90 + camiseta 67 = 157, e o combo custa 150). Aceita receita sem ingresso — é o "copo + camiseta R$ 70" para quem já comprou o convite.';

CREATE TABLE IF NOT EXISTS public.event_bundle_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id         uuid NOT NULL REFERENCES public.event_bundles(id) ON DELETE CASCADE,
  kind              text NOT NULL,
  lot_id            uuid REFERENCES public.event_lots(id) ON DELETE RESTRICT,
  event_product_id  uuid REFERENCES public.event_products(id) ON DELETE RESTRICT,
  quantity          integer NOT NULL DEFAULT 1,
  -- Quanto do preço do combo cabe a ESTA linha. É o número que vai para o
  -- repasse e para o relatório — por isso quem monta o combo decide, vendo a
  -- conta na tela, em vez de o sistema ratear por fora.
  unit_face_share   numeric(10,2) NOT NULL,
  CONSTRAINT event_bundle_items_kind_ck CHECK (kind IN ('lot','product')),
  CONSTRAINT event_bundle_items_qty_ck CHECK (quantity > 0),
  CONSTRAINT event_bundle_items_share_ck CHECK (unit_face_share >= 0),
  -- Cada linha aponta para exatamente uma coisa.
  CONSTRAINT event_bundle_items_alvo_ck CHECK (
    (kind = 'lot'     AND lot_id IS NOT NULL AND event_product_id IS NULL) OR
    (kind = 'product' AND event_product_id IS NOT NULL AND lot_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS event_bundle_items_bundle_idx
  ON public.event_bundle_items (bundle_id);

-- ----------------------------------------------------------------------------
-- 4. VENDA E RETIRADA
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_product_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_product_id  uuid NOT NULL REFERENCES public.event_products(id) ON DELETE RESTRICT,
  stock_id          uuid NOT NULL REFERENCES public.event_product_stock(id) ON DELETE RESTRICT,
  -- O tamanho que a pessoa escolheu. Pode diferir da linha de estoque: com
  -- estoque único (stock.variant_id NULL) o tamanho é escolha, não limite, e
  -- ainda assim o produtor precisa saber quantas G mandar fazer.
  variant_id        uuid REFERENCES public.producer_product_variants(id) ON DELETE RESTRICT,
  bundle_id         uuid REFERENCES public.event_bundles(id) ON DELETE SET NULL,
  quantity          integer NOT NULL DEFAULT 1,
  -- Valor de face desta linha, capturado no ato: o que o produtor recebe, sem
  -- taxa e sem juro. Mesmo princípio de order_line_face.
  unit_face         numeric(10,2) NOT NULL,
  -- Cópia do rótulo no momento da venda ("Camiseta branca · G"). Se o produtor
  -- renomear o produto depois, o pedido antigo continua contando a história
  -- certa. É a mesma razão de order_line_face guardar lot_name.
  label_snapshot    text,
  -- Máquina de estados do ESTOQUE desta linha. É ela que torna cada movimento
  -- de estoque único: reservar, vender, liberar e devolver só acontecem uma vez,
  -- não importa quantas rotinas tentem (expiração, recusa, reconciliação).
  --   reserved → sold      (pedido pago)
  --   reserved → released  (pedido expirou, falhou ou foi apagado)
  --   sold     → returned  (pedido pago foi reembolsado ou cancelado)
  stock_state       text NOT NULL DEFAULT 'reserved',
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_product_items_qty_ck CHECK (quantity > 0),
  CONSTRAINT order_product_items_face_ck CHECK (unit_face >= 0),
  CONSTRAINT order_product_items_state_ck CHECK (stock_state IN ('reserved','sold','released','returned'))
);

CREATE INDEX IF NOT EXISTS order_product_items_order_idx
  ON public.order_product_items (order_id);
CREATE INDEX IF NOT EXISTS order_product_items_event_product_idx
  ON public.order_product_items (event_product_id);

COMMENT ON TABLE public.order_product_items IS
  'Linhas de PRODUTO de um pedido. O ingresso NÃO está aqui: ele vive em tickets (entrega) e order_line_face (dinheiro). stock_state garante que cada movimento de estoque aconteça uma vez só.';

-- O comprovante de retirada: UM código por pedido. A pessoa dita um código no
-- balcão e quem atende vê tudo o que ela comprou (camiseta G x2, copo x1).
-- Mesmo princípio do abadá (collaborator-redeem-abada): marca a entrega SEM
-- consumir o ingresso, fora da janela de check-in, e a baixa é atômica.
CREATE TABLE IF NOT EXISTS public.product_claims (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  claim_code    text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'pending',
  picked_up_at  timestamptz,
  -- Quem entregou: id do produtor (auth) ou do colaborador. Texto livre no
  -- nome porque os dois vivem em tabelas diferentes.
  picked_up_by       uuid,
  picked_up_by_name  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_claims_status_ck CHECK (status IN ('pending','picked_up','cancelled'))
);

CREATE INDEX IF NOT EXISTS product_claims_event_idx
  ON public.product_claims (event_id, status);

COMMENT ON TABLE public.product_claims IS
  'Comprovante de retirada de produto, um por pedido. A baixa NÃO toca em tickets.status: a pessoa pega a camiseta de tarde e entra à noite.';

-- ----------------------------------------------------------------------------
-- 5. A TRAVA DE ATIVAÇÃO ("não pode ser só ele ali")
-- ----------------------------------------------------------------------------
-- A tela mostra a lista do que falta e mantém o botão apagado; esta função é a
-- mesma regra do lado do servidor, para o estado impossível não existir no banco
-- nem por chamada direta.

-- A conta em si. Recebe os valores em vez de ler a linha, para que o gatilho
-- possa julgar a linha COMO ELA VAI FICAR: quem salva preço, forma de entrega
-- e "ativar" no mesmo clique não pode ser recusado por causa do valor antigo
-- (pego no ensaio de 01/10).
CREATE OR REPLACE FUNCTION public.event_product_faltas(
  _event_product_id uuid, _product_id uuid, _price numeric, _fulfillment text
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _imagem  text;
  -- array_append, e não `||`: com texto solto à direita o Postgres tenta ler
  -- 'preco' como um array e a função morre (pego no ensaio de 01/10).
  _faltas  text[] := '{}';
  _linhas  int;
  _sem_qtd int;
BEGIN
  IF _price IS NULL OR _price <= 0 THEN
    _faltas := array_append(_faltas, 'preco');
  END IF;

  SELECT image_url INTO _imagem FROM public.producer_products WHERE id = _product_id;
  IF _imagem IS NULL OR length(btrim(_imagem)) = 0 THEN
    _faltas := array_append(_faltas, 'foto');
  END IF;

  IF _fulfillment IS NULL THEN
    _faltas := array_append(_faltas, 'como_entrega');
  END IF;

  SELECT count(*), count(*) FILTER (WHERE total_quantity <= 0)
    INTO _linhas, _sem_qtd
    FROM public.event_product_stock
   WHERE event_product_id = _event_product_id AND is_active;

  IF _linhas = 0 THEN
    _faltas := array_append(_faltas, 'estoque');
  ELSIF _sem_qtd > 0 THEN
    -- Tamanho exibido sem quantidade é o que gera "comprei e não tinha".
    -- Ou preenche, ou tira o tamanho deste evento.
    _faltas := array_append(_faltas, 'estoque_incompleto');
  END IF;

  RETURN _faltas;
END $function$;

CREATE OR REPLACE FUNCTION public.event_product_pendencias(_event_product_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _ep public.event_products;
BEGIN
  SELECT * INTO _ep FROM public.event_products WHERE id = _event_product_id;
  IF NOT FOUND THEN RETURN ARRAY['produto_nao_encontrado']; END IF;
  RETURN public.event_product_faltas(_ep.id, _ep.product_id, _ep.price, _ep.fulfillment);
END $function$;

COMMENT ON FUNCTION public.event_product_pendencias(uuid) IS
  'O que falta para o produto poder ir à venda. A tela lê isto para listar as pendências em vez de só recusar.';

CREATE OR REPLACE FUNCTION public.event_products_validar_ativacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _faltas text[];
BEGIN
  -- No INSERT o estoque ainda não existe, então não há como estar completo.
  -- Produto nasce em rascunho e é ativado depois; dizer isso é melhor do que
  -- deixar a validação falhar com uma lista que não ensina nada a quem chamou.
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    RAISE EXCEPTION 'Produto nasce como rascunho: cadastre preço, estoque e a forma de entrega antes de ativar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    _faltas := public.event_product_faltas(NEW.id, NEW.product_id, NEW.price, NEW.fulfillment);
    IF array_length(_faltas, 1) > 0 THEN
      RAISE EXCEPTION 'Produto incompleto para ativar: %', array_to_string(_faltas, ', ')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_event_products_validar_ativacao ON public.event_products;
CREATE TRIGGER trg_event_products_validar_ativacao
  BEFORE INSERT OR UPDATE ON public.event_products
  FOR EACH ROW EXECUTE FUNCTION public.event_products_validar_ativacao();

-- ----------------------------------------------------------------------------
-- 6. ESTOQUE COM TRAVA ATÔMICA (espelha reserve_lot_quantity)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_product_quantity(_stock_id uuid, _qty integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _ok int;
BEGIN
  IF _qty <= 0 THEN RETURN false; END IF;
  PERFORM set_config('loja.movimento_de_estoque', 'on', true);
  UPDATE public.event_product_stock
     SET reserved_quantity = reserved_quantity + _qty
   WHERE id = _stock_id
     AND is_active = true
     AND (sold_quantity + reserved_quantity + _qty) <= total_quantity;
  GET DIAGNOSTICS _ok = ROW_COUNT;
  RETURN _ok = 1;
END $function$;

CREATE OR REPLACE FUNCTION public.release_product_quantity(_stock_id uuid, _qty integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _ok int;
BEGIN
  IF _qty <= 0 THEN RETURN false; END IF;
  PERFORM set_config('loja.movimento_de_estoque', 'on', true);
  UPDATE public.event_product_stock
     SET reserved_quantity = GREATEST(reserved_quantity - _qty, 0)
   WHERE id = _stock_id;
  GET DIAGNOSTICS _ok = ROW_COUNT;
  RETURN _ok = 1;
END $function$;

CREATE OR REPLACE FUNCTION public.confirm_product_sale(_stock_id uuid, _qty integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _ok int;
BEGIN
  IF _qty <= 0 THEN RETURN false; END IF;
  PERFORM set_config('loja.movimento_de_estoque', 'on', true);
  UPDATE public.event_product_stock
     SET sold_quantity    = sold_quantity + _qty,
         reserved_quantity = GREATEST(reserved_quantity - _qty, 0)
   WHERE id = _stock_id;
  GET DIAGNOSTICS _ok = ROW_COUNT;
  RETURN _ok = 1;
END $function$;

-- ⚠️ DROP+CREATE devolve EXECUTE ao public (lição do event_seats, 08/2026).
-- Estas três mexem em estoque de venda: só o servidor chama.
REVOKE ALL ON FUNCTION public.reserve_product_quantity(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_product_quantity(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_product_sale(uuid, integer)     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_product_quantity(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_product_quantity(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_product_sale(uuid, integer)     TO service_role;

-- A checagem de pendências é leitura e a tela do produtor precisa dela.
REVOKE ALL ON FUNCTION public.event_product_faltas(uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.event_products_validar_ativacao() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.event_product_pendencias(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_product_pendencias(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. RLS
-- ----------------------------------------------------------------------------

ALTER TABLE public.producer_products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producer_product_variants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_product_stock        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_bundles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_bundle_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_product_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_claims             ENABLE ROW LEVEL SECURITY;

-- Catálogo: só o dono, igual a seat_types_owner_all / venues_owner_all.
DROP POLICY IF EXISTS producer_products_owner_all ON public.producer_products;
CREATE POLICY producer_products_owner_all ON public.producer_products
  FOR ALL USING (producer_id = auth.uid()) WITH CHECK (producer_id = auth.uid());

DROP POLICY IF EXISTS producer_products_admin_all ON public.producer_products;
CREATE POLICY producer_products_admin_all ON public.producer_products
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Quem compra precisa ver nome, cor e foto do que está à venda: leitura pública
-- APENAS do produto que está ativo em algum evento publicado.
DROP POLICY IF EXISTS producer_products_public_select ON public.producer_products;
CREATE POLICY producer_products_public_select ON public.producer_products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.event_products ep
        JOIN public.events e ON e.id = ep.event_id
       WHERE ep.product_id = producer_products.id
         AND ep.status = 'active'
         AND e.status = 'published'
    )
  );

DROP POLICY IF EXISTS producer_product_variants_owner_all ON public.producer_product_variants;
CREATE POLICY producer_product_variants_owner_all ON public.producer_product_variants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.producer_products p
             WHERE p.id = producer_product_variants.product_id AND p.producer_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.producer_products p
             WHERE p.id = producer_product_variants.product_id AND p.producer_id = auth.uid())
  );

DROP POLICY IF EXISTS producer_product_variants_public_select ON public.producer_product_variants;
CREATE POLICY producer_product_variants_public_select ON public.producer_product_variants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.event_products ep
        JOIN public.events e ON e.id = ep.event_id
       WHERE ep.product_id = producer_product_variants.product_id
         AND ep.status = 'active'
         AND e.status = 'published'
    )
  );

-- Ativação: o dono do evento manda; o público lê o que está à venda.
-- (Mesmo formato das policies de event_lots.)
DROP POLICY IF EXISTS event_products_owner_all ON public.event_products;
CREATE POLICY event_products_owner_all ON public.event_products
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_products.event_id AND e.producer_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_products.event_id AND e.producer_id = auth.uid())
  );

DROP POLICY IF EXISTS event_products_admin_all ON public.event_products;
CREATE POLICY event_products_admin_all ON public.event_products
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS event_products_public_select ON public.event_products;
CREATE POLICY event_products_public_select ON public.event_products
  FOR SELECT USING (
    status = 'active'
    AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_products.event_id AND e.status = 'published')
  );

DROP POLICY IF EXISTS event_product_stock_owner_all ON public.event_product_stock;
CREATE POLICY event_product_stock_owner_all ON public.event_product_stock
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.event_products ep JOIN public.events e ON e.id = ep.event_id
             WHERE ep.id = event_product_stock.event_product_id AND e.producer_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.event_products ep JOIN public.events e ON e.id = ep.event_id
             WHERE ep.id = event_product_stock.event_product_id AND e.producer_id = auth.uid())
  );

-- O público vê o estoque para saber o que esgotou (tamanho riscado na tela).
DROP POLICY IF EXISTS event_product_stock_public_select ON public.event_product_stock;
CREATE POLICY event_product_stock_public_select ON public.event_product_stock
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.event_products ep JOIN public.events e ON e.id = ep.event_id
             WHERE ep.id = event_product_stock.event_product_id
               AND ep.status = 'active' AND e.status = 'published')
  );

DROP POLICY IF EXISTS event_bundles_owner_all ON public.event_bundles;
CREATE POLICY event_bundles_owner_all ON public.event_bundles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_bundles.event_id AND e.producer_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_bundles.event_id AND e.producer_id = auth.uid())
  );

DROP POLICY IF EXISTS event_bundles_public_select ON public.event_bundles;
CREATE POLICY event_bundles_public_select ON public.event_bundles
  FOR SELECT USING (
    status = 'active'
    AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_bundles.event_id AND e.status = 'published')
  );

DROP POLICY IF EXISTS event_bundle_items_owner_all ON public.event_bundle_items;
CREATE POLICY event_bundle_items_owner_all ON public.event_bundle_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.event_bundles b JOIN public.events e ON e.id = b.event_id
             WHERE b.id = event_bundle_items.bundle_id AND e.producer_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.event_bundles b JOIN public.events e ON e.id = b.event_id
             WHERE b.id = event_bundle_items.bundle_id AND e.producer_id = auth.uid())
  );

DROP POLICY IF EXISTS event_bundle_items_public_select ON public.event_bundle_items;
CREATE POLICY event_bundle_items_public_select ON public.event_bundle_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.event_bundles b JOIN public.events e ON e.id = b.event_id
             WHERE b.id = event_bundle_items.bundle_id
               AND b.status = 'active' AND e.status = 'published')
  );

-- Linhas de produto do pedido: quem comprou vê as suas; o produtor vê as do
-- evento dele. Escrita é só do servidor (service_role ignora RLS) — o mesmo
-- princípio que vale para tickets.
DROP POLICY IF EXISTS order_product_items_buyer_select ON public.order_product_items;
CREATE POLICY order_product_items_buyer_select ON public.order_product_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_product_items.order_id AND o.user_id = auth.uid())
  );

DROP POLICY IF EXISTS order_product_items_producer_select ON public.order_product_items;
CREATE POLICY order_product_items_producer_select ON public.order_product_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders o JOIN public.events e ON e.id = o.event_id
             WHERE o.id = order_product_items.order_id AND e.producer_id = auth.uid())
  );

DROP POLICY IF EXISTS product_claims_buyer_select ON public.product_claims;
CREATE POLICY product_claims_buyer_select ON public.product_claims
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = product_claims.order_id AND o.user_id = auth.uid())
  );

DROP POLICY IF EXISTS product_claims_producer_select ON public.product_claims;
CREATE POLICY product_claims_producer_select ON public.product_claims
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = product_claims.event_id AND e.producer_id = auth.uid())
  );

-- Admin da plataforma enxerga e conserta tudo (suporte). Catálogo e ativação
-- já têm a deles acima; faltavam estoque, combos, itens e comprovantes.
DROP POLICY IF EXISTS event_product_stock_admin_all ON public.event_product_stock;
CREATE POLICY event_product_stock_admin_all ON public.event_product_stock
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS producer_product_variants_admin_all ON public.producer_product_variants;
CREATE POLICY producer_product_variants_admin_all ON public.producer_product_variants
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS event_bundles_admin_all ON public.event_bundles;
CREATE POLICY event_bundles_admin_all ON public.event_bundles
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS event_bundle_items_admin_all ON public.event_bundle_items;
CREATE POLICY event_bundle_items_admin_all ON public.event_bundle_items
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS order_product_items_admin_select ON public.order_product_items;
CREATE POLICY order_product_items_admin_select ON public.order_product_items
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS product_claims_admin_select ON public.product_claims;
CREATE POLICY product_claims_admin_select ON public.product_claims
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- ----------------------------------------------------------------------------
-- 7b. QUEM MEXE NOS CONTADORES DE ESTOQUE
-- ----------------------------------------------------------------------------
-- O produtor é dono da linha de estoque (define a quantidade total, liga e
-- desliga tamanho), e a policy dele é FOR ALL. Mas `sold_quantity` e
-- `reserved_quantity` são CONTABILIDADE: quem os move é a venda, nunca a tela.
-- Sem esta guarda, uma chamada direta à API zeraria "vendidos" e o sistema
-- venderia de novo o que já foi vendido.
--
-- Como a guarda sabe quem é quem: as funções de venda desta migration ligam
-- uma marca que vale só dentro da transação delas. Sem a marca, quem chega pela
-- API como usuário (logado ou anônimo) tem os dois contadores preservados.

CREATE OR REPLACE FUNCTION public.event_product_stock_guardar_contadores()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _em_venda boolean := COALESCE(current_setting('loja.movimento_de_estoque', true), '') = 'on';
  _pela_api boolean := COALESCE(auth.role(), '') IN ('authenticated', 'anon');
BEGIN
  IF _em_venda OR NOT _pela_api THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.sold_quantity := 0;
    NEW.reserved_quantity := 0;
  ELSE
    NEW.sold_quantity := OLD.sold_quantity;
    NEW.reserved_quantity := OLD.reserved_quantity;
    -- Total abaixo do que já saiu deixaria a conta negativa.
    IF NEW.total_quantity < OLD.sold_quantity + OLD.reserved_quantity THEN
      RAISE EXCEPTION 'A quantidade não pode ser menor que o que já foi vendido ou reservado (%)',
        OLD.sold_quantity + OLD.reserved_quantity USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_event_product_stock_guardar ON public.event_product_stock;
CREATE TRIGGER trg_event_product_stock_guardar
  BEFORE INSERT OR UPDATE ON public.event_product_stock
  FOR EACH ROW EXECUTE FUNCTION public.event_product_stock_guardar_contadores();

REVOKE ALL ON FUNCTION public.event_product_stock_guardar_contadores() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7c. A TRAVA DE ATIVAÇÃO DO COMBO
-- ----------------------------------------------------------------------------
-- A tela mostra a conta e segura o botão; aqui a mesma regra vale no servidor,
-- para o combo quebrado não existir nem por chamada direta.
--   1. tem pelo menos um item;
--   2. a soma das fatias é igual ao preço (senão alguém paga ou recebe a
--      diferença sem saber; a venda também recusa, mas só na hora de cobrar);
--   3. todo produto do combo está à venda neste evento;
--   4. todo ingresso do combo tem de estar À VENDA SOZINHO. É isso que mantém o
--      combo opcional: quem quer só o convite compra só o convite, pelo preço
--      do lote. Condicionar o ingresso à compra de outro produto é a infração
--      do art. 39, I do CDC ("venda casada"); combo de lote que não se vende
--      avulso seria exatamente isso.
--      ⚠️ A regra NÃO é "o evento precisa ter mais de um lote": a Porcada tem um
--      lote só (Convite Solidário, R$ 90), ele é vendido avulso, e o combo
--      "convite + camiseta" é legítimo. O que não pode é o lote estar fechado.

CREATE OR REPLACE FUNCTION public.event_bundles_validar_ativacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _itens int;
  _soma numeric;
  _produtos_fora int;
  _lotes_fechados int;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    RAISE EXCEPTION 'Combo nasce como rascunho: monte os itens antes de ativar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    SELECT count(*), COALESCE(sum(unit_face_share * quantity), 0)
      INTO _itens, _soma
      FROM public.event_bundle_items WHERE bundle_id = NEW.id;

    IF _itens = 0 THEN
      RAISE EXCEPTION 'Combo sem itens não pode ser ativado' USING ERRCODE = 'check_violation';
    END IF;
    IF abs(_soma - NEW.price) > 0.005 THEN
      RAISE EXCEPTION 'A soma das partes (%) é diferente do preço do combo (%)', _soma, NEW.price
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO _produtos_fora
      FROM public.event_bundle_items i
      JOIN public.event_products ep ON ep.id = i.event_product_id
     WHERE i.bundle_id = NEW.id AND i.kind = 'product'
       AND (ep.status <> 'active' OR ep.event_id <> NEW.event_id);
    IF _produtos_fora > 0 THEN
      RAISE EXCEPTION 'Há produto no combo que não está à venda neste evento'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO _lotes_fechados
      FROM public.event_bundle_items i
      JOIN public.event_lots l ON l.id = i.lot_id
     WHERE i.bundle_id = NEW.id AND i.kind = 'lot'
       AND (l.event_id <> NEW.event_id
            OR l.is_active = false
            OR COALESCE(l.manually_sold_out, false) = true
            OR (l.sold_quantity + l.reserved_quantity) >= l.total_quantity);
    IF _lotes_fechados > 0 THEN
      RAISE EXCEPTION 'Há ingresso no combo que não está à venda sozinho. O ingresso tem de continuar disponível avulso'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_event_bundles_validar_ativacao ON public.event_bundles;
CREATE TRIGGER trg_event_bundles_validar_ativacao
  BEFORE INSERT OR UPDATE ON public.event_bundles
  FOR EACH ROW EXECUTE FUNCTION public.event_bundles_validar_ativacao();

REVOKE ALL ON FUNCTION public.event_bundles_validar_ativacao() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. CÓDIGO DE RETIRADA
-- ----------------------------------------------------------------------------
-- Curto e legível em voz alta, porque alguém vai ditar isso no balcão.
-- Sem I, O, 0 e 1, que se confundem na leitura.

CREATE OR REPLACE FUNCTION public.gerar_codigo_retirada()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $function$
DECLARE
  _alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _codigo text;
  _i int;
  _tentativa int := 0;
BEGIN
  LOOP
    _codigo := '';
    FOR _i IN 1..8 LOOP
      _codigo := _codigo || substr(_alfabeto, 1 + floor(random() * length(_alfabeto))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.product_claims WHERE claim_code = _codigo);
    _tentativa := _tentativa + 1;
    IF _tentativa > 20 THEN
      RAISE EXCEPTION 'Não foi possível gerar código de retirada';
    END IF;
  END LOOP;
  RETURN _codigo;
END $function$;

ALTER TABLE public.product_claims
  ALTER COLUMN claim_code SET DEFAULT public.gerar_codigo_retirada();

REVOKE ALL ON FUNCTION public.gerar_codigo_retirada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_codigo_retirada() TO service_role;


-- ----------------------------------------------------------------------------
-- 9. O ESTOQUE DO PRODUTO ACOMPANHA O PEDIDO (sozinho, e uma vez só)
-- ----------------------------------------------------------------------------
-- Pedido muda de estado por MUITAS portas: a cobrança que falha, a varredura
-- que expira, o webhook, a reconciliação, o cancelamento pelo produtor, o
-- reembolso feito à mão. Ensinar cada uma delas a mexer no estoque do produto
-- é o tipo de coisa que funciona até alguém criar a nona porta. Aqui o estoque
-- segue o `orders.status` por gatilho, e `stock_state` garante que cada
-- movimento só acontece uma vez.

CREATE OR REPLACE FUNCTION public.order_products_liberar(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _n int := 0;
BEGIN
  PERFORM set_config('loja.movimento_de_estoque', 'on', true);
  WITH movidos AS (
    UPDATE public.order_product_items
       SET stock_state = 'released'
     WHERE order_id = _order_id AND stock_state = 'reserved'
    RETURNING stock_id, quantity
  ), por_estoque AS (
    SELECT stock_id, sum(quantity)::int AS q FROM movidos GROUP BY stock_id
  ), baixa AS (
    UPDATE public.event_product_stock s
       SET reserved_quantity = GREATEST(0, s.reserved_quantity - p.q)
      FROM por_estoque p
     WHERE s.id = p.stock_id
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM baixa;
  RETURN _n;
END $function$;

CREATE OR REPLACE FUNCTION public.order_products_confirmar(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _n int := 0; _event_id uuid;
BEGIN
  PERFORM set_config('loja.movimento_de_estoque', 'on', true);
  WITH movidos AS (
    UPDATE public.order_product_items
       SET stock_state = 'sold'
     WHERE order_id = _order_id AND stock_state = 'reserved'
    RETURNING stock_id, quantity
  ), por_estoque AS (
    SELECT stock_id, sum(quantity)::int AS q FROM movidos GROUP BY stock_id
  ), baixa AS (
    UPDATE public.event_product_stock s
       SET sold_quantity     = s.sold_quantity + p.q,
           reserved_quantity = GREATEST(0, s.reserved_quantity - p.q)
      FROM por_estoque p
     WHERE s.id = p.stock_id
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM baixa;

  -- O código de retirada nasce quando o pedido é pago, e só se há produto
  -- vendido nele. ON CONFLICT: a reconciliação pode passar aqui de novo.
  IF EXISTS (SELECT 1 FROM public.order_product_items
              WHERE order_id = _order_id AND stock_state = 'sold') THEN
    SELECT event_id INTO _event_id FROM public.orders WHERE id = _order_id;
    INSERT INTO public.product_claims (order_id, event_id)
    VALUES (_order_id, _event_id)
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN _n;
END $function$;

CREATE OR REPLACE FUNCTION public.order_products_devolver(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _n int := 0;
BEGIN
  -- Produto que já foi entregue não volta para a prateleira por causa de um
  -- reembolso: a camiseta está com a pessoa. Só devolve o que não foi retirado.
  IF EXISTS (SELECT 1 FROM public.product_claims
              WHERE order_id = _order_id AND status = 'picked_up') THEN
    RETURN 0;
  END IF;

  PERFORM set_config('loja.movimento_de_estoque', 'on', true);
  WITH movidos AS (
    UPDATE public.order_product_items
       SET stock_state = 'returned'
     WHERE order_id = _order_id AND stock_state = 'sold'
    RETURNING stock_id, quantity
  ), por_estoque AS (
    SELECT stock_id, sum(quantity)::int AS q FROM movidos GROUP BY stock_id
  ), baixa AS (
    UPDATE public.event_product_stock s
       SET sold_quantity = GREATEST(0, s.sold_quantity - p.q)
      FROM por_estoque p
     WHERE s.id = p.stock_id
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM baixa;

  UPDATE public.product_claims SET status = 'cancelled'
   WHERE order_id = _order_id AND status = 'pending';
  RETURN _n;
END $function$;

CREATE OR REPLACE FUNCTION public.orders_produtos_acompanham_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Sai cedo: pedido sem produto (hoje, todos) não paga nada além deste EXISTS
  -- num índice.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.order_product_items WHERE order_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- ⚠️ NUNCA derruba a mudança de estado do pedido. Um erro aqui é estoque de
  -- camiseta desalinhado; abortar seria desfazer a aprovação de uma venda
  -- paga. Engole, registra e segue. É a regra do gatilho da Meta (item 124).
  BEGIN
    IF NEW.status = 'paid' THEN
      PERFORM public.order_products_confirmar(NEW.id);
    ELSIF OLD.status = 'paid' THEN
      PERFORM public.order_products_devolver(NEW.id);
    ELSE
      -- pending → expired / failed / cancelled / qualquer estado final
      PERFORM public.order_products_liberar(NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
      VALUES ('95628c4a-8040-44ed-83c5-d6a5b8793926', 'order_products_estoque_falhou', 'order', NEW.id,
              jsonb_build_object('de', OLD.status, 'para', NEW.status, 'erro', SQLERRM));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_orders_produtos_status ON public.orders;
CREATE TRIGGER trg_orders_produtos_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_produtos_acompanham_status();

-- Pedido APAGADO (as edges apagam o pedido quando a criação falha no meio):
-- a linha some por cascata, e a reserva tem de voltar junto.
CREATE OR REPLACE FUNCTION public.order_product_items_ao_apagar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.stock_state = 'reserved' THEN
    PERFORM set_config('loja.movimento_de_estoque', 'on', true);
    UPDATE public.event_product_stock
       SET reserved_quantity = GREATEST(0, reserved_quantity - OLD.quantity)
     WHERE id = OLD.stock_id;
  END IF;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS trg_order_product_items_ao_apagar ON public.order_product_items;
CREATE TRIGGER trg_order_product_items_ao_apagar
  BEFORE DELETE ON public.order_product_items
  FOR EACH ROW EXECUTE FUNCTION public.order_product_items_ao_apagar();

REVOKE ALL ON FUNCTION public.order_products_liberar(uuid)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_products_confirmar(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_products_devolver(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orders_produtos_acompanham_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_product_items_ao_apagar()     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_products_liberar(uuid)   TO service_role;
GRANT EXECUTE ON FUNCTION public.order_products_confirmar(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.order_products_devolver(uuid)  TO service_role;

-- ----------------------------------------------------------------------------
-- 10. RETIRADA PELO PAINEL DO PRODUTOR
-- ----------------------------------------------------------------------------
-- O dono do evento (ou admin) dá baixa pelo código. Baixa atômica: o UPDATE
-- condicionado ao estado 'pending' é quem decide; a segunda tentativa recebe
-- "já retirado" com a hora e o nome de quem entregou.

CREATE OR REPLACE FUNCTION public.retirar_produto(_claim_code text, _event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _claim public.product_claims;
  _nome text;
  _ok int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id AND e.producer_id = _uid)
    OR public.has_role(_uid, 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _claim FROM public.product_claims
   WHERE claim_code = upper(btrim(_claim_code)) AND event_id = _event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrado');
  END IF;
  IF _claim.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cancelado');
  END IF;

  SELECT COALESCE(nome_completo, 'Produtor') INTO _nome FROM public.profiles WHERE id = _uid;

  UPDATE public.product_claims
     SET status = 'picked_up', picked_up_at = now(),
         picked_up_by = _uid, picked_up_by_name = COALESCE(_nome, 'Produtor')
   WHERE id = _claim.id AND status = 'pending';
  GET DIAGNOSTICS _ok = ROW_COUNT;

  IF _ok = 0 THEN
    SELECT * INTO _claim FROM public.product_claims WHERE id = _claim.id;
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_retirado',
                              'quando', _claim.picked_up_at, 'por', _claim.picked_up_by_name);
  END IF;
  RETURN jsonb_build_object('ok', true, 'order_id', _claim.order_id);
END $function$;

REVOKE ALL ON FUNCTION public.retirar_produto(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retirar_produto(text, uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 11. apply_order_approved: pedido só de produto pode ser pago
-- ----------------------------------------------------------------------------
-- A função é a peça mais sensível do site (toda venda passa por ela) e as
-- migrations locais não têm a versão que está em produção. Copiar 200 linhas à
-- mão para trocar duas condições seria o jeito mais fácil de introduzir uma
-- diferença que ninguém pediu. Então a mudança é feita EM CIMA da definição que
-- está no banco: três trocas de texto, cada uma conferida pela contagem, e
-- qualquer surpresa aborta a migration inteira sem tocar em nada.
--
--   1. declara `_tem_produtos`
--   2. preenche `_tem_produtos` antes do primeiro IF de estado
--   3. as DUAS travas "IF _total_tickets = 0 THEN" viram
--      "IF _total_tickets = 0 AND NOT _tem_produtos THEN"
--
-- CREATE OR REPLACE com a mesma assinatura: os grants ficam como estão.
-- Pedido sem produto: `_tem_produtos` é falso e o caminho é o de antes.

DO $migracao$
DECLARE
  _def  text;
  _novo text;
  _conta int;
BEGIN
  SELECT pg_get_functiondef('public.apply_order_approved(uuid,text)'::regprocedure) INTO _def;

  IF position('_tem_produtos' in _def) > 0 THEN
    RAISE NOTICE 'apply_order_approved já conhece produtos; nada a fazer';
    RETURN;
  END IF;

  _conta := (length(_def) - length(replace(_def, 'IF _total_tickets = 0 THEN', ''))) / length('IF _total_tickets = 0 THEN');
  IF _conta <> 2 THEN RAISE EXCEPTION 'apply_order_approved mudou: esperava 2 travas de ingresso, achei %', _conta; END IF;
  _conta := (length(_def) - length(replace(_def, 'IF _order.status = ''pending'' THEN', ''))) / length('IF _order.status = ''pending'' THEN');
  IF _conta <> 1 THEN RAISE EXCEPTION 'apply_order_approved mudou: esperava 1 IF de pendente, achei %', _conta; END IF;
  _conta := (length(_def) - length(replace(_def, '_flagged int := 0;', ''))) / length('_flagged int := 0;');
  IF _conta <> 1 THEN RAISE EXCEPTION 'apply_order_approved mudou: esperava 1 declaração de _flagged, achei %', _conta; END IF;

  _novo := replace(_def, '_flagged int := 0;',
    '_flagged int := 0;' || E'\n  _tem_produtos boolean := false;');
  _novo := replace(_novo, 'IF _order.status = ''pending'' THEN',
    '-- Loja do produtor (01/10/2026): pedido só de produto não tem ingresso.' || E'\n  ' ||
    'SELECT EXISTS (SELECT 1 FROM public.order_product_items WHERE order_id = _order_id) INTO _tem_produtos;' || E'\n\n  ' ||
    'IF _order.status = ''pending'' THEN');
  _novo := replace(_novo, 'IF _total_tickets = 0 THEN', 'IF _total_tickets = 0 AND NOT _tem_produtos THEN');

  EXECUTE _novo;
END
$migracao$;

-- PARA VOLTAR ATRÁS (rodar à mão):
--   DO $$ DECLARE _d text; BEGIN
--     SELECT pg_get_functiondef('public.apply_order_approved(uuid,text)'::regprocedure) INTO _d;
--     _d := replace(_d, 'IF _total_tickets = 0 AND NOT _tem_produtos THEN', 'IF _total_tickets = 0 THEN');
--     EXECUTE _d;
--   END $$;
--   (a variável e o SELECT que sobram são inofensivos; a trava volta a ser a de antes)
