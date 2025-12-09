import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SET-PRODUCER-PIN] ${step}${detailsStr}`);
};

// Simple hash function for PIN (in production, use bcrypt)
async function hashPin(pin: string): Promise<string> {
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
    
    // Validate PIN format
    if (!pin || !/^\d{4}$/.test(pin)) {
      throw new Error("PIN must be exactly 4 digits");
    }

    // Check if user has a Stripe account record
    const { data: accountData, error: accountError } = await supabaseClient
      .from("producer_stripe_accounts")
      .select("pin_hash")
      .eq("user_id", user.id)
      .single();

    // If updating existing PIN, verify current PIN
    if (accountData?.pin_hash) {
      if (!current_pin) {
        throw new Error("Current PIN is required to set a new PIN");
      }
      const currentHash = await hashPin(current_pin);
      if (currentHash !== accountData.pin_hash) {
        throw new Error("Current PIN is incorrect");
      }
      logStep("Current PIN verified");
    }

    const pinHash = await hashPin(pin);
    logStep("PIN hashed successfully");

    if (accountError || !accountData) {
      // Create new record if doesn't exist
      const { error: insertError } = await supabaseClient
        .from("producer_stripe_accounts")
        .insert({
          user_id: user.id,
          pin_hash: pinHash,
        });

      if (insertError) throw new Error(`Failed to save PIN: ${insertError.message}`);
    } else {
      // Update existing record
      const { error: updateError } = await supabaseClient
        .from("producer_stripe_accounts")
        .update({ pin_hash: pinHash })
        .eq("user_id", user.id);

      if (updateError) throw new Error(`Failed to update PIN: ${updateError.message}`);
    }

    logStep("PIN saved successfully");

    return new Response(JSON.stringify({ success: true }), {
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
