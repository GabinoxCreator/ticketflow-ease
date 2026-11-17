/**
 * painelDoEvento — o painel do evento lido em PÁGINAS, com os totais vindos do banco
 * (OS-408, etapa 4, 16/11/2026).
 *
 * POR QUE
 * O painel trazia todos os pedidos e todos os ingressos de uma vez e contava o tamanho
 * da lista. A API do banco devolve no máximo um teto de linhas por consulta (padrão do
 * Supabase: 1.000; o deste projeto não deu para medir, ver a ficha da OS-408): num
 * evento maior, os cartões mostrariam números menores, calados, e o "Exportar" sairia
 * faltando gente.
 *
 * COMO
 *  · Totais: função do banco `painel_evento_totais` (só leitura, com a RLS de quem chama).
 *  · Listas: `painel_evento_pedidos` / `painel_evento_ingressos`, 50 por página, com a
 *    busca e a situação filtradas no banco.
 *  · Exportar e as contas por lote e por dia: leitura em blocos de 500 até vir um bloco
 *    vazio. Isso vale com QUALQUER teto (mesmo menor que 500): o próximo bloco começa
 *    onde o anterior parou, pelo número de linhas que de fato chegou.
 *
 * SEM A FUNÇÃO NO BANCO (tela publicada antes da migration), ou se a API não conseguir
 * juntar cupom, lote ou pedido à lista da função: cai na conta antiga — lê a tabela
 * inteira em blocos e filtra e conta no navegador, com as MESMAS regras. Não quebra; só
 * fica mais lento (`usarContaAntiga`).
 *
 * Nenhuma conta de dinheiro mora aqui: "Vendido" é o `computeProducerFinance().total`
 * de sempre (src/lib/producerFinance.ts), que a função do banco repete pelo mesmo
 * `order_producer_value`.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Order } from '@/hooks/useEventOrders';
import type { Ticket } from '@/hooks/useEventParticipants';
import { computeProducerFinance, orderTicketNet } from '@/lib/producerFinance';
import { attachProducerValues } from '@/lib/orderProducerValues';

/** Quantas linhas cada página da tela mostra. */
export const POR_PAGINA = 50;
/** Tamanho do bloco do "Exportar" e das contas que precisam de tudo. */
export const BLOCO = 500;

export type SituacaoPedido = 'todos' | 'pagos' | 'pendentes' | 'cancelados' | 'nao_concluidos';
export type SituacaoIngresso = 'todos' | 'validos' | 'usados' | 'cancelados';
export type FormaDoPedido = 'pix' | 'cartao' | 'dinheiro' | 'cortesia';

/**
 * Filtros da lista de pedidos (OS-408, etapa 5, item 5.4): período, ingresso (lote),
 * forma de pagamento e cupom. Rodam NO BANCO, como filtros da API por cima da lista
 * (da função `painel_evento_pedidos` ou, sem ela, da tabela): a página de 50 e a
 * contagem já vêm filtradas. Nenhuma função nova.
 */
export interface FiltrosDoPedido {
  /** Começo do período (instante ISO, inclusive). */
  de?: string | null;
  /** Fim do período (instante ISO, exclusive: o começo do dia seguinte ao último). */
  ate?: string | null;
  loteId?: string | null;
  forma?: FormaDoPedido | null;
  cupomId?: string | null;
}
export interface FiltroPedidos extends FiltrosDoPedido { situacao: SituacaoPedido; busca?: string }
/** Participantes: situação, busca e o ingresso (lote), item 5.5. */
export interface FiltroIngressos { situacao: SituacaoIngresso; busca?: string; loteId?: string | null }

/**
 * Forma de pagamento → filtro da API. O banco guarda a forma de vários jeitos (ver
 * `formaDePagamento` em painelDoProdutor.ts): 'pix' e 'pix:<id>' (Mercado Pago antigo),
 * 'card', 'card_credit', 'card_debit', 'card:<id>', 'credit_card' (site e maquininha),
 * 'cash' (maquininha) e, na venda manual, `payment_method='manual'` com a forma em
 * `manual_payment_method` ('pix', 'dinheiro', 'cartao'...). Cortesia é pela origem.
 */
