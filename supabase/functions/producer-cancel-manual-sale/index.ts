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
    const reason = (body.reason ?? "").toString().trim();
    if (reason.length < 5)
      return json({ ok: false, error: "Motivo obrigatório (mín 5 caracteres)", code: "reason_required" }, 200);
    if (reason.length > 500)
      return json({ ok: false, error: "Motivo muito longo (máx 500)", code: "reason_too_long" }, 200);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data, error } = await admin.rpc("cancel_manual_order", {
      _order_id: body.order_id,
      _actor: userId,
      _reason: reason,
    });

    if (error) {
      const msg = error.message ?? String(error);
      // Map known RAISE EXCEPTIONs
      const knownCodes = [
        "forbidden",
        "not_manual",
        "ticket_already_used",
        "order_not_found",
        "reason_required",
      ];
      const code = knownCodes.find((c) => msg.includes(c)) ?? "cancel_failed";
      if (msg.includes("invalid_status")) {
        return json({ ok: false, error: msg, code: "invalid_status" }, 200);
      }
      const status = code === "forbidden" ? 403 : 200;
      return json({ ok: false, error: msg, code }, status);
    }

    return json({ ok: true, ...((data as Record<string, unknown>) ?? {}) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: msg, code: "internal_error" }, 500);
  }
});
