import { useEffect, useState } from 'react';
import { Search, Download, CheckCircle, Clock, XCircle, Users, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ParticipantListItem } from '@/components/producer/ParticipantListItem';
import { useEventParticipantsPage, useMudarIngresso, Ticket } from '@/hooks/useEventParticipants';
import { useEventTotals } from '@/hooks/useEventOrders';
import { lerTodosOsIngressos, type SituacaoIngresso } from '@/lib/painelDoEvento';
import { mensagemDeErro } from '@/lib/painelDoProdutor';
import { Skeleton } from '@/components/ui/skeleton';
import { FiltroDeLote } from '@/components/producer/FiltrosDaLista';
import { useEventLots } from '@/hooks/useEventLots';

interface EventParticipantsTabProps {
  eventId: string;
}

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-2xl border border-primary/10 bg-card/40 backdrop-blur-xl overflow-hidden ${className}`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      {children}
    </div>
  );
}

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

/** Uma aba da lista: 50 ingressos por vez, situação e busca filtradas no banco (OS-408). */
function ListaDeIngressos({ eventId, situacao, busca, loteId, vazio, onUpdateStatus }: {
  eventId: string; situacao: SituacaoIngresso; busca: string; loteId: string | null; vazio: string;
  onUpdateStatus: (ticketId: string, status: Ticket['status']) => void;
}) {
  const { tickets, total, temMais, carregarMais, carregandoMais, isLoading, error } = useEventParticipantsPage(eventId, { situacao, busca, loteId });
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }
  if (error) return renderEmpty(mensagemDeErro(error));
  if (tickets.length === 0) return renderEmpty(busca || loteId ? 'Nenhum participante encontrado.' : vazio);
  return (
    <>
      {tickets.map((ticket) => (
        <ParticipantListItem key={ticket.id} ticket={ticket} onUpdateStatus={onUpdateStatus} />
      ))}
      {/* Com o filtro de ingresso, a contagem aparece sempre (quantos o banco achou). */}
      {(temMais || !!loteId) && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <p className="text-xs text-muted-foreground">Mostrando {formatNumero(tickets.length)} de {formatNumero(total)}</p>
          {temMais && (
            <Button variant="outline" className="rounded-xl" onClick={() => carregarMais()} disabled={carregandoMais}>
              {carregandoMais && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Carregar mais
            </Button>
          )}
        </div>
      )}
    </>
  );
}

const ABAS: { value: SituacaoIngresso; vazio: string }[] = [
  { value: 'todos', vazio: 'Nenhum ingresso vendido ainda.' },
  { value: 'validos', vazio: 'Ninguém esperando para entrar.' },
  { value: 'usados', vazio: 'Ninguém entrou ainda.' },
  { value: 'cancelados', vazio: 'Nenhum ingresso cancelado.' },
];

const classeDaAba = 'flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 rounded-xl px-2 sm:px-3 py-2 text-[11px] sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-pink-500 data-[state=active]:text-white';

export function EventParticipantsTab({ eventId }: EventParticipantsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const busca = useDigitado(searchQuery);
  const [situacao, setSituacao] = useState<SituacaoIngresso>('todos');
  const [exportando, setExportando] = useState(false);
  // Filtro por ingresso (lote), OS-408 etapa 5, item 5.5: no banco.
  const [loteId, setLoteId] = useState<string | null>(null);
  const { lots } = useEventLots(eventId);
  // Os números dos cartões e das abas vêm do banco (OS-408): não dependem da página carregada.
  const { data: totais, isLoading, error: erroDosTotais } = useEventTotals(eventId);
  const updateTicketStatus = useMudarIngresso(eventId);

  const handleUpdateStatus = (ticketId: string, status: Ticket['status']) => {
    updateTicketStatus.mutate({ ticketId, status });
  };

  // "Exportar Lista" traz TODOS os participantes, lidos em blocos de 500 até acabar.
  const exportar = async () => {
    setExportando(true);
    try {
      const tickets = await lerTodosOsIngressos(eventId, { situacao: 'todos' });
      if (tickets.length === 0) return;
      const headers = ['Nome', 'Email', 'Telefone', 'Código', 'Status', 'Data'];
      const rows = tickets.map(t => [t.holder_name, t.holder_email || '', t.holder_phone || '', t.ticket_code, t.status, new Date(t.created_at).toLocaleDateString('pt-BR')]);
      const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'participantes.csv'; a.click(); URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(mensagemDeErro(e));
    } finally {
      setExportando(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const n = (v: number | undefined) => (v == null ? '—' : formatNumero(v));
  const stats = [
    { label: 'Total de Ingressos', value: n(totais?.ingressos), icon: Users, iconBg: 'bg-primary/15', iconColor: 'text-primary' },
    { label: 'Ainda não entraram', value: n(totais?.ingressos_validos), icon: Clock, iconBg: 'bg-blue-500/15', iconColor: 'text-blue-400' },
    { label: 'Entraram', value: n(totais?.ingressos_usados), icon: CheckCircle, iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400' },
    { label: 'Cancelados', value: n(totais?.ingressos_cancelados), icon: XCircle, iconBg: 'bg-red-500/15', iconColor: 'text-red-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Sem os totais, os cartões mostram "—" e dizem por quê (a lista e o Exportar seguem). */}
      {erroDosTotais && <p className="text-sm text-destructive">{mensagemDeErro(erroDosTotais)}</p>}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {stats.map((s) => (
          <GlassCard key={s.label}>
            <div className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.iconBg}`}>
                <s.icon className={`h-5 w-5 ${s.iconColor}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xl md:text-2xl font-bold truncate">{s.value}</p>
                <p className="text-[11px] md:text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou código do ingresso..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 rounded-xl bg-background/50 border-border/60"
          />
        </div>
        <div className="sm:w-56 [&_button]:h-11">
          <FiltroDeLote lotes={(lots || []).map((l) => ({ id: l.id, name: l.name, sector_name: l.sector_name }))} valor={loteId} onChange={setLoteId} />
        </div>
        <Button
          variant="outline"
          className="h-11 rounded-xl bg-card/40 backdrop-blur-xl border-primary/10 hover:bg-card/60"
          onClick={exportar}
          disabled={exportando || totais?.ingressos === 0}
        >
          {exportando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Exportar Lista
        </Button>
      </div>

      {/* Participants Tabs — scrollable horizontally on mobile */}
      <Tabs value={situacao} onValueChange={(v) => setSituacao(v as SituacaoIngresso)}>
        <TabsList className="grid grid-cols-4 sm:flex w-full gap-1 p-1 h-auto bg-card/40 backdrop-blur-xl border border-primary/10 rounded-2xl">
          <TabsTrigger value="todos" className={classeDaAba}>
            Todos <Badge variant="secondary" className="bg-background/50 text-[10px] sm:text-xs px-1.5">{n(totais?.ingressos)}</Badge>
          </TabsTrigger>
          <TabsTrigger value="validos" className={`${classeDaAba} text-center`}>
            <span className="leading-tight">Ainda não<br className="sm:hidden"/> entraram</span>
            <Badge variant="secondary" className="bg-background/50 text-[10px] sm:text-xs px-1.5">{n(totais?.ingressos_validos)}</Badge>
          </TabsTrigger>
          <TabsTrigger value="usados" className={classeDaAba}>
            Entraram <Badge variant="secondary" className="bg-background/50 text-[10px] sm:text-xs px-1.5">{n(totais?.ingressos_usados)}</Badge>
          </TabsTrigger>
          <TabsTrigger value="cancelados" className={classeDaAba}>
            Cancelados <Badge variant="secondary" className="bg-background/50 text-[10px] sm:text-xs px-1.5">{n(totais?.ingressos_cancelados)}</Badge>
          </TabsTrigger>
        </TabsList>

        {ABAS.map((a) => (
          <TabsContent key={a.value} value={a.value} className="mt-4 space-y-3">
            <ListaDeIngressos eventId={eventId} situacao={a.value} busca={busca} loteId={loteId} vazio={a.vazio} onUpdateStatus={handleUpdateStatus} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
