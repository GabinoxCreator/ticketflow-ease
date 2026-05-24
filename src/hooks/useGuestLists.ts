import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GuestList {
  id: string;
  event_id: string;
  name: string;
  valid_until_time: string;
  public_slug: string;
  is_active: boolean;
  max_guests: number | null;
  created_at: string;
  updated_at: string;
  entries_count?: number;
}

export interface GuestListEntry {
  id: string;
  guest_list_id: string;
  name: string;
  added_by: 'producer' | 'public';
  status: 'pending' | 'checked_in' | 'no_show';
  checked_in_at: string | null;
  created_at: string;
}

export interface CreateGuestListData {
  event_id: string;
  name: string;
  valid_until_time: string;
  max_guests?: number | null;
}

function generateSlug(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function useGuestLists(eventId: string | undefined) {
  return useQuery({
    queryKey: ['guest-lists', eventId],
    queryFn: async () => {
      if (!eventId) return [];
      
      const { data: lists, error } = await supabase
        .from('guest_lists')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get entry counts for each list
      const listsWithCounts = await Promise.all(
        (lists || []).map(async (list) => {
          const { count } = await supabase
            .from('guest_list_entries')
            .select('*', { count: 'exact', head: true })
            .eq('guest_list_id', list.id);
          
          return { ...list, entries_count: count || 0 };
        })
      );

      return listsWithCounts as GuestList[];
    },
    enabled: !!eventId,
  });
}

export function useGuestListEntries(listId: string | undefined) {
  return useQuery({
    queryKey: ['guest-list-entries', listId],
    queryFn: async () => {
      if (!listId) return [];
      
      const { data, error } = await supabase
        .from('guest_list_entries')
        .select('*')
        .eq('guest_list_id', listId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as GuestListEntry[];
    },
    enabled: !!listId,
  });
}

export function useGuestListMutations() {
  const queryClient = useQueryClient();

  const createList = useMutation({
    mutationFn: async (data: CreateGuestListData) => {
      const slug = generateSlug();
      const { data: result, error } = await supabase
        .from('guest_lists')
        .insert({
          event_id: data.event_id,
          name: data.name,
          valid_until_time: data.valid_until_time,
          public_slug: slug,
          max_guests: data.max_guests || null,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['guest-lists', variables.event_id] });
    },
  });

  const updateList = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; valid_until_time?: string; is_active?: boolean; max_guests?: number | null }) => {
      const { data: result, error } = await supabase
        .from('guest_lists')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-lists'] });
    },
  });

  const deleteList = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('guest_lists')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-lists'] });
    },
  });

  const addEntry = useMutation({
    mutationFn: async ({ listId, name }: { listId: string; name: string }) => {
      const { data, error } = await supabase
        .from('guest_list_entries')
        .insert({
          guest_list_id: listId,
          name,
          added_by: 'producer',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['guest-list-entries', variables.listId] });
      queryClient.invalidateQueries({ queryKey: ['guest-lists'] });
    },
  });

  const addEntriesBulk = useMutation({
    mutationFn: async ({ listId, names }: { listId: string; names: string[] }) => {
      if (names.length === 0) return [];
      const rows = names.map((name) => ({
        guest_list_id: listId,
        name,
        added_by: 'producer' as const,
      }));
      const { data, error } = await supabase
        .from('guest_list_entries')
        .insert(rows)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['guest-list-entries', variables.listId] });
      queryClient.invalidateQueries({ queryKey: ['guest-lists'] });
    },
  });

  const updateEntryStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'pending' | 'checked_in' | 'no_show' }) => {
      const updateData: { status: string; checked_in_at?: string | null } = { status };
      if (status === 'checked_in') {
        updateData.checked_in_at = new Date().toISOString();
      } else {
        updateData.checked_in_at = null;
      }

      const { data, error } = await supabase
        .from('guest_list_entries')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-list-entries'] });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('guest_list_entries')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-list-entries'] });
      queryClient.invalidateQueries({ queryKey: ['guest-lists'] });
    },
  });

  return {
    createList,
    updateList,
    deleteList,
    addEntry,
    addEntriesBulk,
    updateEntryStatus,
    deleteEntry,
  };
}
