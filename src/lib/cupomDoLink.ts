/**
 * O cupom que chega pelo link do evento (OS-358): `/evento/<slug>?cupom=JULIA10`.
 *
 * O influenciador divulga o link; quem entra por ele escolhe o ingresso e o
 * pagamento abre com o cupom aplicado, sem digitar. O código fica guardado no
 * navegador, por evento, porque entre a página e o pagamento a pessoa pode ter
 * que entrar ou criar conta (e pode ver o post hoje e comprar amanhã).
 *
 * ⚠️ Aqui só se guarda o CÓDIGO. Quem diz se o cupom vale é a edge
 * `validate-coupon`, e o servidor confere de novo ao criar o pedido.
 */

const PREFIXO = 'festpag:cupom-do-link:';
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

/** O parâmetro da URL, já no formato que a edge exige (exato, maiúsculo). */
export function cupomDaUrl(search: string): string | null {
  try {
    const bruto = new URLSearchParams(search).get('cupom');
    const codigo = bruto?.trim().toUpperCase();
    return codigo ? codigo.slice(0, 40) : null;
  } catch {
    return null;
  }
}

export function guardarCupomDoLink(eventId: string, codigo: string): void {
  try {
    localStorage.setItem(PREFIXO + eventId, JSON.stringify({ codigo, ate: Date.now() + VALIDADE_MS }));
  } catch {
    // navegador sem armazenamento: o link só não sobrevive ao login
  }
}

export function lerCupomDoLink(eventId: string): string | null {
  try {
    const bruto = localStorage.getItem(PREFIXO + eventId);
    if (!bruto) return null;
    const { codigo, ate } = JSON.parse(bruto);
    if (typeof codigo !== 'string' || !codigo || !(Number(ate) > Date.now())) {
      localStorage.removeItem(PREFIXO + eventId);
      return null;
    }
    return codigo;
  } catch {
    return null;
  }
}

export function esquecerCupomDoLink(eventId: string): void {
  try {
    localStorage.removeItem(PREFIXO + eventId);
  } catch {
    // nada a fazer
  }
}

/** O link que o produtor copia no painel. */
export function linkDoCupom(eventSlugOrId: string, codigo: string): string {
  return `https://festpag.digital/evento/${eventSlugOrId}?cupom=${encodeURIComponent(codigo)}`;
}
