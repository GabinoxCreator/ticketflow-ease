import { useState, useEffect } from 'react';
import { List, Users, Loader2 } from 'lucide-react';
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
    created_at: string;
    added_by: string;
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
            checked_in_at,
            created_at,
            added_by
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
    <div className="space-y-2.5">
      {lists.map((list) => {
        const pending = list.entries.filter(e => e.status === 'pending').length;
        const checkedIn = list.entries.filter(e => e.status === 'checked_in').length;
        const total = list.entries.length;
        const progress = total > 0 ? Math.round((checkedIn / total) * 100) : 0;

        return (
          <button
            key={list.id}
            onClick={() => setSelectedList(list)}
            className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:border-primary/40 active:scale-[0.99] transition-all"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-900 truncate">{list.name}</h4>
                  <p className="text-xs text-slate-500">
                    {total} convidado{total === 1 ? '' : 's'} · {progress}% confirmado
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 font-bold">
                  {checkedIn} ok
                </Badge>
                {pending > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 font-bold">
                    {pending} aguard.
                  </Badge>
                )}
              </div>
            </div>
            <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
