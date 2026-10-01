// Preço do carrinho na rota do Marcel — um lugar só, usado pelo PIX e pelo cartão.
//
// POR QUE COMPARTILHADO
//   Se cada meio de pagamento calcular por conta própria, o mesmo lote sai por
//   preços diferentes no PIX e no cartão. Não é hipótese: as duas edges do
//   Mercado Pago carregam a mesma conta copiada, e manter as duas em sincronia
//   virou um comentário de aviso em cada uma. Aqui a conta é uma só.
//
// O QUE ELE NÃO FAZ
//   Não decide taxa de processamento — essa é do cartão e sai da tabela de
//   custo do crédito (`opcoes_parcelamento`). Aqui para no subtotal: o que o
//   produtor recebe mais a taxa administrativa da plataforma.

export const DEFAULT_FEE_PERCENT = 10;

export interface LinhaCarrinho {
  /** Lote que vale TODAS as noites (passe permanente do rodeio). Falso em
   *  evento comum — é a coluna `covers_all_days`, que só o rodeio preenche. */
  cobreTodosOsDias?: boolean;
  lotId: string;
  lotName: string;
  quantity: number;
  price: number;
  modoTaxa: string;
  /** Teto de parcelas do lote (`event_lots.max_parcelas`). Nulo = sem teto próprio. */
  maxParcelas?: number | null;
  /** Quantas parcelas o produtor absorve. Acima disso o juro vai para o comprador. */
  parcelasSemJuros?: number | null;
  /** Preenchido quando a linha veio de dentro de um combo. Aí `price` é a fatia
   *  do combo que cabe ao ingresso (`unit_face_share`), não o preço do lote. */
  bundleId?: string | null;
}

/** Uma linha de PRODUTO do carrinho (loja do produtor), já resolvida no banco. */
export interface LinhaProduto {
  eventProductId: string;
  /** Linha de estoque de onde sai a unidade (por tamanho, ou a única do produto). */
  stockId: string;
  /** Tamanho escolhido. Nulo em produto sem grade (copo). */
  variantId: string | null;
  /** "Camiseta branca · G": é o que vai para o pedido, o repasse e a retirada. */
  label: string;
  quantity: number;
  /** Face unitária: preço do produto no evento, ou a fatia dele no combo. */
  price: number;
  modoTaxa: string;
  bundleId: string | null;
}

/** O que a tela manda além dos lotes. Só ids e quantidades: preço, nunca. */
export interface ExtrasDoCarrinho {
  products?: Array<{ eventProductId: string; variantId?: string | null; quantity: number }>;
  bundles?: Array<{
    bundleId: string;
    quantity: number;
    /** Tamanho escolhido para cada produto do combo: { eventProductId: variantId }. */
    escolhas?: Record<string, string | null>;
  }>;
}

export interface PrecoResolvido {
  linhas: LinhaCarrinho[];
  /** Linhas de produto (avulso ou de dentro de combo). Vazio em compra só de ingresso. */
  produtos: LinhaProduto[];
  /** Soma das faces. É o que o produtor recebe. */
  totalFace: number;
  /** Taxa administrativa da plataforma (a "conveniência"). */
  taxaAdministrativa: number;
  /** Desconto do cupom, se houver e se ele estiver válido. */
  desconto: number;
  /** Cupom efetivamente aplicado — null quando não havia ou não valia mais. */
  cupomId: string | null;
  /** face − desconto + taxa administrativa. Base do cartão; total do PIX. */
  subtotal: number;
}

export class CarrinhoInvalido extends Error {
  readonly status: number;
  constructor(msg: string, status = 400) {
    super(msg);
    this.name = 'CarrinhoInvalido';
    this.status = status;
  }
}

async function taxaDoEvento(client: any, eventId: string, metodo: 'pix' | 'card') {
  const { data } = await client
    .from('event_fee_overrides')
    .select('fee_percent, fee_fixed')
    .eq('event_id', eventId)
    .eq('payment_method', metodo)
    .maybeSingle();
  return {
    percent: data ? Number(data.fee_percent) : DEFAULT_FEE_PERCENT,
    fixed: data ? Number(data.fee_fixed) : 0,
  };
}

