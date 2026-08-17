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
  lotId: string;
  lotName: string;
  quantity: number;
  price: number;
  modoTaxa: string;
}

export interface PrecoResolvido {
  linhas: LinhaCarrinho[];
  /** Soma das faces. É o que o produtor recebe. */
  totalFace: number;
  /** Taxa administrativa da plataforma (a "conveniência"). */
  taxaAdministrativa: number;
  /** face + taxa administrativa. Base do cartão; total do PIX. */
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
  items: Array<{ lotId: string; quantity: number }>,
  metodo: 'pix' | 'card',
): Promise<PrecoResolvido> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new CarrinhoInvalido('Carrinho vazio');
  }

  const lotIds = items.map((i) => i.lotId);
  const { data: lots, error } = await client
    .from('event_lots')
    .select('id, name, price, is_active, modo_taxa')
    .in('id', lotIds)
    .eq('event_id', eventId);

  if (error || !lots) throw new CarrinhoInvalido('Erro ao buscar lotes', 500);

  const linhas: LinhaCarrinho[] = [];
  let totalFace = 0;
  // Base da taxa administrativa: SÓ as linhas de lote 'cliente_paga'. Lote
  // 'absorve' sai da base — é assim que o promocional do rodeio chega redondo
  // ao comprador, com a conveniência saindo do repasse do produtor.
  let baseDaTaxa = 0;

  for (const item of items) {
    const lot = lots.find((l: any) => l.id === item.lotId);
    if (!lot) throw new CarrinhoInvalido('Lote inválido');
    if (!lot.is_active) throw new CarrinhoInvalido(`Lote "${lot.name}" não está à venda`);

    const qty = Math.max(1, Math.trunc(Number(item.quantity) || 1));
    const linha = Number(lot.price) * qty;
    totalFace += linha;
    // Fail-safe para o comportamento antigo: só 'absorve' exato tira a linha da
    // base. Qualquer outro valor cai em 'cliente_paga', que é como sempre foi.
    if (lot.modo_taxa !== 'absorve') baseDaTaxa += linha;

    linhas.push({
      lotId: lot.id,
      lotName: lot.name,
      quantity: qty,
      price: Number(lot.price),
      modoTaxa: lot.modo_taxa ?? 'cliente_paga',
    });
  }

  const taxa = await taxaDoEvento(client, eventId, metodo);
  // Um arredondamento só, no fim. Somar e arredondar linha a linha muda
  // centavos e faz a conta divergir do que o produtor espera receber.
  const taxaAdministrativa = Math.max(
    0,
    Math.round((baseDaTaxa * taxa.percent / 100 + taxa.fixed) * 100) / 100,
  );
  const subtotal = Math.max(0.01, Math.round((totalFace + taxaAdministrativa) * 100) / 100);

  return { linhas, totalFace, taxaAdministrativa, subtotal };
}

/** Todo o carrinho é de lote que o produtor absorve? Decide se o custo do
 *  crédito vai para o comprador ou sai do repasse (regra dos dois lotes
 *  promocionais do rodeio). */
export function produtorAbsorve(linhas: LinhaCarrinho[]): boolean {
  return linhas.length > 0 && linhas.every((l) => l.modoTaxa === 'absorve');
}
