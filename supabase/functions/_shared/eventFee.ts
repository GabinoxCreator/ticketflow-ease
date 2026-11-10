// Taxa administrativa (repassada ao cliente), por evento E por método, lida de
// event_fee_overrides. ESPELHA o resolveFee/DEFAULT_FEE_PERCENT das edges de cobrança
// online (create-mercadopago-pix, process-card-payment, confra-*) — MESMA fonte,
// MESMO fallback (10%), MESMA fórmula/arredondamento. Extraído p/ o reserve/list-lots
// do totem reusarem sem duplicar de novo. NÃO altera as edges online (que mantêm a
// própria cópia local do helper) — é só reuso aditivo.

export const DEFAULT_FEE_PERCENT = 10;

export type FeeMethod = 'pix' | 'card';

export interface EventFee {
  percent: number;
  fixed: number;
}

// Lê a taxa do evento/método de event_fee_overrides. Sem linha → default 10% / 0.
// Recebe client service-role (ignora RLS). Idêntico ao resolveFee das edges online.
export async function resolveFee(client: any, eventId: string, method: FeeMethod): Promise<EventFee> {
  const { data } = await client
    .from('event_fee_overrides')
    .select('fee_percent, fee_fixed')
    .eq('event_id', eventId)
    .eq('payment_method', method)
    .maybeSingle();
  return {
    percent: data ? Number(data.fee_percent) : DEFAULT_FEE_PERCENT,
    fixed: data ? Number(data.fee_fixed) : 0,
  };
}

// Fórmula/arredondamento IDÊNTICOS às edges online:
//   serviceFee = max(0, round(subtotal * percent/100 + fixed, 2))
export function computeServiceFee(subtotal: number, fee: EventFee): number {
  return Math.max(0, Math.round((subtotal * fee.percent / 100 + fee.fixed) * 100) / 100);
}

// Dinheiro (venda em espécie na maquininha, payment_method 'cash') cobra a taxa
// do evento como cartão e Pix (OS-412, decisão do Gabriel de 09/11/2026). Quando o
// evento tem taxa diferente no Pix e no cartão (ex.: Porcada, Pix 0% e cartão 10%),
// o dinheiro segue a regra escrita AQUI, numa linha só. Hoje: a do Pix (dinheiro não
// passa por adquirente). [A CONFIRMAR pelo Gabriel] Para seguir o cartão: 'card'.
export const TAXA_DO_DINHEIRO_SEGUE: FeeMethod = 'pix';

// Mapeia o payment_method da maquininha/totem (card_credit/card_debit/pix/cash)
// para o método da taxa ('card'/'pix'). Retorna null se ausente/desconhecido
// (chamador → sem taxa).
export function feeMethodFromPaymentMethod(paymentMethod: unknown): FeeMethod | null {
  if (paymentMethod === 'pix') return 'pix';
  if (paymentMethod === 'card' || paymentMethod === 'card_credit' || paymentMethod === 'card_debit') return 'card';
  if (paymentMethod === 'cash') return TAXA_DO_DINHEIRO_SEGUE;
  return null;
}
