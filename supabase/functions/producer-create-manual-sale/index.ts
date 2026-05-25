import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { validateCPF, unformatCPF } from "../_shared/cpf.ts";
import { sendOrderConfirmationEmailSafe } from "../_shared/orderConfirmationEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const log = (event: string, data?: unknown) => {
  try {
    console.log(
      JSON.stringify({ scope: "manual_sale_create", event, data: data ?? null }),
    );
  } catch {
    console.log(`[manual_sale_create] ${event}`);
  }
};

const ALLOWED_METHODS = new Set([
  "pix",
  "dinheiro",
  "transferencia",
  "cartao",
  "outro",
]);

const round2 = (n: number) => Math.round(n * 100) / 100;

interface Item {
  lot_id: string;
  quantity: number;
}

interface Body {
  event_id: string;
  buyer: {
    name: string;
    cpf: string;
    email: string;
    whatsapp?: string | null;
  };
  items: Item[];
  coupon_code?: string | null;
  payment_method: string;
  apply_fee?: boolean;
  note?: string | null;
}

function validateBody(b: any): { ok: true; value: Body } | { ok: false; msg: string } {
  if (!b || typeof b !== "object") return { ok: false, msg: "invalid_body" };
  if (typeof b.event_id !== "string") return { ok: false, msg: "event_id_required" };
  if (!b.buyer || typeof b.buyer !== "object") return { ok: false, msg: "buyer_required" };
  if (typeof b.buyer.name !== "string" || b.buyer.name.trim().length < 3)
    return { ok: false, msg: "buyer_name_invalid" };
  if (typeof b.buyer.email !== "string" || !/^\S+@\S+\.\S+$/.test(b.buyer.email))
    return { ok: false, msg: "buyer_email_invalid" };
  if (typeof b.buyer.cpf !== "string") return { ok: false, msg: "buyer_cpf_required" };
  if (!Array.isArray(b.items) || b.items.length === 0)
    return { ok: false, msg: "items_required" };
  for (const it of b.items) {
    if (typeof it?.lot_id !== "string" || typeof it?.quantity !== "number" || it.quantity < 1)
      return { ok: false, msg: "item_invalid" };
  }
  if (typeof b.payment_method !== "string" || !ALLOWED_METHODS.has(b.payment_method))
    return { ok: false, msg: "payment_method_invalid" };
  if (b.note != null && typeof b.note !== "string")
    return { ok: false, msg: "note_invalid" };
  if (b.note && b.note.length > 500) return { ok: false, msg: "note_too_long" };
  return { ok: true, value: b as Body };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const reserved: Array<{ lot_id: string; quantity: number }> = [];
  let admin: ReturnType<typeof createClient> | null = null;
  let createdOrderId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);
    const token = authHeader.slice(7);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claims?.claims?.sub) return json({ ok: false, error: "unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const parsed = validateBody(await req.json());
    if (!parsed.ok) return json({ ok: false, error: parsed.msg, code: parsed.msg }, 200);
    const body = parsed.value;

    const cpfDigits = unformatCPF(body.buyer.cpf);
    if (!validateCPF(cpfDigits)) {
      return json({ ok: false, error: "CPF inválido", code: "invalid_cpf" }, 200);
    }
    const whatsappDigits = body.buyer.whatsapp
      ? String(body.buyer.whatsapp).replace(/\D/g, "")
      : null;

    admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Rate limit
    const { data: rl } = await admin.rpc("check_rate_limit", {
      _bucket: `manual-sale:${userId}`,
      _max: 30,
      _window_seconds: 60,
      _block_seconds: 60,
    });
    if (rl && Array.isArray(rl) && rl[0] && rl[0].allowed === false) {
      return json({
        ok: false,
        error: "Muitas vendas em sequência. Aguarde alguns segundos.",
        code: "rate_limited",
        retry_after: rl[0].retry_after_seconds,
      }, 200);
    }

    // Ownership
    const { data: event, error: evErr } = await admin
      .from("events")
      .select("id, title, producer_id, status")
      .eq("id", body.event_id)
      .maybeSingle();
    if (evErr || !event) return json({ ok: false, error: "event_not_found", code: "event_not_found" }, 200);
    if (event.producer_id !== userId) return json({ ok: false, error: "forbidden", code: "forbidden" }, 403);

    // Lots
    const lotIds = body.items.map((i) => i.lot_id);
    const { data: lots, error: lotsErr } = await admin
      .from("event_lots")
      .select("id, name, price, is_active, event_id")
      .in("id", lotIds)
      .eq("event_id", body.event_id);
    if (lotsErr || !lots) throw new Error("lots_query_failed");

    const lineItems: Array<{ lot_id: string; lot_name: string; quantity: number; price: number }> = [];
    let subtotal = 0;
    for (const item of body.items) {
      const lot = lots.find((l: any) => l.id === item.lot_id);
      if (!lot) return json({ ok: false, error: "lot_not_found", code: "lot_not_found", lot_id: item.lot_id }, 200);
      if (!lot.is_active) return json({ ok: false, error: `Lote "${lot.name}" inativo`, code: "lot_inactive", lot_id: lot.id }, 200);
      subtotal += Number(lot.price) * item.quantity;
      lineItems.push({ lot_id: lot.id, lot_name: lot.name, quantity: item.quantity, price: Number(lot.price) });
    }

    // Reserve inventory
    for (const li of lineItems) {
      const { data: ok, error: rpcErr } = await admin.rpc("reserve_lot_quantity", {
        _lot_id: li.lot_id,
        _qty: li.quantity,
      });
      if (rpcErr) throw new Error("reserve_failed");
      if (!ok) {
        return json({
          ok: false,
          error: `Lote "${li.lot_name}" sem estoque suficiente`,
          code: "lot_unavailable",
          lot_id: li.lot_id,
        }, 200);
      }
      reserved.push({ lot_id: li.lot_id, quantity: li.quantity });
    }

    // Coupon
    let discountAmount = 0;
    let appliedCouponId: string | null = null;
    if (body.coupon_code) {
      const code = body.coupon_code.trim().toUpperCase();
      const { data: coupon } = await admin
        .from("event_coupons")
        .select("id, discount_type, discount_value, max_uses, uses_count, valid_until, is_active, event_id")
        .eq("event_id", body.event_id)
        .ilike("code", code)
        .maybeSingle();
      if (!coupon || !coupon.is_active) {
        await releaseAll(admin, reserved);
        return json({ ok: false, error: "Cupom inválido", code: "coupon_invalid" }, 200);
      }
      if (coupon.valid_until && new Date(coupon.valid_until).getTime() < Date.now()) {
        await releaseAll(admin, reserved);
        return json({ ok: false, error: "Cupom expirado", code: "coupon_expired" }, 200);
      }
      if (coupon.max_uses != null && coupon.uses_count >= coupon.max_uses) {
        await releaseAll(admin, reserved);
        return json({ ok: false, error: "Cupom esgotado", code: "coupon_exhausted" }, 200);
      }
      discountAmount =
        coupon.discount_type === "percent"
          ? round2((subtotal * Number(coupon.discount_value)) / 100)
          : round2(Math.min(Number(coupon.discount_value), subtotal));
      appliedCouponId = coupon.id;
    }

    // Fee (only if apply_fee)
    let serviceFee = 0;
    if (body.apply_fee) {
      const { data: feeRow } = await admin.rpc("get_event_fee", {
        _event_id: body.event_id,
        _method: "pix",
      });
      const fee = Array.isArray(feeRow) ? feeRow[0] : feeRow;
      const percent = Number(fee?.fee_percent ?? 10);
      const fixed = Number(fee?.fee_fixed ?? 0);
      serviceFee = Math.max(0, round2((subtotal * percent) / 100 + fixed));
    }

    const totalAmount = Math.max(0.01, round2(subtotal + serviceFee - discountAmount));

    // Create order (pending → apply_order_approved promotes)
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        event_id: body.event_id,
        user_id: null,
        customer_name: body.buyer.name.trim(),
        customer_email: body.buyer.email.trim().toLowerCase(),
        customer_phone: whatsappDigits,
        customer_cpf: cpfDigits,
        total_amount: totalAmount,
        service_fee_amount: serviceFee,
        discount_amount: discountAmount,
        coupon_id: appliedCouponId,
        payment_method: "manual",
        status: "pending",
        sale_origin: "manual",
        manual_payment_method: body.payment_method,
        manual_payment_note: body.note ?? null,
        manual_sold_by: userId,
        manual_fee_applied: !!body.apply_fee,
      })
      .select("id")
      .single();
    if (orderErr || !order) throw new Error("order_insert_failed:" + (orderErr?.message ?? "no_row"));
    createdOrderId = order.id;

    // Create pending tickets
    const ticketsRows = lineItems.flatMap((li) =>
      Array.from({ length: li.quantity }, () => ({
        order_id: order.id,
        event_id: body.event_id,
        lot_id: li.lot_id,
        holder_name: body.buyer.name.trim(),
        holder_email: body.buyer.email.trim().toLowerCase(),
        holder_phone: whatsappDigits,
        user_id: null,
        status: "pending",
      })),
    );
    const { error: ticketsErr } = await admin.from("tickets").insert(ticketsRows);
    if (ticketsErr) throw new Error("tickets_insert_failed:" + ticketsErr.message);

    // Promote to paid (confirms lot inventory + flips tickets to valid + increments coupon use)
    const { data: applyData, error: applyErr } = await admin.rpc("apply_order_approved", {
      _order_id: order.id,
      _mp_payment_id: null,
    });
    if (applyErr) throw new Error("apply_order_approved_failed:" + applyErr.message);
    log("apply_result", applyData);

    // Reservations were converted to sold; clear local list so error path doesn't release.
    reserved.length = 0;

    // Load full ticket data for response
    const { data: createdTickets } = await admin
      .from("tickets")
      .select("id, ticket_code, lot_id")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });

    const ticketsOut = (createdTickets ?? []).map((t: any) => ({
      id: t.id,
      ticket_code: t.ticket_code,
      lot_name: lineItems.find((l) => l.lot_id === t.lot_id)?.lot_name ?? "Ingresso",
    }));

    // Send email (non-blocking failure)
    let emailSent = true;
    try {
      const r = await sendOrderConfirmationEmailSafe(admin, {
        orderId: order.id,
        source: "webhook",
      });
      emailSent = r.ok === true;
    } catch (e) {
      log("email_unhandled", { error: String(e) });
      emailSent = false;
    }

    // Audit
    await admin.from("audit_logs").insert({
      actor_id: userId,
      action: "manual_sale_created",
      target_type: "order",
      target_id: order.id,
      metadata: {
        method: body.payment_method,
        apply_fee: !!body.apply_fee,
        items_count: lineItems.length,
        total_tickets: ticketsRows.length,
        total_amount: totalAmount,
      },
    });

    return json({
      ok: true,
      order_id: order.id,
      tickets: ticketsOut,
      totals: {
        subtotal: round2(subtotal),
        service_fee: serviceFee,
        discount: discountAmount,
        total: totalAmount,
      },
      customer: {
        name: body.buyer.name.trim(),
        email: body.buyer.email.trim().toLowerCase(),
        whatsapp: whatsappDigits,
      },
      email_sent: emailSent,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", { msg });
    if (admin && reserved.length > 0) await releaseAll(admin, reserved);
    // If order was created but a later step blew up, best-effort cleanup
    if (admin && createdOrderId && reserved.length === 0) {
      // do not delete to preserve audit; status will remain pending and be cleaned by expiration cron
      log("order_left_pending_for_cleanup", { order_id: createdOrderId });
    }
    return json({ ok: false, error: msg, code: "internal_error" }, 500);
  }
});

async function releaseAll(
  admin: any,
  reserved: Array<{ lot_id: string; quantity: number }>,
) {
  for (const r of reserved) {
    try {
      await admin.rpc("release_lot_quantity", { _lot_id: r.lot_id, _qty: r.quantity });
    } catch (e) {
      console.log("release_failed", r.lot_id, String(e));
    }
  }
  reserved.length = 0;
}
