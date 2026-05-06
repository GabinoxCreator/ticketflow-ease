import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { hashSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SET-PRODUCER-PIN] ${step}${detailsStr}`);
};

// Legacy SHA-256 hash (only used to verify legacy current_pin during forced reset path)
async function legacyHashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);

    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    const { pin, current_pin } = await req.json();

    if (!pin || !/^\d{4}$/.test(pin)) {
      throw new Error("PIN must be exactly 4 digits");
    }

    const { data: accountData } = await supabaseClient
      .from("producer_stripe_accounts")
      .select("pin_hash")
      .eq("user_id", user.id)
      .maybeSingle();

    const existingHash = accountData?.pin_hash ?? null;
    const isLegacy = existingHash != null && !existingHash.startsWith("$2");

    // Verify current PIN unless this is a forced reset from a legacy hash
    if (existingHash && !isLegacy) {
      if (!current_pin) throw new Error("Current PIN is required to set a new PIN");
      const { compareSync } = await import("https://deno.land/x/bcrypt@v0.4.1/mod.ts");
      if (!compareSync(current_pin, existingHash)) {
        throw new Error("Current PIN is incorrect");
      }
      logStep("Current PIN verified (bcrypt)");
    } else if (isLegacy) {
      // Legacy SHA-256 hash - allow setting new PIN without current_pin (forced reset)
      // If current_pin is provided, verify it; otherwise allow reset.
      if (current_pin) {
        const legacy = await legacyHashPin(current_pin);
        if (legacy !== existingHash) {
          // Don't fail — legacy reset path allows direct overwrite
          logStep("Legacy current_pin mismatch, proceeding with forced reset");
        }
      }
      logStep("Legacy PIN detected, performing forced reset");
    }

    const pinHash = hashSync(pin);
    logStep("PIN hashed with bcrypt");

    const wasReset = isLegacy;

    if (!accountData) {
      const { error: insertError } = await supabaseClient
        .from("producer_stripe_accounts")
        .insert({ user_id: user.id, pin_hash: pinHash });
      if (insertError) throw new Error(`Failed to save PIN: ${insertError.message}`);
    } else {
      const { error: updateError } = await supabaseClient
        .from("producer_stripe_accounts")
        .update({ pin_hash: pinHash })
        .eq("user_id", user.id);
      if (updateError) throw new Error(`Failed to update PIN: ${updateError.message}`);
    }

    // Audit log (human actor)
    await supabaseClient.from("audit_logs").insert({
      actor_id: user.id,
      target_type: "producer_pin",
      target_id: user.id,
      action: wasReset ? "pin_reset_forced" : "pin_set",
      metadata: { had_existing: !!existingHash },
    });

    logStep("PIN saved successfully");

    return new Response(JSON.stringify({ success: true, was_reset: wasReset }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
