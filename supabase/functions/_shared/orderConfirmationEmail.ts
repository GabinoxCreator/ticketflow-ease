// Shared helper: send post-payment confirmation email with atomic idempotency.
// Never throws — payment-critical callers can `await` this safely.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export type OrderEmailSource = "card_inline" | "polling" | "webhook";
export const ORDER_EMAIL_KIND = "paid_confirmation" as const;

type OkResult = { ok: true; messageId?: string | null };
type SkippedResult = {
  ok: false;
  skipped: true;
  reason:
    | "already_claimed"
    | "order_not_found"
    | "order_not_paid"
    | "no_recipient"
    | "missing_resend_key";
};
type FailResult = { ok: false; skipped?: false; error: string; code?: string };
export type OrderEmailResult = OkResult | SkippedResult | FailResult;

const formatBRL = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const log = (event: string, data: Record<string, unknown>) => {
  try {
    console.log(JSON.stringify({ scope: "order_email", event, ...data }));
  } catch {
    console.log(`[order_email] ${event}`);
  }
};

function buildHtml(args: {
  customerName: string | null;
  customerEmail: string;
  hasUserId: boolean;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventVenue: string;
  qty: number;
  total: number;
}): string {
  const linkedNote = args.hasUserId
    ? `Acesse seus ingressos a qualquer momento em <a href="https://festpag.digital/meus-ingressos" style="color:#7c3aed;">Meus Ingressos</a>.`
    : `Seus ingressos foram vinculados ao email <strong>${args.customerEmail}</strong>. Crie uma conta com este mesmo email em <a href="https://festpag.digital/cadastro" style="color:#7c3aed;">festpag.digital/cadastro</a> para acessá-los.`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 30px;">
        <img src="https://festpag.digital/logo-festpag.png" alt="FestPag" width="160" style="display:inline-block; max-width:160px; height:auto;" />
      </div>
      <div style="background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%); border-radius: 12px; padding: 28px; text-align: center; margin: 0 0 28px 0; color: white;">
        <p style="margin: 0 0 6px 0; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; opacity: .85;">Pagamento confirmado</p>
        <h1 style="margin: 0; font-size: 24px;">${args.eventTitle}</h1>
      </div>
      <h2 style="color: #1f2937; font-size: 18px;">Olá, ${args.customerName || "tudo certo"}!</h2>
      <p style="color: #4b5563; font-size: 15px; line-height: 1.5;">
        Recebemos seu pagamento e seus ingressos já estão garantidos.
      </p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:20px 0;">
        <p style="margin:0 0 6px 0;color:#374151;font-size:14px;"><strong>Resumo</strong></p>
        <p style="margin:4px 0;color:#4b5563;font-size:14px;">Evento: <strong>${args.eventTitle}</strong></p>
        ${args.eventDate ? `<p style="margin:4px 0;color:#4b5563;font-size:14px;">Data: ${args.eventDate}${args.eventTime ? ` às ${args.eventTime}` : ""}</p>` : ""}
        ${args.eventVenue ? `<p style="margin:4px 0;color:#4b5563;font-size:14px;">Local: ${args.eventVenue}</p>` : ""}
        <p style="margin:4px 0;color:#4b5563;font-size:14px;">Ingressos: <strong>${args.qty}</strong></p>
        <p style="margin:4px 0;color:#4b5563;font-size:14px;">Total pago: <strong>${formatBRL(args.total)}</strong></p>
        <p style="margin:4px 0;color:#10b981;font-size:14px;"><strong>Status: Pago</strong></p>
      </div>
      <div style="text-align:center;margin:24px 0;">
        <a href="https://festpag.digital/meus-ingressos"
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
  `;
}

/**
 * Sends post-payment confirmation email with atomic per-(order_id, kind) claim.
 *
 * Idempotency: relies on UNIQUE(order_id, kind) on order_email_notifications.
 * Concurrent callers race on INSERT; the loser receives Postgres error 23505
 * (unique_violation) and returns { skipped: true, reason: 'already_claimed' }.
 * The winner is the only one that proceeds to send. attempt_count is set to 1
 * at claim time and is NOT incremented again in this same flow.
 *
 * Never throws — wraps everything in try/catch.
 */
export async function sendOrderConfirmationEmailSafe(
  supabase: SupabaseClient,
  args: { orderId: string; source: OrderEmailSource },
): Promise<OrderEmailResult> {
  const { orderId, source } = args;
  const kind = ORDER_EMAIL_KIND;

  try {
    // === 1) ATOMIC CLAIM ===
    // Race-safe: INSERT with UNIQUE(order_id, kind). Loser gets 23505 and exits.
    // attempt_count starts at 1 and is NOT incremented later in this flow.
    const claimedAt = new Date().toISOString();
    const { data: claim, error: claimErr } = await supabase
      .from("order_email_notifications")
      .insert({
        order_id: orderId,
        kind,
        source,
        status: "sending",
        attempt_count: 1,
        claimed_at: claimedAt,
      })
      .select("id")
      .maybeSingle();

    if (claimErr) {
      const code = (claimErr as { code?: string }).code;
      if (code === "23505") {
        log("already_claimed", { order_id: orderId, kind, source });
        return { ok: false, skipped: true, reason: "already_claimed" };
      }
      log("claim_error", { order_id: orderId, kind, source, code, message: claimErr.message });
      return { ok: false, error: claimErr.message, code };
    }

    if (!claim) {
      log("claim_no_row", { order_id: orderId, kind, source });
      return { ok: false, skipped: true, reason: "already_claimed" };
    }

    const claimId = claim.id as string;
    log("claimed", { order_id: orderId, kind, source, claim_id: claimId });

    // === 2) LOAD ORDER ===
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, status, customer_name, customer_email, total_amount, user_id, event_id")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      await supabase
        .from("order_email_notifications")
        .update({ status: "failed", error_code: "order_not_found", error_message: orderErr?.message ?? null })
        .eq("id", claimId);
      log("order_not_found", { order_id: orderId, error: orderErr?.message });
      return { ok: false, skipped: true, reason: "order_not_found" };
    }

    if (order.status !== "paid") {
      await supabase
        .from("order_email_notifications")
        .update({ status: "failed", error_code: "order_not_paid", error_message: `status:${order.status}` })
        .eq("id", claimId);
      log("order_not_paid", { order_id: orderId, status: order.status });
      return { ok: false, skipped: true, reason: "order_not_paid" };
    }

    if (!order.customer_email) {
      await supabase
        .from("order_email_notifications")
        .update({ status: "failed", error_code: "no_recipient", error_message: "missing customer_email" })
        .eq("id", claimId);
      log("no_recipient", { order_id: orderId });
      return { ok: false, skipped: true, reason: "no_recipient" };
    }

    // === 3) RESEND KEY ===
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      await supabase
        .from("order_email_notifications")
        .update({
          status: "failed",
          error_code: "missing_resend_key",
          error_message: "RESEND_API_KEY not configured",
          recipient_email: order.customer_email,
        })
        .eq("id", claimId);
      log("missing_resend_key", { order_id: orderId });
      return { ok: false, skipped: true, reason: "missing_resend_key" };
    }

    // === 4) LOAD EVENT + TICKETS COUNT ===
    const [{ data: event }, { count: ticketCount }] = await Promise.all([
      supabase
        .from("events")
        .select("title, date, time, venue, city, state")
        .eq("id", order.event_id)
        .maybeSingle(),
      supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId),
    ]);

    const qty = ticketCount ?? 0;
    const eventTitle = event?.title ?? "seu evento";
    const eventVenue = event?.venue
      ? `${event.venue}${event?.city ? ` — ${event.city}/${event.state ?? ""}` : ""}`
      : "";
    const eventDate = event?.date
      ? new Date(`${event.date}T12:00:00`).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "";
    const eventTime = event?.time ? String(event.time).slice(0, 5) : "";

    const html = buildHtml({
      customerName: order.customer_name ?? null,
      customerEmail: order.customer_email,
      hasUserId: Boolean(order.user_id),
      eventTitle,
      eventDate,
      eventTime,
      eventVenue,
      qty,
      total: Number(order.total_amount ?? 0),
    });

    // === 5) SEND VIA RESEND ===
    const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;
    const resend = new Resend(resendKey);
    const { data: sent, error: emailError } = await resend.emails.send({
      from: "FestPag <naoresponda@festpag.com.br>",
      to: [order.customer_email],
      subject: `Pagamento confirmado — ${eventTitle}`,
      html,
    });

    if (emailError) {
      const message = String(
        (emailError as { message?: string })?.message ?? emailError ?? "unknown_error",
      ).slice(0, 500);
      await supabase
        .from("order_email_notifications")
        .update({
          status: "failed",
          error_code: "resend_error",
          error_message: message,
          recipient_email: order.customer_email,
        })
        .eq("id", claimId);
      log("resend_error", { order_id: orderId, error: message });
      return { ok: false, error: message, code: "resend_error" };
    }

    const messageId = (sent as { id?: string } | null)?.id ?? null;

    await supabase
      .from("order_email_notifications")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        resend_email_id: messageId,
        recipient_email: order.customer_email,
      })
      .eq("id", claimId);

    log("sent", { order_id: orderId, kind, source, to: order.customer_email, message_id: messageId });
    return { ok: true, messageId };
  } catch (err) {
    const message = String((err as { message?: string })?.message ?? err ?? "unknown").slice(0, 500);
    // Best-effort failure marker; ignore if it errors out.
    try {
      await supabase
        .from("order_email_notifications")
        .update({ status: "failed", error_code: "unhandled", error_message: message })
        .eq("order_id", orderId)
        .eq("kind", kind)
        .eq("status", "sending");
    } catch {
      /* swallow */
    }
    log("unhandled", { order_id: orderId, kind, source, error: message });
    return { ok: false, error: message, code: "unhandled" };
  }
}

// Re-export createClient so callers don't need a separate import path.
export { createClient };
