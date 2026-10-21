// Conferência antes de promover um pedido a pago pelo id de pagamento GRAVADO
// NO PEDIDO (OS-265, 21/10/2026). Usada por expire-pending-orders,
// marcel-check-pix, marcel-reconcile e confra-check-pix.
//
// O BURACO (varredura 17/10, E10)
//   Essas rotinas perguntam ao provedor "o pagamento X foi pago?" e, se sim,
//   promovem o pedido que tem X gravado. Ninguém conferia que X é DESTE pedido
//   e do MESMO valor. Quem gravasse o id de um PIX pequeno e pago em vários
//   pedidos liberava todos com um pagamento só. A regra que deixava o produtor
//   gravar esse id caiu na migration da OS-265; esta conferência é a segunda
//   trava, para o id que vier errado por qualquer outro caminho.
//
// O QUE DÁ PARA CONFERIR EM CADA PROVEDOR
//   · Mercado Pago: a consulta do pagamento traz `external_reference` (o id do
//     pedido que mandamos na cobrança) e `transaction_amount`. Confere os dois,
//     com a mesma tolerância do webhook (R$ 0,01), como a
//     check-mercadopago-payment já faz.
//   · Marcel: `/checkpix` e `/reconcile` respondem só `aprovado`, `status` e
//     `message` (doc API-PAGAMENTOS-INTEGRACAO.md): não dá para ler de quem é o
//     pagamento nem o valor. O que se confere é que o id não está gravado em
//     OUTRO pedido: um pagamento libera um pedido só. O valor fica garantido por
//     quem grava: só as nossas edges de cobrança, com a chave de serviço, gravam
//     o id e o total, e o produtor não alcança mais essas colunas.
//     Pela consulta por purchaseId (`/reconcile` com o id do pedido) o próprio
//     Marcel amarra o pagamento ao pedido; ali não há id nosso a conferir.
//
// RECUSOU: NÃO FICA EM SILÊNCIO (revisão 1 da OS-265)
//   O provedor disse "pago" e a conferência não deixou promover: alguém pode
//   ter pagado e ficado sem ingresso. `recusarPromocao` leva o caso para a
//   MESMA bandeira dos outros "pago sem entrega" (review_status =
//   'paid_no_delivery', que o ritual do "oi" confere; `flavor: c_conferencia`) e avisa a gestão (sino e push). Uma vez só por pedido:
//   audita e avisa só a chamada que pôs a bandeira (as rotinas passam pelo
//   mesmo pedido a cada minuto, duas delas no mesmo segundo, e a tela a cada
//   5 s). Pedido com essa bandeira só a casa vê (decisão do Gabriel, 21/10).
//   Id repetido entre dois pedidos sem pagamento: os dois vão para análise e
//   nenhum é promovido (não dá para saber qual é o dono). Pagamento que o
//   próprio Mercado Pago diz ser de OUTRO pedido não marca este (ele não foi
//   pago por esse id): só registra e avisa.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { avisarGestao } from "./avisarGestao.ts";

const SYSTEM_ACTOR = '95628c4a-8040-44ed-83c5-d6a5b8793926';

export type Recusa = {
  ok: false;
  motivo: 'pagamento_de_outro_pedido' | 'valor_diferente' | 'conferencia_indisponivel';
  detalhe: Record<string, unknown>;
  /** Id repetido: o(s) outro(s) pedido(s) com o mesmo id, e em que situação estão. */
  outros?: { id: string; status: string }[];
};
export type ConferenciaPagamento = { ok: true } | Recusa;

/** Mercado Pago: o pagamento consultado é deste pedido e do mesmo valor? */
export function conferirPagamentoMercadoPago(
  order: { id: string; total_amount: number | string | null },
  payment: { external_reference?: string | null; transaction_amount?: number | string | null },
): ConferenciaPagamento {
  const ref = payment?.external_reference ?? null;
  if (ref !== order.id) {
    return { ok: false, motivo: 'pagamento_de_outro_pedido', detalhe: { external_reference: ref } };
  }
  const esperado = Number(order.total_amount);
  const recebido = Number(payment?.transaction_amount);
  if (!Number.isFinite(esperado) || !Number.isFinite(recebido) || Math.abs(esperado - recebido) > 0.01) {
    return { ok: false, motivo: 'valor_diferente', detalhe: { esperado, recebido } };
  }
  return { ok: true };
}

/**
 * O id de pagamento que vai promover este pedido está gravado em OUTRO pedido
 * (como id do Mercado Pago ou como id da transação do provedor)?
 * Erro de leitura volta `conferencia_indisponivel`: quem chama NÃO promove nesta
 * rodada e tenta de novo depois (nunca promover no escuro).
 */
export async function conferirIdSoDestePedido(
  admin: SupabaseClient,
  orderId: string,
  paymentId: string,
): Promise<ConferenciaPagamento> {
  const id = String(paymentId);
  // Duas consultas com .eq (e não um .or com o id no meio do filtro): o id vem
  // do banco, mas não se monta filtro do PostgREST com texto de fora.
  const [porMp, porProvedor] = await Promise.all([
    admin.from('orders').select('id, status').eq('mp_payment_id', id).neq('id', orderId).limit(5),
    admin.from('orders').select('id, status').eq('provider_transaction_id', id).neq('id', orderId).limit(5),
  ]);
  if (porMp.error || porProvedor.error) {
    return {
      ok: false,
      motivo: 'conferencia_indisponivel',
      detalhe: { erro: String(porMp.error?.message ?? porProvedor.error?.message ?? 'erro') },
    };
  }
  const vistos = new Map<string, string>();
  for (const r of [...(porMp.data ?? []), ...(porProvedor.data ?? [])] as { id: string; status: string }[]) {
    vistos.set(r.id, r.status);
  }
  if (vistos.size > 0) {
    const outros = [...vistos].map(([oid, status]) => ({ id: oid, status }));
    return {
      ok: false,
      motivo: 'pagamento_de_outro_pedido',
      detalhe: { outro_pedido: outros[0].id, outros_pedidos: outros.map((o) => `${o.id}:${o.status}`) },
      outros,
    };
  }
  return { ok: true };
}

