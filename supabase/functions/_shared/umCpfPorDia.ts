// 1 CPF = 1 ingresso por DIA — a trava anti-cambista do Rodeio (§3 do framework).
//
// A regra: o mesmo CPF pode ir nas cinco noites, mas não pode ter DOIS ingressos
// da MESMA noite. Sem isso, uma pessoa compra 40 ingressos de sábado e revende
// na porta pelo dobro.
//
// ⚠️ INVISÍVEL PARA OS OUTROS CLIENTES (§0-A). A trava é ligada por DADO, não
// por `if evento == rodeio`: ela só morde onde o evento tem noites cadastradas
// (`event_days`) e os lotes apontam para elas. Evento comum passa por aqui e sai
// sem restrição nenhuma — é o comportamento de hoje, bit a bit.
//
// A conta mora no banco (`conflitos_cpf_por_dia`), não aqui: é lá que estão os
// ingressos e os pedidos, e refazer a conta em TypeScript seria a mesma receita
// que fez o cupom ser ignorado no checkout.

export interface ItemDoCarrinho { lotId: string; quantity: number }

export interface ConflitoDeDia {
  event_day_id: string;
  dia_label: string;
  /** 'ja_possui' = já tem ingresso dessa noite · 'quantidade_no_pedido' = está
   *  levando mais de um da mesma noite no mesmo carrinho. */
  motivo: string;
}

/** Mensagem que o cliente lê. Precisa dizer QUAL noite e o que fazer. */
export function mensagemDoConflito(conflitos: ConflitoDeDia[]): string {
  const jaTem = conflitos.filter((c) => c.motivo === 'ja_possui').map((c) => c.dia_label);
  const repetido = conflitos.filter((c) => c.motivo !== 'ja_possui').map((c) => c.dia_label);

  if (jaTem.length && repetido.length) {
    return `Este CPF já tem ingresso de ${jaTem.join(', ')} e o pedido leva mais de um ingresso de ${repetido.join(', ')}. `
      + `É permitido 1 ingresso por pessoa em cada noite.`;
  }
  if (jaTem.length) {
    return `Este CPF já tem ingresso de ${jaTem.join(', ')}. `
      + `É permitido 1 ingresso por pessoa em cada noite — escolha outra noite.`;
  }
  return `O pedido leva mais de um ingresso de ${repetido.join(', ')}. `
    + `É permitido 1 ingresso por pessoa em cada noite.`;
}

/**
 * Devolve as noites em conflito. Vazio = pode vender.
 *
 * ⚠️ FALHA FECHADA. Se a consulta der erro, esta função LANÇA em vez de deixar
 * passar. É trava anti-cambista: deixar vender porque a checagem falhou é
 * exatamente o furo que ela existe para tapar — o mesmo princípio do rate limit
 * (`_shared/rateLimit.ts`), que erra para o lado de barrar.
 */
export async function conflitosDeCpfPorDia(
  admin: any,
  eventId: string,
  cpf: string,
  itens: ItemDoCarrinho[],
): Promise<ConflitoDeDia[]> {
  const { data, error } = await admin.rpc('conflitos_cpf_por_dia', {
    _event_id: eventId,
    _cpf: cpf,
    _itens: itens.map((i) => ({ lot_id: i.lotId, quantity: i.quantity })),
  });
  if (error) {
    console.log(`[UM-CPF-POR-DIA] falha ao checar (barrando por segurança): ${error.message}`);
    throw new Error('Não foi possível validar o limite de ingressos por pessoa. Tente novamente.');
  }
  return (data ?? []) as ConflitoDeDia[];
}
