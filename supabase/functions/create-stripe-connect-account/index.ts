import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-STRIPE-CONNECT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Check if user already has a Stripe Connect account
    const { data: existingAccount } = await supabaseClient
      .from("producer_stripe_accounts")
      .select("stripe_account_id, onboarding_completed")
      .eq("user_id", user.id)
      .single();

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let accountId = existingAccount?.stripe_account_id;

    // If no account exists, create a new Custom account (for embedded components)
    if (!accountId) {
      logStep("Creating new Stripe Connect Custom account");
      
      const account = await stripe.accounts.create({
        country: "BR",
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        controller: {
          fees: {
            payer: "application",
          },
          losses: {
            payments: "application",
          },
          requirement_collection: "application",
          stripe_dashboard: {
            type: "none",
          },
        },
      });

      accountId = account.id;
      logStep("Stripe Custom account created", { accountId });

      // Save account to database
      const { error: insertError } = await supabaseClient
        .from("producer_stripe_accounts")
        .insert({
          user_id: user.id,
          stripe_account_id: accountId,
          stripe_account_status: "pending",
          onboarding_completed: false,
        });

      if (insertError) {
        logStep("Error saving account to database", { error: insertError.message });
        throw new Error(`Failed to save account: ${insertError.message}`);
      }
    }

    logStep("Account ready for embedded onboarding", { accountId });

    return new Response(JSON.stringify({ 
      success: true, 
      account_id: accountId,
      message: "Account created successfully. Use create-account-session to get embedded component credentials."
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
