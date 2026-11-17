// Regra única de disponibilidade de lote para venda.
// Usada pela vitrine (EventDetails, home, loja) e espelhada no servidor:
// supabase/functions/_shared/loteAberto.ts (carrinho do Marcel) e, escrita à mão,
// nas edges do Mercado Pago (create-mercadopago-pix / process-card-payment).
// Mudou aqui, atualize lá. A portaria, a maquininha e o totem só usam a data de
// fim (`isLotEnded` aqui, `encerrou` lá).

import { tamanhoDoGrupo } from '@/lib/lote-em-grupo';

export interface LotForAvailability {
  id: string;
  is_active: boolean;
  sales_start_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  starts_after_lot_id?: string | null;
  /** Lote que só sai pelo link de cortesia (OS-313): nunca entra na venda normal. */
  retirada_publica?: boolean | null;
  total_quantity: number;
  sold_quantity: number;
  reserved_quantity?: number | null;
  manually_sold_out?: boolean | null;
  group_ticket_enabled?: boolean | null;
  group_ticket_quantity?: number | null;
}

export function isLotSoldOut(lot: LotForAvailability): boolean {
  if (lot.manually_sold_out) return true;
  const taken = lot.sold_quantity + (lot.reserved_quantity || 0);
  // Lote em grupo (OS-317): sobrar menos que um grupo inteiro é esgotado. Uma
  // cortesia ou um ingresso devolvido deixaria 1 ingresso solto que ninguém
  // compra, e o lote seguinte nunca abriria.
  return lot.total_quantity - taken < tamanhoDoGrupo(lot);
}

/** A data de fim do lote já passou. Sem data de fim, nunca encerra por data. */
export function isLotEnded(lot: LotForAvailability, now: Date = new Date()): boolean {
  return !!lot.end_date && new Date(lot.end_date) < now;
}

/**
 * Um lote está aberto para venda quando:
 * - está ativo;
 * - a data de fim, se houver, ainda não passou (é o "Encerrado" do painel do produtor);
 * - se agendado ('scheduled'), a data/hora de início já passou;
 * - se encadeado ('after_lot'), o lote anterior já esgotou OU já encerrou pela data
 *   de fim (OS-227, 14/10/2026: o que ocorrer primeiro; antes só o esgotado abria, e
 *   um anterior que encerrava pela data deixava o seguinte fechado para sempre).
 * Lote 'scheduled' sem data se comporta como 'now' (não trava venda por dado incompleto).
 *
 * Lote de retirada pública (OS-313) NUNCA está aberto aqui: ele existe só para o link de
 * cortesia, onde valem a trava de um por pessoa e o cadastro. Deixá-lo na vitrine punha
 * ingresso de graça à venda na página do evento, na maquininha e no totem.
 */
export function isLotOpenForSale(
  lot: LotForAvailability,
  allLots: LotForAvailability[],
  now: Date = new Date(),
): boolean {
  if (!lot.is_active) return false;
  if (lot.retirada_publica) return false;

  if (isLotEnded(lot, now)) return false;

  if (lot.sales_start_type === 'scheduled' && lot.start_date) {
    if (new Date(lot.start_date) > now) return false;
  }

  if (lot.sales_start_type === 'after_lot' && lot.starts_after_lot_id) {
    const previous = allLots.find((l) => l.id === lot.starts_after_lot_id);
    if (previous && previous.is_active && !isLotSoldOut(previous) && !isLotEnded(previous, now)) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Quando a venda abre (OS-419, 12/11/2026). SÓ LEITURA, ao lado da regra acima:
// não muda o que está à venda, só diz à página do evento quando o próximo lote
// agendado abre, para ela avisar "Vendas abrem em 16/11 às 06h" em vez de sumir
// com os ingressos. O servidor continua recusando compra antes da hora.
// ---------------------------------------------------------------------------

/** Campo da OS-405 (lote escondido): pode ainda não existir na linha do banco. */
type LoteComEscondido = LotForAvailability & { escondido?: boolean | null };

export interface ProximaAbertura {
  /** O instante em que o(s) lote(s) abre(m). */
  quando: Date;
  /** Todos os lotes que abrem nesse mesmo instante (só para a conta; a tela não mostra). */
  lotes: LotForAvailability[];
}

/**
 * O lote agendado que abre primeiro, e todos os que abrem na mesma hora.
 *
 * Entra só lote que poderia ser vendido quando abrir: ativo, agendado
 * ('scheduled') com `start_date` no futuro, fora da retirada pública (OS-313) e
 * do lote escondido (OS-405), não esgotado e sem data de fim vencida (nem data
 * de fim antes da abertura, que nunca chegaria a vender). Lote encadeado
 * ('after_lot') não tem hora marcada e fica de fora. Sem nenhum: `null`.
 */
export function proximaAbertura(
  lots: LotForAvailability[],
  now: Date = new Date(),
): ProximaAbertura | null {
  const candidatos = (lots || []).filter((lote) => {
    const l = lote as LoteComEscondido;
    if (!l.is_active || l.retirada_publica || l.escondido) return false;
    if (l.sales_start_type !== 'scheduled' || !l.start_date) return false;
    const abre = new Date(l.start_date);
    if (Number.isNaN(abre.getTime()) || abre <= now) return false;
    if (isLotSoldOut(l) || isLotEnded(l, now)) return false;
    if (l.end_date && new Date(l.end_date) <= abre) return false;
    return true;
  });
  if (candidatos.length === 0) return null;

  const primeiro = Math.min(...candidatos.map((l) => new Date(l.start_date!).getTime()));
  return {
    quando: new Date(primeiro),
    lotes: candidatos.filter((l) => new Date(l.start_date!).getTime() === primeiro),
  };
}

/**
 * "16/11 às 06h" ou "16/11 às 06h30", na hora de Brasília (como o resto do site).
 */
export function textoDaAbertura(quando: Date): string {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(quando);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? '';
  const minutos = p('minute');
  return `${p('day')}/${p('month')} às ${p('hour')}h${minutos === '00' ? '' : minutos}`;
}