/**
 * Resolve o preço do carrinho lendo os lotes do BANCO.
 *
 * O preço NUNCA vem do cliente — é a trava contra manipulação, e o princípio
 * está escrito na raiz do projeto: "preço e valor financeiro são sempre
 * server-side".
 */
export async function resolverPreco(
  client: any,
  eventId: string,
  items: Array<{ lotId: string; quantity: number }> | null | undefined,
  metodo: 'pix' | 'card',
  couponId?: string | null,
  extras?: ExtrasDoCarrinho | null,
): Promise<PrecoResolvido> {
  const itensLote = Array.isArray(items) ? items : [];
  const pedidosProduto = Array.isArray(extras?.products) ? extras!.products! : [];
  const pedidosCombo = Array.isArray(extras?.bundles) ? extras!.bundles! : [];

  if (itensLote.length === 0 && pedidosProduto.length === 0 && pedidosCombo.length === 0) {
    throw new CarrinhoInvalido('Carrinho vazio');
  }

  // Quantidade inválida é RECUSADA, não "corrigida" para 1. Antes, pedir 0 ou
  // −5 ingressos criava um pedido de 1 e cobrava por ele: o comprador pediria
  // uma coisa e pagaria por outra. Requisição malformada tem que falhar alto.
  const quantidadeValida = (bruto: unknown, nome: string): number => {
    const qty = Number(bruto);
    if (!Number.isInteger(qty) || qty < 1) {
      throw new CarrinhoInvalido(`Quantidade inválida para "${nome}"`);
    }
    if (qty > 50) {
      // Teto de sanidade: pedido de 10 mil unidades é engano ou abuso, e
      // reservaria o estoque inteiro antes de alguém perceber.
      throw new CarrinhoInvalido(`Quantidade acima do permitido para "${nome}"`);
    }
    return qty;
  };

  // ---- COMBOS: lidos primeiro, porque trazem lotes e produtos para dentro ----
  let combos: any[] = [];
  let itensDeCombo: any[] = [];
  if (pedidosCombo.length > 0) {
    const ids = pedidosCombo.map((b) => b.bundleId);
    const { data: bs, error: eb } = await client
      .from('event_bundles')
      .select('id, name, price, status')
      .in('id', ids)
      .eq('event_id', eventId);
    if (eb || !bs) throw new CarrinhoInvalido('Erro ao buscar combos', 500);
    combos = bs;
    const { data: bi, error: ei } = await client
      .from('event_bundle_items')
      .select('bundle_id, kind, lot_id, event_product_id, quantity, unit_face_share')
      .in('bundle_id', ids);
    if (ei || !bi) throw new CarrinhoInvalido('Erro ao buscar combos', 500);
    itensDeCombo = bi;
  }

  // ---- LOTES: os avulsos e os que vêm dentro de combo, numa leitura só ----
  const lotIds = Array.from(new Set([
    ...itensLote.map((i) => i.lotId),
    ...itensDeCombo.filter((i) => i.kind === 'lot').map((i) => i.lot_id),
  ]));
  let lots: any[] = [];
  if (lotIds.length > 0) {
    const { data, error } = await client
      .from('event_lots')
      .select('id, name, price, is_active, modo_taxa, covers_all_days, max_parcelas, parcelas_sem_juros')
      .in('id', lotIds)
      .eq('event_id', eventId);
    if (error || !data) throw new CarrinhoInvalido('Erro ao buscar lotes', 500);
    lots = data;
  }

  // ---- PRODUTOS: idem, avulsos e de combo ----
  const epIds = Array.from(new Set([
    ...pedidosProduto.map((p) => p.eventProductId),
    ...itensDeCombo.filter((i) => i.kind === 'product').map((i) => i.event_product_id),
  ]));
  let eps: any[] = [];
  let catalogo: any[] = [];
  let variantes: any[] = [];
  let estoques: any[] = [];
  if (epIds.length > 0) {
    const { data: e1, error: x1 } = await client
      .from('event_products')
      .select('id, product_id, price, modo_taxa, status')
      .in('id', epIds)
      .eq('event_id', eventId);
    if (x1 || !e1) throw new CarrinhoInvalido('Erro ao buscar produtos', 500);
    eps = e1;
    const productIds = Array.from(new Set(eps.map((e) => e.product_id)));
    if (productIds.length > 0) {
      const [{ data: c1, error: x2 }, { data: v1, error: x3 }, { data: s1, error: x4 }] = await Promise.all([
        client.from('producer_products').select('id, name, color').in('id', productIds),
        client.from('producer_product_variants').select('id, product_id, label, is_active').in('product_id', productIds),
        client.from('event_product_stock').select('id, event_product_id, variant_id, is_active').in('event_product_id', epIds),
      ]);
      if (x2 || x3 || x4 || !c1 || !v1 || !s1) throw new CarrinhoInvalido('Erro ao buscar produtos', 500);
      catalogo = c1; variantes = v1; estoques = s1;
    }
  }

  /** Resolve uma unidade de produto: confere que está à venda, acha o tamanho e
   *  a linha de estoque. `face` é o preço do evento ou a fatia do combo. */
  const resolverProduto = (
    eventProductId: string, variantId: string | null | undefined,
    qty: number, face: number | null, bundleId: string | null,
  ): LinhaProduto => {
    const ep = eps.find((e) => e.id === eventProductId);
    if (!ep) throw new CarrinhoInvalido('Produto inválido');
    const prod = catalogo.find((c) => c.id === ep.product_id);
    const nome = [prod?.name, prod?.color].filter(Boolean).join(' ') || 'Produto';
    if (ep.status !== 'active') throw new CarrinhoInvalido(`"${nome}" não está à venda`);

    const doProduto = estoques.filter((s) => s.event_product_id === ep.id && s.is_active);
    const porTamanho = doProduto.filter((s) => s.variant_id);
    const unico = doProduto.find((s) => !s.variant_id);
    const grade = variantes.filter((v) => v.product_id === ep.product_id && v.is_active);
    // Quais tamanhos valem NESTE evento: com estoque por tamanho, só os que têm
    // linha; com estoque único, a grade inteira do produto.
    const tamanhosDoEvento = porTamanho.length > 0
      ? grade.filter((v) => porTamanho.some((s) => s.variant_id === v.id))
      : grade;

    let variante: any = null;
    if (tamanhosDoEvento.length > 0) {
      if (!variantId) throw new CarrinhoInvalido(`Escolha o tamanho de "${nome}"`);
      variante = tamanhosDoEvento.find((v) => v.id === variantId);
      if (!variante) throw new CarrinhoInvalido(`Tamanho indisponível para "${nome}"`);
    }
    const estoque = variante
      ? (porTamanho.find((s) => s.variant_id === variante.id) ?? unico)
      : unico;
    if (!estoque) throw new CarrinhoInvalido(`"${nome}" está sem estoque`);

    const price = face ?? Number(ep.price);
    if (!Number.isFinite(price) || price < 0) throw new CarrinhoInvalido(`"${nome}" está sem preço`, 500);

    return {
      eventProductId: ep.id,
      stockId: estoque.id,
      variantId: variante?.id ?? null,
      label: variante ? `${nome} · ${variante.label}` : nome,
      quantity: qty,
      price,
      modoTaxa: ep.modo_taxa === 'absorve' ? 'absorve' : 'cliente_paga',
      bundleId,
    };
  };

  const linhas: LinhaCarrinho[] = [];
  const produtos: LinhaProduto[] = [];
  let totalFace = 0;
  // Base da taxa administrativa: SÓ as linhas 'cliente_paga'. Lote (ou produto)
  // 'absorve' sai da base: é assim que o promocional do rodeio chega redondo
  // ao comprador, com a conveniência saindo do repasse do produtor.
  let baseDaTaxa = 0;
  // O cupom é de INGRESSO: incide sobre a face dos lotes comprados avulsos.
  // Combo já é preço promocional e produto não é ingresso. Em compra só de
  // ingresso (tudo o que existia até aqui) esta base é igual ao total de face.
  let baseDoCupom = 0;

  const linhaDeLote = (lotId: string, qty: number, face: number | null, bundleId: string | null) => {
    const lot = lots.find((l: any) => l.id === lotId);
    if (!lot) throw new CarrinhoInvalido('Lote inválido');
    if (!lot.is_active) throw new CarrinhoInvalido(`Lote "${lot.name}" não está à venda`);
    const price = face ?? Number(lot.price);
    const linha = price * qty;
    totalFace += linha;
    // Fail-safe para o comportamento antigo: só 'absorve' exato tira a linha da
    // base. Qualquer outro valor cai em 'cliente_paga', que é como sempre foi.
    if (lot.modo_taxa !== 'absorve') baseDaTaxa += linha;
    if (!bundleId) baseDoCupom += linha;
    linhas.push({
      lotId: lot.id,
      lotName: lot.name,
      quantity: qty,
      price,
      modoTaxa: lot.modo_taxa ?? 'cliente_paga',
      maxParcelas: lot.max_parcelas ?? null,
      parcelasSemJuros: lot.parcelas_sem_juros ?? null,
      cobreTodosOsDias: lot.covers_all_days === true,
      bundleId,
    });
  };

  const linhaDeProduto = (p: LinhaProduto) => {
    const linha = p.price * p.quantity;
    totalFace += linha;
    if (p.modoTaxa !== 'absorve') baseDaTaxa += linha;
    produtos.push(p);
  };

  for (const item of itensLote) {
    const lot = lots.find((l: any) => l.id === item.lotId);
    if (!lot) throw new CarrinhoInvalido('Lote inválido');
    linhaDeLote(item.lotId, quantidadeValida(item.quantity, lot.name), null, null);
  }

  for (const pedido of pedidosProduto) {
    const qty = quantidadeValida(pedido.quantity, 'produto');
    linhaDeProduto(resolverProduto(pedido.eventProductId, pedido.variantId, qty, null, null));
  }

  for (const pedido of pedidosCombo) {
    const combo = combos.find((b) => b.id === pedido.bundleId);
    if (!combo) throw new CarrinhoInvalido('Combo inválido');
    if (combo.status !== 'active') throw new CarrinhoInvalido(`"${combo.name}" não está à venda`);
    const qty = quantidadeValida(pedido.quantity, combo.name);
    const receita = itensDeCombo.filter((i) => i.bundle_id === combo.id);
    if (receita.length === 0) throw new CarrinhoInvalido(`"${combo.name}" está sem itens`, 500);

    // ⚠️ O combo se DESMONTA em linhas, cada uma com a sua fatia do preço. Se a
    // soma das fatias não der o preço do combo, alguém receberia ou pagaria a
    // diferença sem saber. Não vende: falha alto e o produtor corrige o rateio.
    const somaDasFatias = receita.reduce(
      (s, i) => s + Number(i.unit_face_share) * Number(i.quantity), 0);
    if (Math.abs(somaDasFatias - Number(combo.price)) > 0.005) {
      throw new CarrinhoInvalido(`"${combo.name}" está com o rateio diferente do preço`, 500);
    }

    for (const it of receita) {
      const unidades = Number(it.quantity) * qty;
      if (it.kind === 'lot') {
        linhaDeLote(it.lot_id, unidades, Number(it.unit_face_share), combo.id);
      } else {
        const escolha = pedido.escolhas?.[it.event_product_id] ?? null;
        linhaDeProduto(resolverProduto(
          it.event_product_id, escolha, unidades, Number(it.unit_face_share), combo.id));
      }
    }
  }

  // CUPOM. Sem isto o cliente aplica o desconto, VÊ o valor abatido na tela e é
  // cobrado o valor cheio — que foi o que aconteceu na primeira versão destas
  // edges. O cupom é revalidado aqui no servidor (ativo, dentro da validade,
  // dentro do limite de usos, e do MESMO evento): confiar no que o front mandou
  // deixaria um cupom expirado valer para sempre.
  let desconto = 0;
  let cupomId: string | null = null;
  if (couponId) {
    const { data: cupom } = await client
      .from('event_coupons')
      .select('id, discount_type, discount_value, max_uses, uses_count, valid_until, is_active, event_id')
      .eq('id', couponId)
      .eq('event_id', eventId)
      .maybeSingle();
    if (cupom && cupom.is_active
        && (!cupom.valid_until || new Date(cupom.valid_until).getTime() > Date.now())
        && (cupom.max_uses == null || cupom.uses_count < cupom.max_uses)) {
      desconto = cupom.discount_type === 'percent'
        ? (baseDoCupom * Number(cupom.discount_value)) / 100
        // Desconto fixo nunca passa do valor da compra: senão o total fica
        // negativo e a cobrança vira um crédito ao cliente.
        : Math.min(Number(cupom.discount_value), baseDoCupom);
      // Cupom que não abateu nada (carrinho sem ingresso avulso) não é gasto.
      cupomId = desconto > 0 ? cupom.id : null;
    }
  }

  const taxa = await taxaDoEvento(client, eventId, metodo);
  // Um arredondamento só, no fim. Somar e arredondar linha a linha muda
  // centavos e faz a conta divergir do que o produtor espera receber.
  const taxaAdministrativa = Math.max(
    0,
    Math.round((baseDaTaxa * taxa.percent / 100 + taxa.fixed) * 100) / 100,
  );
  // Mesma ordem da rota do Mercado Pago: a taxa incide sobre a face, e o
  // desconto entra depois. Inverter mudaria o valor cobrado de todo mundo.
  const subtotal = Math.max(
    0.01,
    Math.round((totalFace - desconto + taxaAdministrativa) * 100) / 100,
  );

  return { linhas, produtos, totalFace, taxaAdministrativa, desconto, cupomId, subtotal };
}

