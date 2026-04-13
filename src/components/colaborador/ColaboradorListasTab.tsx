import { useState, useEffect } from 'react';
import { List, Users, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ColaboradorListaDetalhe from './ColaboradorListaDetalhe';

interface GuestList {
  id: string;
  name: string;
  entries: {
    id: string;
    name: string;
    status: string;
    checked_in_at: string | null;
  }[];
}

interface ColaboradorListasTabProps {
  eventId: string;
  collaboratorId: string;
  sessionToken: string;
  onSessionExpired: () => void;
  onCheckinDone: () => void;
}

export default function ColaboradorListasTab({
  eventId,
  collaboratorId,
  sessionToken,
  onSessionExpired,
  onCheckinDone,
}: ColaboradorListasTabProps) {
  const [lists, setLists] = useState<GuestList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedList, setSelectedList] = useState<GuestList | null>(null);

  const fetchLists = async () => {
    try {
      const { data, error } = await supabase
        .from('guest_lists')
        .select(`
          id,
          name,
          guest_list_entries (
            id,
            name,
            status,
            checked_in_at
          )
        `)
        .eq('event_id', eventId)
        .eq('is_active', true);

      if (error) throw error;

      const formatted: GuestList[] = (data || []).map(list => ({
        id: list.id,
        name: list.name,
        entries: list.guest_list_entries || [],
      }));

      setLists(formatted);
    } catch (error) {
      console.error('Error fetching lists:', error);
      toast.error('Erro ao carregar listas');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLists();
  }, [eventId]);

  const handleCheckinDone = () => {
    fetchLists();
    onCheckinDone();
  };

  if (selectedList) {
    return (
      <ColaboradorListaDetalhe
        listName={selectedList.name}
        entries={selectedList.entries}
        eventId={eventId}
        collaboratorId={collaboratorId}
        sessionToken={sessionToken}
        onBack={() => {
          setSelectedList(null);
          fetchLists();
        }}
        onSessionExpired={onSessionExpired}
        onCheckinDone={handleCheckinDone}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground mt-2">Carregando listas...</p>
      </div>
    );
  }

  if (lists.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <List className="w-12 h-12 mx-auto opacity-50 mb-4" />
        <h3 className="font-medium mb-1">Nenhuma lista</h3>
        <p className="text-sm">Este evento não possui listas de convidados</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {lists.map((list) => {
        const pending = list.entries.filter(e => e.status === 'pending').length;
        const checkedIn = list.entries.filter(e => e.status === 'checked_in').length;
        const total = list.entries.length;

        return (
          <Card
            key={list.id}
            className="cursor-pointer hover:bg-muted/50 transition-colors active:scale-[0.98]"
            onClick={() => setSelectedList(list)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">{list.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {total} convidado(s)
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600">
                    {pending}
                  </Badge>
                  <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                    {checkedIn}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
