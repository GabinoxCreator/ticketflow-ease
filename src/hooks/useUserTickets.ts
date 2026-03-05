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
    title: string;
    date: string;
    time: string;
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
          event:events(id, title, date, time, venue, city, state, image_url),
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

  const upcomingTickets = tickets?.filter(t => {
    if (t.status === 'cancelled') return false;
    const eventDate = new Date(t.event.date);
    return eventDate >= new Date();
  }) || [];

  const pastTickets = tickets?.filter(t => {
    if (t.status === 'cancelled') return false;
    const eventDate = new Date(t.event.date);
    return eventDate < new Date();
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
