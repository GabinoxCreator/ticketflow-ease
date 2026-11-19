import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { orderTicketNet, isCashOrder, taxaDoDinheiroDoPedido } from '@/lib/producerFinance';
import { attachProducerValues } from '@/lib/orderProducerValues';

export interface EventFinance {
  id: string;
  title: string;
  date: string;
  image_url: string | null;
  gross: number;
  fee: number;
  net: number;
  paidOut: number;
  available: number;
  // Partition by sale_origin
  grossOnline: number;
  feeOnline: number;
  netOnline: number;
  grossManual: number;
  feeManual: number;
  netManual: number;
  /** Recebido em espécie: contado nas vendas, FORA do repasse (decisão 02/09/2026). */
  cash: number;
  /**
   * O que está em `gross` e fica fora da conta do produtor além da taxa do
   * comprador: o custo do cartão (processamento e juro) da rota do Marcel e,
   * desde a OS-426 (13/11/2026), a taxa de serviço que o produtor paga nos lotes
   * "Sem taxa" (o banco já a tira do valor do ingresso). Não é só juro: a régua
   * diz as duas partes (OS-431).
   */
  interest: number;
  /**
   * Tudo que o produtor recebeu direto, sem passar pela FestPag: a venda
   * manual inteira (18/08) + o dinheiro das outras origens (02/09) + a taxa das
   * vendas em dinheiro (OS-416). Está em `gross` e FORA de `net`.
   */
  receivedDirectly: number;
  /**
   * Taxa das vendas em DINHEIRO na maquininha (OS-416; a venda manual fica como
   * antes, "Só a maquininha"): ficou na mão do produtor, é da FestPag
   * e sai do repasse (`net`), como `base_de_repasse` faz no banco. Está dentro de
   * `receivedDirectly`; no lote normal, também de `fee` (Taxa do comprador); no
   * lote "Sem taxa", de `interest`. Com ela, `available` pode ser negativo (dívida).
   */
  cashFee: number;
}

export interface PayoutRow {
  id: string;
  event_id: string | null;
  period_start: string;
  period_end: string;
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
  status: string;
  paid_at: string | null;
  notes: string | null;
  bank_account_snapshot: any;
  created_at: string;
}

export interface FeeConfig {
  percent: number;
  fixed: number;
}

interface FinanceData {
  feeConfig: FeeConfig;
  producerProfileId: string | null;
  events: EventFinance[];
  payouts: PayoutRow[];
  totals: {
    gross: number;
    fee: number;
    net: number;
    paidOut: number;
    available: number;
    grossOnline: number;
    netOnline: number;
    grossManual: number;
    netManual: number;
    cash: number;
    interest: number;
    receivedDirectly: number;
    cashFee: number;
    /**
     * Parte de `cashFee` que já saiu do "A receber" do total: a dos eventos que não
     * estão devendo. A de evento devendo fica na linha do próprio evento (OS-416).
     */
    cashFeeNoAReceber: number;
  };
}

interface Bucket {
  gross: number;
  fee: number;
  net: number;
}