export const FORMA_NO_BANCO: Record<Exclude<FormaDoPedido, 'cortesia'>, string> = {
  pix: 'payment_method.like.pix*,manual_payment_method.eq.pix',
  cartao: 'payment_method.like.card*,payment_method.in.(credit_card,debit_card),manual_payment_method.like.cart*,manual_payment_method.like.card*,manual_payment_method.in.(credit_card,debit_card)',
  dinheiro: 'payment_method.in.(cash,dinheiro),manual_payment_method.in.(dinheiro,cash)',
};

export const temFiltroDoPedido = (f: FiltrosDoPedido) => !!(f.de || f.ate || f.loteId || f.forma || f.cupomId);

/** O que entra na chave do cache (só os filtros ligados). */
export const chaveDosFiltros = (f: FiltrosDoPedido) => [f.de || '', f.ate || '', f.loteId || '', f.forma || '', f.cupomId || ''].join('|');

interface Filtravel<B> {
  gte: (coluna: string, valor: string) => B;
  lt: (coluna: string, valor: string) => B;
  eq: (coluna: string, valor: string) => B;
  or: (filtros: string) => B;
}

/** Põe os filtros do pedido na consulta (vale igual para a função e para a tabela). */
function comFiltrosDoPedido<B>(consulta: B, f: FiltrosDoPedido): B {
  let q = consulta as unknown as Filtravel<B>;
  const passo = (b: B) => (q = b as unknown as Filtravel<B>);
  if (f.de) passo(q.gte('created_at', f.de));
  if (f.ate) passo(q.lt('created_at', f.ate));
  if (f.cupomId) passo(q.eq('coupon_id', f.cupomId));
  if (f.forma === 'cortesia') passo(q.eq('sale_origin', 'courtesy'));
  else if (f.forma) passo(q.or(FORMA_NO_BANCO[f.forma]));
  // Pedido que tem pelo menos um ingresso daquele lote (junção "inner" com os ingressos).
  if (f.loteId) passo(q.eq('tickets.lot_id', f.loteId));
  return q as unknown as B;
}

/** Com filtro de ingresso, o pedido traz junto o lote dos ingressos (só para filtrar). */
const selectDoPedido = (f: FiltrosDoPedido) => (f.loteId ? `${SELECT_PEDIDO}, tickets!inner(lot_id)` : SELECT_PEDIDO);

/** As mesmas situações da função do banco (migration 20261116100000). */
const STATUS_DO_PEDIDO: Record<SituacaoPedido, string[] | null> = {
  todos: null,
  pagos: ['paid', 'completed'],
  pendentes: ['pending'],
  cancelados: ['cancelled', 'refunded', 'charged_back'],
  nao_concluidos: ['expired', 'failed'],
};
const STATUS_DO_INGRESSO: Record<SituacaoIngresso, string[]> = {
  todos: ['valid', 'used', 'cancelled'],
  validos: ['valid'],
  usados: ['used'],
  cancelados: ['cancelled'],
};

export const SELECT_PEDIDO = '*, event_coupons(code)';
export const SELECT_INGRESSO = `
  *,
  lot:event_lots(name, price, group_ticket_enabled, group_ticket_quantity),
  order:orders(status)
`;

export interface TotaisDoEvento {
  pedidos: number;
  pagos: number;
  pendentes: number;
  cancelados: number;
  nao_concluidos: number;
  com_problema: number;
  /** Valor dos ingressos pagos, sem taxa e sem cortesia (o "Vendido" da régua). */
  vendido: number;
  ingressos: number;
  ingressos_validos: number;
  ingressos_usados: number;
  ingressos_cancelados: number;
  /** De onde veio: a função do banco, ou a conta antiga (função ainda não está no ar). */
  origem: 'banco' | 'conta_antiga';
}

export interface Pagina<T> { linhas: T[]; total: number }

