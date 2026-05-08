// LEGACY / DEPRECATED — DO NOT USE
//
// This function implemented the old Mercado Pago "preference" (redirect)
// checkout flow. It bypassed the modern transactional checkout
// (create-mercadopago-pix / process-card-payment) and the inventory
// reservation pipeline (reserve_lot_quantity / confirm_lot_sale).
//
// Keeping its old logic deployed is a real operational risk: it could create
// orders + tickets + mutate sold_quantity outside of the current contract.
//
// As of Parte 2.2 it is fully neutralized:
//   - returns HTTP 410 Gone for any invocation
//   - performs no DB writes, no MP calls, no side effects
//
// The file is intentionally kept in the repo for historical context. If the
// function is ever truly unused for a full release cycle, delete it from the
// deploy pipeline entirely.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.warn(
    "[CREATE-MERCADOPAGO-PREFERENCE] Deprecated legacy endpoint invoked. Returning 410.",
  );

  return new Response(
    JSON.stringify({
      error: "gone",
      message:
        "This legacy checkout endpoint has been disabled. Use create-mercadopago-pix or process-card-payment.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
