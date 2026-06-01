import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AdminSection =
  | 'dashboard'
  | 'produtores'
  | 'repasses'
  | 'checklist'
  | 'saude'
  | 'configuracoes'
  | '_manage_team';

export const ADMIN_SECTION_ORDER: AdminSection[] = [
  'dashboard',
  'produtores',
  'repasses',
  'checklist',
  'saude',
  'configuracoes',
];

export function useAdminPermissions() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['admin-section-permissions', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_section_permissions')
        .select('section')
        .eq('user_id', user!.id);
      if (error) throw error;
      return new Set<string>((data ?? []).map((r) => r.section));
    },
  });

  const sections = query.data ?? new Set<string>();
  const isManager = sections.has('_manage_team');
  const hasSection = (s: AdminSection) => isManager || sections.has(s);

  const firstAllowed: AdminSection | null =
    ADMIN_SECTION_ORDER.find((s) => isManager || sections.has(s)) ?? null;

  return {
    sections,
    isManager,
    hasSection,
    firstAllowed,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
