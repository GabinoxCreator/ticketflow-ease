// Lote aberto para venda: a regra da vitrine, cumprida no servidor.
//
// ESPELHO de src/lib/lot-availability.ts (`isLotOpenForSale`). Mudou lá, mude
// aqui, e vice-versa. A tela esconde o lote fechado; aqui é onde a regra vale de
// verdade, porque página aberta há horas (ou requisição montada à mão) pode
// pedir um lote que já fechou.
//
// Um lote vende quando:
//   - está ativo;
//   - a data de fim, se houver, ainda não passou (OS-106, 02/10/2026: o painel
//     do produtor dizia "Encerrado" e o site, a maquininha e o totem seguiam
//     vendendo, porque ninguém lia a data de fim);
//   - se agendado, a data de início já chegou;
//   - se encadeado, o lote anterior já esgotou.
// Esgotado por quantidade NÃO entra aqui: quem garante é a reserva de estoque.
//
// Quem usa:
//   - `porQueFechado` (a regra inteira): o carrinho do Marcel, PIX e cartão do
//     site. As duas edges do Mercado Pago carregam a mesma regra escrita à mão.
//   - `encerrou` (só a data de fim): a lista e a reserva da maquininha e do
//     totem, e a venda da portaria. Ali a agenda de início e o encadeamento
//     nunca valeram, e a decisão do Gabriel (02/10/2026) foi só a data de fim
//     valer "em todo lugar". Não trocar por `porQueFechado` sem perguntar.

/** Campos de `event_lots` que a regra lê. */
export const CAMPOS_DA_REGRA = 'is_active, sales_start_type, start_date, end_date, starts_after_lot_id';

export type LoteFechado = 'inativo' | 'encerrado' | 'ainda_nao_abriu';

export interface LoteDaRegra {
  is_active: boolean | null;
  sales_start_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  starts_after_lot_id?: string | null;
}

export interface LoteAnterior {
  is_active: boolean | null;
  total_quantity: number;
  sold_quantity: number;
  reserved_quantity?: number | null;
  manually_sold_out?: boolean | null;
}

const esgotado = (l: LoteAnterior) =>
  !!l.manually_sold_out || l.sold_quantity + (l.reserved_quantity || 0) >= l.total_quantity;

/** A data de fim do lote já passou. Sem data de fim, nunca encerra por data. */
export function encerrou(lote: { end_date?: string | null }, agora: Date = new Date()): boolean {
  return !!lote.end_date && new Date(lote.end_date) < agora;
}

/** Por que o lote não vende agora; `null` quando vende. */
export function porQueFechado(
  lote: LoteDaRegra,
  anterior: LoteAnterior | null | undefined,
  agora: Date = new Date(),
): LoteFechado | null {
  if (!lote.is_active) return 'inativo';
  if (encerrou(lote, agora)) return 'encerrado';
  if (lote.sales_start_type === 'scheduled' && lote.start_date && new Date(lote.start_date) > agora) {
    return 'ainda_nao_abriu';
  }
  // Anterior que não veio (apagado, ou leitura que falhou) não trava: é o que a
  // vitrine faz, e as edges do Mercado Pago sempre fizeram.
  if (lote.sales_start_type === 'after_lot' && lote.starts_after_lot_id &&
      anterior && anterior.is_active && !esgotado(anterior)) {
    return 'ainda_nao_abriu';
  }
  return null;
}

/** Os lotes anteriores dos encadeados, numa leitura só, por id. */
export async function lotesAnteriores(client: any, lotes: LoteDaRegra[]): Promise<Map<string, LoteAnterior>> {
  const ids = Array.from(new Set(
    lotes
      .filter((l) => l.sales_start_type === 'after_lot' && l.starts_after_lot_id)
      .map((l) => l.starts_after_lot_id as string),
  ));
  const mapa = new Map<string, LoteAnterior>();
  if (ids.length === 0) return mapa;
  const { data } = await client
    .from('event_lots')
    .select('id, is_active, total_quantity, sold_quantity, reserved_quantity, manually_sold_out')
    .in('id', ids);
  for (const l of data ?? []) mapa.set(l.id, l);
  return mapa;
}

/** A frase que o comprador (ou a equipe da portaria) lê quando o lote fechou. */
export function mensagemDoFechado(nome: string, motivo: LoteFechado): string {
  if (motivo === 'encerrado') return `As vendas do lote "${nome}" já encerraram`;
  if (motivo === 'ainda_nao_abriu') return `Lote "${nome}" ainda não está à venda`;
  return `Lote "${nome}" não está à venda`;
}
