/*
 * E-mail interno de quem só tem WhatsApp (plano de 09/09/2026).
 *
 * O Supabase exige um e-mail por conta; quem se cadastra só com WhatsApp recebe
 * `<cpf>@sem-email.festpag.digital`. Esse endereço NUNCA recebe mensagem: o
 * perfil fica com e-mail vazio, e todo lugar que grava ou envia e-mail passa
 * por `semEmailInterno()` antes. Arquivo pequeno de propósito — as edges de
 * pagamento importam só isto, sem carregar o motor de código.
 */
export const DOMINIO_SEM_EMAIL = 'sem-email.festpag.digital';

export function emailInternoSemEmail(cpf: string): string {
  return `${String(cpf ?? '').replace(/\D/g, '')}@${DOMINIO_SEM_EMAIL}`;
}

export function ehEmailInterno(email: unknown): boolean {
  return new RegExp(`@${DOMINIO_SEM_EMAIL.replace('.', '\\.')}$`, 'i').test(String(email ?? ''));
}

/** O e-mail que pode ser gravado/enviado: vazio quando é o interno. */
export function semEmailInterno(email: unknown): string {
  const e = String(email ?? '').trim();
  return ehEmailInterno(e) ? '' : e;
}
