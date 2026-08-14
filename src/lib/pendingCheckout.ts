/*
 * Rascunho local do checkout em andamento.
 *
 * O código PIX não é persistido no banco (a edge `create-mercadopago-pix` só o
 * devolve na resposta), e o pedido inteiro vivia em memória do React — bastava a
 * aba ser descarregada, ou o passo do modal ser resetado, para o cliente perder a
 * tela do pagamento (incidente de 13/08).
 *
 * Guardamos aqui o mínimo para conseguir RETOMAR: qual pedido está em andamento e
 * o código do PIX para remostrar o QR. Nada de PII — só id de pedido, id de
 * pagamento, o payload do PIX (que é público, é o que o cliente copia) e o prazo.
 *
 * localStorage e não sessionStorage: o iOS costuma abrir o app do banco e voltar
 * numa aba nova, o que zera o sessionStorage.
 */

const KEY = 'festpag:pending-checkout';
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2h — bem além do prazo do PIX (30min)

export type PendingCheckout = {
  orderId: string;
  paymentId: string | null;
  pixCode: string | null;
  expiresAt: string | null;
  eventId: string;
  savedAt: number;
};

export function savePendingCheckout(data: Omit<PendingCheckout, 'savedAt'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    /* modo privado / storage cheio: seguir sem retomada é aceitável */
  }
}

/** Devolve o rascunho salvo. Com `orderId`, só devolve se for do mesmo pedido. */
export function readPendingCheckout(orderId?: string): PendingCheckout | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingCheckout;
    if (!parsed?.orderId) return null;
    if (Date.now() - (parsed.savedAt ?? 0) > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    if (orderId && parsed.orderId !== orderId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingCheckout(orderId?: string): void {
  try {
    if (orderId) {
      const current = readPendingCheckout();
      if (current && current.orderId !== orderId) return;
    }
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
