// marcel-vigia-estornos — descobre contestação e estorno na rota da SafeToPay.
//
// O BURACO QUE ISTO FECHA (achado em 18/08/2026):
//
// No Mercado Pago, quando o cliente contesta a compra, o provedor AVISA — o
// webhook recebe `charged_back` e o pedido muda de estado. Na API do Marcel
// **não existe webhook**: ninguém nos conta nada, nunca.
//
// E a varredura que já existe (`marcel-reconcile`) só olha pedidos `pending`,
// `expired` e `failed` — ela procura dinheiro que entrou e não foi confirmado.
// **Nenhuma rotina olhava pedido PAGO.** Ou seja: uma venda estornada semanas
// depois seguia como paga para sempre, com o ingresso válido na mão do cliente
// e o dinheiro já devolvido a ele.
//
// O QUE ESTA FUNÇÃO FAZ, E O QUE NÃO FAZ:
//   · pergunta ao provedor o estado das vendas pagas recentes;
//   · status 5 (cancelado) e 6 (estornado) marcam o pedido para ANÁLISE;
//   · avisa a equipe (sino do painel + push no app da FestPag).
//
//   ⚠️ NÃO devolve a vaga para a venda, NÃO cancela ingresso, NÃO mexe em
//   estoque. Decisão do Gabriel em 18/08: contestação vai para análise humana.
//   O motivo é bom — a contestação chega dias depois, muitas vezes com a pessoa
//   JÁ TENDO ENTRADO no evento, e devolver a vaga sozinho colocaria à venda um
//   lugar ocupado. Ver `Cofre-Negocios/FestPag/Decisões.md`.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { consultarPix, reconciliar, MarcelIndisponivel } from "../_shared/marcel.ts";
import { avisarGestao } from "../_shared/avisarGestao.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

// Estados que significam "o dinheiro não está mais conosco".
const CANCELADO = '5';
const ESTORNADO = '6';

// Janela de vigilância. Contestação de cartão pode chegar meses depois, mas
// varrer a base inteira a cada hora seria caro e sem retorno: o que importa é o
// evento que ainda vai acontecer (ainda dá para agir) e a venda recente.
const DIAS_PARA_TRAS = 90;
const LOTE_MAX = 60;

const log = (step: string, d?: unknown) =>
  console.log(`[MARCEL-VIGIA] ${step}${d ? ` - ${JSON.stringify(d)}` : ''}`);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Mesma trava da `marcel-reconcile`: chave própria, porque quem chama é o
    // relógio do banco, não uma pessoa logada.
    const esperada = Deno.env.get('MARCEL_RECONCILE_KEY');
    if (!esperada) return json({ error: 'nao_configurado' }, 503);
    if (!iguais(req.headers.get('x-api-key') ?? '', esperada)) return json({ error: 'nao_autorizado' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: eventosMarcel } = await admin
      .from('events').select('id').eq('payment_provider', 'marcel');
    const idsMarcel = (eventosMarcel || []).map((e: any) => e.id);
    if (idsMarcel.length === 0) return json({ ok: true, verificados: 0, achados: 0 });

    const desde = new Date(Date.now() - DIAS_PARA_TRAS * 86400_000).toISOString();

    const { data: pedidos, error } = await admin
      .from('orders')
      .select('id, status, provider_transaction_id, payment_method, total_amount, customer_name, event_id, review_status')
      .eq('status', 'paid')
      .in('event_id', idsMarcel)
      .gte('created_at', desde)
      // Pedido já marcado para análise não precisa ser reavaliado: alguém já foi
      // avisado, e avisar de novo a cada hora vira ruído que a equipe aprende a
      // ignorar — justamente o que estraga um alarme.
      .is('review_status', null)
      .order('created_at', { ascending: false })
      .limit(LOTE_MAX);

    if (error) throw error;

    const resumo = { verificados: 0, achados: 0, indefinidos: 0 };

    for (const p of pedidos ?? []) {
      resumo.verificados++;
      try {
        const ehPix = p.payment_method === 'pix';
        const resp = (ehPix && p.provider_transaction_id)
          ? await consultarPix(p.provider_transaction_id)
          : await reconciliar(p.id);

        const status = String(resp?.status ?? '');
        if (status !== CANCELADO && status !== ESTORNADO) continue;

        const rotulo = status === ESTORNADO ? 'estorno' : 'cancelamento';
        log('Venda paga que voltou atrás', { orderId: p.id, status, valor: p.total_amount });

        // Marca para análise. NÃO mexe no estoque nem no ingresso — quem decide
        // é gente. A bandeira é a mesma que o painel do produtor já mostra em
        // vermelho, então o caso aparece na tela sem inventar nada novo.
        await admin.from('orders')
          .update({
            review_status: 'paid_no_delivery',
            review_flagged_at: new Date().toISOString(),
            review_reason: {
              motivo: `${rotulo} detectado na SafeToPay`,
              provider_status: status,
              detected_at: new Date().toISOString(),
              order_status: p.status,
            },
          })
          .eq('id', p.id)
          .is('review_status', null);

        const valor = Number(p.total_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        await avisarGestao({
          tipo: 'contestacao',
          titulo: `Contestação de ${valor} — precisa de análise`,
          mensagem: `A venda de ${p.customer_name ?? 'cliente'} (${valor}) foi ${rotulo === 'estorno' ? 'estornada' : 'cancelada'} no provedor. `
            + `O ingresso continua válido e a vaga segue contada como vendida — nada foi desfeito automaticamente, como combinado. `
            + `Pedido ${p.id}.`,
          referencia: p.id,
        });

        resumo.achados++;
      } catch (e) {
        // Provedor fora do ar não pode interromper a varredura: o próximo pedido
        // pode ser o que interessa. Fica para a rodada seguinte.
        resumo.indefinidos++;
        log('Falha ao verificar', { orderId: p.id, msg: e instanceof Error ? e.message : String(e) });
      }
    }

    log('Varredura concluída', resumo);
    return json({ ok: true, ...resumo });

  } catch (e) {
    if (e instanceof MarcelIndisponivel) return json({ error: 'pagamento_indisponivel' }, 503);
    log('Erro', { msg: e instanceof Error ? e.message : String(e) });
    return json({ error: 'erro_interno' }, 500);
  }
});
