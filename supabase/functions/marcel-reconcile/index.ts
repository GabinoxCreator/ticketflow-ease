// marcel-reconcile — varre pedidos em dúvida e confirma os que foram pagos.
//
// POR QUE ISTO É OBRIGATÓRIO, E NÃO UM EXTRA
//   A API do Marcel não tem webhook. A confirmação depende de ALGUÉM consultar.
//   Enquanto o cliente está com o QR na tela, quem consulta é o navegador dele.
//   Mas o caso comum é justamente o outro: ele paga pelo app do banco, fecha a
//   aba e vai dormir. Ninguém mais pergunta — e o pedido pago fica pendente para
//   sempre, com o dinheiro na conta e o ingresso não emitido.
//
//   No Mercado Pago esse buraco não existia porque o webhook empurrava a
//   confirmação. Aqui, esta função É o webhook.
//
// O QUE ELA VARRE
//   Pedidos com transação registrada no provedor que ainda não viraram pagos —
//   incluindo os já EXPIRADOS no nosso lado. Esse é o caso mais perigoso:
//   expirou aqui, mas o cliente pagou lá.
//
// SÓ COMPRA DO SITE, E NENHUM PEDIDO INVISÍVEL (OS-245, 21/10/2026)
//   Em 15/10 os testes de R$ 1,12 da maquininha lotaram 39 dos 40 lugares do
//   lote (que pegava os MAIS ANTIGOS) e a compra real de uma cliente ficou de
//   fora. Agora entra só `sale_origin = 'online'`: maquininha e totem
//   (`smartpos`) cobram no SiTef, manual e cortesia nascem pagos; nenhum deles
//   passa pelo Marcel. E quem cabe no lote sai de `fila.ts`: pendente primeiro,
//   o resto em rodízio, para nenhum pedido ficar de fora se a fila crescer.
//
// Chamada por cron. verify_jwt=false + segredo próprio no header, como o
// facial-resync: é rotina de servidor, não rota de usuário.
//
// ⚠️ O vigia do relógio (`relogio_do_pix_saude`, no banco) lê `ok`,
// `verificados` e `indefinidos` desta resposta para saber se a rotina e o
// Marcel estão vivos. Não mudar o sentido desses três campos.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { applyOrderApproved } from "../_shared/applyOrderApproved.ts";
import { consultarPix, reconciliar, PAGO, MarcelIndisponivel } from "../_shared/marcel.ts";
import { montarLote, rodadaDoMinuto } from "./fila.ts";
import { conferirIdSoDestePedido, recusarPromocao } from "../_shared/conferePagamento.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

// Janela: 48h cobre com folga o PIX (expira em 1h) e o cartão em dúvida por
// queda de rede. Mais que isso vira varredura de arquivo morto.
const JANELA_HORAS = 48;
// Quantos pedidos se pergunta ao Marcel por rodada (uma rodada por minuto).
const LOTE_MAX = 40;
// Quantos pedidos em dúvida se lê do banco para montar o lote. O pior caso
// real (120 dias até 21/10) foi 27 compras do site em dúvida numa janela de 48h.
const FILA_MAX = 1000;

