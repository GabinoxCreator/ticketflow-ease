/*
 * Descobre a bandeira pelo começo do número do cartão.
 *
 * Por que existe: o motor de repasse precisa da bandeira para saber o custo
 * real de cada venda — e a resposta da Safe2Pay **não traz esse campo**. O
 * código gravava `null`, o que é honesto (melhor saber que não sabe do que
 * chutar a faixa mais barata), mas o framework do rodeio marca isso como
 * "o único item irrecuperável": cada venda que passa sem a bandeira é um dado
 * que não volta depois.
 *
 * A saída não depende do provedor: os primeiros dígitos do cartão já dizem a
 * bandeira. É informação pública do padrão ISO/IEC 7812, usada por qualquer
 * checkout para desenhar o logotipo antes de enviar nada.
 *
 * ⚠️ Só o NOME da bandeira sai daqui. O número entra, é classificado e some —
 * nada de PAN, BIN ou fragmento é retornado, gravado ou registrado em log.
 */

export type Bandeira =
  | 'visa' | 'mastercard' | 'elo' | 'amex' | 'hipercard' | 'diners' | 'discover' | 'jcb' | 'aura';

/** Faixas do Elo. Não seguem prefixo curto, então a lista é explícita. */
const ELO: string[] = [
  '401178', '401179', '431274', '438935', '451416', '457393', '457631', '457632',
  '504175', '506699', '506770', '506771', '506772', '506773', '506774', '506775',
  '506776', '506777', '506778', '509000', '509001', '509002', '509003', '509004',
  '627780', '636297', '636368', '650031', '650032', '650033', '650035', '650036',
  '650037', '650038', '650039', '650405', '650406', '650407', '650408', '650409',
  '650485', '650486', '650487', '650488', '650489', '650538', '650541', '650542',
  '650543', '650544', '650545', '650546', '650547', '650548', '650549', '650590',
  '650591', '650592', '650593', '650594', '650595', '650596', '650597', '650598',
  '650720', '650721', '650722', '650723', '650724', '650725', '650726', '650727',
  '651652', '651653', '651654', '651655', '651656', '651657', '651658', '651659',
  '655000', '655001', '655002', '655003', '506780',
];

/**
 * @param numero número do cartão, com ou sem espaços.
 * @returns a bandeira, ou null quando não reconhece — nunca um palpite.
 */
export function bandeiraDoCartao(numero: unknown): Bandeira | null {
  const d = String(numero ?? '').replace(/\D/g, '');
  if (d.length < 6) return null;

  const seis = d.slice(0, 6);
  const quatro = d.slice(0, 4);
  const tres = Number(d.slice(0, 3));
  const dois = d.slice(0, 2);

  // Elo antes de Visa e Master: várias faixas dele começam com 4, 5 ou 6 e
  // seriam capturadas pela regra genérica dessas duas.
  if (ELO.includes(seis)) return 'elo';

  if (d[0] === '4') return 'visa';

  if (dois === '34' || dois === '37') return 'amex';

  // Hipercard tem faixa própria e também um prefixo curto herdado.
  if (seis === '606282' || quatro === '3841') return 'hipercard';

  const doisNum = Number(dois);
  if (doisNum >= 51 && doisNum <= 55) return 'mastercard';
  const quatroNum = Number(quatro);
  if (quatroNum >= 2221 && quatroNum <= 2720) return 'mastercard';

  if ((tres >= 300 && tres <= 305) || dois === '36' || dois === '38') return 'diners';
  if (quatro === '6011' || dois === '65') return 'discover';
  if (dois === '35') return 'jcb';
  if (quatro === '5078') return 'aura';

  return null;
}
