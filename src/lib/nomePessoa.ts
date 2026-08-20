/*
 * Validação do nome de quem compra.
 *
 * Nasceu de um caso real (19/08): uma compra da Oktoberfest entrou com
 * "328244429" no campo nome — a pessoa digitou o CPF ali. O ingresso é válido,
 * o QR abre, mas na portaria o colaborador não tem como conferir documento
 * contra um nome que é um número.
 *
 * A regra é de propósito frouxa: só barra o que claramente não é nome de gente.
 * Nome brasileiro tem apóstrofo (D'Ávila), hífen (Ana-Clara) e ponto (Jr.), e
 * barrar esses cria um problema pior do que o que resolve — gente legítima
 * travada no checkout de um evento que está vendendo.
 */

/** Nome válido, ou a mensagem do que está errado. */
export function validarNomePessoa(valor: string): string | null {
  const nome = String(valor ?? '').trim().replace(/\s+/g, ' ');

  if (nome.length < 3) return 'Nome deve ter pelo menos 3 caracteres';

  // O caso que originou isto: CPF, telefone ou pedido digitado no campo nome.
  if (/\d/.test(nome)) return 'O nome não pode ter números';

  // "..." ou "---" passariam pelo teste acima sem ser nome de ninguém.
  const letras = (nome.match(/\p{L}/gu) ?? []).length;
  if (letras < 3) return 'Digite seu nome como está no documento';

  return null;
}

/** Espaços sobrando fora — é o que vai para o banco e para o ingresso. */
export function normalizarNomePessoa(valor: string): string {
  return String(valor ?? '').trim().replace(/\s+/g, ' ');
}