// As funções novas ainda não estão nos tipos gerados (types.ts é do Lovable).
type Resposta<T> = { data: T | null; error: { code?: string; message?: string } | null; count?: number | null };
type Construtor<T> = PromiseLike<Resposta<T>> & {
  select: (colunas: string) => Construtor<T>;
  order: (coluna: string, opcoes?: { ascending?: boolean }) => Construtor<T>;
  range: (de: number, ate: number) => Construtor<T>;
};
const rpc = <T>(fn: string, args: Record<string, unknown>, opcoes?: { count?: 'exact' }): Construtor<T> =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>, o?: { count?: 'exact' }) => Construtor<T>).call(supabase, fn, args, opcoes);

/**
 * Página pedida além do fim, com contagem: a API responde 416 (PGRST103) em vez de lista
 * vazia (conferido na API de verdade em 16/11). Só acontece se a lista encolheu entre uma
 * página e outra (um pedido mudou de situação): vale como "acabou".
 */
const alemDoFim = (error: { code?: string } | null | undefined) => error?.code === 'PGRST103';

/**
 * Quando a leitura pela função nova não dá e a tela cai na conta antiga (a tabela inteira
 * em blocos, como antes da etapa 4), para o painel nunca ficar pior do que era:
 *  · a função ainda não existe no banco (migration não aplicada): PGRST202 / 42883;
 *  · a API não consegue juntar o cupom, o ingresso ou o pedido à lista da função
 *    (erro de relacionamento: PGRST200 / PGRST201). Sobre a tabela, o mesmo pedido já
 *    funciona hoje. (Revisão 1 da etapa 4: o caminho da função com essas junções só
 *    roda de verdade depois da migration.)
 */
export function usarContaAntiga(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return ['PGRST202', '42883', 'PGRST200', 'PGRST201'].includes(error.code || '')
    || /could not find the function|could not find a relationship|more than one relationship/i.test(error.message || '');
}

function erroDeLeitura(error: { message?: string } | null, oQue: string): Error {
  console.error(`[painelDoEvento] ${oQue}`, error);
  return new Error(`Não deu para ler ${oQue}. Confira a internet e tente de novo.`);
}

/**
 * Lê tudo, em blocos, até vir um bloco vazio. Não supõe teto nenhum: o próximo bloco
 * começa pelo número de linhas que de fato chegou. Linha repetida (um pedido novo que
 * entrou no meio e empurrou a lista) sai pelo id.
 */
export async function lerTudoEmBlocos<T extends { id?: string }>(
  ler: (de: number, ate: number) => PromiseLike<Resposta<T[]>>,
  oQue: string,
  /** Leitura pela função nova: o erro que manda para a conta antiga sobe como veio. */
  pelaFuncao = false,
  bloco = BLOCO,
): Promise<T[]> {
  const tudo: T[] = [];
  let lidas = 0;
  for (let volta = 0; volta < 1000; volta++) {
    const { data, error } = await ler(lidas, lidas + bloco - 1);
    if (error) {
      if (pelaFuncao && usarContaAntiga(error)) throw error;
      throw erroDeLeitura(error, oQue);
    }
    if (!data || data.length === 0) break;
    tudo.push(...data);
    lidas += data.length;
  }
  return semRepetido(tudo);
}

/**
 * Tira a linha repetida pelo id, ficando a primeira. Página por posição pode repetir
 * uma linha quando entra um pedido novo entre um "Carregar mais" e outro (ele empurra
 * a lista); a leitura em blocos também passa por aqui.
 */
export function semRepetido<T extends { id?: string }>(lista: T[]): T[] {
  const vistos = new Set<string>();
  return lista.filter((x) => {
    if (!x.id) return true;
    if (vistos.has(x.id)) return false;
    vistos.add(x.id);
    return true;
  });
}

const contem = (valor: string | null | undefined, termo: string) => (valor || '').toLowerCase().includes(termo);
const termoDe = (busca?: string) => (busca || '').trim().toLowerCase();

// ── Pedidos ──────────────────────────────────────────────────────────────────

/** Filtro da conta antiga: as mesmas regras da função `painel_evento_pedidos`. */
export function filtrarPedidos(lista: Order[], filtro: FiltroPedidos): Order[] {
  const status = STATUS_DO_PEDIDO[filtro.situacao];
  const termo = termoDe(filtro.busca);
  return lista.filter(
    (o) =>
      (!status || status.includes(o.status)) &&
      (!termo || contem(o.customer_name, termo) || contem(o.customer_email, termo) || contem(o.customer_phone, termo)),
  );
}

