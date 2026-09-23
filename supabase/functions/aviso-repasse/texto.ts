/*
 * O texto do aviso de repasse — separado da edge de propósito.
 *
 * É a única parte deste trabalho que uma PESSOA lê, e é a que mais vai mudar
 * com o uso. Num arquivo próprio ela é uma função pura — dá para rodá-la num
 * script de 10 linhas e LER a mensagem exatamente como ela chega no WhatsApp,
 * sem subir nada e sem mandar mensagem para ninguém. Foi assim que o texto
 * abaixo foi conferido antes de existir.
 */

export interface Caso {
  payout: { id: string; status: string; net_amount: number | string; created_at: string };
  produtor: string;
  evento: string;
  dataEvento: string | null;
  resumo: { base: number; pedidos_pagos: number; ja_pago: number; ja_pedido: number; disponivel: number } | null;
}

export const PAINEL = 'https://festpag.digital/admin/repasses';

export const dinheiro = (n: unknown) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n ?? 0));

/** Data e hora no fuso de Brasília — quem lê o aviso vive nele, não em UTC. */
export function quandoBR(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function dataBR(ymd: string | null): string {
  if (!ymd) return '—';
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

/**
 * O texto. Escrito para ser entendido na notificação, sem abrir nada: quem,
 * quanto, de qual evento. O resto é contexto para decidir sem ir ao banco.
 */
export function montarTexto(c: Caso): string {
  const linhas: string[] = [];
  linhas.push('💸 *PEDIDO DE REPASSE* — site de ingressos');
  linhas.push('');
  linhas.push(`*${c.produtor}*`);
  linhas.push(`pediu ${dinheiro(c.payout.net_amount)}`);
  linhas.push('');
  linhas.push(`🎟️ Evento: ${c.evento}`);
  if (c.dataEvento) {
    const faltam = diasAte(c.dataEvento);
    const quando =
      faltam === null ? dataBR(c.dataEvento)
      : faltam > 0 ? `${dataBR(c.dataEvento)} — faltam ${faltam} dia${faltam === 1 ? '' : 's'}`
      : faltam === 0 ? `${dataBR(c.dataEvento)} — é HOJE`
      : `${dataBR(c.dataEvento)} — já aconteceu`;
    linhas.push(`📅 ${quando}`);
  }
  linhas.push(`🕐 Pedido em ${quandoBR(c.payout.created_at)}`);

  if (c.resumo) {
    linhas.push('');
    linhas.push(`Vendido no site (o que custodiamos): ${dinheiro(c.resumo.base)} em ${c.resumo.pedidos_pagos} pedido${c.resumo.pedidos_pagos === 1 ? '' : 's'}`);
    if (Number(c.resumo.ja_pago) > 0) linhas.push(`Já repassado antes: ${dinheiro(c.resumo.ja_pago)}`);
    if (Number(c.resumo.disponivel) > 0) linhas.push(`Ainda não pedido: ${dinheiro(c.resumo.disponivel)}`);
    // Venda manual e dinheiro ficam de fora da base de propósito (regras de
    // 18/08 e 02/09) — dizer isso evita a pergunta "por que não bate com o
    // painel do produtor?", que é o que sempre vem em seguida.
    linhas.push('_Venda manual e dinheiro ficam fora — o produtor já recebeu._');
  }

  // Este é o alerta que evita pagar cedo demais: dinheiro devolvido depois do
  // repasse não tem como voltar (Termos §11, sem cláusula de regresso).
  const faltam = diasAte(c.dataEvento);
  if (faltam !== null && faltam > 0) {
    linhas.push('');
    linhas.push('⚠️ O evento ainda não aconteceu. Pagar agora é adiantamento — contestação e cancelamento depois disso saem do nosso bolso.');
  }

  linhas.push('');
  linhas.push(`Conta para pagar e marcar como pago: ${PAINEL}`);
  return linhas.join('\n');
}
