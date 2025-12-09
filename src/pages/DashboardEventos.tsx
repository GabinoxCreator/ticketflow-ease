import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, CalendarDays } from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { EventListItem } from '@/components/producer/EventListItem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEvents } from '@/hooks/useEvents';
import { Skeleton } from '@/components/ui/skeleton';
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
        event.city.toLowerCase().includes(query)
    );
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteEvent.mutate(deleteId);
      setDeleteId(null);
    }
  };

  const renderEventList = (eventList: typeof events, emptyMessage: string) => {
    const filtered = filterEvents(eventList);

    if (isLoading) {
      return (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      );
    }

    if (!eventList || eventList.length === 0) {
      return (
        <div className="text-center py-12">
          <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">{emptyMessage}</p>
          <Button onClick={() => navigate('/criar-evento')} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Criar Evento
          </Button>
        </div>
      );
    }

    if (filtered.length === 0) {
      return (
        <div className="text-center py-12">
          <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            Nenhum evento encontrado para "{searchQuery}"
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {filtered.map((event) => (
          <EventListItem
            key={event.id}
            event={event}
            onDelete={handleDelete}
          />
        ))}
      </div>
    );
  };

  return (
    <ProducerLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Meus Eventos</h1>
            <p className="text-muted-foreground">
              Gerencie todos os seus eventos em um só lugar
            </p>
          </div>
          <Button onClick={() => navigate('/criar-evento')}>
            <Plus className="w-4 h-4 mr-2" />
            Criar Evento
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar eventos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="active" className="space-y-6">
          <TabsList>
            <TabsTrigger value="active">
              Ativos ({activeEvents.length})
            </TabsTrigger>
            <TabsTrigger value="drafts">
              Rascunhos ({draftEvents.length})
            </TabsTrigger>
            <TabsTrigger value="past">
              Passados ({pastEvents.length})
            </TabsTrigger>
            <TabsTrigger value="all">
              Todos ({events?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {renderEventList(activeEvents, 'Você não tem eventos ativos no momento')}
          </TabsContent>

          <TabsContent value="drafts">
            {renderEventList(draftEvents, 'Você não tem rascunhos de eventos')}
          </TabsContent>

          <TabsContent value="past">
            {renderEventList(pastEvents, 'Você ainda não tem eventos passados')}
          </TabsContent>

          <TabsContent value="all">
            {renderEventList(events, 'Você ainda não criou nenhum evento')}
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