export function useProducerFinance() {
  const { user } = useAuth();

  return useQuery<FinanceData>({
    queryKey: ['producer-finance', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // 1. Producer profile of current user
      const { data: membership } = await supabase
        .from('producer_members')
        .select('producer_profile_id')
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .maybeSingle();

      const producerProfileId = membership?.producer_profile_id || null;

      // 2. Fee config (informational only — actual fee comes from each order)
      let feeConfig: FeeConfig = { percent: 10, fixed: 0 };
      if (producerProfileId) {
        const { data: override } = await supabase
          .from('producer_fee_overrides')
          .select('fee_percent, fee_fixed')
          .eq('producer_profile_id', producerProfileId)
          .maybeSingle();
        if (override) {
          feeConfig = {
            percent: Number(override.fee_percent),
            fixed: Number(override.fee_fixed),
          };
        }
      }

      // 3. Producer events
      const { data: events } = await supabase
        .from('events')
        .select('id, title, date, image_url')
        .eq('producer_id', user!.id)
        .order('date', { ascending: false });

      const eventList = events || [];
      const eventIds = eventList.map((e) => e.id);

      // 4. Paid orders per event, partitioned by sale_origin
      const onlineByEvent = new Map<string, Bucket>();
      const manualByEvent = new Map<string, Bucket>();
      const cashByEvent = new Map<string, number>();
      const cashOnlineByEvent = new Map<string, number>();
      const cashFeeByEvent = new Map<string, number>();
      if (eventIds.length > 0) {
        const { data: rawOrders, error: ordersError } = await supabase
          .from('orders')
          .select('id, event_id, total_amount, service_fee_amount, status, sale_origin, payment_method, manual_payment_method')
          .in('event_id', eventIds)
          .in('status', ['paid', 'completed']);
        if (ordersError) throw ordersError;
        // Valor do ingresso para o produtor vem do banco (face, sem taxa de
        // conveniência e sem juro de parcela; nos lotes "Sem taxa", já sem a taxa
        // de serviço que o produtor paga, OS-426) — a mesma conta que
        // request_payout usa para pagar.
        const orders = await attachProducerValues(rawOrders || []);
        orders.forEach((o: any) => {
          if (o.sale_origin === 'courtesy') return; // cortesias não entram em receita
          const isManual = o.sale_origin === 'manual';
          const map = isManual ? manualByEvent : onlineByEvent;
          const cur = map.get(o.event_id) || { gross: 0, fee: 0, net: 0 };
          cur.gross += Number(o.total_amount || 0);
          cur.fee += Number(o.service_fee_amount || 0);
          // net = valor do ingresso para o produtor (o "Vendido") — mesma fórmula
          // do resto do painel
          cur.net += orderTicketNet(o);
          map.set(o.event_id, cur);
          // Dinheiro fica DENTRO das vendas e FORA do repasse: é abatido do net
          // logo abaixo, do mesmo jeito que a função base_de_repasse faz no banco.
          if (isCashOrder(o)) {
            cashByEvent.set(o.event_id, (cashByEvent.get(o.event_id) || 0) + orderTicketNet(o));
            // A venda manual já sai inteira do repasse; só o dinheiro das
            // OUTRAS origens ainda precisa ser abatido do online.
            if (!isManual) {
              cashOnlineByEvent.set(o.event_id, (cashOnlineByEvent.get(o.event_id) || 0) + orderTicketNet(o));
            }
          }
          // A taxa das vendas em dinheiro ficou com o produtor e é da FestPag:
          // sai do repasse (OS-416, `taxa_do_dinheiro_do_pedido` no banco). No lote
          // normal ela já está em `fee` (Taxa do comprador) e não cai em
          // `interest`; no lote "Sem taxa" é a taxa paga pelo produtor, que já
          // aparece em `interest` ("fora da sua conta") como no site (OS-431).
          const taxaDinheiro = taxaDoDinheiroDoPedido(o);
          if (taxaDinheiro > 0) {
            cashFeeByEvent.set(o.event_id, (cashFeeByEvent.get(o.event_id) || 0) + taxaDinheiro);
          }
        });
      }

      // 5. Payouts of this producer profile
      let payouts: PayoutRow[] = [];
      if (producerProfileId) {
        const { data } = await supabase
          .from('payouts')
          .select('*')
          .eq('producer_profile_id', producerProfileId)
          .order('created_at', { ascending: false });
        payouts = (data || []) as any as PayoutRow[];
      }

      const paidByEvent = new Map<string, number>();
      payouts
        .filter((p) => p.status === 'paid' && p.event_id)
        .forEach((p) => {
          paidByEvent.set(
            p.event_id!,
            (paidByEvent.get(p.event_id!) || 0) + Number(p.net_amount || 0)
          );
        });

      // 6. Build per-event finance using REAL stored fees (respects per-method overrides + apply_fee=false)
      const eventsFinance: EventFinance[] = eventList.map((e) => {
        const on = onlineByEvent.get(e.id) || { gross: 0, fee: 0, net: 0 };
        const man = manualByEvent.get(e.id) || { gross: 0, fee: 0, net: 0 };
        const gross = on.gross + man.gross;
        const fee = on.fee + man.fee;
        const cash = cashByEvent.get(e.id) || 0;
        // O que a FestPag tem a repassar: só o que passou pelo NOSSO caixa.
        // A venda manual inteira o produtor recebeu direto (regra de 18/08), e o
        // dinheiro das outras origens também (02/09). A taxa cobrada no dinheiro
        // ficou com ele e é da FestPag: sai daqui (OS-416). Mesma conta da função
        // base_de_repasse (lida por request_payout), que é quem gera o valor a
        // pagar: a trava em zero vale só no que passou pelo caixa; depois de tirar
        // a taxa do dinheiro pode dar negativo (o produtor deve à FestPag).
        const cashOnline = cashOnlineByEvent.get(e.id) || 0;
        const cashFee = cashFeeByEvent.get(e.id) || 0;
        const net = Math.max(0, on.net - cashOnline) - cashFee;
        // O que sobra entre "bruto − taxa" e o valor do ingresso para o produtor:
        // o custo do cartão que o comprador pagou e, nos lotes "Sem taxa", a taxa
        // de serviço que o banco já tirou do produtor (OS-426). Precisa aparecer
        // para a conta fechar, senão o produtor pergunta "cadê o resto?".
        const interest = Math.max(0, gross - fee - (on.net + man.net));
        const receivedDirectly = man.net + cashOnline + cashFee;
        const paidOut = paidByEvent.get(e.id) || 0;
        return {
          id: e.id,
          title: e.title,
          date: e.date,
          image_url: e.image_url,
          gross,
          fee,
          net,
          paidOut,
          // Decisão do Gabriel de 16/11 ("Mostrar aos dois"): com taxa no dinheiro,
          // a dívida aparece (negativo) em vez de virar R$ 0,00. Sem taxa no
          // dinheiro fica como antes (trava em zero).
          available: cashFee > 0 ? net - paidOut : Math.max(0, net - paidOut),
          grossOnline: on.gross,
          feeOnline: on.fee,
          netOnline: Math.max(0, on.net),
          grossManual: man.gross,
          feeManual: man.fee,
          netManual: Math.max(0, man.net),
          cash,
          interest,
          receivedDirectly,
          cashFee,
        };
      });

      const totals = eventsFinance.reduce(
        (acc, e) => {
          acc.gross += e.gross;
          acc.fee += e.fee;
          acc.net += e.net;
          acc.paidOut += e.paidOut;
          // Cada evento é uma conta (decisão do Gabriel de 16/11): o saque é por
          // evento, então a dívida de um evento NÃO abate o saldo de outro. O total
          // soma só o que dá para sacar; a dívida aparece na linha do evento.
          acc.available += Math.max(0, e.available);
          if (e.available >= 0) acc.cashFeeNoAReceber += e.cashFee;
          acc.grossOnline += e.grossOnline;
          acc.netOnline += e.netOnline;
          acc.grossManual += e.grossManual;
          acc.netManual += e.netManual;
          acc.cash += e.cash;
          acc.interest += e.interest;
          acc.receivedDirectly += e.receivedDirectly;
          acc.cashFee += e.cashFee;
          return acc;
        },
        {
          gross: 0,
          fee: 0,
          net: 0,
          paidOut: 0,
          available: 0,
          grossOnline: 0,
          netOnline: 0,
          grossManual: 0,
          netManual: 0,
          cash: 0,
          interest: 0,
          receivedDirectly: 0,
          cashFee: 0,
          cashFeeNoAReceber: 0,
        }
      );

      return {
        feeConfig,
        producerProfileId,
        events: eventsFinance,
        payouts,
        totals,
      };
    },
  });
}
