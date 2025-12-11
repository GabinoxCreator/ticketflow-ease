import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Event {
  id: string;
  producer_id: string;
  title: string;
  description: string | null;
  short_description: string | null;
  date: string;
  time: string;
  venue: string;
  city: string;
  state: string;
  address: string | null;
  category: string;
  image_url: string | null;
  is_hot: boolean;
  status: 'draft' | 'published' | 'cancelled' | 'finished';
  fake_scarcity_enabled: boolean | null;
  fake_scarcity_percentage: number | null;
  created_at: string;
  updated_at: string;
}

export interface EventFormData {
  title: string;
  description?: string;
  short_description?: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  state: string;
  address?: string;
  category: string;
  image_url?: string;
  is_hot?: boolean;
  status?: 'draft' | 'published' | 'cancelled' | 'finished';
  fake_scarcity_enabled?: boolean;
  fake_scarcity_percentage?: number;
}

export function useEvents() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: events, isLoading, error } = useQuery({
    queryKey: ['producer-events', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('producer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Event[];
    },
    enabled: !!user,
  });

  const createEvent = useMutation({
    mutationFn: async (eventData: EventFormData) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('events')
        .insert({
          ...eventData,
          producer_id: user.id,
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

  const activeEvents = events?.filter(e => e.status === 'published' && new Date(e.date) >= new Date()) || [];
  const pastEvents = events?.filter(e => e.status === 'finished' || new Date(e.date) < new Date()) || [];
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

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['event', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data as Event | null;
    },
    enabled: !!id,
  });
}

export function usePublicEvents() {
  return useQuery({
    queryKey: ['public-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
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
        .order('date', { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}
