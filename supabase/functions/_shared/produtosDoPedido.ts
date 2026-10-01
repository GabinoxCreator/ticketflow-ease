// produtosDoPedido — o que a pessoa comprou na loja do evento e como retira.
//
// Usado pelas duas entregas (e-mail de confirmação e WhatsApp). Mora aqui para
// as duas dizerem a MESMA coisa: os itens, o código de retirada e onde pegar.
//
// REGRA DE OURO: NUNCA LANÇA.
// Roda dentro do envio da confirmação de um pedido já pago. Falhar aqui não
// pode derrubar a entrega do ingresso: qualquer erro (inclusive as tabelas da
// loja não existirem ainda) devolve `null`, e a confirmação sai como sempre
// saiu, só sem o bloco de produtos.

export interface ProdutosDoPedido {
  itens: Array<{ rotulo: string; quantidade: number }>;
  /** Total de unidades de produto no pedido. */
  unidades: number;
  /** Código que a pessoa dita no balcão. Nulo se ainda não foi gerado. */
  codigo: string | null;
  /** Como e onde retirar, uma frase por forma de entrega distinta. */
  comoRetirar: string[];
}

const NOME_DA_ENTREGA: Record<string, string> = {
  retirada_evento: 'Retirada no dia do evento',
  retirada_antes: 'Retirada antes do evento',
  entrega: 'Entrega combinada com o organizador',
};

export async function carregarProdutosDoPedido(
  client: any,
  orderId: string,
): Promise<ProdutosDoPedido | null> {
  try {
    const { data: linhas, error } = await client
      .from('order_product_items')
      .select('event_product_id, quantity, label_snapshot, stock_state')
      .eq('order_id', orderId)
      .eq('stock_state', 'sold');
    if (error || !linhas || linhas.length === 0) return null;

    // Mesma camiseta do mesmo tamanho pode vir em duas linhas (uma avulsa, uma
    // de dentro de combo): para quem lê, é uma coisa só.
    const porRotulo = new Map<string, number>();
    for (const l of linhas as Array<{ label_snapshot: string | null; quantity: number }>) {
      const rotulo = l.label_snapshot || 'Produto';
      porRotulo.set(rotulo, (porRotulo.get(rotulo) ?? 0) + Number(l.quantity || 0));
    }
    const itens = [...porRotulo.entries()].map(([rotulo, quantidade]) => ({ rotulo, quantidade }));

    const [{ data: claim }, { data: ativacoes }] = await Promise.all([
      client.from('product_claims').select('claim_code, status').eq('order_id', orderId).maybeSingle(),
      client.from('event_products').select('id, fulfillment, fulfillment_info')
        .in('id', [...new Set((linhas as Array<{ event_product_id: string }>).map((l) => l.event_product_id))]),
    ]);

    const comoRetirar = [...new Set(
      ((ativacoes ?? []) as Array<{ fulfillment: string | null; fulfillment_info: string | null }>)
        .map((a) => {
          const forma = a.fulfillment ? NOME_DA_ENTREGA[a.fulfillment] ?? '' : '';
          const info = (a.fulfillment_info ?? '').trim();
          return [forma, info].filter(Boolean).join(': ');
        })
        .filter(Boolean),
    )];

    return {
      itens,
      unidades: itens.reduce((s, i) => s + i.quantidade, 0),
      codigo: claim?.claim_code ?? null,
      comoRetirar,
    };
  } catch (err) {
    console.warn('[produtosDoPedido] falhou', orderId, String((err as { message?: string })?.message ?? err).slice(0, 200));
    return null;
  }
}