const pedidosNoBanco = (eventId: string, filtro: FiltroPedidos, contar = false) =>
  comFiltrosDoPedido(
    rpc<Order[]>(
      'painel_evento_pedidos',
      { _event_id: eventId, _situacao: filtro.situacao, _busca: termoDe(filtro.busca) ? filtro.busca!.trim() : null },
      contar ? { count: 'exact' } : undefined,
    ),
    filtro,
  )
    .select(selectDoPedido(filtro))
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

/**
 * A tabela inteira, em blocos (conta antiga, só quando a função não está no ar). Os
 * filtros da etapa 5 (período, ingresso, forma, cupom) vão no próprio pedido à API, do
 * mesmo jeito que na função; a situação e a busca são filtradas aqui (`filtrarPedidos`).
 */
function lerPedidosDaTabela(eventId: string, filtros: FiltrosDoPedido = {}): Promise<Order[]> {
  return lerTudoEmBlocos<Order>(
    (de, ate) =>
      comFiltrosDoPedido(supabase.from('orders').select(selectDoPedido(filtros)), filtros)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(de, ate) as unknown as PromiseLike<Resposta<Order[]>>,
    'os pedidos',
  );
}

export async function lerPaginaDePedidos(eventId: string, filtro: FiltroPedidos, de: number, ate: number): Promise<Pagina<Order>> {
  const { data, error, count } = await pedidosNoBanco(eventId, filtro, true).range(de, ate);
  if (!error) return { linhas: (data || []) as Order[], total: count ?? de + (data?.length || 0) };
  if (alemDoFim(error)) return { linhas: [], total: de };
  if (!usarContaAntiga(error)) throw erroDeLeitura(error, 'os pedidos');
  const todos = filtrarPedidos(await lerPedidosDaTabela(eventId, filtro), filtro);
  return { linhas: todos.slice(de, ate + 1), total: todos.length };
}

/** Todos os pedidos do filtro (o "Exportar" e a análise das tentativas), em blocos de 500. */
export async function lerTodosOsPedidos(eventId: string, filtro: FiltroPedidos): Promise<Order[]> {
  try {
    return await lerTudoEmBlocos<Order>((de, ate) => pedidosNoBanco(eventId, filtro).range(de, ate), 'os pedidos', true);
  } catch (e) {
    if (!usarContaAntiga(e as { code?: string })) throw e;
    return filtrarPedidos(await lerPedidosDaTabela(eventId, filtro), filtro);
  }
}

// ── Ingressos (participantes) ────────────────────────────────────────────────

/** Ingresso de tentativa (PIX que venceu, cartão recusado) não é cancelamento: nunca foi pago (OS-155). */
export function ingressoConta(t: Ticket): boolean {
  return !(t.status === 'cancelled' && t.order && ['expired', 'failed'].includes(t.order.status));
}

/** Filtro da conta antiga: as mesmas regras da função `painel_evento_ingressos`. */
export function filtrarIngressos(lista: Ticket[], filtro: FiltroIngressos): Ticket[] {
  const status = STATUS_DO_INGRESSO[filtro.situacao];
  const termo = termoDe(filtro.busca);
  return lista.filter(
    (t) =>
      status.includes(t.status) &&
      ingressoConta(t) &&
      (!termo || contem(t.holder_name, termo) || contem(t.holder_email, termo) || contem(t.ticket_code, termo)),
  );
}

/** Filtro do ingresso (lote), item 5.5: vale igual para a função e para a tabela. */
function comLote<B>(consulta: B, loteId?: string | null): B {
  return loteId ? ((consulta as unknown as Filtravel<B>).eq('lot_id', loteId)) : consulta;
}