/** Todo o carrinho é de lote que o produtor absorve? Decide se o custo do
 *  crédito vai para o comprador ou sai do repasse (regra dos dois lotes
 *  promocionais do rodeio). */
/**
 * Teto de parcelas do carrinho: o MENOR entre o limite global e o de cada lote.
 *
 * O promocional do rodeio vai até 3x sem juros — é o que foi vendido no material
 * e o que a tabela de repasse suporta (§6, Regra A). Sem este teto, a tela
 * ofereceria 10x num lote em que o produtor absorve o custo, e cada parcela
 * extra sairia do bolso dele sem que ninguém tivesse combinado isso.
 *
 * ⚠️ Lote sem `max_parcelas` não restringe nada — é o caso de todos os outros
 * eventos, que seguem no teto global.
 */
export function tetoDeParcelas(linhas: LinhaCarrinho[], tetoGlobal: number): number {
  const tetos = linhas
    .map((l) => l.maxParcelas)
    .filter((n): n is number => typeof n === 'number' && n > 0);
  return tetos.length ? Math.min(tetoGlobal, ...tetos) : tetoGlobal;
}

/**
 * Até quantas parcelas o produtor absorve o custo do cartão.
 *
 * O passe promocional do rodeio sai a R$ 300 redondos em **até 3x**; de 4x a 10x
 * continua parcelando, com o juro por conta de quem parcela. Antes só existiam
 * os extremos — "absorve tudo" ou "cliente paga tudo" —, e a saída era travar o
 * lote em 3x, o que matava a venda de quem queria pagar em seis.
 *
 * Carrinho misto pega o MENOR: se um item só é sem juros até 2x, a faixa sem
 * juros do pedido inteiro é 2. É o conservador — o produtor nunca absorve mais
 * do que combinou em nenhum dos lotes.
 *
 * @returns 0 quando nenhum lote tem faixa sem juros (comportamento de hoje).
 */
