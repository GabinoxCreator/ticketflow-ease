// Shared helper: send post-payment confirmation email with atomic idempotency.
// Never throws — payment-critical callers can `await` this safely.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export type OrderEmailSource = "card_inline" | "polling" | "webhook" | "smartpos";
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

const escapeHtml = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Card de UM ingresso: QR (via cid) + código de entrada (8 primeiros do ticket_code).
function buildTicketCard(t: {
  eventTitle: string;
  holderName: string;
  lotName: string;
  shortCode: string;
  cid: string;
}): string {
  return `
      <div style="border:1px solid #e5e7eb;border-radius:14px;padding:20px;margin:0 0 16px 0;text-align:center;background:#ffffff;">
        <p style="margin:0 0 2px 0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#7c3aed;font-weight:bold;">Ingresso</p>
        <h3 style="margin:0 0 14px 0;font-size:18px;color:#1f2937;">${escapeHtml(t.eventTitle)}</h3>
        <img src="cid:${t.cid}" alt="QR Code do ingresso" width="220" height="220" style="display:inline-block;width:220px;height:220px;border-radius:8px;" />
        <p style="margin:14px 0 2px 0;font-size:12px;color:#6b7280;">Código de entrada</p>
        <p style="margin:0 0 12px 0;font-size:26px;font-weight:bold;letter-spacing:3px;color:#1f2937;font-family:'Courier New',monospace;">${escapeHtml(t.shortCode)}</p>
        <p style="margin:2px 0;font-size:13px;color:#4b5563;">Titular: <strong>${escapeHtml(t.holderName)}</strong>${t.lotName ? ` · ${escapeHtml(t.lotName)}` : ""}</p>
        <p style="margin:8px 0 0 0;font-size:13px;color:#6b7280;">Apresente este QR Code na entrada.</p>
      </div>`;
}

// Seção do ingresso: banner do evento (opcional) + os cards. Vazia se não há cards.
function buildTicketSection(args: { bannerUrl: string; cardsHtml: string }): string {
  if (!args.cardsHtml) return "";
  return `
      <div style="margin:8px 0 24px 0;">
        ${args.bannerUrl ? `<img src="${escapeHtml(args.bannerUrl)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border-radius:12px;margin:0 0 16px 0;" />` : ""}
        <p style="margin:0 0 12px 0;font-size:15px;color:#1f2937;font-weight:bold;text-align:center;">Seu ingresso</p>
        ${args.cardsHtml}
      </div>`;
}

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
  ticketSectionHtml: string;
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
      ${args.ticketSectionHtml}
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

    // === 4) LOAD EVENT + TICKETS ===
    // Tickets agora vêm como LINHAS (ticket_code/holder_name/lot_id) p/ o QR; a
    // quantidade continua sendo derivada daqui (tickets.length), como antes do count.
    const [{ data: event }, { data: ticketRows }] = await Promise.all([
      supabase
        .from("events")
        .select("title, date, time, venue, city, state, image_url")
        .eq("id", order.event_id)
        .maybeSingle(),
      supabase
        .from("tickets")
        .select("ticket_code, holder_name, lot_id")
        .eq("order_id", orderId),
    ]);

    const tickets = (ticketRows ?? []) as Array<{
      ticket_code: string;
      holder_name: string | null;
      lot_id: string | null;
    }>;
    const qty = tickets.length;
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

    // === 4b) SEÇÃO DO INGRESSO (QR via cid) — BEST-EFFORT ===
    // Se QUALQUER coisa aqui falhar, o e-mail AINDA sai com a confirmação (sem os
    // ingressos/QR). O QR codifica o ticket_code CRU (== qr_payload, o que a portaria
    // valida) e vai como anexo inline (cid) — nunca a um serviço externo.
    let ticketSectionHtml = "";
    const attachments: Array<{ filename: string; content: string; contentId: string; contentType: string }> = [];
    try {
      if (tickets.length > 0) {
        // tickets tem lot_id (não lot_name); busca os nomes dos lotes.
        const lotIds = [...new Set(tickets.map((t) => t.lot_id).filter(Boolean))] as string[];
        const lotNameById = new Map<string, string>();
        if (lotIds.length > 0) {
          const { data: lots } = await supabase.from("event_lots").select("id, name").in("id", lotIds);
          for (const l of (lots ?? []) as Array<{ id: string; name: string }>) lotNameById.set(l.id, l.name);
        }

        // qrcode via npm: (toDataURL usa encoder PNG puro pngjs, sem canvas/DOM).
        const QRCode: any = (await import("npm:qrcode@1.5.4")).default;
        const cards: string[] = [];
        for (let i = 0; i < tickets.length; i++) {
          const t = tickets[i];
          const dataUrl: string = await QRCode.toDataURL(t.ticket_code, {
            width: 320,
            margin: 1,
            errorCorrectionLevel: "M",
          });
          const base64 = dataUrl.split(",")[1];
          if (!base64) continue; // PNG inválido → pula ESTE ticket (não derruba os outros)
          const contentId = `qr-${i}-${t.ticket_code.slice(0, 8)}`;
          attachments.push({ filename: `ingresso-${i + 1}.png`, content: base64, contentId, contentType: "image/png" });
          cards.push(
            buildTicketCard({
              eventTitle,
              holderName: t.holder_name || order.customer_name || "Convidado",
              lotName: t.lot_id ? (lotNameById.get(t.lot_id) ?? "") : "",
              shortCode: t.ticket_code.slice(0, 8).toUpperCase(),
              cid: contentId,
            }),
          );
        }
        ticketSectionHtml = buildTicketSection({ bannerUrl: event?.image_url ?? "", cardsHtml: cards.join("") });
      }
    } catch (qrErr) {
      // Best-effort: descarta seção/anexos e segue com a confirmação simples.
      ticketSectionHtml = "";
      attachments.length = 0;
      log("ticket_section_failed", {
        order_id: orderId,
        error: String((qrErr as { message?: string })?.message ?? qrErr ?? "unknown").slice(0, 300),
      });
    }

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
      ticketSectionHtml,
    });

    // === 5) SEND VIA RESEND ===
    // resend 6.17.0 (npm:): o anexo inline por contentId só existe a partir da v6.0.0;
    // a v4.0.0 ignorava o campo e o QR (cid) não renderizava (quadrado vazio). npm:
    // evita a peer opcional @react-email/render da série 6.x no bundler (e já está
    // provado neste deploy via npm:qrcode). Chamada/attachments inalterados (formato 6.x).
    const Resend = (await import("npm:resend@6.17.0")).Resend;
    const resend = new Resend(resendKey);
    const { data: sent, error: emailError } = await resend.emails.send({
      from: "FestPag <naoresponda@festpag.com.br>",
      to: [order.customer_email],
      subject: `Pagamento confirmado — ${eventTitle}`,
      html,
      ...(attachments.length > 0 ? { attachments } : {}),
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
