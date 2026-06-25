import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// Telemetria best-effort de cliques no evento beneficente (Confra do Bem).
// Recebe { event_slug, button }, valida button no enum e insere com service-role.
// SEMPRE responde 200: telemetria nunca pode virar erro visível pro usuário.
// verify_jwt = false (config.toml) — chamado fire-and-forget pelo front, sem sessão.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_BUTTONS = new Set(["doar", "copiar_pix"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const eventSlug =
      typeof body?.event_slug === "string" ? body.event_slug.trim() : "";
    const button = typeof body?.button === "string" ? body.button.trim() : "";

    if (eventSlug && VALID_BUTTONS.has(button)) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      const { error } = await supabase
        .from("donation_click_events")
        .insert({ event_slug: eventSlug, button });
      if (error) {
        console.error("[track-donation-click] insert error", error);
      }
    } else {
      console.warn("[track-donation-click] ignored invalid payload", {
        eventSlug,
        button,
      });
    }
  } catch (err) {
    console.error("[track-donation-click] error", err);
  }

  // best-effort: 200 sempre, independente do resultado
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