const log = (step: string, d?: unknown) =>
  console.log(`[MARCEL-RECONCILE] ${step}${d ? ` - ${JSON.stringify(d)}` : ''}`);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Autentica por segredo próprio: sem ele, recusa tudo. Nunca fica aberta.
  const esperado = Deno.env.get('MARCEL_RECONCILE_KEY');
  if (!esperado) {
    log('MARCEL_RECONCILE_KEY ausente — recusando por segurança');
    return json({ error: 'nao_configurada' }, 503);
  }
  if (req.headers.get('x-api-key') !== esperado) {
    return json({ error: 'nao_autorizado' }, 401);
  }

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const desde = new Date(Date.now() - JANELA_HORAS * 3600_000).toISOString();

    // Inclui 'expired' de propósito: expirar aqui não impede o cliente de ter
    // pago lá. É o caso que mais dói — dinheiro entrou, ingresso não saiu.
    // Só pedidos de eventos que estão NA ROTA DO MARCEL — varrer os do Mercado
    // Pago aqui seria perguntar do produto errado ao fornecedor errado.
    const { data: eventosMarcel } = await admin
      .from('events').select('id').eq('payment_provider', 'marcel');
    const idsMarcel = (eventosMarcel || []).map((e: any) => e.id);
    if (idsMarcel.length === 0) {
      return json({
        ok: true, verificados: 0, pagos: 0, promovidos: 0, indefinidos: 0, falhas: 0,
        na_fila: 0, pendentes: 0, fora_desta_rodada: 0, confirmados: [],
      });
    }

    // ⚠️ ANTES daqui havia um `.not('provider_transaction_id','is',null)`, e ele
    // cegava a varredura justamente no caso mais grave: pedido cuja cobrança foi
    // criada mas cujo id não chegou a ser gravado (queda entre a resposta da API
    // e o UPDATE). O cliente TEM o código na mão e paga; o pedido fica invisível
    // para sempre. É para isso que existe o `/reconcile` por purchaseId — que é o
    // próprio id do pedido — e o `else` lá embaixo já sabia usá-lo, mas nunca era
    // alcançado. Corrigido em 18/08.
    //
    // `sale_origin = 'online'` (OS-245): só a compra do site é cobrada pelo
    // Marcel. Venda da maquininha e do totem, manual e cortesia nunca passaram
    // por ele, e perguntar por elas só ocupava lugar no lote.
    const { data: pedidos, error } = await admin
      .from('orders')
      .select('id, status, provider_transaction_id, payment_method, total_amount, created_at')
      .eq('sale_origin', 'online')
      .in('status', ['pending', 'expired', 'failed'])
      .in('event_id', idsMarcel)
      .gte('created_at', desde)
      // Mais novos primeiro só para a leitura: se um dia a fila passar do teto,
      // quem fica de fora é o mais antigo, nunca a compra de agora. A ordem de
      // conferência quem decide é a `fila.ts`.
      .order('created_at', { ascending: false })
      .limit(FILA_MAX);

    if (error) throw error;
    if ((pedidos?.length ?? 0) >= FILA_MAX) {
      log('Fila no teto de leitura: os pedidos em dúvida mais antigos ficaram fora desta rodada', { teto: FILA_MAX });
    }

    const fila = montarLote(pedidos ?? [], LOTE_MAX, rodadaDoMinuto());

    const resumo = {
      verificados: 0, pagos: 0, promovidos: 0, indefinidos: 0, falhas: 0,
      na_fila: fila.naFila, pendentes: fila.pendentes, fora_desta_rodada: fila.foraDestaRodada,
    };
    const confirmados: string[] = [];

    for (const p of fila.lote) {
      resumo.verificados++;
      try {
        // `/checkpix` é a consulta do PIX. Perguntar por ela o destino de uma
        // cobrança de CARTÃO é perguntar do produto errado — e agora entram
        // pedidos de mesa, que também podem ser no crédito. Para qualquer coisa
        // que não seja PIX (ou quando falta o id da transação), o caminho é o
        // `/reconcile` pelo purchaseId, que é o próprio id do pedido.
        const ehPix = p.payment_method === 'pix';
        const resp = (ehPix && p.provider_transaction_id)
          ? await consultarPix(p.provider_transaction_id)
          : await reconciliar(p.id);

        if (String(resp?.status ?? '') !== PAGO) continue;

        resumo.pagos++;
        log('Pago e não confirmado', { orderId: p.id, situacao: p.status, valor: p.total_amount });

        // OS-265: quando a pergunta foi pelo id gravado no pedido (PIX), esse id
        // não pode estar em OUTRO pedido: um pagamento libera um pedido só. O
        // Marcel não devolve de quem é o pagamento nem o valor. Pela consulta por
        // purchaseId (o id do pedido) o próprio Marcel já amarrou o pedido.
        if (ehPix && p.provider_transaction_id) {
          const conferencia = await conferirIdSoDestePedido(admin, p.id, String(p.provider_transaction_id));
          if (!conferencia.ok) {
            if (conferencia.motivo === 'conferencia_indisponivel') {
              // Não deu para conferir: tenta na próxima rodada.
              resumo.indefinidos++;
            } else {
              // Análise humana (bandeira + aviso), uma vez só por pedido.
              await recusarPromocao(admin, {
                orderId: p.id, situacao: p.status, valor: p.total_amount,
                source: 'marcel-reconcile', paymentId: String(p.provider_transaction_id),
                recusa: conferencia, bandeira: true,
              });
              resumo.falhas++;
              log('Promoção recusada: id de pagamento também está em outro pedido', { orderId: p.id, ...conferencia.detalhe });
            }
            continue;
          }
        }

        const r = await applyOrderApproved(admin, {
          orderId: p.id,
          mpPaymentId: String(p.provider_transaction_id ?? p.id),
          source: 'marcel-reconcile',
        });

        if (r.mismatch) {
          // O CLIENTE PAGOU E O PEDIDO ESTÁ ENCERRADO. A RPC se recusa a promover
          // pedido terminal (é a regra certa: ressuscitar venda encerrada seria
          // pior), então ela só audita — e auditoria ninguém lê.
          //
          // Levanto a MESMA bandeira que o webhook do Mercado Pago levanta: com
          // ela o caso aparece em vermelho no painel do produtor, com o valor,
          // para alguém devolver o dinheiro ou entregar o ingresso. Sem isto o
          // caso morre no log e o cliente descobre na porta do evento.
          await admin.rpc('flag_order_paid_no_delivery', {
            _order_id: p.id,
            _mp_payment_id: String(p.provider_transaction_id ?? p.id),
            _transaction_amount: p.total_amount,
            _order_status: p.status,
          }).then(
            () => log('Sinalizado pago-sem-entrega no painel', { orderId: p.id }),
            (e: unknown) => log('Falha ao sinalizar (não fatal)', { orderId: p.id, msg: String(e) }),
          );
          resumo.falhas++;
          log('Promoção recusada — precisa de olho humano', { orderId: p.id, situacao: p.status });
          continue;
        }

        resumo.promovidos++;
        confirmados.push(p.id);
      } catch (e) {
        // Uma falha não pode interromper a varredura: o próximo pedido pode ser
        // exatamente o que está esperando confirmação.
        resumo.indefinidos++;
        log('Falha ao verificar', { orderId: p.id, msg: e instanceof Error ? e.message : String(e) });
      }
    }

    log('Varredura concluída', resumo);
    return json({ ok: true, ...resumo, confirmados });

  } catch (e) {
    if (e instanceof MarcelIndisponivel) return json({ error: 'pagamento_indisponivel' }, 503);
    log('Erro', { msg: e instanceof Error ? e.message : String(e) });
    return json({ error: 'erro_interno' }, 500);
  }
});
