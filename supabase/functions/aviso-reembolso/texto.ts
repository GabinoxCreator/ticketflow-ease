/*
 * O texto do aviso de pedido de reembolso, separado da edge de propósito
 * (mesmo motivo do aviso de repasse): é função pura, dá para rodar num script
 * e LER a mensagem como ela chega no WhatsApp, sem subir nada.
 *
 * ⚠️ O aviso NÃO leva a chave PIX do comprador. Ela fica no painel, atrás de
 * login. WhatsApp é tela de bloqueio e celular que passa de mão.
 */

export interface Caso {
  reembolso: {
    id: string;
    numero: number;
    status: string;
    forma: 'pix' | 'cartao' | string;
    valor_a_devolver: number | string;
    valor_ingressos: number | string;
    valor_taxa: number | string;
    devolve_taxa: boolean;
    solicitado_em: string;
    regra: { janela?: string; versao_aceita?: string } | null;
  };
  comprador: string;
  evento: string;
  dataEvento: string | null;
  ingressosPedidos: number;
  ingressosDoPedido: number;
  /** Quanto sobra para o produtor no evento, já descontado este reembolso. Nulo = não deu para calcular. */
  saldoDoProdutor: number | null;
}

export const PAINEL = 'https://festpag.digital/admin/reembolsos';

export const dinheiro = (n: unknown) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n ?? 0));

/** Data e hora no fuso de Brasília: quem lê o aviso vive nele, não em UTC. */
export function quandoBR(iso: string | null): string {
  if (!iso) return '?';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '?';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function dataBR(ymd: string | null): string {
  if (!ymd) return '?';
  const [a, m, d] = String(ymd).split('-');
  return d && m && a ? `${d}/${m}/${a}` : String(ymd);
}

/** Dias que faltam para o evento. Negativo = já aconteceu. */
export function diasAte(ymd: string | null): number | null {
  if (!ymd) return null;
  const alvo = new Date(`${ymd}T12:00:00-03:00`).getTime();
  if (isNaN(alvo)) return null;
  return Math.round((alvo - Date.now()) / 86_400_000);
}

export function montarTexto(c: Caso): string {
  const r = c.reembolso;
  const linhas: string[] = [];
  linhas.push(`↩️ *PEDIDO DE REEMBOLSO nº ${r.numero}* · site de ingressos`);
  linhas.push('');
  linhas.push(`*${c.comprador}*`);
  const quantos = c.ingressosPedidos === c.ingressosDoPedido
    ? (c.ingressosPedidos === 1 ? 'o ingresso da compra' : `os ${c.ingressosPedidos} ingressos da compra`)
    : `${c.ingressosPedidos} de ${c.ingressosDoPedido} ingressos da compra`;
  linhas.push(`quer devolver ${quantos}: ${dinheiro(r.valor_a_devolver)}`);
  linhas.push('');
  linhas.push(`🎟️ Evento: ${c.evento}`);
  if (c.dataEvento) {
    const faltam = diasAte(c.dataEvento);
    const quando =
      faltam === null ? dataBR(c.dataEvento)
      : faltam > 0 ? `${dataBR(c.dataEvento)}, faltam ${faltam} dia${faltam === 1 ? '' : 's'}`
      : faltam === 0 ? `${dataBR(c.dataEvento)}, é HOJE`
      : `${dataBR(c.dataEvento)}, já aconteceu`;
    linhas.push(`📅 ${quando}`);
  }
  linhas.push(`🕐 Pedido em ${quandoBR(r.solicitado_em)}`);
  linhas.push('');

  // A regra que o sistema aplicou, dita em uma linha: quem aprova confere sem
  // abrir a Política.
  const janela = r.regra?.janela === 'arrependimento'
    ? 'Desistência dentro dos 7 dias da compra'
    : 'Fora dos 7 dias, pedido até 48h antes do evento';
  linhas.push(`Regra: ${janela}.`);
  if (r.devolve_taxa) {
    linhas.push(`Comprou com a Política antiga: a taxa volta junto (${dinheiro(r.valor_ingressos)} de ingresso + ${dinheiro(r.valor_taxa)} de taxa).`);
  } else {
    linhas.push(`Volta só o valor do ingresso. A taxa de serviço (${dinheiro(r.valor_taxa)}) fica.`);
  }
  linhas.push(r.forma === 'cartao'
    ? '💳 Compra no CARTÃO: devolver por estorno no cartão (Marcel), não por PIX.'
    : '💠 Compra no PIX: devolver por PIX. A chave está no painel.');

  linhas.push('');
  linhas.push('🔒 Os ingressos estão bloqueados até a resposta. Aprovar cancela o ingresso e devolve a vaga para a venda.');

  // Dinheiro que o produtor já levou sai do nosso bolso: é o alerta que não
  // pode faltar antes de aprovar.
  if (c.saldoDoProdutor !== null && c.saldoDoProdutor < 0) {
    linhas.push('');
    linhas.push(`⚠️ O produtor já recebeu este dinheiro. O evento fica devendo ${dinheiro(Math.abs(c.saldoDoProdutor))} para a casa.`);
  }

  linhas.push('');
  linhas.push(`Analisar e dar baixa: ${PAINEL}`);
  return linhas.join('\n');
}