const ingressosNoBanco = (eventId: string, filtro: FiltroIngressos, contar = false) =>
  comLote(
    rpc<Ticket[]>(
      'painel_evento_ingressos',
      { _event_id: eventId, _situacao: filtro.situacao, _busca: termoDe(filtro.busca) ? filtro.busca!.trim() : null },
      contar ? { count: 'exact' } : undefined,
    ),
    filtro.loteId,
  )
    .select(SELECT_INGRESSO)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

function lerIngressosDaTabela(eventId: string, loteId?: string | null): Promise<Ticket[]> {
  return lerTudoEmBlocos<Ticket>(
    (de, ate) =>
      comLote(supabase.from('tickets').select(SELECT_INGRESSO), loteId)
        .eq('event_id', eventId)
        // Só quem efetivamente comprou (pendente não entra)
        .in('status', ['valid', 'used', 'cancelled'])
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(de, ate) as unknown as PromiseLike<Resposta<Ticket[]>>,
    'os participantes',
  );
}

export async function lerPaginaDeIngressos(eventId: string, filtro: FiltroIngressos, de: number, ate: number): Promise<Pagina<Ticket>> {
  const { data, error, count } = await ingressosNoBanco(eventId, filtro, true).range(de, ate);
  if (!error) return { linhas: (data || []) as Ticket[], total: count ?? de + (data?.length || 0) };
  if (alemDoFim(error)) return { linhas: [], total: de };
  if (!usarContaAntiga(error)) throw erroDeLeitura(error, 'os participantes');
  const todos = filtrarIngressos(await lerIngressosDaTabela(eventId, filtro.loteId), filtro);
  return { linhas: todos.slice(de, ate + 1), total: todos.length };
}

export async function lerTodosOsIngressos(eventId: string, filtro: FiltroIngressos): Promise<Ticket[]> {
  try {
    return await lerTudoEmBlocos<Ticket>((de, ate) => ingressosNoBanco(eventId, filtro).range(de, ate), 'os participantes', true);
  } catch (e) {
    if (!usarContaAntiga(e as { code?: string })) throw e;
    return filtrarIngressos(await lerIngressosDaTabela(eventId, filtro.loteId), filtro);
  }
}

// ── Totais ───────────────────────────────────────────────────────────────────

const numero = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function lerTotaisDoEvento(eventId: string): Promise<TotaisDoEvento> {
  const { data, error } = await rpc<Record<string, unknown>>('painel_evento_totais', { _event_id: eventId });
  if (!error && data) {
    return {
      pedidos: numero(data.pedidos),
      pagos: numero(data.pagos),
      pendentes: numero(data.pendentes),
      cancelados: numero(data.cancelados),
      nao_concluidos: numero(data.nao_concluidos),
      com_problema: numero(data.com_problema),
      vendido: numero(data.vendido),
      ingressos: numero(data.ingressos),
      ingressos_validos: numero(data.ingressos_validos),
      ingressos_usados: numero(data.ingressos_usados),
      ingressos_cancelados: numero(data.ingressos_cancelados),
      origem: 'banco',
    };
  }
  if (error && !usarContaAntiga(error)) throw erroDeLeitura(error, 'os totais do evento');

  // Conta antiga, completa (em blocos): as mesmas regras de antes da etapa 4.
  const [pedidos, ingressos] = await Promise.all([lerPedidosDaTabela(eventId), lerIngressosDaTabela(eventId)]);
  const c = (s: SituacaoPedido) => filtrarPedidos(pedidos, { situacao: s }).length;
  const pagos = filtrarPedidos(pedidos, { situacao: 'pagos' });
  const contam = ingressos.filter(ingressoConta);
  return {
    pedidos: pedidos.length,
    pagos: pagos.length,
    pendentes: c('pendentes'),
    cancelados: c('cancelados'),
    nao_concluidos: c('nao_concluidos'),
    com_problema: pedidos.filter((o) => !!o.review_status).length,
    vendido: computeProducerFinance(await attachProducerValues(pagos)).total,
    ingressos: contam.length,
    ingressos_validos: contam.filter((t) => t.status === 'valid').length,
    ingressos_usados: contam.filter((t) => t.status === 'used').length,
    ingressos_cancelados: contam.filter((t) => t.status === 'cancelled').length,
    origem: 'conta_antiga',
  };
}

