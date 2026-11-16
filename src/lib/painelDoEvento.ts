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
import { computeProducerFinance } from '@/lib/producerFinance';
import { attachProducerValues } from '@/lib/orderProducerValues';

/** Quantas linhas cada página da tela mostra. */
export const POR_PAGINA = 50;
/** Tamanho do bloco do "Exportar" e das contas que precisam de tudo. */
export const BLOCO = 500;

export type SituacaoPedido = 'todos' | 'pagos' | 'pendentes' | 'cancelados' | 'nao_concluidos';
export type SituacaoIngresso = 'todos' | 'validos' | 'usados' | 'cancelados';

export interface FiltroPedidos { situacao: SituacaoPedido; busca?: string }
export interface FiltroIngressos { situacao: SituacaoIngresso; busca?: string }

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
  rpc<Order[]>(
    'painel_evento_pedidos',
    { _event_id: eventId, _situacao: filtro.situacao, _busca: termoDe(filtro.busca) ? filtro.busca!.trim() : null },
    contar ? { count: 'exact' } : undefined,
  )
    .select(SELECT_PEDIDO)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

/** A tabela inteira, em blocos (conta antiga, só quando a função não está no ar). */
function lerPedidosDaTabela(eventId: string): Promise<Order[]> {
  return lerTudoEmBlocos<Order>(
    (de, ate) =>
      supabase
        .from('orders')
        .select(SELECT_PEDIDO)
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
  const todos = filtrarPedidos(await lerPedidosDaTabela(eventId), filtro);
  return { linhas: todos.slice(de, ate + 1), total: todos.length };
}

/** Todos os pedidos do filtro (o "Exportar" e a análise das tentativas), em blocos de 500. */
export async function lerTodosOsPedidos(eventId: string, filtro: FiltroPedidos): Promise<Order[]> {
  try {
    return await lerTudoEmBlocos<Order>((de, ate) => pedidosNoBanco(eventId, filtro).range(de, ate), 'os pedidos', true);
  } catch (e) {
    if (!usarContaAntiga(e as { code?: string })) throw e;
    return filtrarPedidos(await lerPedidosDaTabela(eventId), filtro);
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

const ingressosNoBanco = (eventId: string, filtro: FiltroIngressos, contar = false) =>
  rpc<Ticket[]>(
    'painel_evento_ingressos',
    { _event_id: eventId, _situacao: filtro.situacao, _busca: termoDe(filtro.busca) ? filtro.busca!.trim() : null },
    contar ? { count: 'exact' } : undefined,
  )
    .select(SELECT_INGRESSO)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

function lerIngressosDaTabela(eventId: string): Promise<Ticket[]> {
  return lerTudoEmBlocos<Ticket>(
    (de, ate) =>
      supabase
        .from('tickets')
        .select(SELECT_INGRESSO)
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
  const todos = filtrarIngressos(await lerIngressosDaTabela(eventId), filtro);
  return { linhas: todos.slice(de, ate + 1), total: todos.length };
}

export async function lerTodosOsIngressos(eventId: string, filtro: FiltroIngressos): Promise<Ticket[]> {
  try {
    return await lerTudoEmBlocos<Ticket>((de, ate) => ingressosNoBanco(eventId, filtro).range(de, ate), 'os participantes', true);
  } catch (e) {
    if (!usarContaAntiga(e as { code?: string })) throw e;
    return filtrarIngressos(await lerIngressosDaTabela(eventId), filtro);
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
