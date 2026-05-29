import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type EventType = 'ingresso' | 'mesa' | 'hibrido';

export interface Event {
  id: string;
  producer_id: string;
  slug?: string | null;
  title: string;
  description: string | null;
  short_description: string | null;
  date: string;
  time: string;
  end_date: string | null;
  end_time: string | null;
  venue: string;
  city: string;
  state: string;
  address: string | null;
  category: string | null;
  image_url: string | null;
  is_hot: boolean;
  status: 'draft' | 'published' | 'cancelled' | 'finished';
  event_type: EventType;
  fake_scarcity_enabled: boolean | null;
  fake_scarcity_percentage: number | null;
  table_map_id: string | null;
  map_snapshot_at: string | null;
  created_at: string;
  updated_at: string;
  event_lots?: Array<{
    id: string;
    price: number;
    total_quantity: number;
    sold_quantity: number;
    reserved_quantity?: number;
    is_active?: boolean;
  }>;
  paid_revenue?: number;
}

export interface EventFormData {
  title: string;
  description?: string;
  short_description?: string;
  date: string;
  time: string;
  end_date?: string;
  end_time?: string;
  venue: string;
  city: string;
  state: string;
  address?: string;
  category?: string;
  image_url?: string;
  is_hot?: boolean;
  status?: 'draft' | 'published' | 'cancelled' | 'finished';
  event_type?: EventType;
  fake_scarcity_enabled?: boolean;
  fake_scarcity_percentage?: number;
  table_map_id?: string | null;
}

export function useEvents() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: events, isLoading, error } = useQuery({
    queryKey: ['producer-events', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      // Lista de produtor: enumeramos colunas para evitar puxar map_snapshot (jsonb pesado).
      const { data, error } = await supabase
        .from('events')
        .select(`
          id, producer_id, producer_profile_id, slug, title, description, short_description,
          date, time, end_date, end_time, venue, city, state, address, category, image_url,
          is_hot, status, event_type, fake_scarcity_enabled, fake_scarcity_percentage,
          table_map_id, map_snapshot_at, created_at, updated_at,
          event_lots ( id, price, total_quantity, sold_quantity, reserved_quantity, is_active )
        `)
        .eq('producer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const eventsList = (data || []) as Event[];
      const eventIds = eventsList.map(e => e.id);

      if (eventIds.length > 0) {
        const { data: paidOrders } = await supabase
          .from('orders')
          .select('event_id, total_amount')
          .eq('status', 'paid')
          .in('event_id', eventIds);

        const revenueByEvent = new Map<string, number>();
        (paidOrders || []).forEach((o: any) => {
          revenueByEvent.set(o.event_id, (revenueByEvent.get(o.event_id) || 0) + Number(o.total_amount || 0));
        });
        eventsList.forEach(e => {
          e.paid_revenue = revenueByEvent.get(e.id) || 0;
        });
      }

      return eventsList;
    },
    enabled: !!user,
  });

  const createEvent = useMutation({
    mutationFn: async (eventData: EventFormData) => {
      if (!user) throw new Error('Usuário não autenticado');

      // Fetch producer_profile_id for dual-write
      const { data: memberData } = await supabase
        .from('producer_members')
        .select('producer_profile_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      const { data, error } = await supabase
        .from('events')
        .insert({
          ...eventData,
          producer_id: user.id,
          producer_profile_id: memberData?.producer_profile_id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producer-events'] });
      toast.success('Evento criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar evento: ${error.message}`);
    },
  });

  const updateEvent = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<EventFormData> }) => {
      const { data: updatedEvent, error } = await supabase
        .from('events')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return updatedEvent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producer-events'] });
      toast.success('Evento atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar evento: ${error.message}`);
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producer-events'] });
      toast.success('Evento excluído com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir evento: ${error.message}`);
    },
  });

  const _now = new Date();
  const activeEvents = events?.filter(e => e.status === 'published' && getEventEndInstant(e) >= _now) || [];
  const pastEvents = events?.filter(e => e.status === 'finished' || (e.status !== 'draft' && getEventEndInstant(e) < _now)) || [];
  const draftEvents = events?.filter(e => e.status === 'draft') || [];


  return {
    events,
    activeEvents,
    pastEvents,
    draftEvents,
    isLoading,
    error,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}

export function useEvent(idOrSlug: string | undefined) {
  return useQuery({
    queryKey: ['event', idOrSlug],
    queryFn: async () => {
      if (!idOrSlug) return null;

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
      const select = '*, producer_profiles ( brand_name, logo_url, meta_pixel_id, tracking_enabled )';

      // Try slug first (most public URLs), fall back to id (legacy/UUID links)
      let { data, error } = await supabase
        .from('events')
        .select(select)
        .eq(isUuid ? 'id' : 'slug', idOrSlug)
        .maybeSingle();

      if (!data && !error) {
        const fallback = await supabase
          .from('events')
          .select(select)
          .eq(isUuid ? 'slug' : 'id', idOrSlug)
          .maybeSingle();
        data = fallback.data;
        error = fallback.error;
      }

      if (error) throw error;
      return data as any;
    },
    enabled: !!idOrSlug,
  });
}

export function usePublicEvents() {
  return useQuery({
    queryKey: ['public-events'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('events')
        .select(`
          id, slug, title, description, short_description,
          date, time, end_date, end_time, venue, city, state, address, category, image_url,
          is_hot, status, event_type, fake_scarcity_enabled, fake_scarcity_percentage,
          table_map_id, map_snapshot_at, created_at, updated_at,
          event_lots (
            id,
            name,
            price,
            original_price,
            total_quantity,
            sold_quantity,
            is_active
          )
        `)
        .eq('status', 'published')
        .gte('date', today)
        .order('date', { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}
