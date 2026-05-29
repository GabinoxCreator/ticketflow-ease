import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getEventEndInstant } from '@/lib/eventTime';


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
  } | null;
  seat: {
    label: string | null;
    code: string | null;
    seat_type_name: string | null;
  } | null;
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
          event:events(id, slug, title, date, time, end_date, end_time, venue, city, state, image_url),
          lot:event_lots(name, price),
          seat:event_seats(label, code, seat_type_name)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Filter out pending tickets (not yet paid)
      return (data as unknown as UserTicket[]).filter(t => t.status !== 'pending');
    },
    enabled: !!user,
  });


  // Comparação determinística em America/Sao_Paulo:
  // getEventEndInstant -> Date (UTC) via fromZonedTime; now -> Date (UTC).
  // Ambos os lados em UTC, independente do fuso do navegador.
  const now = new Date();

  const upcomingTickets = tickets?.filter(t => {
    if (t.status === 'cancelled') return false;
    return getEventEndInstant(t.event) >= now;
  }) || [];

  const pastTickets = tickets?.filter(t => {
    if (t.status === 'cancelled') return false;
    return getEventEndInstant(t.event) < now;
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