export function parcelasSemJurosDoCarrinho(linhas: LinhaCarrinho[]): number {
  const faixas = linhas
    .map((l) => l.parcelasSemJuros)
    .filter((n): n is number => typeof n === 'number' && n > 0);
  // Só vale se TODAS as linhas tiverem faixa: um item sem faixa nenhuma
  // significa que aquele lote não tem parcela sem juros, e o pedido segue ele.
  if (faixas.length === 0 || faixas.length !== linhas.length) return 0;
  return Math.min(...faixas);
}

export function produtorAbsorve(linhas: LinhaCarrinho[]): boolean {
  return linhas.length > 0 && linhas.every((l) => l.modoTaxa === 'absorve');
}

/**
 * O produtor absorve o custo do cartão do pedido INTEIRO?
 *
 * Só quando tudo o que está no carrinho é 'absorve', ingresso e produto. Um
 * único item em que o cliente paga leva o pedido para "cliente paga": é o
 * lado conservador, o produtor nunca absorve mais do que combinou.
 * Em carrinho só de ingresso, é idêntico a `produtorAbsorve(linhas)`.
 */
export function carrinhoAbsorve(preco: PrecoResolvido): boolean {
  if (preco.linhas.length === 0 && preco.produtos.length === 0) return false;
  return preco.linhas.every((l) => l.modoTaxa === 'absorve')
    && preco.produtos.every((p) => p.modoTaxa === 'absorve');
}

