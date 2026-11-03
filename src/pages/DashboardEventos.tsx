import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { CalendarDays, ExternalLink, Layers, Sparkles } from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { EventListItem } from '@/components/producer/EventListItem';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEvents } from '@/hooks/useEvents';
import { supabasePublic } from '@/integrations/supabase/publicClient';
import { tituloSemSessao, type InfoDaLista } from '@/hooks/useListaDeAlunos';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function EventSkeleton() {
  return (
    <div className="rounded-2xl border border-primary/10 bg-card/40 backdrop-blur-xl overflow-hidden animate-pulse">
      <div className="flex flex-col md:flex-row">
        <div className="w-full md:w-60 h-44 md:h-48 bg-gradient-to-br from-primary/10 to-accent/10" />
        <div className="flex-1 p-5 space-y-3">
          <div className="h-5 w-2/3 rounded bg-muted/40" />
          <div className="h-4 w-1/2 rounded bg-muted/30" />
          <div className="flex gap-2 pt-2">
            <div className="h-6 w-24 rounded-full bg-muted/30" />
            <div className="h-6 w-24 rounded-full bg-muted/30" />
            <div className="h-6 w-20 rounded-full bg-muted/30" />
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted/30" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-card/30 backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      <div className="relative text-center py-16 px-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 shadow-lg shadow-primary/10">
          <CalendarDays className="w-9 h-9 text-primary" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-1.5">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {message}
        </p>
      </div>
    </div>
  );
}

type EventoDaLista = NonNullable<ReturnType<typeof useEvents>['events']>[number];

