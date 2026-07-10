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
    const resp = await fetch(`${marcelBase}/checkpix`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
