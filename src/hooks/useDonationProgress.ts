import { useQuery } from '@tanstack/react-query';
import { supabasePublic } from '@/integrations/supabase/publicClient';

export interface DonationProgress {
  goalAmountCents: number;
  raisedAmountCents: number;
}

/**
 * Leitura PÚBLICA da barra de arrecadação do evento beneficente (Confra do Bem).
 * Número CURADO em donation_campaign_progress, atualizado à mão por SQL — não
 * soma pagamentos nem donation_click_events. RLS permite SELECT público.
 *
 * Passe `enabled = isBeneficent` para não consultar em outros eventos. Em erro
 * ou ausência de linha retorna `null` e o call site esconde a barra (sem quebrar
 * a página). Hardcoded sob o slug — generalizar no modo "evento beneficente".
 */
export function useDonationProgress(
  eventSlug: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['donation-progress', eventSlug],
    enabled: enabled && !!eventSlug,
    queryFn: async (): Promise<DonationProgress | null> => {
      const { data, error } = await supabasePublic
        .from('donation_campaign_progress' as any)
        .select('goal_amount_cents, raised_amount_cents')
        .eq('event_slug', eventSlug as string)
        .maybeSingle();

      if (error || !data) return null;

      // bigint pode voltar como string no supabase-js — normaliza com Number.
      const row = data as unknown as {
        goal_amount_cents: number | string;
        raised_amount_cents: number | string;
      };
      const goal = Number(row.goal_amount_cents);
      const raised = Number(row.raised_amount_cents);
      if (!Number.isFinite(goal) || !Number.isFinite(raised) || goal <= 0) {
        return null;
      }
      return { goalAmountCents: goal, raisedAmountCents: raised };
    },
  });
}
