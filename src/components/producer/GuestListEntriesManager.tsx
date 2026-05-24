import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useGuestListEntries, useGuestListMutations, GuestListEntry } from '@/hooks/useGuestLists';
import { BulkAddGuestsDialog } from '@/components/producer/BulkAddGuestsDialog';
import {
  Plus,
  Search,
  Trash2,
  CheckCircle,
  Clock,
  XCircle,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface GuestListEntriesManagerProps {
  listId: string;
}

export function GuestListEntriesManager({ listId }: GuestListEntriesManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);

  const { data: entries, isLoading } = useGuestListEntries(listId);
  const { updateEntryStatus, deleteEntry } = useGuestListMutations();




  const handleCheckIn = async (entry: GuestListEntry) => {
    try {
      await updateEntryStatus.mutateAsync({ 
        id: entry.id, 
        status: entry.status === 'checked_in' ? 'pending' : 'checked_in' 
      });
      toast.success(
        entry.status === 'checked_in' 
          ? 'Check-in desfeito' 
          : 'Check-in realizado!'
      );
    } catch (error) {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteEntry.mutateAsync(id);
      toast.success('Convidado removido');
    } catch (error) {
      toast.error('Erro ao remover convidado');
    }
  };

  const filteredEntries = entries?.filter((entry) =>
    entry.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusConfig = {
    pending: { label: 'Pendente', color: 'bg-yellow-500', icon: Clock },
    checked_in: { label: 'Check-in', color: 'bg-green-500', icon: CheckCircle },
    no_show: { label: 'Não compareceu', color: 'bg-red-500', icon: XCircle },
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  const stats = {
    total: entries?.length || 0,
    pending: entries?.filter(e => e.status === 'pending').length || 0,
    checkedIn: entries?.filter(e => e.status === 'checked_in').length || 0,
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-500">{stats.pending}</div>
            <div className="text-sm text-muted-foreground">Pendentes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-500">{stats.checkedIn}</div>
            <div className="text-sm text-muted-foreground">Check-in</div>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Add Button */}
      <div className="flex justify-end">
        <Button onClick={() => setBulkOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Convidados
        </Button>
      </div>

      <BulkAddGuestsDialog listId={listId} open={bulkOpen} onOpenChange={setBulkOpen} />


      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Entries List */}
      <div className="space-y-2">
        {filteredEntries && filteredEntries.length > 0 ? (
          filteredEntries.map((entry) => {
            const status = statusConfig[entry.status];
            const StatusIcon = status.icon;

            return (
              <Card key={entry.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-muted">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium">{entry.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Adicionado {entry.added_by === 'public' ? 'pelo link' : 'manualmente'}
                          {entry.checked_in_at && (
                            <> • Check-in às {format(new Date(entry.checked_in_at), 'HH:mm', { locale: ptBR })}</>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline"
                        className={`${status.color} bg-opacity-10 border-0`}
                      >
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {status.label}
                      </Badge>
                      
                      <Button
                        variant={entry.status === 'checked_in' ? 'secondary' : 'default'}
                        size="sm"
                        onClick={() => handleCheckIn(entry)}
                      >
                        {entry.status === 'checked_in' ? 'Desfazer' : 'Check-in'}
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(entry.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">
              {searchQuery ? 'Nenhum convidado encontrado' : 'Nenhum convidado na lista'}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
