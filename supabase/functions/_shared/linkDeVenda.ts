// Link de venda com o carrinho pronto (OS-405, 08/11/2026) — o lado das edges de cobrança.
//
// A casa gera o link no admin (`admin_criar_link_de_venda`): lotes, quantidades e o preço
// de cada um ficam GRAVADOS em `links_de_venda`. A página /link/<token> mostra o carrinho e
// manda só o `linkToken` às edges `marcel-create-pix` e `marcel-process-card`; daqui sai o
// carrinho que vale. Nada do que a URL ou o corpo dizem sobre lote, quantidade, preço ou
// cupom entra na conta quando há link.
//
// "Um uso" (decisão do Gabriel): quem garante é o índice único `orders_link_de_venda_um_uso`
// (no máximo um pedido pendente ou pago por link). A conferência abaixo dá a frase certa
// antes de reservar estoque; o índice fecha a corrida de duas abas pagando juntas.

import { CarrinhoInvalido, type ItemDoLink } from './carrinhoMarcel.ts';
import { mensagemDoLinkFechado } from './loteAberto.ts';

/** Frase da reserva quando o lote do link esgotou (o lote "virou" pela quantidade). */
export const semEstoqueDoLink = (_nomeDoLote: string) => mensagemDoLinkFechado('esgotado');

const FORMATO_DO_TOKEN = /^[0-9a-f]{32}$/;

export const MSG_LINK_EM_PAGAMENTO =
  'Já existe um pagamento em andamento por este link. Conclua o PIX gerado ou espere 30 minutos para tentar de novo.';
export const MSG_LINK_USADO = 'Este link já foi usado numa compra.';

/**
 * O token que veio no corpo. Ausente: `null` (compra normal, nada muda). Presente e fora
 * do formato: recusa, em vez de cair na compra normal com o carrinho do corpo.
 */
export function tokenDoLink(bruto: unknown): string | null {
  if (bruto === undefined || bruto === null || bruto === '') return null;
  const token = typeof bruto === 'string' ? bruto.trim().toLowerCase() : '';
  if (!FORMATO_DO_TOKEN.test(token)) throw new CarrinhoInvalido('Link de compra não encontrado', 404);
  return token;
}

export interface LinkParaCompra {
  id: string;
  itens: ItemDoLink[];
}

/**
 * Lê o link para cobrar. Recusa (CarrinhoInvalido, nada reservado ainda) quando o link não
 * existe, é de outro evento, já foi usado, tem pagamento em andamento, foi cancelado ou
 * venceu. `client` precisa ser service role: a tabela é fechada para o navegador.
 */
export async function lerLinkParaCompra(client: any, token: string, eventId: string): Promise<LinkParaCompra> {
  const { data: link, error } = await client
    .from('links_de_venda')
    .select('id, event_id, itens, expira_em, cancelado_em')
    .eq('token', token)
    .maybeSingle();
  if (error) throw new CarrinhoInvalido('Erro ao ler o link de compra', 500);
  if (!link || link.event_id !== eventId) throw new CarrinhoInvalido('Link de compra não encontrado', 404);

  // Pedido que já nasceu deste link e não morreu (recusado e vencido não contam).
  // Pendente e em análise são "pagamento em andamento"; o resto (pago, reembolsado,
  // contestado, cancelado) é link usado.
  const { data: pedidos, error: erroPedidos } = await client
    .from('orders')
    .select('id, status')
    .eq('link_de_venda_id', link.id)
    .not('status', 'in', '(failed,expired)');
  if (erroPedidos) throw new CarrinhoInvalido('Erro ao ler o link de compra', 500);
  const EM_ANDAMENTO = ['pending', 'in_review'];
  if ((pedidos ?? []).some((p: { status: string }) => !EM_ANDAMENTO.includes(p.status))) {
    throw new CarrinhoInvalido(MSG_LINK_USADO, 409);
  }
  if ((pedidos ?? []).length > 0) throw new CarrinhoInvalido(MSG_LINK_EM_PAGAMENTO, 409);

  if (link.cancelado_em) throw new CarrinhoInvalido('Este link foi cancelado.', 410);
  if (!link.expira_em || new Date(link.expira_em).getTime() <= Date.now()) {
    throw new CarrinhoInvalido('Este link venceu. Peça um link novo a quem enviou.', 410);
  }

  const brutos = Array.isArray(link.itens) ? link.itens : [];
  const itens: ItemDoLink[] = brutos.map((i: any) => ({
    lotId: String(i?.lot_id ?? ''),
    quantity: Number(i?.quantidade),
    preco: Number(i?.preco),
  }));
  const valido = itens.length > 0 && itens.every((i) =>
    i.lotId && Number.isInteger(i.quantity) && i.quantity >= 1 && Number.isFinite(i.preco) && i.preco > 0);
  if (!valido) throw new CarrinhoInvalido('Link de compra com itens inválidos', 500);

  return { id: link.id, itens };
}

/** O insert do pedido bateu no índice do "um uso": outra aba criou o pedido primeiro. */
export function ehLinkJaEmUso(erro: { code?: string; message?: string } | null | undefined): boolean {
  return !!erro && erro.code === '23505' && String(erro.message ?? '').includes('orders_link_de_venda_um_uso');
}
