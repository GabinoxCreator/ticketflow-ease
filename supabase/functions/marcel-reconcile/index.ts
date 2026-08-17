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
// Chamada por cron. verify_jwt=false + segredo próprio no header, como o
// facial-resync: é rotina de servidor, não rota de usuário.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { applyOrderApproved } from "../_shared/applyOrderApproved.ts";
import { consultarPix, reconciliar, PAGO, MarcelIndisponivel } from "../_shared/marcel.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

// Janela: 48h cobre com folga o PIX (expira em 1h) e o cartão em dúvida por
// queda de rede. Mais que isso vira varredura de arquivo morto.
const JANELA_HORAS = 48;
const LOTE_MAX = 40;

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
    const { data: pedidos, error } = await admin
      .from('orders')
      .select('id, status, provider_transaction_id, payment_method, total_amount, created_at')
      .in('status', ['pending', 'expired'])
      .not('provider_transaction_id', 'is', null)
      .gte('created_at', desde)
      .order('created_at', { ascending: true })
      .limit(LOTE_MAX);

    if (error) throw error;

    const resumo = { verificados: 0, pagos: 0, promovidos: 0, indefinidos: 0, falhas: 0 };
    const confirmados: string[] = [];

    for (const p of pedidos ?? []) {
      resumo.verificados++;
      try {
        const resp = p.provider_transaction_id
          ? await consultarPix(p.provider_transaction_id)
          : await reconciliar(p.id);

        if (String(resp?.status ?? '') !== PAGO) continue;

        resumo.pagos++;
        log('Pago e não confirmado', { orderId: p.id, situacao: p.status, valor: p.total_amount });

        const r = await applyOrderApproved(admin, {
          orderId: p.id,
          mpPaymentId: String(p.provider_transaction_id ?? p.id),
          source: 'marcel-reconcile',
        });

        if (r.mismatch) {
          // Pedido pago que a RPC recusa promover é caso para humano: pode ser
          // pedido sem tickets ou cancelado. Fica auditado por ela.
          resumo.falhas++;
          log('Promoção recusada — precisa de olho humano', { orderId: p.id });
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
