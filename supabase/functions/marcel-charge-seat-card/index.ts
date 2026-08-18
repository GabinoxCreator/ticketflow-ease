// marcel-charge-seat-card — cobrança no CRÉDITO de MESA/CAMAROTE pela API do Marcel.
//
// Gêmea da `charge-seat-card` (Mercado Pago), com duas diferenças de fundo:
//
// 1. QUEM APROVA. Lá o webhook do Mercado Pago é o único caminho de promoção, e
//    a edge nunca promove. A API do Marcel NÃO TEM WEBHOOK: ninguém nos avisa.
//    Então aqui a aprovação acontece na resposta da cobrança, pela mesma RPC
//    transacional de sempre (`apply_order_approved`) — que é idempotente, recusa
//    pedido sem ingresso e confirma os assentos de held→sold.
//
// 2. QUEM PAGA O PARCELAMENTO. No Mercado Pago o juro é do adquirente e some na
//    conta do produtor. Aqui a conta é nossa e está escrita na nossa tabela:
//    decisão do Gabriel para camarote — **quem parcela paga os juros**, e o
//    produtor recebe o combinado. Por isso `_absorve = false`.
//
// A regra do dinheiro em dúvida é a mesma das outras: recusa explícita solta a
// mesa; timeout ou resposta ilegível NÃO soltam nada — a cobrança pode ter
// passado, e soltar a mesa colocaria à venda um camarote já pago.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { applyOrderApproved } from "../_shared/applyOrderApproved.ts";
import { captureSaleTerms } from "../_shared/captureSaleTerms.ts";
import { cobrarCredito, MarcelIndisponivel } from "../_shared/marcel.ts";
import {
  corsMesa, jsonMesa, adminClient, exigirUsuario, exigirCpfValido, eventoPublicado,
  abrirPedidoDeMesa, desfazerPedidoDeMesa, cotarMesa, MesaInvalida,
  type AssentoPedido,
} from "../_shared/mesaMarcel.ts";

// Teto da API. A tela mostra o que vier desta lista — nunca uma lista inventada
// no navegador, porque a API RECUSA A VENDA INTEIRA se a parcela cair abaixo de
// R$5, em vez de reduzir o número de parcelas sozinha.
const MAX_PARCELAS = 10;

// Cartão segura a mesa por 20 min (mesma janela da rota do Mercado Pago): o
// banco entra no caminho e a resposta demora mais que a do PIX.
const JANELA_CARTAO = '00:20:00';

interface OpcaoParcela {
  parcelas: number;
  total_cents: number;
  parcela_cents: number;
  acrescimo_cents: number;
  taxa_pct: string | number;
}

const log = (step: string, d?: unknown) =>
  console.log(`[MARCEL-SEAT-CARD] ${step}${d ? ` - ${JSON.stringify(d)}` : ''}`);

