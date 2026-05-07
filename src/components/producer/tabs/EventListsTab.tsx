import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useGuestLists, useGuestListMutations, useGuestListEntries, GuestList, GuestListEntry } from '@/hooks/useGuestLists';
import { AddGuestListDialog } from '@/components/producer/AddGuestListDialog';
import { GuestListEntriesManager } from '@/components/producer/GuestListEntriesManager';
import { 
  Plus, 
  Link as LinkIcon, 
  Users, 
  Clock, 
  Trash2, 
  ChevronRight,
  Copy,
  CheckCircle,
  ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';
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

interface EventListsTabProps {
  eventId: string;
  eventTime?: string | null;
}

export function EventListsTab({ eventId, eventTime }: EventListsTabProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedList, setSelectedList] = useState<GuestList | null>(null);
  const [listToDelete, setListToDelete] = useState<GuestList | null>(null);
  
  const { data: lists, isLoading } = useGuestLists(eventId);
  const { deleteList } = useGuestListMutations();

  const handleCopyLink = (slug: string) => {
    const url = `${window.location.origin}/lista/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado para a área de transferência');
  };

  const handleDeleteList = async () => {
    if (!listToDelete) return;
    
    try {
      await deleteList.mutateAsync(listToDelete.id);
      toast.success('Lista excluída com sucesso');
      setListToDelete(null);
    } catch (error) {
      toast.error('Erro ao excluir lista');
    }
  };

  if (selectedList) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setSelectedList(null)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <h2 className="text-xl font-semibold">{selectedList.name}</h2>
          <Badge variant={selectedList.is_active ? 'default' : 'secondary'}>
            {selectedList.is_active ? 'Ativa' : 'Inativa'}
          </Badge>
        </div>
        
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            Válida até {selectedList.valid_until_time.slice(0, 5)}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCopyLink(selectedList.public_slug)}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copiar Link
          </Button>
        </div>

        <GuestListEntriesManager listId={selectedList.id} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Listas de Cortesia</h2>
          <p className="text-sm text-muted-foreground">
            Crie listas e compartilhe o link para convidados se inscreverem
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Lista
        </Button>
      </div>

      {lists && lists.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <Card 
              key={list.id} 
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedList(list)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{list.name}</CardTitle>
                    <Badge 
                      variant={list.is_active ? 'default' : 'secondary'}
                      className="mt-1"
                    >
                      {list.is_active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Válida até {list.valid_until_time.slice(0, 5)}
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {list.entries_count || 0} inscritos
                    {list.max_guests && ` / ${list.max_guests} máx`}
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyLink(list.public_slug);
                      }}
                    >
                      <LinkIcon className="h-4 w-4 mr-2" />
                      Copiar Link
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setListToDelete(list);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-full bg-muted">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Nenhuma lista criada</h3>
              <p className="text-sm text-muted-foreground">
                Crie sua primeira lista de cortesia e compartilhe o link
              </p>
            </div>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Lista
            </Button>
          </div>
        </Card>
      )}

      <AddGuestListDialog
        eventId={eventId}
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
      />

      <AlertDialog open={!!listToDelete} onOpenChange={() => setListToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lista</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a lista "{listToDelete?.name}"? 
              Todos os convidados inscritos serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteList}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
