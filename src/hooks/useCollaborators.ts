import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Collaborator {
  id: string;
  producer_id: string;
  username: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CollaboratorEvent {
  id: string;
  collaborator_id: string;
  event_id: string;
  created_at: string;
}

export function useCollaborators() {
  const queryClient = useQueryClient();

  const { data: collaborators = [], isLoading } = useQuery({
    queryKey: ['collaborators'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collaborators')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Collaborator[];
    },
  });

  const createCollaborator = useMutation({
    mutationFn: async ({ name, username, password, eventIds }: { 
      name: string; 
      username: string; 
      password: string;
      eventIds: string[];
    }) => {
      // Create collaborator with base64 encoded password (simple hash for demo)
      const passwordHash = btoa(password);
      
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Usuário não autenticado');

      const { data: collaborator, error } = await supabase
        .from('collaborators')
        .insert({
          name,
          username,
          password_hash: passwordHash,
          producer_id: user.user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Assign events to collaborator
      if (eventIds.length > 0) {
        const { error: eventsError } = await supabase
          .from('collaborator_events')
          .insert(
            eventIds.map(eventId => ({
              collaborator_id: collaborator.id,
              event_id: eventId,
            }))
          );

        if (eventsError) throw eventsError;
      }

      return collaborator;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborators'] });
      toast.success('Colaborador criado com sucesso!');
    },
    onError: (error: any) => {
      if (error.code === '23505') {
        toast.error('Já existe um colaborador com este username');
      } else {
        toast.error('Erro ao criar colaborador');
      }
    },
  });

  const updateCollaborator = useMutation({
    mutationFn: async ({ id, name, username, password, is_active }: { 
      id: string;
      name?: string; 
      username?: string; 
      password?: string;
      is_active?: boolean;
    }) => {
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (username !== undefined) updateData.username = username;
      if (password !== undefined) updateData.password_hash = btoa(password);
      if (is_active !== undefined) updateData.is_active = is_active;

      const { data, error } = await supabase
        .from('collaborators')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborators'] });
      toast.success('Colaborador atualizado com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao atualizar colaborador');
    },
  });

  const deleteCollaborator = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('collaborators')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborators'] });
      toast.success('Colaborador excluído com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao excluir colaborador');
    },
  });

  return {
    collaborators,
    isLoading,
    createCollaborator,
    updateCollaborator,
    deleteCollaborator,
  };
}

export function useCollaboratorEvents(collaboratorId: string) {
  const queryClient = useQueryClient();

  const { data: assignedEvents = [], isLoading } = useQuery({
    queryKey: ['collaborator-events', collaboratorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collaborator_events')
        .select(`
          id,
          event_id,
          events (
            id,
            title,
            date,
            time,
            venue,
            city,
            state,
            image_url
          )
        `)
        .eq('collaborator_id', collaboratorId);

      if (error) throw error;
      return data;
    },
    enabled: !!collaboratorId,
  });

  const assignEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from('collaborator_events')
        .insert({
          collaborator_id: collaboratorId,
          event_id: eventId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborator-events', collaboratorId] });
      toast.success('Evento vinculado com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao vincular evento');
    },
  });

  const unassignEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from('collaborator_events')
        .delete()
        .eq('collaborator_id', collaboratorId)
        .eq('event_id', eventId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborator-events', collaboratorId] });
      toast.success('Evento desvinculado com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao desvincular evento');
    },
  });

  return {
    assignedEvents,
    isLoading,
    assignEvent,
    unassignEvent,
  };
}
