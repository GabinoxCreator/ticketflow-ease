import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, CalendarDays, Sparkles, X } from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { EventListItem } from '@/components/producer/EventListItem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEvents } from '@/hooks/useEvents';
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
  onAction,
  actionLabel = 'Criar meu primeiro evento',
  icon: Icon = CalendarDays,
}: {
  title: string;
  message: string;
  onAction?: () => void;
  actionLabel?: string;
  icon?: typeof CalendarDays;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-card/30 backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      <div className="relative text-center py-16 px-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 shadow-lg shadow-primary/10">
          <Icon className="w-9 h-9 text-primary" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-1.5">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
          {message}
        </p>
        {onAction && (
          <Button
            onClick={onAction}
            className="bg-gradient-to-r from-primary to-accent hover:opacity-90 shadow-lg shadow-primary/30"
          >
            <Plus className="w-4 h-4 mr-2" />
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function DashboardEventos() {
  const navigate = useNavigate();
  const { events, activeEvents, pastEvents, draftEvents, isLoading, deleteEvent } = useEvents();
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filterEvents = (eventList: typeof events) => {
    if (!eventList) return [];
    if (!searchQuery.trim()) return eventList;
    const query = searchQuery.toLowerCase();
    return eventList.filter(
      (event) =>
        event.title.toLowerCase().includes(query) ||
        event.venue.toLowerCase().includes(query) ||
        event.city.toLowerCase().includes(query),
    );
  };

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
    showCreateCta = true,
  ) => {
    const filtered = filterEvents(eventList);

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
      return (
        <EmptyState
          title={emptyTitle}
          message={emptyMessage}
          onAction={showCreateCta ? () => navigate('/produtor/criar-evento') : undefined}
        />
      );
    }

    if (filtered.length === 0) {
      return (
        <EmptyState
          icon={Search}
          title={`Nenhum resultado para "${searchQuery}"`}
          message="Tente buscar por outro nome, local ou cidade."
          onAction={() => setSearchQuery('')}
          actionLabel="Limpar busca"
        />
      );
    }

    return (
      <div className="space-y-4">
        {filtered.map((event) => (
          <EventListItem key={event.id} event={event} onDelete={handleDelete} />
        ))}
      </div>
    );
  };

  const totalCount = events?.length || 0;

  return (
    <ProducerLayout>
      <div className="space-y-6 overflow-hidden">
        {/* Premium Header */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-card/30 backdrop-blur-xl p-6 md:p-8">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/20 blur-3xl opacity-40" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-accent/20 blur-3xl opacity-30" />

          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary rounded-full px-3 py-1 text-[11px] font-semibold backdrop-blur mb-3">
                <Sparkles className="w-3 h-3" />
                {totalCount} {totalCount === 1 ? 'evento no total' : 'eventos no total'}
              </div>
              <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                Meus Eventos
              </h1>
              <p className="text-muted-foreground mt-1.5 text-sm md:text-base">
                Gerencie todos os seus eventos em um só lugar
              </p>
            </div>
            <Button
              onClick={() => navigate('/produtor/criar-evento')}
              size="lg"
              className="bg-gradient-to-r from-primary to-accent hover:opacity-90 shadow-lg shadow-primary/30 flex-shrink-0"
            >
              <Plus className="w-4 h-4 mr-2" />
              Criar Evento
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/70" />
          <Input
            placeholder="Buscar por nome, local ou cidade..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 pr-10 h-12 bg-card/50 backdrop-blur-xl border-primary/10 focus-visible:border-primary/40 focus-visible:ring-primary/20 rounded-xl"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/40 transition"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="active" className="space-y-6">
          <TabsList className="grid grid-cols-4 w-full h-auto p-1 bg-card/40 backdrop-blur-xl border border-primary/10 rounded-xl">
            <TabsTrigger
              value="active"
              className="text-xs sm:text-sm py-2.5 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-primary/30"
            >
              Ativos <span className="ml-1.5 opacity-70">({activeEvents.length})</span>
            </TabsTrigger>
            <TabsTrigger
              value="drafts"
              className="text-xs sm:text-sm py-2.5 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-primary/30"
            >
              Rascunhos <span className="ml-1.5 opacity-70">({draftEvents.length})</span>
            </TabsTrigger>
            <TabsTrigger
              value="past"
              className="text-xs sm:text-sm py-2.5 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-primary/30"
            >
              Passados <span className="ml-1.5 opacity-70">({pastEvents.length})</span>
            </TabsTrigger>
            <TabsTrigger
              value="all"
              className="text-xs sm:text-sm py-2.5 rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-primary/30"
            >
              Todos <span className="ml-1.5 opacity-70">({totalCount})</span>
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
              false,
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
