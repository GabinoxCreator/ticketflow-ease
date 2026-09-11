// collaborator-create-courtesy — CORTESIA emitida na maquininha (11/09/2026).
//
// Pedido do Gabriel: um botão de cortesia na POS, "pra gerar uma cortesia mesmo — a
// pessoa não pagou. Como não vendeu, fica sem repasse, mas contabiliza nas cortesias."
//
// NÃO INVENTA NADA: é a mesma dinâmica da `admin-generate-courtesy-tickets`, que já
// roda desde antes — pedido PAGO com total R$ 0 e `sale_origin='courtesy'`, reservando
// o lote como qualquer venda. Total zero é o que a mantém fora do repasse sozinha;
// pedido pago é o que a faz contar nos ingressos emitidos. A única diferença aqui é
// QUEM pede: lá é o admin da plataforma pelo painel, aqui é o colaborador no balcão.
//
// ⚠️ AS DUAS TRAVAS, e onde cada uma mora:
//  1. O botão só existe se `smart_pos_devices.payment_courtesy_enabled` estiver ligado
//     naquela maquininha — e esse campo vive no banco do TOTEM, outro projeto Supabase.
//  2. O app exige o PIN do colaborador (`smartpos-verify-pin`, banco do totem) ANTES
//     de chamar esta porta.
//
// ⚠️ O QUE ISSO SIGNIFICA, dito sem maquiagem: as duas travas moram no aparelho, não
// aqui. Esta edge não tem como conferir o PIN nem o interruptor, porque eles estão num
// banco que ela não enxerga. Quem tiver o login de colaborador e souber chamar a API
// direto consegue emitir cortesia sem PIN. É a MESMA exposição que a venda em dinheiro
// já tem hoje (marcar "dinheiro" por fora também não passa por PIN) — não estamos
// piorando nada, mas está escrito para ninguém achar que está protegido e não está.
// Fechar isso de verdade exige a porta do aparelho (`x-activation-token`) chegando até
// o site, que é trabalho do plano de ativação de aparelhos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateCollaboratorSession, sessionErrorResponse } from "../_shared/collaboratorSession.ts";
import { unformatCPF, validateCPF } from "../_shared/cpf.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const BALCAO_EMAIL = 'balcao@smartpos.local';
const MAX_CORTESIAS = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const {
      collaborator_id, session_token, event_id, lot_id, quantity,
      customer_name, customer_email, customer_phone, cpf, note,
    } = await req.json();

    if (!collaborator_id || !event_id || !lot_id) {
      return json({ error: 'Parâmetros obrigatórios ausentes' }, 400);
    }

    const qty = Number(quantity ?? 1);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_CORTESIAS) {
      // Teto de sanidade: cortesia é exceção. Pedido de 500 é engano ou abuso, e
      // comeria o lote inteiro antes de alguém perceber.
      return json({ error: `Quantidade inválida (1 a ${MAX_CORTESIAS})` }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // 1) Sessão do colaborador
    const sv = await validateCollaboratorSession(supabase, collaborator_id, session_token);
    if (!sv.ok) return sessionErrorResponse(sv, corsHeaders);

    // 2) TRAVA DE AUTORIZAÇÃO: o colaborador precisa estar vinculado a este evento.
    //    Mesma regra do reserve e do list-lots — nunca emitir em evento alheio.
    const { data: vinculo } = await supabase
      .from('collaborator_events')
      .select('id')
      .eq('collaborator_id', collaborator_id)
      .eq('event_id', event_id)
      .maybeSingle();
    if (!vinculo) return json({ error: 'Sem acesso a este evento' }, 403);

    // 3) Lote (nome para o papel, e a conferência de que é do evento certo)
    const { data: lot, error: lotErr } = await supabase
      .from('event_lots')
      .select('id, name, event_id, is_active')
      .eq('id', lot_id)
      .eq('event_id', event_id)
      .maybeSingle();
    if (lotErr || !lot) return json({ error: 'Lote não encontrado neste evento' }, 404);
    if (!lot.is_active) return json({ error: 'Lote inativo' }, 400);

    const { data: evento } = await supabase
      .from('events').select('title').eq('id', event_id).maybeSingle();

    const nome = (typeof customer_name === 'string' && customer_name.trim())
      ? customer_name.trim() : 'Cortesia';
    const email = (typeof customer_email === 'string' && customer_email.trim())
      ? customer_email.trim().toLowerCase() : BALCAO_EMAIL;
    const fone = String(customer_phone ?? '').replace(/\D/g, '') || null;
    const normCpf = unformatCPF(cpf);
    const cpfOk = normCpf && validateCPF(normCpf) ? normCpf : null;

    // 4) Reserva de estoque — cortesia consome lote como qualquer venda. Se não
    //    reservar, NÃO emite: cortesia não pode furar a lotação da casa.
    const { data: reserveOk, error: rErr } = await supabase.rpc('reserve_lot_quantity', {
      _lot_id: lot_id, _qty: qty,
    });
    if (rErr || !reserveOk) return json({ error: 'Sem ingressos disponíveis neste lote' }, 409);

    let orderId: string | null = null;
    try {
      // 5) Pedido de cortesia: total ZERO é o que o mantém fora do repasse.
      const { data: order, error: oErr } = await supabase
        .from('orders')
        .insert({
          event_id,
          user_id: null,
          customer_name: nome,
          customer_email: email,
          customer_phone: fone,
          customer_cpf: cpfOk,
          total_amount: 0,
          service_fee_amount: 0,
          discount_amount: 0,
          payment_method: 'courtesy',
          status: 'pending',
          sale_origin: 'courtesy',
          // QUEM emitiu. É isto que responde "quantas cortesias saíram da POS 03" —
          // vem da sessão validada, nunca do corpo.
          collaborator_id,
          manual_payment_note: (typeof note === 'string' && note.trim())
            ? note.trim() : 'Cortesia emitida no equipamento',
          manual_fee_applied: false,
        })
        .select('id')
        .single();
      if (oErr || !order) throw new Error('order_insert_failed:' + (oErr?.message ?? 'no_row'));
      orderId = order.id;

      // 6) Ingressos
      const rows = Array.from({ length: qty }, () => ({
        order_id: order.id,
        event_id,
        lot_id,
        holder_name: nome,
        holder_email: email,
        holder_phone: fone,
        user_id: null,
        status: 'pending',
      }));
      const { error: tErr } = await supabase.from('tickets').insert(rows);
      if (tErr) throw new Error('tickets_insert_failed:' + tErr.message);

      // 7) Promove pending → paid: confirma o estoque e valida os ingressos. A MESMA
      //    função que a cortesia do admin usa — não existe caminho paralelo.
      const { error: aErr } = await supabase.rpc('apply_order_approved', {
        _order_id: order.id, _mp_payment_id: null,
      });
      if (aErr) throw new Error('apply_order_approved_failed:' + aErr.message);

      const { data: criados } = await supabase
        .from('tickets')
        .select('ticket_code')
        .eq('order_id', order.id)
        .order('created_at', { ascending: true });

      // Mesmo formato do collaborator-confirm-payment: o app reusa a impressão.
      return json({
        ok: true,
        order_id: order.id,
        status: 'paid',
        tickets: (criados ?? []).map((t: any) => ({
          ticket_code: t.ticket_code,
          qr_payload: t.ticket_code,
          event_name: evento?.title ?? null,
          lot_name: lot.name,
        })),
      });
    } catch (err) {
      // Devolve o estoque se quebrou no meio — senão a casa perde lugar sem ter
      // emitido nada. O pedido, se chegou a nascer, NÃO é apagado: fica para
      // auditoria (pedido nunca se apaga).
      await supabase.rpc('release_lot_quantity', { _lot_id: lot_id, _qty: qty }).catch(() => {});
      console.error('[courtesy] falhou', { orderId, err: String(err) });
      return json({ error: 'Não foi possível emitir a cortesia' }, 500);
    }
  } catch (e) {
    console.error('[courtesy] erro', e);
    return json({ error: 'Erro interno' }, 500);
  }
});