/**
 * Faixa sem juros do pedido inteiro. Produto não tem faixa própria, então
 * carrinho com produto não tem parcela sem juros. É a mesma regra que já vale
 * entre lotes: um item sem faixa leva o pedido com ele.
 */
export function parcelasSemJurosDoPedido(preco: PrecoResolvido): number {
  if (preco.produtos.length > 0) return 0;
  return parcelasSemJurosDoCarrinho(preco.linhas);
}

/**
 * O carrinho leva passe permanente?
 *
 * Quando leva, o comprador PRECISA ter aceitado que o passe trava no CPF de
 * quem usar (§4b do framework do Rodeio). Validar isso só na tela seria enfeite:
 * quem chamasse a função direto passaria por cima, e a pessoa descobriria a
 * regra na portaria, no dia — que é exatamente o que o aviso existe para
 * evitar.
 */
export function temPassePermanente(linhas: LinhaCarrinho[]): boolean {
  return linhas.some((l) => l.cobreTodosOsDias === true);
}

/**
 * RESERVA DE ESTOQUE — obrigatória ANTES de criar o pedido.
 *
 * Sem isto, dois compradores pegam o último ingresso ao mesmo tempo e o sistema
 * aceita os dois. Não é hipótese remota: é o caso normal de lote acabando em
 * evento cheio, exatamente quando mais gente está comprando junto.
 *
 * `reserve_lot_quantity` é atômica no banco — ela é quem decide quem chegou
 * primeiro. Se qualquer linha falhar, TUDO que já foi reservado é devolvido
 * antes de propagar o erro: reserva pela metade prende estoque de um lote por
 * causa da falta de outro.
 */
