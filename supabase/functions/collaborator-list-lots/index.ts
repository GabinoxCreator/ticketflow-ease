// redeploy list-lots taxa — expõe event_fees + Deno.serve
// Usa Deno.serve built-in (import de std/http removido p/ evitar timeout do bundler
// no host deno.land, que estava travando deploys — mesmo motivo do reserve/confirm).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateCollaboratorSession, sessionErrorResponse } from "../_shared/collaboratorSession.ts";
import { resolveFee } from "../_shared/eventFee.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { collaborator_id, session_token, event_id } = await req.json();

    if (!collaborator_id || !event_id) {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios ausentes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1) Sessão (mesmo helper das outras edges de colaborador)
    const sv = await validateCollaboratorSession(supabase, collaborator_id, session_token);
    if (!sv.valid) return sessionErrorResponse(sv, corsHeaders);

    // 2) TRAVA DE AUTORIZAÇÃO: o colaborador precisa estar vinculado a este evento.
    //    Sem vínculo -> 403 (não 401). Nunca devolve lotes de evento alheio.
    const { data: access } = await supabase
      .from('collaborator_events')
      .select('id')
      .eq('collaborator_id', collaborator_id)
      .eq('event_id', event_id)
      .maybeSingle();

    if (!access) {
      return new Response(JSON.stringify({ error: 'Sem acesso a este evento' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3) Lotes do evento — só ativos e não esgotados manualmente (filtro no DB), ordenados por name.
    const { data: lots, error } = await supabase
      .from('event_lots')
      .select('id, name, price, original_price, total_quantity, sold_quantity, reserved_quantity, is_active, manually_sold_out, start_date, end_date')
      .eq('event_id', event_id)
      .eq('is_active', true)
      .eq('manually_sold_out', false)
      .order('name', { ascending: true });

    if (error) {
      console.error('[LIST-LOTS] query error:', error);
      return new Response(JSON.stringify({ error: 'Erro ao listar lotes' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 4) Regra "à venda no momento" — IDÊNTICA ao ColaboradorVenderModal / door-sale:
    //    available = total - sold - reserved (clamp >= 0). Sem filtro de data.
    const formatted = (lots || [])
      .map((l: any) => {
        const available = Math.max(
          0,
          (l.total_quantity ?? 0) - (l.sold_quantity ?? 0) - (l.reserved_quantity ?? 0)
        );
        return {
          id: l.id,
          name: l.name,
          price: l.price,
          original_price: l.original_price,
          total_quantity: l.total_quantity,
          sold_quantity: l.sold_quantity,
          reserved_quantity: l.reserved_quantity,
          is_active: l.is_active,
          manually_sold_out: l.manually_sold_out,
          start_date: l.start_date,
          end_date: l.end_date,
          available,
        };
      })
      .filter((l: any) => l.available > 0);

    // 5) Taxa administrativa do evento (repasse), pros dois métodos — MESMA fonte
    //    (event_fee_overrides) do reserve e das edges online (fallback 10%). Aditivo:
    //    o totem usa pra mostrar o valor por card ANTES do clique. Não quebra o shape.
    const [pixFee, cardFee] = await Promise.all([
      resolveFee(supabase, event_id, 'pix'),
      resolveFee(supabase, event_id, 'card'),
    ]);
    const event_fees = {
      pix_percent: pixFee.percent,
      pix_fixed: pixFee.fixed,
      card_percent: cardFee.percent,
      card_fixed: cardFee.fixed,
    };

    return new Response(JSON.stringify({ lots: formatted, event_fees }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[LIST-LOTS] error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
