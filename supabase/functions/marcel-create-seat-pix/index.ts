// marcel-create-seat-pix — cobrança PIX de MESA/CAMAROTE pela API do Marcel.
//
// Gêmea da `create-seat-pix` (Mercado Pago). O que muda é o provedor; o que NÃO
// muda é a disciplina dos assentos: quem decide preço e quem prende a mesa é a
// RPC `create_seat_order`, a mesma das duas rotas.
//
// ⚠️ ESTA FUNÇÃO NÃO APROVA NADA. Ela cria a cobrança e devolve o código.
// `aprovado:true` na resposta do /pix significa "cobrança criada", não "paga" —
// é a armadilha nº 1 da documentação. Quem libera a mesa é a `marcel-check-pix`,
// e só com status "3".
//
// DIFERENÇA DE FUNDO EM RELAÇÃO AO MERCADO PAGO: lá o provedor avisa quando o
// cliente paga. Aqui ninguém avisa — nós perguntamos. Enquanto a tela está
// aberta quem pergunta é ela; quem fecha tudo é pego pela varredura de minuto.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { criarPix, telefoneParaMarcel, MarcelIndisponivel } from "../_shared/marcel.ts";
import { validarNomePessoa, normalizarNomePessoa } from "../_shared/nomePessoa.ts";
import {
  corsMesa, jsonMesa, adminClient, exigirUsuario, exigirCpfValido, eventoPublicado,
  abrirPedidoDeMesa, desfazerPedidoDeMesa, vencimentoDaReserva, MesaInvalida,
  type AssentoPedido,
} from "../_shared/mesaMarcel.ts";

// A reserva do PIX segura a mesa por 15 min — mesma janela da rota do Mercado
// Pago. Mesa parada é mesa que ninguém mais consegue comprar, e camarote é item
// escasso: 100 no rodeio inteiro.
const JANELA_PIX = '00:15:00';

const log = (step: string, d?: unknown) =>
  console.log(`[MARCEL-SEAT-PIX] ${step}${d ? ` - ${JSON.stringify(d)}` : ''}`);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsMesa });

  const admin = adminClient();
  let orderId: string | null = null;

  try {
    const userId = await exigirUsuario(req);
    const body = await req.json();
    const { eventId, holdToken, seats, customerName, customerEmail, customerPhone } = body as {
      eventId: string; holdToken: string; seats: AssentoPedido[];
      customerName: string; customerEmail: string; customerPhone?: string;
    };

    if (!eventId || !holdToken || !Array.isArray(seats) || seats.length === 0) {
      return jsonMesa({ error: 'invalid_request' }, 400);
    }
    // O checkout de mesa manda `customerCPF` maiúsculo; aceito as duas grafias
    // porque um campo com nome ligeiramente diferente vira CPF vazio em
    // silêncio, e a venda morre num "CPF inválido" que ninguém entende.
    const cleanCPF = exigirCpfValido(body.customerCPF ?? body.customerCpf);

    // Nome de gente, não CPF digitado no campo errado (caso real de 19/08).
    // ⚠️ Estas duas edges de camarote ficaram de fora quando a trava subiu em
    // 20/08 — eu protegi as equivalentes do Mercado Pago por engano, e são
    // ESTAS que o rodeio usa.
    const erroNome = validarNomePessoa(customerName);
    if (erroNome) return jsonMesa({ error: 'invalid_name', message: erroNome }, 400);
    const nomeLimpo = normalizarNomePessoa(customerName);

    const event = await eventoPublicado(admin, eventId);

    const pedido = await abrirPedidoDeMesa(admin, {
      eventId, userId, holdToken, seats,
      customerName: nomeLimpo, customerEmail, customerCpf: cleanCPF, customerPhone,
      metodo: 'pix', janela: JANELA_PIX,
    });
    orderId = pedido.orderId;
    log('Pedido de mesa criado', { orderId, total: pedido.total, mesas: seats.length });

    const prov = await criarPix({
      amount: pedido.total,
      description: `${event.title} - Mesa`.slice(0, 120),
      // purchaseId = id do pedido. É por ele que a varredura acha esta venda se
      // a rede cair no meio — sem isso, mesa em dúvida fica em dúvida para sempre.
      purchaseId: pedido.orderId,
      customer: {
        name: nomeLimpo, cpf: cleanCPF, email: customerEmail,
        // Sem o código do país: com 13 dígitos a API RECUSA a cobrança.
        phone: telefoneParaMarcel(customerPhone),
      },
    });

    if (!prov?.transactionId || !prov?.pixCode) {
      // Veredito explícito: não há cobrança. Pode soltar a mesa.
      log('Marcel não devolveu cobrança', { erro: prov?.error, msg: prov?.message });
      await desfazerPedidoDeMesa(admin, pedido.orderId, 'sem_cobranca');
      return jsonMesa({ error: 'payment_failed', message: 'Não foi possível gerar o PIX. Tente novamente.' }, 502);
    }

    const { error: updErr } = await admin.from('orders')
      .update({
        provider_transaction_id: String(prov.transactionId),
        // Guardar o código é o que faz o QR sobreviver à troca de aparelho:
        // quem reserva no computador e abre o link no celular continua vendo a
        // mesma cobrança, em vez de perder uma mesa já presa em seu nome.
        provider_pix_code: prov.pixCode,
      })
      .eq('id', pedido.orderId);
    if (updErr) {
      log('FALHA AO GRAVAR O ID DA TRANSAÇÃO — venda depende do purchaseId', {
        orderId: pedido.orderId, erro: updErr.message,
      });
    }

    log('PIX de mesa criado', { orderId: pedido.orderId, transactionId: prov.transactionId });

    return jsonMesa({
      success: true,
      orderId: pedido.orderId,
      pixCode: prov.pixCode,
      // Sem `qrCodeBase64`: o Marcel devolve imagem por URL, e a tela já monta o
      // QR a partir do código copia-e-cola. Uma imagem a menos para carregar.
      qrCodeBase64: '',
      // NÃO devolvo "aprovado": a tela não pode nem cogitar liberar aqui.
      expiresAt: pedido.holdExpiresAt,
      holdExpiresAt: pedido.holdExpiresAt,
      amount: pedido.total,
      serviceFeeAmount: pedido.taxaAdministrativa,
    });

  } catch (e) {
    if (e instanceof MesaInvalida) {
      // Reserva vencida ou mesa tomada: o pedido nem chegou a existir, então não
      // há o que desfazer. A tela devolve o cliente ao mapa.
      if (e.code === 'unauthorized') return jsonMesa({ error: 'Unauthorized' }, 401);
      if (e.code === 'invalid_cpf') return jsonMesa({ error: 'invalid_cpf', message: e.message }, 400);
      if (e.status === 422) {
        return jsonMesa({ error: 'payment_failed', message: 'Não foi possível processar. Tente novamente.' }, 422);
      }
      return jsonMesa({ error: e.code }, e.status);
    }

    if (e instanceof MarcelIndisponivel) {
      // ⚠️ NÃO solta a mesa: "não consegui falar com o provedor" não é o mesmo
      // que "não houve cobrança". Se ela passou, soltar aqui colocaria à venda
      // uma mesa já paga. A varredura resolve com o purchaseId.
      log('Provedor inacessível — mesa mantida presa', { orderId, msg: e.message });
      return jsonMesa({ error: 'payment_provider_unreachable', orderId }, 502);
    }

    log('Erro', { msg: e instanceof Error ? e.message : String(e) });
    return jsonMesa({ error: 'payment_provider_unreachable', orderId }, 502);
  }
});
