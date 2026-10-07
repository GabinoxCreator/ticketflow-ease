/**
 * Corpo de uma resposta 4xx/5xx de edge.
 *
 * Nesses casos o `supabase.functions.invoke` deixa `data` vazio e guarda a
 * resposta em `error.context` (um FunctionsHttpError). Quem lê só `data` perde
 * o que a edge explicou, como o `orderId` de uma cobrança em verificação
 * (OS-165). Devolve null se não houver corpo legível.
 */
export async function corpoDoErroDaEdge(error: unknown): Promise<Record<string, unknown> | null> {
  const contexto = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (typeof contexto?.json !== 'function') return null;
  try {
    const corpo = await contexto.json();
    return corpo && typeof corpo === 'object' ? (corpo as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
