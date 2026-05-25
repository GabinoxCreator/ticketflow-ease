import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const log = (event: string, data?: unknown) => {
  try {
    console.log(JSON.stringify({ scope: "courtesy_tickets", event, data: data ?? null }));
  } catch {
    console.log(`[courtesy_tickets] ${event}`);
  }
};

interface Body {
  event_id: string;
  lot_id: string;
  quantity: number;
  holder_name: string;
  holder_email: string;
  holder_phone?: string | null;
  note?: string | null;
}

function validate(b: any): { ok: true; v: Body } | { ok: false; msg: string } {
  if (!b || typeof b !== "object") return { ok: false, msg: "invalid_body" };
  if (typeof b.event_id !== "string") return { ok: false, msg: "event_id_required" };
  if (typeof b.lot_id !== "string") return { ok: false, msg: "lot_id_required" };
  if (typeof b.quantity !== "number" || b.quantity < 1 || b.quantity > 100)
    return { ok: false, msg: "quantity_invalid" };
  if (typeof b.holder_name !== "string" || b.holder_name.trim().length < 2)
    return { ok: false, msg: "holder_name_invalid" };
  if (typeof b.holder_email !== "string" || !/^\S+@\S+\.\S+$/.test(b.holder_email))
    return { ok: false, msg: "holder_email_invalid" };
  return { ok: true, v: b as Body };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let admin: ReturnType<typeof createClient> | null = null;
  let reservedQty = 0;
  let lotId = "";
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
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      log("auth_failed", { msg: userErr?.message });
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    const userId = userData.user.id;

    admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Admin check (server-side, never trust the client)
    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      log("forbidden_not_admin", { userId, roleErr: roleErr?.message });
      return json({ ok: false, error: "forbidden", code: "not_admin" }, 403);
    }

    const parsed = validate(await req.json());
    if (!parsed.ok) return json({ ok: false, error: parsed.msg, code: parsed.msg }, 200);
    const body = parsed.v;
    lotId = body.lot_id;

    // Load event + lot
    const { data: event, error: evErr } = await admin
      .from("events")
      .select("id, title")
      .eq("id", body.event_id)
      .maybeSingle();
    if (evErr || !event) return json({ ok: false, error: "event_not_found", code: "event_not_found" }, 200);

    const { data: lot, error: lotErr } = await admin
      .from("event_lots")
      .select("id, name, event_id, is_active")
      .eq("id", body.lot_id)
      .eq("event_id", body.event_id)
      .maybeSingle();
    if (lotErr || !lot) return json({ ok: false, error: "lot_not_found", code: "lot_not_found" }, 200);
    if (!lot.is_active) return json({ ok: false, error: "lot_inactive", code: "lot_inactive" }, 200);

    // Reserve inventory (respects total_quantity / manually_sold_out)
    const { data: reserveOk, error: rErr } = await admin.rpc("reserve_lot_quantity", {
      _lot_id: body.lot_id,
      _qty: body.quantity,
    });
    if (rErr) throw new Error("reserve_failed:" + rErr.message);
    if (!reserveOk) {
      return json({
        ok: false,
        error: `Lote "${lot.name}" sem estoque suficiente`,
        code: "lot_unavailable",
      }, 200);
    }
    reservedQty = body.quantity;

    // Create courtesy order (paid, total=0, sale_origin='courtesy')
    const holderName = body.holder_name.trim();
    const holderEmail = body.holder_email.trim().toLowerCase();
    const holderPhone = body.holder_phone
      ? String(body.holder_phone).replace(/\D/g, "") || null
      : null;

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        event_id: body.event_id,
        user_id: null,
        customer_name: holderName,
        customer_email: holderEmail,
        customer_phone: holderPhone,
        total_amount: 0,
        service_fee_amount: 0,
        discount_amount: 0,
        payment_method: "courtesy",
        status: "pending",
        sale_origin: "courtesy",
        manual_payment_method: "courtesy",
        manual_payment_note: body.note ?? "Cortesia gerada pelo admin",
        manual_sold_by: userId,
        manual_fee_applied: false,
      })
      .select("id")
      .single();
    if (orderErr || !order) throw new Error("order_insert_failed:" + (orderErr?.message ?? "no_row"));
    createdOrderId = order.id;

    // Insert pending tickets
    const ticketRows = Array.from({ length: body.quantity }, () => ({
      order_id: order.id,
      event_id: body.event_id,
      lot_id: body.lot_id,
      holder_name: holderName,
      holder_email: holderEmail,
      holder_phone: holderPhone,
      user_id: null,
      status: "pending",
    }));
    const { error: tErr } = await admin.from("tickets").insert(ticketRows);
    if (tErr) throw new Error("tickets_insert_failed:" + tErr.message);

    // Promote pending → paid (confirms inventory, flips tickets to valid)
    const { error: applyErr } = await admin.rpc("apply_order_approved", {
      _order_id: order.id,
      _mp_payment_id: null,
    });
    if (applyErr) throw new Error("apply_order_approved_failed:" + applyErr.message);

    // Reservation already converted to sold; don't release on error path
    reservedQty = 0;

    const { data: created } = await admin
      .from("tickets")
      .select("id, ticket_code")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });

    const ticketsOut = (created ?? []).map((t: any) => ({
      id: t.id,
      ticket_code: t.ticket_code,
      lot_name: lot.name,
      holder_name: holderName,
    }));

    await admin.from("audit_logs").insert({
      actor_id: userId,
      action: "courtesy_tickets_generated",
      target_type: "order",
      target_id: order.id,
      metadata: {
        event_id: body.event_id,
        event_title: event.title,
        lot_id: body.lot_id,
        lot_name: lot.name,
        quantity: body.quantity,
        holder_name: holderName,
      },
    });

    log("ok", { order_id: order.id, qty: body.quantity, lot_id: body.lot_id });

    return json({ ok: true, order_id: order.id, tickets: ticketsOut });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", { msg });
    if (admin && reservedQty > 0 && lotId) {
      try {
        await admin.rpc("release_lot_quantity", { _lot_id: lotId, _qty: reservedQty });
      } catch {}
    }
    return json({ ok: false, error: msg, code: "internal_error" }, 500);
  }
});
