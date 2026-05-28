import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

function extractCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { message?: string; details?: string; hint?: string };
  const haystack = `${e.message ?? ''} ${e.details ?? ''} ${e.hint ?? ''}`;
  if (haystack.includes('no_seats')) return 'no_seats';
  if (haystack.includes('has_active_seats')) return 'has_active_seats';
  if (haystack.includes('forbidden')) return 'forbidden';
  if (haystack.includes('event_not_found')) return 'event_not_found';
  return null;
}

export function usePublishEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      const { data, error } = await supabase.rpc('publish_event_with_snapshot', {
        _event_id: eventId,
      });
      if (error) throw error;
      return data as {
        already_published: boolean;
        has_map?: boolean;
        seats_created: number;
        seats_total?: number;
      };
    },
    onSuccess: (data, eventId) => {
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['event', eventId] });
      qc.invalidateQueries({ queryKey: ['event-seats', eventId] });
      if (data.already_published) {
        toast.info('Evento já estava publicado');
      } else if (data.has_map === false) {
        toast.success('Evento publicado');
      } else {
        toast.success(`Evento publicado · ${data.seats_created} assentos disponíveis`);
      }
    },
    onError: (err) => {
      const code = extractCode(err);
      if (code === 'no_seats') {
        toast.error('Adicione assentos ao mapa antes de publicar');
      } else if (code === 'forbidden') {
        toast.error('Você não tem permissão para publicar este evento');
      } else if (code === 'event_not_found') {
        toast.error('Evento não encontrado');
      } else {
        toast.error('Erro ao publicar evento', {
          description: (err as Error)?.message,
        });
      }
    },
  });
}

export function useUnpublishEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      const { data, error } = await supabase.rpc('unpublish_event', {
        _event_id: eventId,
      });
      if (error) throw error;
      return data as { already_unpublished: boolean; deleted: number };
    },
    onSuccess: (_data, eventId) => {
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['event', eventId] });
      qc.invalidateQueries({ queryKey: ['event-seats', eventId] });
      toast.success('Evento despublicado');
    },
    onError: (err) => {
      const code = extractCode(err);
      if (code === 'has_active_seats') {
        toast.error('Não é possível despublicar', {
          description: 'Existem assentos reservados ou vendidos neste evento.',
        });
      } else if (code === 'forbidden') {
        toast.error('Você não tem permissão para despublicar este evento');
      } else {
        toast.error('Erro ao despublicar evento', {
          description: (err as Error)?.message,
        });
      }
    },
  });
}
