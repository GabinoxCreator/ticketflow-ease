import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface UserTicket {
  id: string;
  ticket_code: string;
  holder_name: string;
  holder_email: string | null;
  holder_phone: string | null;
  status: 'pending' | 'valid' | 'used' | 'cancelled';
  validated_at: string | null;
  created_at: string;
  event: {
    id: string;
    slug: string | null;
    title: string;
    date: string;
    time: string;
    end_date: string | null;
    end_time: string | null;
    venue: string;
    city: string;
    state: string;
    image_url: string | null;
  };
  lot: {
    name: string;
    price: number;
  };
}

export function useUserTickets() {
  const { user } = useAuth();

  const { data: tickets, isLoading, error } = useQuery({
    queryKey: ['user-tickets', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          id,
          ticket_code,
          holder_name,
          holder_email,
          holder_phone,
          status,
          validated_at,
          created_at,
          event:events(id, title, date, time, end_date, end_time, venue, city, state, image_url),
          lot:event_lots(name, price)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Filter out pending tickets (not yet paid)
      return (data as UserTicket[]).filter(t => t.status !== 'pending');
    },
    enabled: !!user,
  });

  // Calcula o momento real de término do evento (respeita fuso local)
  const getEventEndDate = (event: UserTicket['event']): Date => {
    if (event.end_date) {
      const time = event.end_time ? event.end_time.slice(0, 8) : '23:59:00';
      return new Date(`${event.end_date}T${time}`);
    }
    // Sem end_date: usa data/hora de início + 6h de buffer
    const startTime = event.time ? event.time.slice(0, 8) : '00:00:00';
    const start = new Date(`${event.date}T${startTime}`);
    return new Date(start.getTime() + 6 * 60 * 60 * 1000);
  };

  const now = new Date();

  const upcomingTickets = tickets?.filter(t => {
    if (t.status === 'cancelled') return false;
    return getEventEndDate(t.event) >= now;
  }) || [];

  const pastTickets = tickets?.filter(t => {
    if (t.status === 'cancelled') return false;
    return getEventEndDate(t.event) < now;
  }) || [];

  const cancelledTickets = tickets?.filter(t => t.status === 'cancelled') || [];

  return {
    tickets,
    upcomingTickets,
    pastTickets,
    cancelledTickets,
    isLoading,
    error,
  };
}
