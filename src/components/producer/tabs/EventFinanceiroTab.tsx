import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ShoppingBag, QrCode, CreditCard, Info, Hand, Store } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { supabase } from '@/integrations/supabase/client';
import { useEventLots } from '@/hooks/useEventLots';
import { useLotSales, sumLotSales } from '@/hooks/useLotSales';
import { computeProducerFinance, isPaidStatus, orderTicketNet, saleOrigin } from '@/lib/producerFinance';
import { attachProducerValues } from '@/lib/orderProducerValues';
import { useProducerFinance } from '@/hooks/useProducerFinance';
import { ReguaEmCartoes } from '@/components/producer/ReguaDoDinheiro';

// Formata em BRL. NUNCA colocar troca de valor especifico aqui: um formatador so formata.
// Havia quatro substituicoes cravadas neste ponto (ex.: 50.585,00 aparecia como 50.085,00)
// que mascaravam na tela o juro inflado do repasse em vez de corrigi-lo na origem -- ver
// _docs/investigacao-juro-parcelamento-repasse.md. Removidas em 15/08/2026.
const formatBRL = (v: number) => {
  const [intPart, fracPart] = v.toFixed(2).split('.');
  const intWithDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$\u00A0${intWithDots},${fracPart}`;
};

const METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
  transferencia: 'Transferência',
  outro: 'Outro',
};

interface Props {
  eventId: string;
}

interface OrderRow {
  id: string;
  total_amount: number;
  service_fee_amount: number;
  payment_method: string | null;
  status: string;
  sale_origin: string | null;
  manual_payment_method: string | null;
  /** Valor de face para o produtor, vindo do banco (sem taxa, sem juro). */
  producer_value?: number | null;
}

interface DoorSaleRow {
  id: string;
  quantity: number;
  total_amount: number;
  payment_method: string;
  operator_id: string | null;
}

export function EventFinanceiroTab({ eventId }: Props) {
  const { lots } = useEventLots(eventId);
  // Vendidos de verdade (pago, sem cortesia), não o contador de estoque do lote.
  const { data: vendasPorLote } = useLotSales(eventId ? [eventId] : []);

  // Os cinco números da régua: a mesma fonte do Financeiro (OS-408).
  const { data: financa, isLoading: financaLoading } = useProducerFinance();
  const doEvento = financa?.events.find((e) => e.id === eventId);

  const { data, isLoading, error } = useQuery({
    queryKey: ['event-financeiro', eventId],
    queryFn: async () => {
      const [ordersRes, doorRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, total_amount, service_fee_amount, payment_method, status, sale_origin, manual_payment_method')
          .eq('event_id', eventId)
          .in('status', ['paid', 'completed']),
        supabase
          .from('door_sales')
          .select('id, quantity, total_amount, payment_method, operator_id, created_at')
          .eq('event_id', eventId),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      // O valor do ingresso para o produtor vem do banco (face, sem taxa e sem
      // juro de parcela) — a conta local "total − taxa" dava o juro ao produtor.
      const orders = await attachProducerValues((ordersRes.data || []) as OrderRow[]);
      return {
        orders,
        doorSales: (doorRes.data || []) as DoorSaleRow[],
        // O bloco de portaria some quando não há venda de portaria (OS-408). Se a
        // leitura falhar, ele avisa, em vez de sumir como se não houvesse venda. O
        // resto do financeiro não depende disso (portaria é só conferência).
        doorSalesFailed: !!doorRes.error,
      };
    },
    enabled: !!eventId,
  });

  // Resolve operator names for door sales (collaborator IDs)
  const operatorIds = useMemo(
    () => Array.from(new Set((data?.doorSales || []).map(s => s.operator_id).filter(Boolean) as string[])),
    [data]
  );
  const { data: operators } = useQuery({
    queryKey: ['event-financeiro-operators', operatorIds.join(',')],
    queryFn: async () => {
      if (operatorIds.length === 0) return new Map<string, string>();
      const { data } = await supabase
        .from('collaborators')
        .select('id, name')
        .in('id', operatorIds);
      const m = new Map<string, string>();
      (data || []).forEach((c: any) => m.set(c.id, c.name));
      return m;
    },
    enabled: operatorIds.length > 0,
  });

  const stats = useMemo(() => {
    const allOrdersRaw = data?.orders || [];
    const doorSales = data?.doorSales || [];

    // Fonte única (src/lib/producerFinance.ts): valor do ingresso para o produtor
    // (o "Vendido"), pago, sem cortesia. online / manual / total coerentes com o
    // resto do painel; o repasse é total − recebido direto (com a taxa do dinheiro, OS-416).
    const finance = computeProducerFinance(allOrdersRaw);

    // Partições p/ as quebras por meio de pagamento (pagos, sem cortesia)
    const paidNonCourtesy = allOrdersRaw.filter(o => isPaidStatus(o.status) && saleOrigin(o) !== 'courtesy');
    const onlineOrders = paidNonCourtesy.filter(o => saleOrigin(o) === 'online');
    const manualOrders = paidNonCourtesy.filter(o => saleOrigin(o) === 'manual');

    // Method breakdown for ONLINE orders — valor do ingresso (sem taxa)
    const byMethodOnline = new Map<string, { qty: number; total: number }>();
    onlineOrders.forEach(o => {
      const key = (o.payment_method || 'desconhecido').toLowerCase();
      const k = key.includes('pix') ? 'pix' : (key.includes('card') || key.includes('cart')) ? 'cartao' : key;
      const cur = byMethodOnline.get(k) || { qty: 0, total: 0 };
      cur.qty += 1; cur.total += orderTicketNet(o);
      byMethodOnline.set(k, cur);
    });

    const pixOnline = byMethodOnline.get('pix') || { qty: 0, total: 0 };
    const cardOnline = byMethodOnline.get('cartao') || { qty: 0, total: 0 };

    // Method breakdown for MANUAL orders — valor do ingresso (sem taxa)
    const byMethodManual = new Map<string, { qty: number; total: number }>();
    manualOrders.forEach(o => {
      const k = (o.manual_payment_method || 'outro').toLowerCase();
      const cur = byMethodManual.get(k) || { qty: 0, total: 0 };
      cur.qty += 1; cur.total += orderTicketNet(o);
      byMethodManual.set(k, cur);
    });

    // Ingressos vendidos: pago, sem cortesia; cortesia à parte (decisão do Gabriel, 02/10/2026).
    // null = sem a contagem (carregando ou falhou) e a tela mostra "—".
    const semContagem = vendasPorLote === undefined;
    const vendas = sumLotSales(vendasPorLote);
    const ticketsSold = semContagem ? null : vendas.vendidos;
    const courtesies = semContagem ? 0 : vendas.cortesias;
    const capacity = (lots || []).reduce((s, l) => s + Number(l.total_quantity || 0), 0);

    // Door sales
    const doorTotal = doorSales.reduce((s, d) => s + Number(d.total_amount), 0);
    const doorTickets = doorSales.reduce((s, d) => s + Number(d.quantity), 0);
    const doorByMethod = new Map<string, { qty: number; total: number; sales: number }>();
    const doorByOperator = new Map<string, { qty: number; total: number; sales: number }>();
    doorSales.forEach(d => {
      const m = doorByMethod.get(d.payment_method) || { qty: 0, total: 0, sales: 0 };
      m.qty += Number(d.quantity); m.total += Number(d.total_amount); m.sales += 1;
      doorByMethod.set(d.payment_method, m);

      const opKey = d.operator_id || 'unknown';
      const op = doorByOperator.get(opKey) || { qty: 0, total: 0, sales: 0 };
      op.qty += Number(d.quantity); op.total += Number(d.total_amount); op.sales += 1;
      doorByOperator.set(opKey, op);
    });

    return {
      online: finance.online, fisica: finance.fisica, manual: finance.manual, total: finance.total,
      // Recebido direto pelo produtor (venda manual + dinheiro): dentro das
      // vendas, fora do repasse (decisões do Gabriel, 18/08 e 02/09/2026)
      dinheiro: finance.dinheiro, dinheiroCount: finance.dinheiroCount,
      recebidoDireto: finance.recebidoDireto, recebidoDiretoCount: finance.recebidoDiretoCount,
      taxaDoDinheiro: finance.taxaDoDinheiro,
      repasse: finance.repasse,
      pixOnline, cardOnline,
      fisicaCount: finance.fisicaCount,
      manualCount: finance.manualCount,
      byMethodManual: Array.from(byMethodManual.entries()),
      ticketsSold, courtesies, capacity,
      doorTotal, doorTickets, doorSalesCount: doorSales.length,
      doorByMethod: Array.from(doorByMethod.entries()),
      doorByOperator: Array.from(doorByOperator.entries()),
    };
  }, [data, lots, vendasPorLote]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Sem o valor certo, não mostramos valor nenhum: número errado com cara de
  // certo é pior que tela sem número quando o assunto é dinheiro.
  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-5 text-sm">
          <p className="font-semibold">Não foi possível calcular o financeiro deste evento agora.</p>
          <p className="text-muted-foreground mt-1">Tente recarregar a página. Se continuar, fale com a FestPag.</p>
          <p className="text-xs text-muted-foreground mt-2 break-words">{(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* A régua do dinheiro (OS-408): as cinco palavras, na mesma ordem de toda tela.
          Os números vêm de useProducerFinance, o mesmo lugar do Financeiro: "A receber
          da FestPag" é o que falta pagar, igual lá (decisão do Gabriel em 09/11: "Só o
          que falta"). Antes este cartão dizia "Repasse ao Produtor" com o total do evento,
          sem descontar o que já tinha sido pago. */}
      <ReguaEmCartoes
        carregando={financaLoading}
        numeros={{
          vendido: doEvento ? doEvento.netOnline + doEvento.netManual : stats.total,
          taxaDoComprador: doEvento ? doEvento.fee : null,
          juro: doEvento?.interest,
          recebidoDireto: doEvento ? doEvento.receivedDirectly : stats.recebidoDireto,
          taxaDoDinheiro: doEvento ? doEvento.cashFee : stats.taxaDoDinheiro,
          // Membro da produtora que não é o dono não enxerga os repasses: "—", nunca um número errado.
          aReceber: doEvento ? doEvento.available : null,
          jaPago: doEvento ? doEvento.paidOut : null,
        }}
      />

      {/* Ingressos */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><ShoppingBag className="w-4 h-4" /> Ingressos</h3>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Ingressos Vendidos</p>
              <p className="text-2xl font-bold tabular-nums">{stats.ticketsSold ?? '—'}<span className="text-base text-muted-foreground">/{stats.capacity}</span></p>
              {stats.courtesies > 0 && (
                <p className="text-xs text-muted-foreground">mais {stats.courtesies} {stats.courtesies === 1 ? 'cortesia' : 'cortesias'}</p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Vendido</p>
              <p className="text-2xl font-bold tabular-nums break-words">{formatBRL(stats.total)}</p>
            </div>
          </div>
          <div className="border-t pt-3 space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <QrCode className="w-3.5 h-3.5 text-emerald-600" />
              <span>PIX online: <strong>{formatBRL(stats.pixOnline.total)}</strong> ({stats.pixOnline.qty} venda{stats.pixOnline.qty !== 1 ? 's' : ''})</span>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5 text-blue-600" />
              <span>Cartão online: <strong>{formatBRL(stats.cardOnline.total)}</strong> ({stats.cardOnline.qty} venda{stats.cardOnline.qty !== 1 ? 's' : ''})</span>
            </div>
            {stats.fisicaCount > 0 && (
              <div className="flex items-center gap-2">
                <Store className="w-3.5 h-3.5 text-purple-600" />
                <span>Venda Física (Totem/SmartPOS): <strong>{formatBRL(stats.fisica)}</strong> ({stats.fisicaCount} venda{stats.fisicaCount !== 1 ? 's' : ''})</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Vendas Manuais */}
      <Card className="border-indigo-200">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Hand className="w-4 h-4 text-indigo-600" /> Vendas Manuais
              <HoverCard openDelay={150}>
                <HoverCardTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="O que são vendas manuais">
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </HoverCardTrigger>
                <HoverCardContent className="w-80 text-xs">
                  Vendas registradas manualmente pelo produtor. O FestPag não processa
                  esses pagamentos — apenas registra para emitir ingressos e somar nas
                  vendas. Como o valor foi recebido direto por você, ele conta nas
                  vendas mas não entra no repasse.
                </HoverCardContent>
              </HoverCard>
            </h3>
            <span className="text-[10px] uppercase tracking-wide bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold">
              Conta nas vendas · fora do repasse
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Total de Vendas Manuais</p>
              <p className="text-2xl font-bold tabular-nums">{stats.manualCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Valor Manual (já recebido por você)</p>
              <p className="text-2xl font-bold tabular-nums break-words">{formatBRL(stats.manual)}</p>
            </div>
          </div>
          {stats.byMethodManual.length > 0 ? (
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Por Meio de Pagamento</p>
              <div className="space-y-1.5">
                {stats.byMethodManual.map(([method, v]) => (
                  <div key={method} className="flex justify-between text-sm">
                    <span>{METHOD_LABELS[method] || method}</span>
                    <span className="tabular-nums">{v.qty}× · <strong>{formatBRL(v.total)}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground border-t pt-3">
              Nenhuma venda manual registrada neste evento.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Vendas na Portaria — conferência. Só aparece em evento que tem venda de
          portaria (OS-408): a tela de lançar saiu em 20/08 e o bloco zerado confundia. */}
      {data?.doorSalesFailed && (
        <Card className="border-amber-200">
          <CardContent className="p-5 text-sm">
            <p className="font-semibold">Não foi possível ler as vendas de portaria agora.</p>
            <p className="text-muted-foreground mt-1">Os outros números desta tela não dependem delas. Tente recarregar a página.</p>
          </CardContent>
        </Card>
      )}
      {!data?.doorSalesFailed && stats.doorSalesCount > 0 && (
      <Card className="border-amber-200">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-amber-600" /> Vendas na Portaria
            </h3>
            <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
              Apenas conferência
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Quantidade vendida na porta</p>
              <p className="text-2xl font-bold tabular-nums">{stats.doorTickets}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Valor referência</p>
              <p className="text-2xl font-bold tabular-nums break-words">{formatBRL(stats.doorTotal)}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded p-2 flex gap-2">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
            <span>Estes valores <strong>não</strong> são contabilizados na receita. Servem apenas para controle de quantidade de pessoas e conferência de caixa.</span>
          </p>

          {stats.doorByMethod.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Por Meio de Pagamento</p>
              <div className="space-y-1.5">
                {stats.doorByMethod.map(([method, v]) => (
                  <div key={method} className="flex justify-between text-sm">
                    <span>{METHOD_LABELS[method] || method}</span>
                    <span className="tabular-nums">{v.qty}× · <strong>{formatBRL(v.total)}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.doorByOperator.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Por Operador</p>
              <div className="space-y-1.5">
                {stats.doorByOperator.map(([opId, v]) => (
                  <div key={opId} className="flex justify-between text-sm">
                    <span>{operators?.get(opId) || 'Desconhecido'}</span>
                    <span className="tabular-nums">{v.sales} venda(s) · <strong>{formatBRL(v.total)}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
