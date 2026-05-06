import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, data?: any) => {
  console.log(`[SEND-ORDER-EMAIL] ${step}${data ? " " + JSON.stringify(data) : ""}`);
};

const formatBRL = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { order_id } = await req.json();
    if (!order_id || typeof order_id !== "string") {
      return new Response(JSON.stringify({ error: "order_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Atomic claim — first caller wins
    const { data: claim, error: claimErr } = await supabase
      .from("order_email_notifications")
      .insert({ order_id, status: "pending", attempts: 1 })
      .select("order_id")
      .maybeSingle();

    if (claimErr) {
      // 23505 unique_violation = already claimed/sent
      if ((claimErr as any).code === "23505") {
        log("already_claimed", { order_id });
        return new Response(JSON.stringify({ skipped: true, reason: "already_claimed" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      log("claim_error", { claimErr });
      return new Response(JSON.stringify({ error: "claim failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!claim) {
      log("no_claim_returned", { order_id });
      return new Response(JSON.stringify({ skipped: true, reason: "already_claimed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, status, customer_name, customer_email, total_amount, user_id, event_id")
      .eq("id", order_id)
      .maybeSingle();

    if (orderErr || !order) {
      await supabase
        .from("order_email_notifications")
        .update({ status: "failed", last_error: "order_not_found" })
        .eq("order_id", order_id);
      log("order_not_found", { order_id });
      return new Response(JSON.stringify({ error: "order not found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (order.status !== "paid") {
      await supabase
        .from("order_email_notifications")
        .update({ status: "failed", last_error: `order_status:${order.status}` })
        .eq("order_id", order_id);
      log("order_not_paid", { order_id, status: order.status });
      return new Response(JSON.stringify({ skipped: true, reason: "order_not_paid" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!order.customer_email) {
      await supabase
        .from("order_email_notifications")
        .update({ status: "failed", last_error: "missing_email" })
        .eq("order_id", order_id);
      log("missing_email", { order_id });
      return new Response(JSON.stringify({ skipped: true, reason: "missing_email" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load event + tickets count
    const [{ data: event }, { count: ticketCount }] = await Promise.all([
      supabase
        .from("events")
        .select("title, date, time, venue, city, state")
        .eq("id", order.event_id)
        .maybeSingle(),
      supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("order_id", order_id),
    ]);

    const qty = ticketCount ?? 0;
    const eventTitle = event?.title ?? "seu evento";
    const eventVenue = event?.venue ? `${event.venue}${event?.city ? ` — ${event.city}/${event.state ?? ""}` : ""}` : "";
    const eventDate = event?.date
      ? new Date(`${event.date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
      : "";
    const eventTime = event?.time ? String(event.time).slice(0, 5) : "";

    const linkedNote = order.user_id
      ? `Acesse seus ingressos a qualquer momento em <a href="https://festpag.com.br/meus-ingressos" style="color:#7c3aed;">Meus Ingressos</a>.`
      : `Seus ingressos foram vinculados ao email <strong>${order.customer_email}</strong>. Crie sua conta com este mesmo email para acessá-los em <a href="https://festpag.com.br/meus-ingressos" style="color:#7c3aed;">Meus Ingressos</a>.`;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      await supabase
        .from("order_email_notifications")
        .update({ status: "failed", last_error: "missing_resend_key" })
        .eq("order_id", order_id);
      log("missing_resend_key");
      return new Response(JSON.stringify({ error: "resend not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resend = new Resend(resendKey);
    const { data: sent, error: emailError } = await resend.emails.send({
      from: "FestPag <naoresponda@festpag.com.br>",
      to: [order.customer_email],
      subject: `Pagamento confirmado — ${eventTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="https://festpag.com.br/logo-festpag.png" alt="FestPag" width="160" style="display:inline-block; max-width:160px; height:auto;" />
          </div>

          <div style="background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%); border-radius: 12px; padding: 28px; text-align: center; margin: 0 0 28px 0; color: white;">
            <p style="margin: 0 0 6px 0; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; opacity: .85;">Pagamento confirmado</p>
            <h1 style="margin: 0; font-size: 24px;">${eventTitle}</h1>
          </div>

          <h2 style="color: #1f2937; font-size: 18px;">Olá, ${order.customer_name || "tudo certo"}!</h2>
          <p style="color: #4b5563; font-size: 15px; line-height: 1.5;">
            Recebemos seu pagamento e seus ingressos já estão garantidos.
          </p>

          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:20px 0;">
            <p style="margin:0 0 6px 0;color:#374151;font-size:14px;"><strong>Resumo</strong></p>
            <p style="margin:4px 0;color:#4b5563;font-size:14px;">Evento: <strong>${eventTitle}</strong></p>
            ${eventDate ? `<p style="margin:4px 0;color:#4b5563;font-size:14px;">Data: ${eventDate}${eventTime ? ` às ${eventTime}` : ""}</p>` : ""}
            ${eventVenue ? `<p style="margin:4px 0;color:#4b5563;font-size:14px;">Local: ${eventVenue}</p>` : ""}
            <p style="margin:4px 0;color:#4b5563;font-size:14px;">Ingressos: <strong>${qty}</strong></p>
            <p style="margin:4px 0;color:#4b5563;font-size:14px;">Total pago: <strong>${formatBRL(order.total_amount)}</strong></p>
            <p style="margin:4px 0;color:#10b981;font-size:14px;"><strong>Status: Pago</strong></p>
          </div>

          <div style="text-align:center;margin:24px 0;">
            <a href="https://festpag.com.br/meus-ingressos"
               style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold;">
              Ver meus ingressos
            </a>
          </div>

          <p style="color:#6b7280;font-size:13px;line-height:1.5;">${linkedNote}</p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;">
          <p style="color:#9ca3af;font-size:12px;text-align:center;">
            © ${new Date().getFullYear()} FestPag. Todos os direitos reservados.
          </p>
        </div>
      `,
    });

    if (emailError) {
      await supabase
        .from("order_email_notifications")
        .update({ status: "failed", last_error: String(emailError?.message || emailError) })
        .eq("order_id", order_id);
      log("resend_error", { emailError });
      return new Response(JSON.stringify({ error: "send failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("order_email_notifications")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        resend_message_id: (sent as any)?.id ?? null,
      })
      .eq("order_id", order_id);

    log("sent", { order_id, to: order.customer_email });

    return new Response(JSON.stringify({ ok: true, sent: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    log("UNHANDLED", { message: err?.message });
    return new Response(JSON.stringify({ error: err?.message ?? "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
