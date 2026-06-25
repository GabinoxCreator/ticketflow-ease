// Telemetria best-effort de cliques no evento beneficente (Confra do Bem).
// Chamada SEMPRE atrás do guard isBeneficent nos call sites — nenhum outro evento
// dispara. Hardcoded sob o slug; generalizar no futuro modo "evento beneficente"
// (ver roadmap.md). Persiste em donation_click_events via edge track-donation-click.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export type DonationClickButton = 'doar' | 'copiar_pix';

/**
 * Dispara fire-and-forget o registro de um clique de doação. NÃO retorna promise
 * e NUNCA lança: qualquer erro é silenciosamente ignorado. A ação real do botão
 * (abrir modal / copiar) não pode ser bloqueada nem afetada por esta chamada.
 */
export function trackDonationClick(
  eventSlug: string | null | undefined,
  button: DonationClickButton,
): void {
  try {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !eventSlug) return;
    void fetch(`${SUPABASE_URL}/functions/v1/track-donation-click`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ event_slug: eventSlug, button }),
      keepalive: true,
    }).catch(() => {
      /* best-effort: ignora falha de rede */
    });
  } catch {
    /* best-effort: nunca propaga */
  }
}
