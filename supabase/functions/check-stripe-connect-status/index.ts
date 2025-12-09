import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-STRIPE-STATUS] ${step}${detailsStr}`);
};

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

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // Get account from database
    const { data: accountData, error: accountError } = await supabaseClient
      .from("producer_stripe_accounts")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (accountError || !accountData?.stripe_account_id) {
      logStep("No Stripe account found");
      return new Response(JSON.stringify({ 
        connected: false,
        status: "not_connected",
        onboarding_completed: false,
        has_pin: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    // Check account status on Stripe
    const account = await stripe.accounts.retrieve(accountData.stripe_account_id);
    logStep("Stripe account retrieved", { 
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    });

    const isActive = account.charges_enabled && account.payouts_enabled;
    const newStatus = isActive ? "active" : account.details_submitted ? "restricted" : "pending";

    // Update status in database if changed
    if (newStatus !== accountData.stripe_account_status || isActive !== accountData.onboarding_completed) {
      await supabaseClient
        .from("producer_stripe_accounts")
        .update({
          stripe_account_status: newStatus,
          onboarding_completed: isActive,
        })
        .eq("user_id", user.id);
      logStep("Database status updated", { newStatus, onboarding_completed: isActive });
    }

    return new Response(JSON.stringify({
      connected: true,
      status: newStatus,
      onboarding_completed: isActive,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      has_pin: !!accountData.pin_hash,
    }), {
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
