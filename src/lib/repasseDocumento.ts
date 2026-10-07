// Repasse só com o CPF/CNPJ da produtora e a conta que recebe (OS-157, 06/10/2026).
//
// A regra de verdade mora no banco (`pendencias_de_repasse`, chamada pelo
// `request_payout`): CPF/CNPJ da produtora com dígito certo e uma conta com o
// CPF/CNPJ do titular preenchido (o titular pode ser outra pessoa, decisão de
// 07/10). Aqui ficam só a conferência de dígito para a tela e os textos que o
// produtor lê, aprovados pelo Gabriel na caixinha (06/10 noite e 07/10).
// Mudar um texto daqui é mudar o que o cliente lê: passa pelo Gabriel.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { validateCPF, formatCPF } from '@/utils/cpfValidator';
import { validateCNPJ, formatCNPJ } from '@/utils/cnpjValidator';

export const soDigitos = (valor: string | null | undefined) => (valor ?? '').replace(/\D/g, '');

/** CPF (11) ou CNPJ (14) com dígito verificador certo, com ou sem pontuação. */
export function documentoValido(valor: string | null | undefined): boolean {
  const d = soDigitos(valor);
  if (d.length === 11) return validateCPF(d);
  if (d.length === 14) return validateCNPJ(d);
  return false;
}

/** Máscara de CPF até 11 dígitos; de CNPJ a partir do 12º. */
export function formatarDocumento(valor: string | null | undefined): string {
  const d = soDigitos(valor).slice(0, 14);
  return d.length <= 11 ? formatCPF(d) : formatCNPJ(d);
}

export type PendenciaRepasse =
  | 'missing_document'
  | 'invalid_document'
  | 'no_bank_account'
  | 'missing_holder_document';

export const AVISO_REPASSE =
  'Para pedir repasse, precisamos do CPF ou CNPJ da produtora e da conta que vai receber. Suas vendas continuam normais.';

const CADASTRE_A_CONTA = 'Cadastre a conta que vai receber na aba Dados & PIN.';

export const MENSAGEM_PENDENCIA_REPASSE: Record<PendenciaRepasse, string> = {
  missing_document: 'Falta o CPF ou CNPJ da produtora. Preencha em Configurações para pedir o repasse.',
  invalid_document: 'O CPF ou CNPJ da produtora está com número errado. Corrija em Configurações.',
  no_bank_account: CADASTRE_A_CONTA,
  // Conta antiga sem o CPF/CNPJ do titular: a conta só vale com ele, então a
  // frase é a mesma (abrir Dados & PIN, Editar, o campo é obrigatório).
  missing_holder_document: CADASTRE_A_CONTA,
};

export const CHAVE_PENDENCIAS_REPASSE = 'pendencias-repasse';

/**
 * O que falta para o produtor logado pedir repasse. Lista vazia = nada falta.
 * Se a consulta falhar, devolve lista vazia: o aviso some, mas a trava continua
 * no servidor (é o `request_payout` que decide).
 */
export function usePendenciasRepasse() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [CHAVE_PENDENCIAS_REPASSE, user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<PendenciaRepasse[]> => {
      // A função é nova e ainda não está no types.ts gerado: chamada sem tipo.
      // `bind`: o rpc usa o próprio client por dentro; solto, ele perde a referência.
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
      ) => Promise<{ data: unknown; error: unknown }>;
      const { data, error } = await rpc('minhas_pendencias_de_repasse');
      if (error) return [];
      const resposta = data as { ok?: boolean; pendencias?: unknown } | null;
      const lista = resposta?.ok && Array.isArray(resposta.pendencias) ? resposta.pendencias : [];
      return lista.filter(
        (p): p is PendenciaRepasse => typeof p === 'string' && p in MENSAGEM_PENDENCIA_REPASSE,
      );
    },
  });
}