// ── Vendas pagas, para as contas por lote e por dia da visão geral ────────────

export interface IngressoParaConta {
  id: string;
  order_id: string;
  lot_id: string | null;
  status: string;
  created_at: string;
}
export interface PedidoPago {
  id: string;
  status: string;
  total_amount: number;
  service_fee_amount: number | null;
  sale_origin: string | null;
  payment_method: string | null;
  manual_payment_method: string | null;
  created_at: string;
  producer_value: number | null;
}

/**
 * Tudo o que a visão geral precisa para a receita por lote e o gráfico por dia, lido em
 * blocos (nunca cortado pelo teto): os pedidos pagos, com o valor do ingresso para o
 * produtor vindo do banco, e os ingressos que a lista de participantes mostra.
 */
export async function lerVendasParaContas(eventId: string): Promise<{ pagos: PedidoPago[]; ingressos: IngressoParaConta[] }> {
  const [pagosSemValor, ingressos] = await Promise.all([
    lerTudoEmBlocos<Omit<PedidoPago, 'producer_value'>>(
      (de, ate) =>
        supabase
          .from('orders')
          .select('id, status, total_amount, service_fee_amount, sale_origin, payment_method, manual_payment_method, created_at')
          .eq('event_id', eventId)
          .in('status', ['paid', 'completed'])
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(de, ate) as unknown as PromiseLike<Resposta<Omit<PedidoPago, 'producer_value'>[]>>,
      'os pedidos pagos',
    ),
    lerTudoEmBlocos<IngressoParaConta & { order?: { status: string } | null }>(
      (de, ate) =>
        supabase
          .from('tickets')
          .select('id, order_id, lot_id, status, created_at, order:orders(status)')
          .eq('event_id', eventId)
          .in('status', ['valid', 'used', 'cancelled'])
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(de, ate) as unknown as PromiseLike<Resposta<(IngressoParaConta & { order?: { status: string } | null })[]>>,
      'os ingressos',
    ),
  ]);
  return {
    pagos: (await attachProducerValues(pagosSemValor)) as PedidoPago[],
    ingressos: ingressos.filter((t) => ingressoConta(t as unknown as Ticket)),
  };
}

// ── Cupons: quanto cada um vendeu (OS-408, etapa 5, item 5.6) ────────────────

export interface VendidoDoCupom {
  /** Pedidos pagos com o cupom (cortesia não entra). */
  pedidos: number;
  /**
   * "Vendido, com desconto" (decisão do Gabriel de 10/11): o valor dos ingressos sem a
   * taxa do comprador, já com o desconto do cupom tirado, do MESMO jeito do "Vendido" da
   * régua (o valor do ingresso para o produtor que o banco calcula, `order_producer_value`,
   * lido por `attachProducerValues`; somado por `orderTicketNet`). Nenhuma conta nova.
   */
  vendido: number;
}

/** Por cupom (id): os pedidos pagos que usaram o cupom e quanto venderam. Lido em blocos. */
export async function lerVendidoPorCupom(eventId: string): Promise<Record<string, VendidoDoCupom>> {
  type Linha = { id: string; coupon_id: string; status: string; total_amount: number; service_fee_amount: number | null; sale_origin: string | null };
  const pagos = await lerTudoEmBlocos<Linha>(
    (de, ate) =>
      supabase
        .from('orders')
        .select('id, coupon_id, status, total_amount, service_fee_amount, sale_origin')
        .eq('event_id', eventId)
        .in('status', ['paid', 'completed'])
        .not('coupon_id', 'is', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(de, ate) as unknown as PromiseLike<Resposta<Linha[]>>,
    'os pedidos com cupom',
  );
  const comValor = await attachProducerValues(pagos.filter((p) => p.sale_origin !== 'courtesy'));
  const porCupom: Record<string, VendidoDoCupom> = {};
  for (const p of comValor) {
    const c = (porCupom[p.coupon_id] ??= { pedidos: 0, vendido: 0 });
    c.pedidos += 1;
    c.vendido = Math.round((c.vendido + orderTicketNet(p)) * 100) / 100;
  }
  return porCupom;
}
