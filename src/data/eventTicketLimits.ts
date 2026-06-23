// Espelho do mapa de limites do backend (supabase/functions/_shared/event-ticket-limits.ts).
// Apenas UX: limita o seletor de quantidade. A trava REAL é no servidor.
export const EVENT_TICKET_LIMITS: Record<string, number> = {
  // 5ª Confra do Bem (slug: 5-confra-do-bem) — 1 ingresso por CPF
  "e86df07b-e06f-471e-abf0-a5ec94a11b93": 1,
};

export function getTicketLimitForEvent(eventId: string | undefined | null): number | null {
  if (!eventId) return null;
  const limit = EVENT_TICKET_LIMITS[eventId];
  return typeof limit === "number" ? limit : null;
}
