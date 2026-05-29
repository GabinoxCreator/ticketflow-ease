import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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

interface Body {
  seat_id?: string;
  holder_name?: string;
  holder_phone?: string;
  notes?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

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

    const body = await req.json().catch(() => null) as Body | null;
    if (!body?.seat_id || typeof body.seat_id !== "string") {
      return json({ ok: false, error: "seat_id_required" }, 400);
    }
    const holderName = (body.holder_name ?? "").toString().trim().slice(0, 200) || null;
    const holderPhone = (body.holder_phone ?? "").toString().trim().slice(0, 50) || null;
    const notes = (body.notes ?? "").toString().trim().slice(0, 500) || null;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Ownership: producer_id ou membro da organização
    const { data: seat, error: seatErr } = await admin
      .from("event_seats")
      .select("id,event_id,status,events:event_id(producer_id,producer_profile_id)")
      .eq("id", body.seat_id)
      .maybeSingle();

    if (seatErr || !seat) return json({ ok: false, error: "seat_not_found" }, 404);

    const ev = (seat as { events: { producer_id: string; producer_profile_id: string | null } }).events;
    let isOwner = ev?.producer_id === userId;
    if (!isOwner && ev?.producer_profile_id) {
      const { data: isMember } = await admin.rpc("is_producer_member", {
        _user_id: userId,
        _producer_profile_id: ev.producer_profile_id,
      });
      isOwner = !!isMember;
    }
    if (!isOwner) return json({ ok: false, error: "forbidden" }, 403);

    // UPDATE atômico — gate espelhando hold_seats (available OU held-expirado)
    const nowIso = new Date().toISOString();
    const { data: updated, error: updErr } = await admin
      .from("event_seats")
      .update({
        status: "manual",
        manually_closed_by: userId,
        manually_closed_at: nowIso,
        manual_close_reason: notes,
        manual_holder_name: holderName,
        manual_holder_phone: holderPhone,
        manual_holder_notes: notes,
        hold_token: null,
        hold_expires_at: null,
        held_by_user_id: null,
      })
      .eq("id", body.seat_id)
      .or(`status.eq.available,and(status.eq.held,hold_expires_at.lt.${nowIso})`)
      .select("id")
      .maybeSingle();

    if (updErr) return json({ ok: false, error: updErr.message }, 500);
    if (!updated) return json({ ok: false, error: "seat_unavailable" }, 409);

    await admin.from("audit_logs").insert({
      actor_id: userId,
      action: "table.close_manual",
      target_type: "event_seat",
      target_id: body.seat_id,
      metadata: {
        event_id: seat.event_id,
        holder_name: holderName,
        holder_phone: holderPhone,
        notes,
      },
    });

    return json({ ok: true, seat_id: body.seat_id });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message ?? "unknown" }, 500);
  }
});
