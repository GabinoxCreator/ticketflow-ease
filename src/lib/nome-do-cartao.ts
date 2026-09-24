/*
 * Encaixa o nome do titular no limite do cartão.
 *
 * Por que existe: a Safe2Pay recusa quando o nome do titular passa de 25
 * letras — "O nome do titular do cartão pode possuir no máximo 25 caracteres".
 * O nosso checkout preenchia esse campo com o nome completo do comprador, sem
 * limite nenhum. Entre 18/08 e 21/09/2026 foram 27 recusas por esse motivo;
 * quase todo mundo pagou na segunda tentativa, mas duas compras se perderam
 * (R$ 103,88 no Carlos Caetano e R$ 70,83).
 *
 * Como o cartão abrevia: primeiro nome inteiro, sobrenome final inteiro, e os
 * do meio viram inicial — é assim que os bancos imprimem no plástico. Fazer o
 * mesmo aumenta a chance de o que mandamos bater com o que está gravado lá.
 *
 * ⚠️ Só a rota Safe2Pay tem esse limite. O formulário do Mercado Pago não usa
 * esta função de propósito: cortar um nome que passaria criaria um defeito novo.
 */

export const LIMITE_NOME_CARTAO = 25;

// Ficam minúsculas no cartão e são as primeiras a cair quando falta espaço.
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'la']);

export function abreviarNomeDoCartao(nomeCompleto: string, limite = LIMITE_NOME_CARTAO): string {
  const nome = (nomeCompleto || '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (nome.length <= limite) return nome;

  const partes = nome.split(' ');
  if (partes.length === 1) return nome.slice(0, limite);

  const primeiro = partes[0];
  const ultimo = partes[partes.length - 1];
  const meio = partes.slice(1, -1);

  // 1) tira as partículas do meio ("DOS", "DA"…)
  const semParticulas = meio.filter((p) => !PARTICULAS.has(p.toLowerCase()));
  const tentativa1 = [primeiro, ...semParticulas, ultimo].join(' ');
  if (tentativa1.length <= limite) return tentativa1;

  // 2) abrevia o que sobrou do meio para a inicial
  const iniciais = semParticulas.map((p) => p[0]);
  const tentativa2 = [primeiro, ...iniciais, ultimo].join(' ');
  if (tentativa2.length <= limite) return tentativa2;

  // 3) só primeiro e último
  const tentativa3 = `${primeiro} ${ultimo}`;
  if (tentativa3.length <= limite) return tentativa3;

  // 4) primeiro nome + inicial do último. Se nem isso couber, corta —
  //    mas nunca devolve uma string que a Safe2Pay vá recusar pelo tamanho.
  const tentativa4 = `${primeiro} ${ultimo[0]}`;
  if (tentativa4.length <= limite) return tentativa4;
  return primeiro.slice(0, limite);
}
