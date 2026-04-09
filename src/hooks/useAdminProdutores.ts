import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useAdminProdutores(search?: string, statusFilter?: string) {
  return useQuery({
    queryKey: ['admin-produtores', search, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('producer_profiles')
        .select('*, producer_members(user_id, role)')
        .order('created_at', { ascending: false });

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('admin_status', statusFilter);
      }
      if (search) {
        query = query.or(`brand_name.ilike.%${search}%,email.ilike.%${search}%,document.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useAdminProdutorDetalhe(id: string) {
  return useQuery({
    queryKey: ['admin-produtor', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('producer_profiles')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useAdminProdutorEvents(producerProfileId: string) {
  return useQuery({
    queryKey: ['admin-produtor-events', producerProfileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('producer_profile_id', producerProfileId)
        .order('date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!producerProfileId,
  });
}

export function useAdminProdutorNotes(producerProfileId: string) {
  return useQuery({
    queryKey: ['admin-produtor-notes', producerProfileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('producer_notes')
        .select('*')
        .eq('producer_profile_id', producerProfileId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!producerProfileId,
  });
}

export function useAdminProdutorBankAccount(producerProfileId: string) {
  return useQuery({
    queryKey: ['admin-produtor-bank', producerProfileId],
    queryFn: async () => {
      // Bank accounts are linked to user_id, not producer_profile_id
      // We need to find the owner via producer_members
      const { data: members } = await supabase
        .from('producer_members')
        .select('user_id')
        .eq('producer_profile_id', producerProfileId)
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle();

      if (!members?.user_id) return null;

      const { data, error } = await supabase
        .from('producer_bank_accounts')
        .select('*')
        .eq('user_id', members.user_id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!producerProfileId,
  });
}

export function useUpdateProducerStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('producer_profiles')
        .update({ admin_status: status })
        .eq('id', id);
      if (error) throw error;

      // Log audit
      await supabase.from('audit_logs').insert({
        actor_id: user!.id,
        action: `producer.${status}`,
        target_type: 'producer_profile',
        target_id: id,
        metadata: { new_status: status },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-produtores'] });
      queryClient.invalidateQueries({ queryKey: ['admin-produtor'] });
    },
  });
}

export function useAddProducerNote() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ producerProfileId, content }: { producerProfileId: string; content: string }) => {
      const { error } = await supabase.from('producer_notes').insert({
        producer_profile_id: producerProfileId,
        author_id: user!.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-produtor-notes'] });
    },
  });
}