/** Monta as faixas de parcela para um total. Camarote: o comprador paga o juro. */
async function opcoesPara(admin: any, totalReais: number): Promise<OpcaoParcela[]> {
  const { data, error } = await admin.rpc('opcoes_parcelamento', {
    _face_cents: Math.round(totalReais * 100),
    _absorve: false,
    _max_parcelas: MAX_PARCELAS,
  });
  if (error) {
    log('Falha ao montar parcelas', { error });
    throw new Error('parcelamento_indisponivel');
  }
  return (data ?? []) as OpcaoParcela[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsMesa });

  const admin = adminClient();
  let orderId: string | null = null;

  try {
    const userId = await exigirUsuario(req);
    const body = await req.json();
    const { eventId, holdToken, seats, quote, installments, card, cartaoId,
            customerName, customerEmail, customerPhone } = body as {
      eventId: string; holdToken: string; seats: AssentoPedido[]; quote?: boolean;
      installments?: number; card?: unknown; cartaoId?: string;
      customerName: string; customerEmail: string; customerPhone?: string;
    };

    if (!eventId || !holdToken || !Array.isArray(seats) || seats.length === 0) {
      return jsonMesa({ error: 'invalid_request' }, 400);
    }

    // ---- Cotação: nada é criado, nenhuma mesa é presa ------------------------
    // A tela precisa mostrar as parcelas ANTES de o cliente decidir. Cotar pela
    // RPC de criação prenderia o camarote de quem só está olhando o preço.
    if (quote) {
      const conta = await cotarMesa(admin, { eventId, userId, holdToken, seats, metodo: 'card' });
      const lista = await opcoesPara(admin, conta.total);
      return jsonMesa({
        subtotal: conta.total,
        totalFace: conta.subtotal,
        taxaAdministrativa: conta.taxaAdministrativa,
        desconto: 0,
        produtorAbsorve: false,
        // Mesmo formato que a tela de cartão já consome. Nome em inglês de
        // propósito: mudar exigiria mexer no componente, e uma tela que não
        // entende o formato cai no fallback de "só 1x" — o cliente perderia o
        // parcelamento sem ninguém perceber.
        options: lista.map((o) => ({
          installments: o.parcelas,
          total: o.total_cents / 100,
          perInstallment: o.parcela_cents / 100,
          processingFee: o.acrescimo_cents / 100,
          ratePct: Number(o.taxa_pct),
        })),
        opcoes: lista.map((o) => ({
          parcelas: o.parcelas,
          total: o.total_cents / 100,
          valorParcela: o.parcela_cents / 100,
          taxaProcessamento: o.acrescimo_cents / 100,
          taxaPct: Number(o.taxa_pct),
        })),
      });
    }

    // ---- Cobrança de verdade -------------------------------------------------
    const cleanCPF = exigirCpfValido(body.customerCPF ?? body.customerCpf);
    if (!card && !cartaoId) return jsonMesa({ error: 'invalid_request', message: 'Dados do cartão obrigatórios' }, 400);

    const event = await eventoPublicado(admin, eventId);

    const pedido = await abrirPedidoDeMesa(admin, {
      eventId, userId, holdToken, seats,
      customerName, customerEmail, customerCpf: cleanCPF, customerPhone,
      metodo: 'card', janela: JANELA_CARTAO,
    });
    orderId = pedido.orderId;

    const lista = await opcoesPara(admin, pedido.total);
    const n = Math.trunc(Number(installments) || 1);
    const escolhida = lista.find((o) => o.parcelas === n);
    if (!escolhida) {
      // Passou do teto, ou a parcela cairia abaixo do mínimo da API. Devolvo as
      // opções válidas para a tela se corrigir sem o cliente digitar tudo de
      // novo — e solto a mesa, porque não houve cobrança nenhuma.
      await desfazerPedidoDeMesa(admin, pedido.orderId, 'parcelamento_invalido');
      return jsonMesa({
        error: 'parcelamento_indisponivel',
        message: `Não é possível parcelar em ${n}x neste valor.`,
        opcoes: lista.map((o) => ({ parcelas: o.parcelas, total: o.total_cents / 100 })),
      }, 400);
    }

    const valorCobrado = escolhida.total_cents / 100;

    // O pedido nasceu com o total sem juros (é o que a RPC de assentos sabe
    // calcular). O que vai ser cobrado é este valor — e `total_amount` precisa
    // ser o valor cobrado, senão a conferência de pagamento compara números
    // diferentes e acusa divergência numa venda correta.
    await admin.from('orders')
      .update({ total_amount: valorCobrado })
      .eq('id', pedido.orderId);

    log('Cobrando mesa', { orderId: pedido.orderId, parcelas: n, valor: valorCobrado, mesas: seats.length });

    const prov = await cobrarCredito({
      amount: valorCobrado,
      parcelas: n,
      description: `${event.title} - Mesa`.slice(0, 120),
      purchaseId: pedido.orderId,
      ...(cartaoId ? { cartaoId } : { card: card as any }),
      customer: { name: customerName, cpf: cleanCPF, email: customerEmail },
    });

    // Guarda o identificador ANTES de decidir aprovado/recusado: a recusa também
    // vem com transactionId, e jogá-lo fora impede reconciliar depois uma recusa
    // duvidosa.
    if (prov?.transactionId) {
      await admin.from('orders')
        .update({
          provider_transaction_id: String(prov.transactionId),
          provider_authorization_code: prov.authorizationCode ?? null,
        })
        .eq('id', pedido.orderId);
    }

    // Recusa chega com HTTP 200: a decisão é pelo campo `aprovado`, sempre.
    if (!prov?.aprovado) {
      log('Recusado — soltando a mesa', { orderId: pedido.orderId, msg: prov?.message });
      await desfazerPedidoDeMesa(admin, pedido.orderId, 'recusado');
      return jsonMesa({
        status: 'rejected',
        errorCode: prov?.error || 'card_declined',
        message: prov?.message || 'Pagamento não aprovado. Tente outro cartão.',
        orderId: pedido.orderId,
      });
    }

    // Grava o que o sistema jogava fora: valor de face, parcelas e provedor. Em
    // mesa não há lote — o `lotId` é nulo de propósito, e o nome guarda quantas
    // mesas foram nesta venda.
    await captureSaleTerms(admin, pedido.orderId,
      [{
        lotId: null,
        lotName: `Mesa (${seats.length})`,
        unitFace: pedido.subtotal,
        quantity: 1,
        modoTaxa: 'repassa',
      }],
      { installments: n, brandRaw: null, provider: 'marcel', method: 'card' });

    const resultado = await applyOrderApproved(admin, {
      orderId: pedido.orderId,
      mpPaymentId: String(prov.transactionId ?? pedido.orderId),
      source: 'marcel-charge-seat-card',
    });

    if (resultado.mismatch) {
      // Pagou e a RPC recusa promover. Levanta a bandeira vermelha do painel do
      // produtor — sem isso o caso morre numa auditoria que ninguém lê, e o
      // cliente descobre na porta do evento que a mesa dele não existe.
      await admin.rpc('flag_order_paid_no_delivery', {
        _order_id: pedido.orderId,
        _mp_payment_id: String(prov.transactionId ?? pedido.orderId),
        _transaction_amount: valorCobrado,
        _order_status: 'pending',
      }).then(
        () => log('Sinalizado pago-sem-entrega no painel', { orderId: pedido.orderId }),
        (e: unknown) => log('Falha ao sinalizar (não fatal)', { msg: String(e) }),
      );
      return jsonMesa({ status: 'paid_pending_review', orderId: pedido.orderId }, 409);
    }

    log('Mesa aprovada', { orderId: pedido.orderId, autorizacao: prov.authorizationCode });

    return jsonMesa({
      // A tela de mesa já entende este estado (é o que a rota do Mercado Pago
      // devolve quando aprova). Aqui a promoção JÁ aconteceu, então ela vai
      // encontrar o pedido pago na primeira conferência.
      status: 'approved_pending_confirmation',
      orderId: pedido.orderId,
      paymentId: prov.transactionId ?? null,
      amount: valorCobrado,
      installments: n,
      holdExpiresAt: pedido.holdExpiresAt,
    });

  } catch (e) {
    if (e instanceof MesaInvalida) {
      if (e.code === 'unauthorized') return jsonMesa({ error: 'Unauthorized' }, 401);
      if (e.code === 'invalid_cpf') return jsonMesa({ error: 'invalid_cpf', message: e.message }, 400);
      if (e.status === 422) {
        return jsonMesa({ error: 'payment_failed', message: 'Não foi possível processar. Tente novamente.' }, 422);
      }
      return jsonMesa({ error: e.code }, e.status);
    }

    if (e instanceof MarcelIndisponivel) {
      // ⚠️ NÃO solta a mesa. "Não consegui falar com o provedor" não é "não
      // houve cobrança" — a doc é explícita que timeout pode ter passado.
      log('Provedor inacessível — mesa mantida presa', { orderId, msg: e.message });
      return jsonMesa({ error: 'payment_provider_unreachable', orderId }, 502);
    }

    log('Erro', { msg: e instanceof Error ? e.message : String(e) });
    return jsonMesa({ error: 'payment_provider_unreachable', orderId }, 502);
  }
});
