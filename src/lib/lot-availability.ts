// Regra única de disponibilidade de lote para venda.
// Usada pela vitrine (EventDetails, home, loja) e espelhada no servidor:
// supabase/functions/_shared/loteAberto.ts (carrinho do Marcel) e, escrita à mão,
// nas edges do Mercado Pago (create-mercadopago-pix / process-card-payment).
// Mudou aqui, atualize lá. A portaria, a maquininha e o totem só usam a data de
// fim (`isLotEnded` aqui, `encerrou` lá).

export interface LotForAvailability {
  id: string;
  is_active: boolean;
  sales_start_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  starts_after_lot_id?: string | null;
  total_quantity: number;
  sold_quantity: number;
  reserved_quantity?: number | null;
  manually_sold_out?: boolean | null;
}

export function isLotSoldOut(lot: LotForAvailability): boolean {
  if (lot.manually_sold_out) return true;
  const taken = lot.sold_quantity + (lot.reserved_quantity || 0);
  return taken >= lot.total_quantity;
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
 * - se encadeado ('after_lot'), o lote anterior já esgotou.
 * Lote 'scheduled' sem data se comporta como 'now' (não trava venda por dado incompleto).
 */
export function isLotOpenForSale(
  lot: LotForAvailability,
  allLots: LotForAvailability[],
  now: Date = new Date(),
): boolean {
  if (!lot.is_active) return false;

  if (isLotEnded(lot, now)) return false;

  if (lot.sales_start_type === 'scheduled' && lot.start_date) {
    if (new Date(lot.start_date) > now) return false;
  }

  if (lot.sales_start_type === 'after_lot' && lot.starts_after_lot_id) {
    const previous = allLots.find((l) => l.id === lot.starts_after_lot_id);
    if (previous && previous.is_active && !isLotSoldOut(previous)) return false;
  }

  return true;
}
