/*
 * UUID que não derruba a página.
 *
 * `crypto.randomUUID()` só existe em CONTEXTO SEGURO (HTTPS ou localhost). Num
 * acesso por http://IP-da-rede, ou em navegador antigo, ele simplesmente não
 * existe — e a chamada crua derrubava a página do evento inteira (tela preta,
 * sem mensagem nenhuma). Descoberto em 14/08 testando o checkout pelo celular.
 *
 * Ordem: a função nativa quando existir; senão um UUID v4 montado a partir de
 * bytes aleatórios do próprio navegador; e, no pior caso, Math.random — pior
 * qualidade, mas aqui o valor é só um identificador local (curtida anônima,
 * chave de lista), nunca segredo nem token.
 */

export function safeRandomUUID(): string {
  const c: Crypto | undefined = globalThis.crypto;

  if (typeof c?.randomUUID === 'function') return c.randomUUID();

  if (typeof c?.getRandomValues === 'function') {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // versão 4
    b[8] = (b[8] & 0x3f) | 0x80; // variante
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
