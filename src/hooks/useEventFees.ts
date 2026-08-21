import { useQuery } from '@tanstack/react-query';
import { supabasePublic } from '@/integrations/supabase/publicClient';

export interface EventFeeOverride {
  id: string;
  event_id: string;
  payment_method: 'pix' | 'card';
  fee_percent: number;
  fee_fixed: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventFees {
  pixPercent: number;
  pixFixed: number;
  cardPercent: number;
  cardFixed: number;
}

const DEFAULT: EventFees = {
  pixPercent: 10,
  pixFixed: 0,
  cardPercent: 10,
  cardFixed: 0,
};

// Hardening #6 (12/08/2026): a tabela event_fee_overrides era legível por
// qualquer um (USING true) — dava pra baixar a taxa negociada de TODOS os
// eventos + as notes da negociação. O checkout só precisa dos 4 números do
// evento em compra, e é o que a RPC pública devolve (sem notes, sem listar
// outros eventos). A tabela em si ficou restrita a admin.
export function useEventFees(eventId: string | undefined) {
  const { data, ...rest } = useQuery({
    queryKey: ['event-fees', eventId],
    queryFn: async (): Promise<EventFees> => {
      if (!eventId) return DEFAULT;
      // Leitura pública: client sem sessão, não espera o refresh de token.
      // cast: types.ts é auto-gerado e ainda não conhece a RPC nova
      const { data, error } = await (supabasePublic.rpc as any)('get_event_fees', {
        _event_id: eventId,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as {
        pix_percent: number | string;
        pix_fixed: number | string;
        card_percent: number | string;
        card_fixed: number | string;
      } | null;
      if (!row) return DEFAULT;
      return {
        pixPercent: Number(row.pix_percent),
        pixFixed: Number(row.pix_fixed),
        cardPercent: Number(row.card_percent),
        cardFixed: Number(row.card_fixed),
      };
    },
    enabled: !!eventId,
    staleTime: 60_000,
  });

  return { fees: data ?? DEFAULT, ...rest };
}

export function computeFee(subtotal: number, percent: number, fixed: number) {
  const fee = (subtotal * percent) / 100 + fixed;
  return Math.max(0, Math.round(fee * 100) / 100);
}

/**
 * Quanto do carrinho entra na conta da taxa de conveniência.
 *
 * Lote com `modo_taxa = 'absorve'` fica de fora: nele o cliente paga o valor de
 * face redondo e a taxa sai de DENTRO desse valor — é como o passe promocional
 * do rodeio chega a R$ 300 na mão do comprador, com o produtor recebendo R$ 270.
 *
 * ⚠️ Esta é a mesma conta que o servidor faz em `_shared/carrinhoMarcel.ts`.
 * Ela existia só lá, e a tela somava 10% em cima de tudo: o passe de R$ 300
 * aparecia como R$ 330 e seria cobrado R$ 300. A tela mentia contra a própria
 * venda — o comprador podia desistir por causa de uma taxa que não existe
 * (achado do Gabriel, 20/08). Se as duas divergirem de novo, a do servidor manda.
 */
export function baseDaTaxa(
  itens: Array<{ price: number; quantity: number; modoTaxa?: string | null }>,
): number {
  return itens.reduce(
    (soma, i) => (i.modoTaxa === 'absorve' ? soma : soma + i.price * i.quantity),
    0,
  );
}
