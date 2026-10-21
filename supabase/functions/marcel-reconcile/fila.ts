// fila.ts: quem a conferência pergunta ao Marcel em cada rodada (OS-245).
//
// POR QUE EXISTE
//   Em 15/10 a rotina olhava só os 40 pedidos em dúvida MAIS ANTIGOS das últimas
//   48h. Os testes de R$ 1,12 da maquininha (que nunca passam pelo Marcel)
//   ocuparam 39 desses lugares e as compras reais do site ficaram de fora: se
//   alguém pagasse ali, o ingresso não sairia. O filtro de origem (só `online`)
//   fica na consulta, no index.ts. Aqui fica a outra metade: mesmo que a fila
//   passe do lote, nenhum pedido pode ficar invisível.
//
// A REGRA
//   1. Pedido PENDENTE vem antes, todos, até o tamanho do lote: é o cliente que
//      pode estar pagando agora, e é o único que ainda vira pago (a RPC não
//      promove pedido encerrado).
//   2. Expirado e recusado preenchem as vagas que sobram, em rodízio.
//      Pago lá e encerrado aqui vira bandeira no painel para alguém resolver.
//   3. Só quando os pendentes PASSAM do lote: eles também entram em rodízio, e
//      um quarto do lote fica reservado para os encerrados (quando houver), para
//      uma enxurrada de pendentes não cegar o resto da fila.
//
// O RODÍZIO (quando a lista não cabe nas vagas)
//   Cada pedido tem um lugar fixo numa roda, tirado do próprio id (o id do
//   pedido é aleatório, então os lugares se espalham por igual). A cada minuto
//   um ponteiro anda 0,618 de volta (a razão áurea: o ponteiro nunca cai duas
//   vezes no mesmo lugar e espalha as paradas por igual), e a rodada confere os
//   pedidos que estão logo depois dele, até encher as vagas.
//   Não guarda estado e não depende de quantas vagas sobraram nem do tamanho da
//   fila naquele minuto: pedido entrando ou saindo, ou o número de pendentes
//   mudando, não faz a roda saltar nem deixa um pedido para trás para sempre.
//   Medido com esta função (ensaio da OS-245): fila de ~150 encerrados entrando
//   e saindo, pendentes de 0 a 29, cada um conferido de novo em no máximo 28
//   minutos (mediana 12). O id do pedido vem de gen_random_uuid(): lugares
//   espalhados.
//   O limite honesto: quem espera é sempre o ENCERRADO, e só quando sobra pouca
//   vaga. Com 35 pendentes parados, um encerrado chegou a esperar 144 minutos;
//   com 38 ou 39, horas; com exatamente 40, nenhum encerrado é conferido até um
//   pendente sair. O pendente nunca espera (até 40). Encerrado esperando só
//   atrasa a bandeira de "pago sem entrega" no painel; não perde ingresso, que
//   já não sairia (a RPC não promove pedido encerrado). No mundo real, em 120
//   dias até 21/10: no máximo 19 pendentes ao mesmo tempo e 27 na fila inteira.

export type PedidoEmDuvida = {
  id: string;
  status: string;
  created_at: string;
};

export type Lote<T> = {
  /** Na ordem em que devem ser conferidos: pendentes primeiro. */
  lote: T[];
  /** Quantos pedidos em dúvida existem na janela (o tamanho real da fila). */
  naFila: number;
  pendentes: number;
  /** Quantos ficaram para as próximas rodadas por falta de vaga. */
  foraDestaRodada: number;
};

/** O minuto do relógio: muda a cada rodada do cron, que roda de minuto em minuto. */
export function rodadaDoMinuto(agoraMs: number = Date.now()): number {
  return Math.floor(agoraMs / 60_000);
}

const RAZAO_AUREA = (Math.sqrt(5) - 1) / 2; // 0,618...

/** Lugar fixo do pedido na roda, entre 0 e 1, tirado do id. */
export function lugarNaRoda(id: string): number {
  const hex = id.replace(/[^0-9a-f]/gi, '').slice(0, 8);
  if (hex.length === 8) return parseInt(hex, 16) / 2 ** 32;
  // id fora do formato uuid: espalha pelo texto (FNV-1a), nunca quebra.
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return h / 2 ** 32;
}

/** Onde o ponteiro para nesta rodada, entre 0 e 1. */
export function ponteiro(rodada: number): number {
  const p = (rodada * RAZAO_AUREA) % 1;
  return p < 0 ? p + 1 : p;
}

/**
 * Até `vagas` itens da lista: todos, se couberem; senão, os que estão logo
 * depois do ponteiro desta rodada, na ordem da roda.
 */
export function daVez<T extends { id: string }>(lista: T[], vagas: number, rodada: number): T[] {
  if (vagas <= 0 || lista.length === 0) return [];
  if (lista.length <= vagas) return lista.slice();
  const p = ponteiro(rodada);
  return lista
    .map((item) => ({ item, distancia: (lugarNaRoda(item.id) - p + 1) % 1 }))
    .sort((a, b) => a.distancia - b.distancia || (a.item.id < b.item.id ? -1 : 1))
    .slice(0, vagas)
    .map((x) => x.item);
}

function maisAntigoPrimeiro(a: PedidoEmDuvida, b: PedidoEmDuvida): number {
  const d = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (d !== 0 && !Number.isNaN(d)) return d;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Monta o lote da rodada. `pedidos` = todos os pedidos em dúvida da janela. */
export function montarLote<T extends PedidoEmDuvida>(pedidos: T[], loteMax: number, rodada: number): Lote<T> {
  const pendentes = pedidos.filter((p) => p.status === 'pending').sort(maisAntigoPrimeiro);
  const encerrados = pedidos.filter((p) => p.status !== 'pending').sort(maisAntigoPrimeiro);

  // Reserva para os encerrados só quando os pendentes sozinhos passam do lote.
  const reserva = pendentes.length > loteMax ? Math.min(encerrados.length, Math.ceil(loteMax / 4)) : 0;

  const dosPendentes = daVez(pendentes, loteMax - reserva, rodada);
  const dosEncerrados = daVez(encerrados, loteMax - dosPendentes.length, rodada);
  const lote = [...dosPendentes, ...dosEncerrados];

  return {
    lote,
    naFila: pedidos.length,
    pendentes: pendentes.length,
    foraDestaRodada: pedidos.length - lote.length,
  };
}
