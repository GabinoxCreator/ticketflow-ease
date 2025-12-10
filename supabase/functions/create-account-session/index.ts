import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-ACCOUNT-SESSION] ${step}${detailsStr}`);
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

    // Get the user's Stripe Connect account
    const { data: accountData, error: accountError } = await supabaseClient
      .from("producer_stripe_accounts")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .single();

    if (accountError || !accountData?.stripe_account_id) {
      throw new Error("No Stripe Connect account found for this user");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    logStep("Creating account session", { accountId: accountData.stripe_account_id });

    // Create an Account Session for embedded components
    const accountSession = await stripe.accountSessions.create({
      account: accountData.stripe_account_id,
      components: {
        account_onboarding: {
          enabled: true,
        },
        account_management: {
          enabled: true,
        },
        balances: {
          enabled: true,
        },
        payouts: {
          enabled: true,
        },
        payments: {
          enabled: true,
        },
      },
    });

    logStep("Account session created", { clientSecret: accountSession.client_secret ? "***" : "missing" });

    return new Response(JSON.stringify({ 
      client_secret: accountSession.client_secret,
      account_id: accountData.stripe_account_id,
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