export async function reservarEstoque(
  client: any,
  linhas: LinhaCarrinho[],
): Promise<{ lotId: string; quantity: number }[]> {
  const reservado: { lotId: string; quantity: number }[] = [];
  try {
    for (const l of linhas) {
      const { data: ok, error } = await client.rpc('reserve_lot_quantity', {
        _lot_id: l.lotId, _qty: l.quantity,
      });
      if (error) throw new CarrinhoInvalido('Erro ao reservar ingressos', 500);
      if (!ok) throw new CarrinhoInvalido(`Quantidade insuficiente para ${l.lotName}`);
      reservado.push({ lotId: l.lotId, quantity: l.quantity });
    }
    return reservado;
  } catch (e) {
    await devolverEstoque(client, reservado);
    throw e;
  }
}

/** Devolve o estoque reservado. Chamar em TODA saída que não vira venda:
 *  recusa do banco, falha ao criar tickets, exceção. Cada devolução é isolada —
 *  uma falhar não pode impedir as outras de voltarem para a prateleira. */
export async function devolverEstoque(
  client: any,
  reservado: { lotId: string; quantity: number }[],
): Promise<void> {
  for (const r of reservado) {
    try {
      await client.rpc('release_lot_quantity', { _lot_id: r.lotId, _qty: r.quantity });
    } catch (e) {
      console.error('[CARRINHO] falha ao devolver estoque', r.lotId, e);
    }
  }
}

