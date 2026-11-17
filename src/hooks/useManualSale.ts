import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ManualSaleItem {
  lot_id: string;
  quantity: number;
}

export interface ManualSaleInput {
  event_id: string;
  buyer: {
    name: string;
    cpf: string;
    email: string;
    whatsapp?: string | null;
  };
  items: ManualSaleItem[];
  coupon_code?: string | null;
  // Na cortesia (is_courtesy=true) não vão método/taxa/cupom — o servidor força zero.
  payment_method?: 'pix' | 'dinheiro' | 'transferencia' | 'cartao' | 'outro';
  apply_fee?: boolean;
  note?: string | null;
  is_courtesy?: boolean;
}

export interface ManualSaleResult {
  ok: true;
  order_id: string;
  tickets: { id: string; ticket_code: string; lot_name: string }[];
  totals: { subtotal: number; service_fee: number; discount: number; total: number };
  customer: { name: string; email: string; whatsapp: string | null };
  email_sent: boolean;
}

/**
 * Quando a resposta da edge se perde (rede caiu, a edge não respondeu, ou ela quebrou no meio
 * com "internal_error"), a venda ou a cortesia PODE ter sido gravada antes de a resposta voltar.
 * Nesses casos a tela não mostra o erro técnico em inglês e diz para conferir em Pedidos antes de
 * tentar de novo (senão a pessoa repete e duplica). OS-408, revisão 1 da etapa 5.
 */
export const SEM_CONFIRMACAO = {
  cortesia: 'Não deu para confirmar se a cortesia entrou. Confira em Pedidos antes de tentar de novo.',
  venda: 'Não deu para confirmar se a venda entrou. Confira em Pedidos antes de tentar de novo.',
};
/** Recusa do servidor sem frase em português (veio só o código, ex.: "forbidden"). */
export const RECUSA_SEM_FRASE = 'O servidor recusou o pedido.';

export type ErroDaVendaManual = Error & { code?: string; lot_id?: string; retry_after?: number; semConfirmacao?: boolean };

/** Frase do servidor quando é frase (tem espaço); código cru ("lot_not_found") vira a recusa genérica. */
const fraseDoServidor = (texto: unknown) =>
  typeof texto === 'string' && texto.trim().includes(' ') ? texto.trim() : RECUSA_SEM_FRASE;

function recusa(corpo: { error?: unknown; code?: string; lot_id?: string; retry_after?: number } | null): ErroDaVendaManual {
  const e: ErroDaVendaManual = new Error(fraseDoServidor(corpo?.error));
  e.code = corpo?.code;
  e.lot_id = corpo?.lot_id;
  // Quanto esperar quando o servidor segura vendas demais em sequência (cortesia em lote, OS-408).
  e.retry_after = corpo?.retry_after;
  return e;
}

/**
 * Lê o erro da edge como o `erroDaEdge` do colaborador (OS-268): com status 4xx e corpo legível,
 * é recusa (a frase vem do corpo); rede, sem corpo, 5xx ou "internal_error": sem confirmação.
 */
async function erroDaVendaManual(error: unknown, cortesia: boolean): Promise<ErroDaVendaManual> {
  const ctx = (error as { context?: { status?: number; json?: () => Promise<unknown> } } | null)?.context;
  const status = typeof ctx?.status === 'number' ? ctx.status : null;
  let corpo: { ok?: boolean; error?: unknown; code?: string } | null = null;
  try {
    const lido = await ctx?.json?.();
    if (lido && typeof lido === 'object') corpo = lido as typeof corpo;
  } catch {
    // sem corpo legível
  }
  if (status != null && status >= 400 && status < 500 && corpo && corpo.code !== 'internal_error') return recusa(corpo);
  console.error('[producer-create-manual-sale] sem confirmação', status, corpo, error);
  const e: ErroDaVendaManual = new Error(cortesia ? SEM_CONFIRMACAO.cortesia : SEM_CONFIRMACAO.venda);
  e.code = 'sem_confirmacao';
  e.semConfirmacao = true;
  return e;
}

export function useManualSale(eventId?: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: ManualSaleInput): Promise<ManualSaleResult> => {
      const { data, error } = await supabase.functions.invoke('producer-create-manual-sale', {
        body: input,
      });
      if (error) throw await erroDaVendaManual(error, input.is_courtesy === true);
      // Resposta 200 sem o pedido: sem corpo é sem confirmação; com "ok: false", recusa do servidor.
      if (!data) throw await erroDaVendaManual(null, input.is_courtesy === true);
      if (data.ok !== true) throw recusa(data);
      return data as ManualSaleResult;
    },
    // Relê a lista também no ERRO (revisão 2 da etapa 5): no "sem confirmação" o pedido pode ter
    // sido gravado; a aba Pedidos aberta tem de mostrar o que de fato está no banco, senão quem
    // confere acha que não entrou e repete (na venda manual, um registro de dinheiro em dobro).
    onSettled: () => {
      if (eventId) {
        qc.invalidateQueries({ queryKey: ['event-orders', eventId] });
        qc.invalidateQueries({ queryKey: ['event-lots', eventId] });
        qc.invalidateQueries({ queryKey: ['event-stats', eventId] });
      }
    },
  });
}
