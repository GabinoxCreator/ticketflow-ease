import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type SeatTypeRow = Database['public']['Tables']['seat_types']['Row'];
type SeatTypeInsert = Database['public']['Tables']['seat_types']['Insert'];
type SeatTypeUpdate = Database['public']['Tables']['seat_types']['Update'];

export interface SeatType extends SeatTypeRow {}

export interface SeatTypeFormData {
  name: string;
  description?: string;
  base_capacity: number;
  max_capacity: number;
  base_price?: number;
  extra_price?: number;
  shape?: 'rect' | 'circle';
  default_width?: number;
  default_height?: number;
  default_color?: string | null;
  icon?: string | null;
  is_active?: boolean;
}

// Templates padrão com preços de exemplo realistas (produtor ajusta se quiser,
// mas nunca fica zerado por esquecimento).
export const DEFAULT_SEAT_TYPE_TEMPLATES: SeatTypeFormData[] = [
  {
    name: 'Mesa Padrão',
    description: 'Mesa retangular para 4 pessoas (até 6)',
    base_capacity: 4,
    max_capacity: 6,
    base_price: 100,
    extra_price: 25,
    shape: 'rect',
    default_width: 100,
    default_height: 100,
    default_color: '#6366f1',
    is_active: true,
  },
  {
    name: 'Bistrô',
    description: 'Mesa alta para 2 pessoas (até 4)',
    base_capacity: 2,
    max_capacity: 4,
    base_price: 60,
    extra_price: 30,
    shape: 'circle',
    default_width: 70,
    default_height: 70,
    default_color: '#ec4899',
    is_active: true,
  },
  {
    name: 'Cadeira',
    description: 'Cadeira individual',
    base_capacity: 1,
    max_capacity: 1,
    base_price: 50,
    extra_price: 0,
    shape: 'rect',
    default_width: 40,
    default_height: 40,
    default_color: '#8b5cf6',
    is_active: true,
  },
];

// FIXME (Bloco 3): adicionar constraint UNIQUE (producer_id, lower(name)) no banco
// para fechar a janela de TOCTOU desta verificação client-side.
async function assertUniqueName(
  producer_id: string,
  name: string,
  excludeId?: string | null
) {
  const { data, error } = await supabase
    .from('seat_types')
    .select('id')
    .eq('producer_id', producer_id)
    .ilike('name', name.trim());

  if (error) throw error;
  const conflict = (data ?? []).find((r) => r.id !== excludeId);
  if (conflict) {
    throw new Error('Já existe um tipo de assento com esse nome.');
  }
}

export function useSeatTypes() {
  const queryClient = useQueryClient();

  const { data: seatTypes, isLoading, error } = useQuery({
    queryKey: ['seat-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seat_types')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return data as SeatType[];
    },
  });

  const createSeatType = useMutation({
    mutationFn: async (formData: SeatTypeFormData) => {
      const { data: userData } = await supabase.auth.getUser();
      const producer_id = userData.user?.id;
      if (!producer_id) throw new Error('Usuário não autenticado');

      await assertUniqueName(producer_id, formData.name);

      const insertData: SeatTypeInsert = {
        ...formData,
        producer_id,
        base_price: formData.base_price ?? 0,
        extra_price: formData.extra_price ?? 0,
        shape: formData.shape ?? 'rect',
        default_width: formData.default_width ?? 80,
        default_height: formData.default_height ?? 80,
        default_color: formData.default_color ?? '#3b82f6',
        is_active: formData.is_active ?? true,
      };

      const { data, error } = await supabase
        .from('seat_types')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-types'] });
      toast.success('Tipo de assento criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar tipo de assento: ${error.message}`);
    },
  });

  const updateSeatType = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SeatTypeFormData> }) => {
      if (data.name) {
        const { data: userData } = await supabase.auth.getUser();
        const producer_id = userData.user?.id;
        if (!producer_id) throw new Error('Usuário não autenticado');
        await assertUniqueName(producer_id, data.name, id);
      }

      const updateData: SeatTypeUpdate = {
        ...data,
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error } = await supabase
        .from('seat_types')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-types'] });
      toast.success('Tipo de assento atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar tipo de assento: ${error.message}`);
    },
  });

  const deleteSeatType = useMutation({
    mutationFn: async (id: string) => {
      // Guard: verificar se está em uso em venue_seats
      const { count, error: countError } = await supabase
        .from('venue_seats')
        .select('id', { count: 'exact', head: true })
        .eq('seat_type_id', id);

      if (countError) throw countError;
      if ((count ?? 0) > 0) {
        throw new Error('Este tipo de assento está em uso em um ou mais mapas e não pode ser excluído.');
      }

      const { error } = await supabase
        .from('seat_types')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-types'] });
      toast.success('Tipo de assento excluído com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const seedDefaultTemplates = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const producer_id = userData.user?.id;
      if (!producer_id) throw new Error('Usuário não autenticado');

      // Idempotente: busca nomes existentes (case-insensitive) e pula colisões.
      const { data: existing, error: exErr } = await supabase
        .from('seat_types')
        .select('name')
        .eq('producer_id', producer_id);
      if (exErr) throw exErr;

      const existingNames = new Set(
        (existing ?? []).map((r) => r.name.trim().toLowerCase())
      );

      const toInsert: SeatTypeInsert[] = DEFAULT_SEAT_TYPE_TEMPLATES
        .filter((t) => !existingNames.has(t.name.trim().toLowerCase()))
        .map((t) => ({
          ...t,
          producer_id,
          base_price: t.base_price ?? 0,
          extra_price: t.extra_price ?? 0,
        }));

      if (toInsert.length === 0) return { inserted: 0 };

      const { error } = await supabase.from('seat_types').insert(toInsert);
      if (error) throw error;
      return { inserted: toInsert.length };
    },
    onSuccess: ({ inserted }) => {
      queryClient.invalidateQueries({ queryKey: ['seat-types'] });
      if (inserted === 0) {
        toast.info('Todos os templates padrão já existem.');
      } else {
        toast.success(`${inserted} template${inserted > 1 ? 's' : ''} padrão criado${inserted > 1 ? 's' : ''}!`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar templates: ${error.message}`);
    },
  });

  return {
    seatTypes,
    isLoading,
    error,
    createSeatType,
    updateSeatType,
    deleteSeatType,
    seedDefaultTemplates,
  };
}
