// Limite de ingressos por CPF, por evento (trava real, sem migration/coluna nova).
// null = sem limite. Só os eventos listados aqui são afetados.
import { unformatCPF } from "./cpf.ts";

export const EVENT_TICKET_LIMITS: Record<string, number> = {
  // 5ª Confra do Bem (slug: 5-confra-do-bem) — 1 ingresso por CPF
  "e86df07b-e06f-471e-abf0-a5ec94a11b93": 1,
};

export function getTicketLimitForEvent(eventId: string): number | null {
  const limit = EVENT_TICKET_LIMITS[eventId];
  return typeof limit === "number" ? limit : null;
}

// Conta quantos ingressos um CPF já possui no evento.
// IMPORTANTE: receba o client de service-role (ignora RLS), senão a trava fura.
// Considera só orders 'paid' OU ('pending' com expires_at > now()).
// NÃO conta cancelled/expired/failed (permite nova tentativa após expirar).
export async function countTicketsForCpf(
  client: any,
  eventId: string,
  cpf: string,
): Promise<number> {
  const normCpf = unformatCPF(cpf);
  if (!normCpf) return 0;

  const { data: orders, error } = await client
    .from("orders")
    .select("id, status, expires_at")
    .eq("event_id", eventId)
    .eq("customer_cpf", normCpf)
    .in("status", ["paid", "pending"]);

  if (error) throw new Error("Erro ao verificar limite de ingressos por CPF");
  if (!orders || orders.length === 0) return 0;

  const now = Date.now();
  const validOrderIds = orders
    .filter((o: any) =>
      o.status === "paid" ||
      (o.status === "pending" && o.expires_at && new Date(o.expires_at).getTime() > now)
    )
    .map((o: any) => o.id);

  if (validOrderIds.length === 0) return 0;

  const { count, error: ticketsError } = await client
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .in("order_id", validOrderIds);

  if (ticketsError) throw new Error("Erro ao verificar limite de ingressos por CPF");
  return count ?? 0;
}
