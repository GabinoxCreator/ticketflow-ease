// collaborator-redeem-product — retirada de produto da loja do evento, no balcão.
//
// Irmã da collaborator-redeem-abada: marca a ENTREGA sem consumir ingresso
// nenhum, não mexe em tickets e não olha a janela de check-in (a camiseta é
// retirada de tarde, a pessoa entra à noite).
//
// Dois passos, na mesma porta:
//   · sem `confirmar`  → só consulta: devolve o comprador e os itens, para quem
//                        atende conferir antes de entregar. Nada é gravado.
//   · `confirmar: true`→ dá a baixa. Atômica: o UPDATE condicionado a
//                        status='pending' decide; a segunda tentativa recebe
//                        "já retirado", com a hora e o nome de quem entregou.
//
// A chave é o código de retirada (um por pedido), que a pessoa dita ou mostra.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateCollaboratorSession, sessionErrorResponse } from "../_shared/collaboratorSession.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { claim_code, event_id, collaborator_id, session_token, confirmar } = await req.json();

    if (!claim_code || !event_id || !collaborator_id) {
      return json({ error: 'Código de retirada, evento e colaborador são obrigatórios' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1) Sessão do colaborador (token hash server-side)
    const sessionValidation = await validateCollaboratorSession(supabase, collaborator_id, session_token);
    if (!sessionValidation.valid) return sessionErrorResponse(sessionValidation, corsHeaders);

    // 2) Colaborador vinculado ao evento (mesmo check da validate-ticket)
    const { data: access } = await supabase
      .from('collaborator_events')
      .select('id')
      .eq('collaborator_id', collaborator_id)
      .eq('event_id', event_id)
      .maybeSingle();
    if (!access) return json({ error: 'Colaborador não tem acesso a este evento' }, 403);

    // 3) O comprovante, SEMPRE dentro do evento do colaborador: código de outro
    //    evento não pode ser consultado nem baixado daqui.
    const codigo = String(claim_code).trim().toUpperCase();
    const { data: claim, error: claimErr } = await supabase
      .from('product_claims')
      .select('id, order_id, status, picked_up_at, picked_up_by_name')
      .eq('claim_code', codigo)
      .eq('event_id', event_id)
      .maybeSingle();

    // Erro de consulta não é "não encontrado": quem atende precisa saber que é
    // para tentar de novo, não para mandar a pessoa embora.
    if (claimErr) {
      console.error('[REDEEM-PRODUCT] falha ao consultar o comprovante', claimErr.message);
      return json({ error: 'Não foi possível consultar agora. Tente de novo.' }, 503);
    }
    if (!claim) return json({ found: false, error: 'Código de retirada não encontrado' }, 404);

    const [{ data: order }, { data: linhas }] = await Promise.all([
      supabase.from('orders').select('customer_name, status').eq('id', claim.order_id).maybeSingle(),
      supabase.from('order_product_items')
        .select('quantity, label_snapshot')
        .eq('order_id', claim.order_id)
        .eq('stock_state', 'sold'),
    ]);

    const porRotulo = new Map<string, number>();
    for (const l of (linhas ?? []) as Array<{ quantity: number; label_snapshot: string | null }>) {
      const rotulo = l.label_snapshot || 'Produto';
      porRotulo.set(rotulo, (porRotulo.get(rotulo) ?? 0) + Number(l.quantity || 0));
    }
    const itens = [...porRotulo.entries()].map(([rotulo, quantidade]) => ({ rotulo, quantidade }));

    const base = {
      found: true,
      claim_code: codigo,
      holder_name: order?.customer_name ?? null,
      itens,
    };

    if (claim.status === 'cancelled' || order?.status !== 'paid') {
      return json({ ...base, error: 'Este pedido foi cancelado ou reembolsado. Não entregar.', cancelled: true }, 400);
    }

    if (claim.status === 'picked_up') {
      return json({
        ...base,
        already_redeemed: true,
        message: 'Estes produtos já foram retirados.',
        picked_up_at: claim.picked_up_at,
        picked_up_by_name: claim.picked_up_by_name,
      });
    }

    // Só consulta: quem atende confere os itens antes de entregar.
    if (confirmar !== true) return json({ ...base, pending: true });

    // 4) Baixa atômica.
    const { data: colaborador } = await supabase
      .from('collaborators').select('name').eq('id', collaborator_id).maybeSingle();
    const agora = new Date().toISOString();
    const { data: updated } = await supabase
      .from('product_claims')
      .update({
        status: 'picked_up',
        picked_up_at: agora,
        picked_up_by: collaborator_id,
        picked_up_by_name: colaborador?.name ?? 'Colaborador',
      })
      .eq('id', claim.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (!updated) {
      // 0 linhas: outra pessoa deu a baixa no meio do caminho. Resposta de
      // negócio, não erro.
      const { data: fresh } = await supabase
        .from('product_claims').select('picked_up_at, picked_up_by_name').eq('id', claim.id).maybeSingle();
      return json({
        ...base,
        already_redeemed: true,
        message: 'Estes produtos já foram retirados.',
        picked_up_at: fresh?.picked_up_at ?? null,
        picked_up_by_name: fresh?.picked_up_by_name ?? null,
      });
    }

    return json({ ...base, success: true, message: 'Retirada registrada!', picked_up_at: agora });
  } catch (error) {
    console.error('[REDEEM-PRODUCT] error:', error);
    return json({ error: 'Erro interno do servidor' }, 500);
  }
});
