/*
 * Validação do nome de quem compra — lado servidor.
 *
 * Gêmea de `src/lib/nomePessoa.ts`. A do front dá o aviso na hora; esta é a que
 * vale, porque trava no navegador é decorativa: quem chama a API direto passa
 * por cima dela, e quem está com uma versão velha do site em cache também.
 *
 * Nasceu de um caso real (19/08): uma compra da Oktoberfest entrou com
 * "328244429" no campo nome. O ingresso vale e o QR abre, mas na portaria não
 * há como conferir documento contra um número.
 *
 * ⚠️ De propósito frouxa. Nome brasileiro tem apóstrofo (D'Ávila), hífen
 * (Ana-Clara) e ponto (Jr.) — barrar isso trava gente legítima no checkout de
 * um evento vendendo, que é problema maior do que o que se resolve.
 *
 * Se as duas regras divergirem, esta manda.
 */

/** Mensagem do que está errado, ou null se o nome serve. */
export function validarNomePessoa(valor: unknown): string | null {
  const nome = String(valor ?? '').trim().replace(/\s+/g, ' ');

  if (nome.length < 3) return 'Informe seu nome completo.';

  // O caso que originou isto: CPF, telefone ou número de pedido no campo nome.
  if (/\d/.test(nome)) return 'O nome não pode ter números. Digite seu nome como está no documento.';

  // "..." ou "---" passariam pelo teste acima sem ser nome de ninguém.
  const letras = (nome.match(/\p{L}/gu) ?? []).length;
  if (letras < 3) return 'Digite seu nome como está no documento.';

  return null;
}

/** Espaços sobrando fora — é o que vai para o banco e para o ingresso. */
export function normalizarNomePessoa(valor: unknown): string {
  return String(valor ?? '').trim().replace(/\s+/g, ' ');
}
