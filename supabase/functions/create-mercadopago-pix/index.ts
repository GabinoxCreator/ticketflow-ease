// DESLIGADA em 21/10/2026 (OS-269). Decisão do Gabriel: "vamos desligar o mercado
// pago, deixa so a api do Marcel que é da Safe2pay".
//
// Esta edge criava a cobrança PIX nova do INGRESSO pelo Mercado Pago. A venda do site é toda pela rota do Marcel (Safe2Pay); a irmã
// desta é `marcel-create-pix`. Desde 08/09 todo evento novo nasce no Marcel, e em 21/10 não havia
// evento do Mercado Pago no futuro, nem pedido pendente dele, nem mesa presa; a última
// venda online pelo Mercado Pago foi em 14/08. Ligada, ela vendia também evento do Marcel
// pulando as travas de lá (1 CPF por noite, passe permanente, teto de parcelas).
//
// Mesmo padrão da `create-mercadopago-preference`, desligada antes: responde 410 a
// qualquer chamada, sem gravar nada e sem chamar o Mercado Pago.
//
// O que CONTINUA LIGADO para os pedidos antigos do Mercado Pago (não desligar):
//   mercadopago-webhook (aprova pagamento e recebe estorno e contestação),
//   check-mercadopago-payment (tela do pedido confere se pagou),
//   expire-pending-orders e reconcile-orphan-orders (conferem no Mercado Pago antes de
//   expirar ou recuperar um pedido), get-mercadopago-public-key (só a chave pública).
//
// Para religar: restaurar este arquivo do commit anterior à OS-269 (git) e fazer o
// redeploy nomeado desta edge.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-meli-session-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.warn("[CREATE-MERCADOPAGO-PIX] Desligada (OS-269). Respondendo 410.");

  return new Response(
    JSON.stringify({
      error: "gone",
      message:
        "Pagamento pelo Mercado Pago desligado. As vendas do site são pela rota do Marcel (Safe2Pay).",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
