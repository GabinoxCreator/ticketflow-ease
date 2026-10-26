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
//   - se encadeado, o lote anterior já esgotou OU já encerrou pela data de fim
//     (OS-227, 14/10/2026: o que ocorrer primeiro).
// Esgotado por quantidade NÃO entra aqui: quem garante é a reserva de estoque.
//
// Quem usa:
//   - `porQueFechado` (a regra inteira): o carrinho do Marcel, PIX e cartão do
//     site, e a lista e a reserva da maquininha e do totem (decisão do Gabriel,
//     14/10/2026, OS-228: "igual ao site"). As duas edges do Mercado Pago
//     carregam a mesma regra escrita à mão.
//   - `encerrou` (só a data de fim): a venda da portaria.

import { CAMPOS_DO_GRUPO, tamanhoDoGrupo } from './loteEmGrupo.ts';

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
  end_date?: string | null;
  group_ticket_enabled?: boolean | null;
  group_ticket_quantity?: number | null;
}

// Lote em grupo (OS-317): sobrar menos que um grupo inteiro é esgotado. Uma
// cortesia ou um ingresso devolvido deixaria 1 ingresso solto que ninguém
// compra, e o lote seguinte nunca abriria. Lote comum: grupo de 1, igual a antes.
const esgotado = (l: LoteAnterior) =>
  !!l.manually_sold_out
  || l.total_quantity - (l.sold_quantity + (l.reserved_quantity || 0)) < tamanhoDoGrupo(l);

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
      anterior && anterior.is_active && !esgotado(anterior) && !encerrou(anterior, agora)) {
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
    .select(`id, is_active, total_quantity, sold_quantity, reserved_quantity, manually_sold_out, end_date, ${CAMPOS_DO_GRUPO}`)
    .in('id', ids);
  for (const l of data ?? []) mapa.set(l.id, l);
  return mapa;
}

/** Nome do lote para quem só vê o nome (totem e maquininha): "Premium · 1º lote". */
export function nomeComSetor(lote: { name: string; sector_name?: string | null }): string {
  const setor = (lote.sector_name ?? '').trim();
  return setor ? `${setor} · ${lote.name}` : lote.name;
}

/** A frase que o comprador (ou a equipe da portaria) lê quando o lote fechou. */
export function mensagemDoFechado(nome: string, motivo: LoteFechado): string {
  if (motivo === 'encerrado') return `As vendas do lote "${nome}" já encerraram`;
  if (motivo === 'ainda_nao_abriu') return `Lote "${nome}" ainda não está à venda`;
  return `Lote "${nome}" não está à venda`;
}