/** Sessões de uma mesma lista de alunos (o Balé: duas sessões, uma página). */
function GrupoDeSessoes({ info, sessoes, onDelete }: {
  info: InfoDaLista;
  sessoes: EventoDaLista[];
  onDelete: (id: string) => void;
}) {
  const titulo = info.pagina_titulo || tituloSemSessao(sessoes[0]?.title ?? '');
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-3 md:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Layers className="w-3.5 h-3.5" /> Um evento, {sessoes.length} sessões
          </p>
          <h3 className="font-display text-lg font-bold truncate">{titulo}</h3>
        </div>
        {info.pagina_slug && (
          <Link
            to={`/evento/${info.pagina_slug}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
          >
            Ver a página <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
      {sessoes.map((event) => (
        <EventListItem key={event.id} event={event} onDelete={onDelete} />
      ))}
    </div>
  );
}

export default function DashboardEventos() {
  const { events, activeEvents, pastEvents, draftEvents, isLoading, deleteEvent } = useEvents();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Evento com mapa pode ser sessão de uma lista de alunos: as sessões da mesma
  // lista aparecem juntas, como um evento só (ajuste da Doca 347).
  const comMapa = useMemo(
    () => (events ?? []).filter((e: any) => e.event_type === 'mesa' || e.event_type === 'hibrido'),
    [events],
  );
  const listas = useQueries({
    queries: comMapa.map((e) => ({
      queryKey: ['lista-alunos', e.id],
      staleTime: 60_000,
      retry: 1,
      queryFn: async (): Promise<InfoDaLista> => {
        const { data, error } = await (supabasePublic as any).rpc('evento_lista_info', { _event_id: e.id });
        if (error) throw error;
        return (data as InfoDaLista) ?? { tem_lista: false };
      },
    })),
  });
  const listaDoEvento = useMemo(() => {
    const m = new Map<string, InfoDaLista>();
    comMapa.forEach((e, i) => {
      const info = listas[i]?.data;
      if (info?.tem_lista && info.lista_id) m.set(e.id, info);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comMapa, listas.map((q) => q.dataUpdatedAt).join(',')]);

  const handleDelete = (id: string) => setDeleteId(id);

  const confirmDelete = () => {
    if (deleteId) {
      deleteEvent.mutate(deleteId);
      setDeleteId(null);
    }
  };

  const renderEventList = (
    eventList: typeof events,
    emptyTitle: string,
    emptyMessage: string,
  ) => {
    if (isLoading) {
      return (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <EventSkeleton key={i} />
          ))}
        </div>
      );
    }

    if (!eventList || eventList.length === 0) {
      return <EmptyState title={emptyTitle} message={emptyMessage} />;
    }

    // Sessões da mesma lista entram juntas, no lugar da primeira delas.
    const jaNoGrupo = new Set<string>();
    return (
      <div className="space-y-4">
        {eventList.map((event) => {
          if (jaNoGrupo.has(event.id)) return null;
          const info = listaDoEvento.get(event.id);
          // Na ordem da sessão (as duas nascem com o mesmo created_at).
          const numero = (id: string) => info?.sessoes?.find((x) => x.event_id === id)?.sessao ?? 99;
          const sessoes = info
            ? eventList.filter((e) => listaDoEvento.get(e.id)?.lista_id === info.lista_id)
                .sort((a, b) => numero(a.id) - numero(b.id))
            : [];
          if (info && sessoes.length > 1) {
            sessoes.forEach((e) => jaNoGrupo.add(e.id));
            return <GrupoDeSessoes key={`lista-${info.lista_id}`} info={info} sessoes={sessoes} onDelete={handleDelete} />;
          }
          return <EventListItem key={event.id} event={event} onDelete={handleDelete} />;
        })}
      </div>
    );
  };

  // As sessões de uma lista contam como um evento só.
  const contar = (lista: typeof events) => {
    const vistas = new Set<string>();
    let n = 0;
    for (const e of lista ?? []) {
      const l = listaDoEvento.get(e.id)?.lista_id;
      if (l) { if (vistas.has(l)) continue; vistas.add(l); }
      n += 1;
    }
    return n;
  };
  const totalCount = contar(events);

  return (
    <ProducerLayout>
      <div className="space-y-6 overflow-hidden">
        {/* Premium Header */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-card/30 backdrop-blur-xl p-5 md:p-8">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/20 blur-3xl opacity-40" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-accent/20 blur-3xl opacity-30" />

          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary rounded-full px-3 py-1 text-[11px] font-semibold backdrop-blur mb-3">
                <Sparkles className="w-3 h-3" />
                {totalCount} {totalCount === 1 ? 'evento no total' : 'eventos no total'}
              </div>
              <h1 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                Meus Eventos
              </h1>
              <p className="text-muted-foreground mt-1.5 text-sm md:text-base">
                Gerencie todos os seus eventos em um só lugar
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="active" className="space-y-6">
          <TabsList className="grid grid-cols-4 w-full h-auto gap-1 p-1 bg-card/40 backdrop-blur-xl border border-primary/10 rounded-xl">
            <TabsTrigger
              value="active"
              className="min-w-0 text-[11px] sm:text-sm py-2 px-1.5 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-primary/30"
            >
              <span className="truncate">Ativos</span>
              <span className="block sm:inline sm:ml-1.5 opacity-70">({contar(activeEvents)})</span>
            </TabsTrigger>
            <TabsTrigger
              value="drafts"
              className="min-w-0 text-[11px] sm:text-sm py-2 px-1.5 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-primary/30"
            >
              <span className="truncate">Rascunhos</span>
              <span className="block sm:inline sm:ml-1.5 opacity-70">({contar(draftEvents)})</span>
            </TabsTrigger>
            <TabsTrigger
              value="past"
              className="min-w-0 text-[11px] sm:text-sm py-2 px-1.5 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-primary/30"
            >
              <span className="truncate">Passados</span>
              <span className="block sm:inline sm:ml-1.5 opacity-70">({contar(pastEvents)})</span>
            </TabsTrigger>
            <TabsTrigger
              value="all"
              className="min-w-0 text-[11px] sm:text-sm py-2 px-1.5 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-primary/30"
            >
              <span className="truncate">Todos</span>
              <span className="block sm:inline sm:ml-1.5 opacity-70">({totalCount})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {renderEventList(
              activeEvents,
              'Nenhum evento ativo no momento',
              'Crie um evento e publique-o para começar a vender ingressos.',
            )}
          </TabsContent>

          <TabsContent value="drafts">
            {renderEventList(
              draftEvents,
              'Você não tem rascunhos',
              'Comece a criar um evento e salve-o como rascunho para terminar depois.',
            )}
          </TabsContent>

          <TabsContent value="past">
            {renderEventList(
              pastEvents,
              'Nenhum evento passado por aqui',
              'Seus eventos finalizados aparecerão aqui após a data ter passado.',
            )}
          </TabsContent>

          <TabsContent value="all">
            {renderEventList(
              events,
              'Você ainda não criou nenhum evento',
              'Que tal criar o primeiro? Em poucos minutos você está pronto pra vender.',
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O evento e todos os seus lotes serão
              permanentemente excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProducerLayout>
  );
}
