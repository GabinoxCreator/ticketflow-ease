// producer-cancel-paid-order
// Redeploy forced: 2026-07-23
// Cancelamento MANUAL de pedido PAGO (online) pelo produtor, a partir do painel.
// NUNCA dispara estorno/reembolso — não fala com o Mercado Pago, não movimenta
// dinheiro. Só ajusta o sistema (status + estoque + tickets) via cancel_paid_order.
// O reembolso é feito manualmente, fora da plataforma.
//
// A RPC cancel_paid_order é service_role-only e NÃO checa dono — então o guard de
// ownership (event.producer_id === userId) vive AQUI, espelhando o padrão do
// producer-cancel-manual-sale. O gancho automático do webhook (chargeback/refund)
// NÃO é isto — continua comentado, é pós-evento.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);
    const token = authHeader.slice(7);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claims?.claims?.sub) return json({ ok: false, error: "unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => null) as
      | { order_id?: string; reason?: string }
      | null;
    if (!body?.order_id || typeof body.order_id !== "string")
      return json({ ok: false, error: "order_id_required", code: "order_id_required" }, 200);
    const reason = ((body.reason ?? "").toString().trim()) || "Cancelamento manual pelo produtor (painel)";
    if (reason.length > 500)
      return json({ ok: false, error: "Motivo muito longo (máx 500)", code: "reason_too_long" }, 200);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Ownership: a RPC não checa dono → garantimos aqui (só o dono do evento).
    const { data: order } = await admin
      .from("orders")
      .select("id, event_id")
      .eq("id", body.order_id)
      .maybeSingle();
    if (!order) return json({ ok: false, error: "order_not_found", code: "order_not_found" }, 200);

    const { data: event } = await admin
      .from("events")
      .select("producer_id")
      .eq("id", order.event_id)
      .maybeSingle();
    if (!event || event.producer_id !== userId) {
      return json({ ok: false, error: "forbidden", code: "forbidden" }, 403);
    }

    // Cancelamento manual = status alvo 'cancelled'. A RPC cuida da cascata
    // transacional (estoque por lote, tickets → cancelled, cupom, idempotência).
    const { data, error } = await admin.rpc("cancel_paid_order", {
      _order_id: body.order_id,
      _target_status: "cancelled",
      _reason: reason,
    });

    if (error) {
      const msg = error.message ?? String(error);
      // invalid_status → pedido não está pago (não cancelável por aqui).
      if (msg.includes("invalid_status")) {
        return json({ ok: false, error: msg, code: "invalid_status" }, 200);
      }
      if (msg.includes("order_not_found")) {
        return json({ ok: false, error: msg, code: "order_not_found" }, 200);
      }
      return json({ ok: false, error: msg, code: "cancel_failed" }, 200);
    }

    return json({ ok: true, ...((data as Record<string, unknown>) ?? {}) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: msg, code: "internal_error" }, 500);
  }
});
