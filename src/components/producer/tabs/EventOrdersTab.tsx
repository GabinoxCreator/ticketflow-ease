import { useEffect, useState } from 'react';
import { Search, Download, ClipboardList, CheckCircle2, Clock, DollarSign, Megaphone, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrderListItem } from '@/components/producer/OrderListItem';
import { OrderDetailDrawer } from '@/components/producer/OrderDetailDrawer';
import { useEventOrders, useEventTotals, useTentativasDoEvento, Order } from '@/hooks/useEventOrders';
import { reasonOf } from '@/lib/orderAttempts';
import { lerTodosOsPedidos, POR_PAGINA, type SituacaoPedido } from '@/lib/painelDoEvento';
import { mensagemDeErro } from '@/lib/painelDoProdutor';
import { Skeleton } from '@/components/ui/skeleton';
import { CAIXA_DO_VALOR, VALOR_QUE_CABE } from '@/components/producer/valorQueCabe';

interface EventOrdersTabProps {
  eventId: string;
  // Meta do evento — usada só pra montar o PDF dos ingressos no drawer.
  event: { id: string; title: string; date: string; time: string; venue: string; city: string; state: string };
}

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-2xl border border-primary/10 bg-card/40 backdrop-blur-xl overflow-hidden ${className}`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      {children}
    </div>
  );
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatNumero = (n: number) => new Intl.NumberFormat('pt-BR').format(n);

/** Espera a pessoa parar de digitar antes de perguntar ao banco. */
function useDigitado(valor: string, ms = 350) {
  const [firme, setFirme] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setFirme(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return firme;
}

const renderEmpty = (msg: string) => (
  <GlassCard>
    <div className="py-12 text-center text-sm text-muted-foreground">{msg}</div>
  </GlassCard>
);

function CarregarMais({ mostrando, total, onClick, carregando }: { mostrando: number; total: number; onClick: () => void; carregando: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 pt-2">
      <p className="text-xs text-muted-foreground">Mostrando {formatNumero(mostrando)} de {formatNumero(total)}</p>
      <Button variant="outline" className="rounded-xl" onClick={onClick} disabled={carregando}>
        {carregando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Carregar mais
      </Button>
    </div>
  );
}

/** Uma aba da lista: 50 pedidos por vez, situação e busca filtradas no banco (OS-408). */
function ListaDePedidos({ eventId, situacao, busca, vazio, onSelect }: {
  eventId: string; situacao: SituacaoPedido; busca: string; vazio: string; onSelect: (o: Order) => void;
}) {
  const { orders, total, temMais, carregarMais, carregandoMais, isLoading, error, updateOrderStatus } = useEventOrders(eventId, { situacao, busca });
  const handleUpdateStatus = (orderId: string, status: Order['status']) => updateOrderStatus.mutate({ orderId, status });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }
  if (error) return renderEmpty(mensagemDeErro(error));
  if (orders.length === 0) return renderEmpty(busca ? 'Nenhum pedido encontrado com esses termos.' : vazio);
  return (
    <>
      {orders.map((order) => (
        <OrderListItem key={order.id} order={order} onSelect={onSelect} onUpdateStatus={handleUpdateStatus} />
      ))}
      {temMais && <CarregarMais mostrando={orders.length} total={total} onClick={carregarMais} carregando={carregandoMais} />}
    </>
  );
}

/** "Não concluídos": compara TODAS as tentativas com TODOS os pagos (lidos em blocos). */
function Tentativas({ eventId, busca, onSelect }: { eventId: string; busca: string; onSelect: (o: Order) => void }) {
  const { data, isLoading, error } = useTentativasDoEvento(eventId, true);
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  useEffect(() => setMostrar(POR_PAGINA), [busca]);

  const q = busca.trim().toLowerCase();
  const casa = (nome?: string | null, email?: string | null, fone?: string | null) =>
    !q || (nome || '').toLowerCase().includes(q) || (email || '').toLowerCase().includes(q) || (fone || '').toLowerCase().includes(q);
  const naoVoltaram = (data?.notReturned ?? []).filter((p) => casa(p.name, p.email, p.phone));
  const tentativas = (data?.tentativas ?? []).filter((o) => casa(o.customer_name, o.customer_email, o.customer_phone));

  return (
    <>
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/15 flex-shrink-0">
          <Megaphone className="h-4 w-4 text-amber-400" />
        </div>
        <div className="text-xs sm:text-sm text-amber-900 dark:text-amber-100/90">
          <strong className="text-amber-700 dark:text-amber-300">Tentativas de compra que não foram pagas:</strong> o PIX venceu ou o cartão foi recusado. Cada QR novo ou nova tentativa aparece como um pedido, e muita gente acaba comprando depois (marcada com "Comprou depois"). Nada aqui foi cobrado.
        </div>
      </div>

      {isLoading && <Skeleton className="h-24 w-full" />}
      {error && renderEmpty(mensagemDeErro(error))}

      {naoVoltaram.length > 0 && (
        <GlassCard>
          <div className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/15 flex-shrink-0">
                <Megaphone className="h-4 w-4 text-primary" />
              </div>
              <div className="text-xs sm:text-sm">
                <strong>Quem não voltou ({(data?.notReturned ?? []).length}):</strong>{' '}
                <span className="text-muted-foreground">
                  estas pessoas tentaram comprar e não têm nenhum pedido pago neste evento. Chame pelo contato para retomar a venda.
                </span>
              </div>
            </div>
            {naoVoltaram.map((p) => (
              <div key={p.key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded-lg border bg-card p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.email}{p.phone ? ` · ${p.phone}` : ''}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground sm:text-right">
                  <p>{p.attempts.length} tentativa(s) · {formatCurrency(p.totalAmount)}</p>
                  <p>última: {reasonOf(p.attempts[0])}, {new Date(p.lastAttemptAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {data && (
        <>
          <h3 className="text-sm font-medium text-muted-foreground pt-2">Todas as tentativas</h3>
          {tentativas.length === 0
            ? renderEmpty(q ? 'Nenhum pedido encontrado com esses termos.' : 'Nenhuma tentativa sem pagamento.')
            : tentativas.slice(0, mostrar).map((order) => (
                <OrderListItem key={order.id} order={order} onSelect={onSelect} boughtLater={data.boughtLater.has(order.id)} />
              ))}
          {tentativas.length > mostrar && (
            <CarregarMais mostrando={mostrar} total={tentativas.length} onClick={() => setMostrar((m) => m + POR_PAGINA)} carregando={false} />
          )}
        </>
      )}
    </>
  );
}

const ABAS: { value: SituacaoPedido; label: string; vazio: string }[] = [
  { value: 'todos', label: 'Todos', vazio: 'Nenhum pedido registrado.' },
  { value: 'pagos', label: 'Pagos', vazio: 'Nenhum pedido pago.' },
  { value: 'pendentes', label: 'Pendentes', vazio: 'Nenhum pedido pendente.' },
  { value: 'cancelados', label: 'Cancelados', vazio: 'Nenhum pedido cancelado ou reembolsado.' },
  { value: 'nao_concluidos', label: 'Não concluídos', vazio: 'Nenhuma tentativa sem pagamento.' },
];

export function EventOrdersTab({ eventId, event }: EventOrdersTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const busca = useDigitado(searchQuery);
  const [situacao, setSituacao] = useState<SituacaoPedido>('todos');
  const [exportando, setExportando] = useState(false);
  // Os números dos cartões e das abas vêm do banco (OS-408): não dependem da página carregada.
  const { data: totais, isLoading: totaisCarregando, error: erroDosTotais } = useEventTotals(eventId);

  // Drawer de detalhe controlado AQUI (um só, fora dos itens clicáveis) — o clique de
  // fechar não borbulha mais até o onClick do item. selectedOrder fica após fechar
  // (Sheet só esconde) → mantém a animação de saída e não precisa tratar order null.
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openOrder = (order: Order) => { setSelectedOrder(order); setDrawerOpen(true); };

  // "Exportar" traz TODOS os pedidos do evento, lidos em blocos de 500 até acabar
  // (antes saía só o que coube numa leitura).
  const exportar = async () => {
    setExportando(true);
    try {
      const orders = await lerTodosOsPedidos(eventId, { situacao: 'todos' });
      if (orders.length === 0) return;
      const headers = ['Nome', 'Email', 'Telefone', 'CPF', 'Valor', 'Status', 'Origem', 'Método', 'Método Manual', 'Taxa Aplicada', 'Nota Manual', 'Data'];
      const rows = orders.map(o => [
        o.customer_name,
        o.customer_email,
        o.customer_phone || '',
        o.customer_cpf || '',
        o.total_amount.toString(),
        o.status,
        o.sale_origin || 'online',
        o.payment_method || '',
        o.manual_payment_method || '',
        o.sale_origin === 'manual' ? (o.manual_fee_applied ? 'Sim' : 'Não') : '',
        (o.manual_payment_note || '').replace(/"/g, '""'),
        new Date(o.created_at).toLocaleDateString('pt-BR'),
      ]);
      const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'pedidos.csv'; a.click(); URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(mensagemDeErro(e));
    } finally {
      setExportando(false);
    }
  };

  if (totaisCarregando) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const n = (v: number | undefined) => (v == null ? '—' : formatNumero(v));
  const contagem: Record<SituacaoPedido, number | undefined> = {
    todos: totais?.pedidos,
    pagos: totais?.pagos,
    pendentes: totais?.pendentes,
    cancelados: totais?.cancelados,
    nao_concluidos: totais?.nao_concluidos,
  };
  const comProblema = totais?.com_problema ?? 0;

  const stats = [
    { label: 'Total de Pedidos', value: n(totais?.pedidos), icon: ClipboardList, iconBg: 'bg-primary/15', iconColor: 'text-primary' },
    { label: 'Pagos', value: n(totais?.pagos), icon: CheckCircle2, iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400' },
    { label: 'Pendentes', value: n(totais?.pendentes), icon: Clock, iconBg: 'bg-amber-500/15', iconColor: 'text-amber-400' },
    // Abaixo de 1280 px o valor em reais ocupa a linha inteira, para não sair cortado ("R$ 16....").
    { label: 'Vendido', value: totais ? formatCurrency(totais.vendido) : '—', icon: DollarSign, iconBg: 'bg-gradient-to-br from-primary/20 to-pink-500/20', iconColor: 'text-primary', gradient: true, largo: true },
  ];

  return (
    <div className="space-y-6">
      {/* Fase 10: chip de pedidos sinalizados para revisão */}
      {comProblema > 0 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-500/20 flex-shrink-0">
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </div>
          <div className="text-xs sm:text-sm text-red-100/90">
            <strong className="text-red-300">{comProblema} pedido(s) com problema:</strong>{' '}
            o pagamento foi confirmado, mas a entrega dos ingressos falhou (parcial ou totalmente). Revise abaixo e fale com a FestPag para devolver o valor ou entregar o ingresso.
          </div>
        </div>
      )}

      {/* Sem os totais, os cartões mostram "—" e dizem por quê (a lista e o Exportar seguem). */}
      {erroDosTotais && <p className="text-sm text-destructive">{mensagemDeErro(erroDosTotais)}</p>}

      {/* Summary Cards */}
      {/* Quatro cartões lado a lado só a partir de 1280 px; abaixo disso, dois por linha e o
          valor em reais na linha inteira, em primeiro: no notebook estreito ele não cabia (OS-408). */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        {stats.map((s) => (
          <GlassCard key={s.label} className={s.largo ? 'col-span-2 xl:col-span-1 order-first xl:order-none' : ''}>
            <div className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.iconBg}`}>
                <s.icon className={`h-5 w-5 ${s.iconColor}`} />
              </div>
              {/* Valor em reais: a letra diminui até caber, nunca sai cortado (valorQueCabe.ts). */}
              <div className={s.gradient ? CAIXA_DO_VALOR : 'min-w-0'}>
                <p className={`font-bold ${s.gradient ? `${VALOR_QUE_CABE} bg-gradient-to-r from-primary to-pink-500 bg-clip-text text-transparent` : 'text-xl md:text-2xl truncate'}`}>
                  {s.value}
                </p>
                <p className="text-[11px] md:text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Search and Export */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou telefone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 rounded-xl bg-background/50 border-border/60"
          />
        </div>
        <Button
          variant="outline"
          className="h-11 rounded-xl bg-card/40 backdrop-blur-xl border-primary/10 hover:bg-card/60"
          onClick={exportar}
          disabled={exportando || totais?.pedidos === 0}
        >
          {exportando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Exportar
        </Button>
      </div>

      {/* Orders Tabs — scrollable horizontally on mobile */}
      <Tabs value={situacao} onValueChange={(v) => setSituacao(v as SituacaoPedido)}>
        <TabsList className="grid grid-cols-3 sm:flex w-full gap-1 p-1 h-auto bg-card/40 backdrop-blur-xl border border-primary/10 rounded-2xl">
          {ABAS.map((a) => (
            <TabsTrigger key={a.value} value={a.value} className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 rounded-xl px-2 sm:px-3 py-2 text-[11px] sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-pink-500 data-[state=active]:text-white">
              {a.label} <Badge variant="secondary" className="bg-background/50 text-[10px] sm:text-xs px-1.5">{n(contagem[a.value])}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {ABAS.filter((a) => a.value !== 'nao_concluidos').map((a) => (
          <TabsContent key={a.value} value={a.value} className="mt-4 space-y-3">
            {a.value === 'pendentes' && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/15 flex-shrink-0">
                  <Megaphone className="h-4 w-4 text-amber-400" />
                </div>
                <div className="text-xs sm:text-sm text-amber-100/90">
                  <strong className="text-amber-300">Oportunidade de remarketing:</strong> estes clientes iniciaram a compra mas não concluíram o pagamento. Use os contatos abaixo para retomar a venda.
                </div>
              </div>
            )}
            <ListaDePedidos eventId={eventId} situacao={a.value} busca={busca} vazio={a.vazio} onSelect={openOrder} />
          </TabsContent>
        ))}

        <TabsContent value="nao_concluidos" className="mt-4 space-y-3">
          <Tentativas eventId={eventId} busca={busca} onSelect={openOrder} />
        </TabsContent>
      </Tabs>

      {/* Um único drawer pra toda a lista (todas as abas). Fora dos itens clicáveis. */}
      {selectedOrder && (
        <OrderDetailDrawer
          order={selectedOrder}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          eventMeta={event}
        />
      )}
    </div>
  );
}
