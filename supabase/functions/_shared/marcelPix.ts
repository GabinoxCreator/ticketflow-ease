// Consulta de status PIX no provedor Marcel (Safe2Pay). FONTE ÚNICA da regra de
// "pago" — usada por confra-check-pix e por expire-pending-orders. Mudou a regra
// aqui? Vale nas duas edges.
//
// ok:false  = provedor não respondeu (HTTP não-2xx, timeout, exceção) → o CALLER
//             NUNCA deve tratar como não-pago (não expirar; tentar de novo depois).
// paid      = só é confiável quando ok:true.

export interface MarcelPixResult {
  ok: boolean;
  paid: boolean;
}

const CHECKPIX_TIMEOUT_MS = 5000;

export async function checkMarcelPixPaid(
  marcelBase: string,
  transactionId: string,
): Promise<MarcelPixResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECKPIX_TIMEOUT_MS);
  try {
    // ⚠️ A API passou a EXIGIR `x-api-key` (17/08/2026). Sem o header ela
    // responde 401, este helper devolve ok:false, e quem chama entende
    // "provedor indisponível" e PULA o pedido para não matar venda paga.
    //
    // A intenção do caller está certa — errado era chamar sem a chave. O efeito
    // era pedido da rota do Marcel que NUNCA expira, segurando estoque para
    // sempre. Pego em auditoria com um pedido preso havia 37 minutos.
    const apiKey = Deno.env.get('MARCEL_API_KEY');
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["x-api-key"] = apiKey;

    const resp = await fetch(`${marcelBase}/checkpix`, {
      method: "POST",
      headers,
      body: JSON.stringify({ transactionId: Number(transactionId) }),
      signal: controller.signal,
    });
    if (!resp.ok) return { ok: false, paid: false };
    const data = await resp.json();
    // Mesma regra que a confra-check-pix já usa em produção.
    const paid = data?.aprovado === true || data?.status === 3;
    return { ok: true, paid };
  } catch (_) {
    // timeout (abort) ou erro de rede → provedor indisponível nesta rodada.
    return { ok: false, paid: false };
  } finally {
    clearTimeout(timer);
  }
}
