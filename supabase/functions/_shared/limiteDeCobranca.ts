// Limite de tentativas de cobrança avulsa na rota do Marcel (OS-269).
//
// POR QUE EXISTE
//   Sem limite, o nosso checkout vira uma máquina de testar cartão roubado:
//   alguém de fora manda centenas de cartões seguidos, e o estorno, a multa e a
//   fama de origem de fraude ficam com a FestPag. No PIX, cada chamada segura
//   ingresso por 30 minutos.
//
// OS NÚMEROS (contados no banco em 21/10, 90 dias da rota do Marcel)
//   O comprador que mais tentou num intervalo de 15 minutos tentou 8 vezes
//   (cartão recusado e nova tentativa), no cartão e no PIX. O site inteiro,
//   somando todo mundo, também não passou de 8 em 15 minutos. Por conta: 12 em
//   15 minutos, depois 30 minutos parado. Por endereço de internet: 60 em 15
//   minutos (operadora de celular põe muita gente atrás do mesmo endereço).
//
// FALHA FECHADA: se a conta de tentativas não responder, a cobrança não passa
// (503), como manda o padrão das edges (`_shared/rateLimit.ts`).

import { checkRateLimit, getClientIp, type RateLimitResult } from './rateLimit.ts';

const POR_CONTA = { max: 12, janela: 900, bloqueio: 1800 };
const POR_ENDERECO = { max: 60, janela: 900, bloqueio: 900 };

export async function limiteDeCobranca(
  admin: any,
  req: Request,
  userId: string,
  metodo: 'card' | 'pix',
): Promise<RateLimitResult> {
  const conta = await checkRateLimit(admin, `cobranca:${metodo}:conta:${userId}`,
    POR_CONTA.max, POR_CONTA.janela, POR_CONTA.bloqueio);
  if (!conta.allowed) return conta;
  const ip = getClientIp(req);
  // Sem endereço conhecido não há o que contar: um balde "unknown" único
  // juntaria todo mundo e travaria a venda inteira.
  if (ip === 'unknown') return conta;
  return await checkRateLimit(admin, `cobranca:${metodo}:ip:${ip}`,
    POR_ENDERECO.max, POR_ENDERECO.janela, POR_ENDERECO.bloqueio);
}
