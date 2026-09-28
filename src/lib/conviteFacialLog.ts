/*
 * conviteFacialLog — registra o que aconteceu com o convite da facial.
 *
 * Por que existe (28/09/2026): o convite sumiu do site em 01/09 e só foi
 * descoberto em 26/09. O banco não tinha como avisar, porque "a tela não
 * apareceu" e "apareceu e a pessoa disse não" gravavam exatamente a mesma
 * coisa: nada. Agora gravam coisas diferentes, e dá para perguntar ao banco
 * se o convite está vivo:
 *
 *   select action, count(*) from audit_logs
 *    where action like 'facial_convite_%' and created_at > now() - interval '7 days'
 *    group by 1;
 *
 * Zero `mostrado` com contas nascendo = o convite sumiu de novo.
 *
 * Nunca atrapalha o cadastro: se a gravação falhar, a pessoa segue o caminho
 * dela e ninguém vê erro nenhum. É registro, não regra de negócio.
 */
import { supabase } from '@/integrations/supabase/client';

export type ConviteFacialEvento = 'mostrado' | 'recusado' | 'concluido';
export type ConviteFacialOrigem = 'compra' | 'login';

export function registrarConviteFacial(
  evento: ConviteFacialEvento,
  origem: ConviteFacialOrigem,
): void {
  // `as any`: a RPC é nova e o types.ts é auto-gerado (não se edita à mão).
  void (supabase as any)
    .rpc('registrar_convite_facial', { p_evento: evento, p_origem: origem })
    .then(() => undefined)
    .catch(() => undefined);
}
