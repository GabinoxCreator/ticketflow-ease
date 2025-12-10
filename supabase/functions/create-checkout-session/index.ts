import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CartItem {
  lotId: string;
  quantity: number;
}

interface CheckoutRequest {
  eventId: string;
  cartItems: CartItem[];
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
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
    const { eventId, cartItems, customerEmail, customerName, customerPhone }: CheckoutRequest = await req.json();
    
    console.log("[CREATE-CHECKOUT] Starting checkout session creation", { eventId, cartItems });

    if (!eventId || !cartItems || cartItems.length === 0) {
      throw new Error("Event ID and cart items are required");
    }

    // Get event details including producer_id
    const { data: event, error: eventError } = await supabaseClient
      .from("events")
      .select("id, title, producer_id")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      throw new Error("Event not found");
    }

    console.log("[CREATE-CHECKOUT] Event found", { eventId: event.id, producerId: event.producer_id });

    // Get producer's Stripe account
    const { data: stripeAccount, error: stripeAccountError } = await supabaseClient
      .from("producer_stripe_accounts")
      .select("stripe_account_id, onboarding_completed")
      .eq("user_id", event.producer_id)
      .single();

    if (stripeAccountError || !stripeAccount?.stripe_account_id) {
      throw new Error("Producer has not configured payment receiving");
    }

    if (!stripeAccount.onboarding_completed) {
      throw new Error("Producer has not completed payment setup");
    }

    console.log("[CREATE-CHECKOUT] Producer Stripe account found", { stripeAccountId: stripeAccount.stripe_account_id });

    // Get lot details for cart items
    const lotIds = cartItems.map(item => item.lotId);
    const { data: lots, error: lotsError } = await supabaseClient
      .from("event_lots")
      .select("id, name, price, sold_quantity, total_quantity")
      .in("id", lotIds);

    if (lotsError || !lots) {
      throw new Error("Failed to fetch lot details");
    }

    console.log("[CREATE-CHECKOUT] Lots fetched", { lots });

    // Validate availability and build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    let totalAmount = 0;

    for (const cartItem of cartItems) {
      const lot = lots.find(l => l.id === cartItem.lotId);
      if (!lot) {
        throw new Error(`Lot ${cartItem.lotId} not found`);
      }

      const availableQuantity = lot.total_quantity - lot.sold_quantity;
      if (cartItem.quantity > availableQuantity) {
        throw new Error(`Not enough tickets available for ${lot.name}`);
      }

      const priceInCents = Math.round(lot.price * 100);
      totalAmount += priceInCents * cartItem.quantity;

      lineItems.push({
        price_data: {
          currency: "brl",
          product_data: {
            name: `${event.title} - ${lot.name}`,
            description: `Ingresso para ${event.title}`,
          },
          unit_amount: priceInCents,
        },
        quantity: cartItem.quantity,
      });
    }

    console.log("[CREATE-CHECKOUT] Line items built", { lineItems, totalAmount });

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Calculate platform fee (e.g., 10%)
    const platformFeePercent = 10;
    const applicationFeeAmount = Math.round(totalAmount * (platformFeePercent / 100));

    console.log("[CREATE-CHECKOUT] Fee calculation", { totalAmount, applicationFeeAmount, platformFeePercent });

    // Get authenticated user if available
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabaseClient.auth.getUser(token);
      userId = userData.user?.id || null;
    }

    // Create order in pending state
    const { data: order, error: orderError } = await supabaseClient
      .from("orders")
      .insert({
        event_id: eventId,
        user_id: userId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone || null,
        total_amount: totalAmount / 100, // Store in BRL, not cents
        status: "pending",
        payment_method: "card",
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error("[CREATE-CHECKOUT] Order creation failed", orderError);
      throw new Error("Failed to create order");
    }

    console.log("[CREATE-CHECKOUT] Order created", { orderId: order.id });

    // Create Stripe Checkout Session with Destination Charges
    const origin = req.headers.get("origin") || "http://localhost:5173";
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/checkout/sucesso?session_id={CHECKOUT_SESSION_ID}&order_id=${order.id}`,
      cancel_url: `${origin}/evento/${eventId}`,
      customer_email: customerEmail,
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: stripeAccount.stripe_account_id,
        },
      },
      metadata: {
        order_id: order.id,
        event_id: eventId,
        customer_name: customerName,
        cart_items: JSON.stringify(cartItems),
      },
    });

    console.log("[CREATE-CHECKOUT] Stripe session created", { sessionId: session.id, url: session.url });

    return new Response(
      JSON.stringify({ 
        url: session.url, 
        sessionId: session.id,
        orderId: order.id 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[CREATE-CHECKOUT] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
