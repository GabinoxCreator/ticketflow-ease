/*
 * useFacialPendente: esta conta precisa fazer a facial antes de pagar? (OS-343)
 *
 * Com a chave DESLIGADA (`src/lib/facialObrigatoria.ts`) devolve sempre "não" e
 * não faz consulta nenhuma: o site fica exatamente como era.
 *
 * Com a chave ligada, só olha conta criada depois do corte. Conta antiga nunca
 * é cobrada (decisão do Gabriel, 28/09/2026). Se a leitura do perfil falhar, a
 * resposta é "não": falha nossa nunca trava uma compra.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { contaNovaParaFacial, facialObrigatoria, precisaDaFacial } from '@/lib/facialObrigatoria';

export const chaveFacialPendente = (userId?: string | null) => ['facial-pendente', userId ?? null] as const;

export interface FacialPendente {
  /** true = antes de pagar, a pessoa passa pela etapa do rosto. */
  pendente: boolean;
  /** true = ainda lendo o perfil; quem decide espera, mas nunca trava por isso. */
  carregando: boolean;
  /** CPF da conta, para conferir a data de nascimento na base do CPF. */
  cpf: string | null;
}

export function useFacialPendente(): FacialPendente {
  const { user } = useAuth();
  const candidata = facialObrigatoria() && !!user && contaNovaParaFacial(user.created_at);

  const consulta = useQuery({
    queryKey: chaveFacialPendente(user?.id),
    enabled: candidata,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('facial_photo_path, cpf')
        .eq('id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return { temFacial: !!data?.facial_photo_path, cpf: (data?.cpf as string | null) ?? null };
    },
  });

  if (!candidata) return { pendente: false, carregando: false, cpf: null };
  if (consulta.isLoading) return { pendente: false, carregando: true, cpf: null };
  if (consulta.isError || !consulta.data) return { pendente: false, carregando: false, cpf: null };
  return {
    pendente: precisaDaFacial(user, consulta.data.temFacial),
    carregando: false,
    cpf: consulta.data.cpf,
  };
}
