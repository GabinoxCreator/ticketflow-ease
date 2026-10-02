// Ingresso com pedido de reembolso EM ANÁLISE (OS-103 / OS-113).
//
// A trava de verdade mora no banco: o gatilho `trg_tickets_barrar_em_reembolso`
// recusa check-in, troca de dono e retirada de abadá desse ingresso, levantando
// a exceção 'ingresso_em_reembolso'. Este arquivo só ajuda as portas a FALAR
// isso direito: reconhecer o erro do gatilho (em vez de "status inválido" ou
// 503) e, onde a porta escolhe sozinha qual ingresso usar (a facial), pular o
// que está em análise para não prender os outros do mesmo CPF.
// deno-lint-ignore-file no-explicit-any

export const MENSAGEM_REEMBOLSO_EM_ANALISE = "Ingresso com pedido de reembolso em análise";

/** O erro que o gatilho do banco levanta para ingresso em análise. */
export function ehErroDeReembolso(err: { message?: string } | null | undefined): boolean {
  return Boolean(err?.message?.includes("ingresso_em_reembolso"));
}

/**
 * Quais destes ingressos estão com reembolso em análise agora.
 *
 * Falha na consulta devolve conjunto vazio e avisa no log: a porta segue como
 * antes e o gatilho continua barrando. Nunca vira liberação.
 */
export async function ingressosEmReembolso(
  supabase: any,
  ticketIds: string[],
  tag: string,
): Promise<Set<string>> {
  if (ticketIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("reembolso_ingressos")
    .select("ticket_id, reembolsos!inner(status)")
    .in("ticket_id", ticketIds)
    .eq("reembolsos.status", "solicitado");
  if (error) {
    console.error(`[${tag}] consulta de reembolso falhou (segue sem pular)`, error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r: { ticket_id: string }) => r.ticket_id));
}