/**
 * RESERVA DO ESTOQUE DE PRODUTO, antes de criar o pedido. Mesma disciplina
 * da reserva de lote: atômica no banco, e se uma linha falhar tudo o que já
 * foi reservado volta antes de o erro subir.
 */
export async function reservarProdutos(
  client: any,
  produtos: LinhaProduto[],
): Promise<{ stockId: string; quantity: number }[]> {
  const reservado: { stockId: string; quantity: number }[] = [];
  try {
    for (const p of produtos) {
      const { data: ok, error } = await client.rpc('reserve_product_quantity', {
        _stock_id: p.stockId, _qty: p.quantity,
      });
      if (error) throw new CarrinhoInvalido('Erro ao reservar produtos', 500);
      if (!ok) throw new CarrinhoInvalido(`Quantidade insuficiente para ${p.label}`);
      reservado.push({ stockId: p.stockId, quantity: p.quantity });
    }
    return reservado;
  } catch (e) {
    await devolverProdutos(client, reservado);
    throw e;
  }
}

/** Devolve reserva de produto que AINDA NÃO virou linha de pedido. Depois que
 *  `gravarItensDeProduto` passa, quem devolve é o banco (o estoque acompanha o
 *  estado do pedido por gatilho) e esta função não deve mais ser chamada. */
export async function devolverProdutos(
  client: any,
  reservado: { stockId: string; quantity: number }[],
): Promise<void> {
  for (const r of reservado) {
    try {
      await client.rpc('release_product_quantity', { _stock_id: r.stockId, _qty: r.quantity });
    } catch (e) {
      console.error('[CARRINHO] falha ao devolver produto', r.stockId, e);
    }
  }
}

/**
 * Grava as linhas de produto do pedido. A partir daqui a reserva é DO PEDIDO:
 * se ele expirar, falhar ou for apagado, o banco devolve o estoque sozinho; se
 * for pago, o banco confirma a venda e cria o código de retirada.
 *
 * @returns false se não gravou. Quem chama desfaz o pedido e devolve a reserva.
 */
export async function gravarItensDeProduto(
  client: any,
  orderId: string,
  produtos: LinhaProduto[],
): Promise<boolean> {
  if (produtos.length === 0) return true;
  const { error } = await client.from('order_product_items').insert(
    produtos.map((p) => ({
      order_id: orderId,
      event_product_id: p.eventProductId,
      stock_id: p.stockId,
      variant_id: p.variantId,
      bundle_id: p.bundleId,
      quantity: p.quantity,
      unit_face: p.price,
      label_snapshot: p.label.slice(0, 200),
    })),
  );
  if (error) {
    console.error('[CARRINHO] falha ao gravar itens de produto', orderId, error.message);
    return false;
  }
  return true;
}

/** Linhas de face para o repasse: ingresso e produto, na mesma fórmula. O
 *  produto vai com `lotId` nulo e o próprio nome, e é assim que
 *  `order_producer_value` passa a incluí-lo sem mudar uma linha. */
export function linhasDeFace(preco: PrecoResolvido, modoDoLote?: (l: LinhaCarrinho) => string) {
  return [
    ...preco.linhas.map((i) => ({
      lotId: i.lotId, lotName: i.lotName, unitFace: i.price, quantity: i.quantity,
      modoTaxa: modoDoLote ? modoDoLote(i) : i.modoTaxa,
    })),
    ...preco.produtos.map((p) => ({
      lotId: null, lotName: p.label, unitFace: p.price, quantity: p.quantity,
      modoTaxa: p.modoTaxa,
    })),
  ];
}