/**
 * O provedor disse "pago" e a conferência recusou. Registra (auditoria), leva
 * para análise humana (bandeira "pago sem entrega") e avisa a gestão, UMA vez
 * por pedido. Nunca lança: roda no meio de rotina de dinheiro.
 *
 * `bandeira`: marca o pedido (e, com id repetido, os outros que também não
 * foram pagos) para análise. Falso só quando o próprio provedor diz que o
 * pagamento é de outro pedido (este não foi pago por esse id).
 * `situacao`: o status do pedido como fica depois desta rodada (o painel do
 * produtor mostra "o pedido já estava <situacao> quando a confirmação chegou").
 */
export async function recusarPromocao(
  admin: SupabaseClient,
  a: {
    orderId: string;
    situacao: string;
    valor: number | string | null;
    source: string;
    paymentId: string | null;
    recusa: Recusa;
    bandeira: boolean;
  },
): Promise<{ registrouAgora: boolean }> {
  const { orderId, recusa } = a;
  if (recusa.motivo === 'conferencia_indisponivel') return { registrouAgora: false };
  const acao = recusa.motivo === 'valor_diferente'
    ? 'promotion_refused_amount_mismatch'
    : 'promotion_refused_payment_of_other_order';
  try {
    const motivo = recusa.motivo === 'valor_diferente'
      ? 'conferência: valor pago diferente do pedido'
      : 'conferência: id de pagamento também gravado em outro pedido';
    const marcados: string[] = [];
    if (a.bandeira) {
      // Marca só quem ainda não tem bandeira (`.is('review_status', null)`): a
      // segunda passada não regrava nada. Id repetido: os outros que também não
      // foram pagos vão junto (nenhum é promovido); o que já está pago não ganha
      // bandeira de "sem entrega".
      // O `review_reason` fica curto de propósito (o comprador lê o próprio
      // pedido): ids de outros pedidos e do pagamento vão só para a auditoria.
      // Pedido com `flavor: c_conferencia` só a casa vê (regra do produtor na
      // migration 20261021130000, decisão do Gabriel de 21/10).
      const alvo = [{ id: orderId, status: a.situacao }, ...(recusa.outros ?? []).filter((o) => o.status !== 'paid')];
      for (const p of alvo) {
        const agora = new Date().toISOString();
        const { data: marcou } = await admin.from('orders')
          .update({
            review_status: 'paid_no_delivery',
            review_flagged_at: agora,
            review_reason: { motivo, flavor: 'c_conferencia', order_status: p.status, source: a.source, detected_at: agora },
          })
          .eq('id', p.id)
          .is('review_status', null)
          .select('id');
        if ((marcou?.length ?? 0) > 0) marcados.push(p.id);
      }
      // Uma vez só, sem corrida: quem audita e avisa é a chamada que MARCOU este
      // pedido (o UPDATE com `review_status is null` devolve a linha para uma
      // chamada só, mesmo com duas rotinas no mesmo segundo). Não marcou = outra
      // chamada já marcou (e avisou), ou o pedido já estava em análise.
      if (!marcados.includes(orderId)) return { registrouAgora: false };
    } else {
      // Sem bandeira: a auditoria é o registro de "já avisei".
      const { data: ja, error: eJa } = await admin.from('audit_logs')
        .select('id').eq('target_id', orderId).eq('action', acao).limit(1);
      if (!eJa && (ja?.length ?? 0) > 0) return { registrouAgora: false };
    }

    await admin.from('audit_logs').insert({
      actor_id: SYSTEM_ACTOR,
      action: acao,
      target_type: 'order',
      target_id: orderId,
      metadata: { source: a.source, payment_id: a.paymentId, marcados, ...recusa.detalhe },
    });

    const valor = Number(a.valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const porque = recusa.motivo === 'valor_diferente'
      ? `o valor pago (${String(recusa.detalhe.recebido)}) é diferente do total do pedido (${String(recusa.detalhe.esperado)})`
      : recusa.outros
        ? `o mesmo id de pagamento (${a.paymentId}) também está gravado no pedido ${String(recusa.detalhe.outro_pedido)}`
        : `esse pagamento (${a.paymentId}) é do pedido ${String(recusa.detalhe.external_reference)}, segundo o próprio Mercado Pago`;
    await avisarGestao({
      tipo: 'pagamento',
      titulo: `Pagamento em conferência (${valor}): ingresso não liberado`,
      mensagem: `O provedor confirmou um pagamento, mas ${porque}. O ingresso NÃO foi liberado`
        + (marcados.length ? ` e ${marcados.length === 1 ? 'o pedido ficou marcado' : `${marcados.length} pedidos ficaram marcados`} para análise.` : '.')
        + ` Pedido ${orderId} (${a.source}).`,
      referencia: orderId,
    });
    return { registrouAgora: true };
  } catch (_) {
    // A recusa já aconteceu (não promoveu); falhar aqui é perder o registro,
    // nunca liberar ingresso.
    return { registrouAgora: false };
  }
}
