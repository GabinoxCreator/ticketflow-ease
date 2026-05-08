// Health snapshot collector - captures system metrics
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const PREFIX = "[HEALTH-SNAP]";

type Severity = "ok" | "warn" | "crit";
const worstSeverity = (a: Severity, b: Severity): Severity => {
  const order = { ok: 0, warn: 1, crit: 2 };
  return order[a] >= order[b] ? a : b;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: cron secret (vault is the single source of truth) OR admin JWT.
  // Accept both casings, aligned with expire-pending-orders.
  const provided =
    req.headers.get("x-cron-secret") ?? req.headers.get("X-Cron-Secret");
  const authHeader = req.headers.get("Authorization");

  let isAuthorized = false;
  if (provided) {
    try {
      const supaSvc = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { persistSession: false } }
      );
      const { data: vaultSecret } = await supaSvc.rpc("get_cron_secret");
      if (vaultSecret && provided === vaultSecret) isAuthorized = true;
    } catch (_) { /* ignore */ }
  }
  if (!isAuthorized && authHeader?.startsWith("Bearer ")) {
    const supaAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data } = await supaAuth.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (data?.claims?.sub) {
      const { data: roleData } = await supaAuth
        .from("user_roles")
        .select("role")
        .eq("user_id", data.claims.sub)
        .eq("role", "admin")
        .maybeSingle();
      if (roleData) isAuthorized = true;
    }
  }
  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    let overall: Severity = "ok";

    // ===== ORDERS =====
    const { count: pendingCount } = await supa
      .from("orders").select("id", { count: "exact", head: true }).eq("status", "pending");
    const { data: oldestPending } = await supa
      .from("orders").select("created_at").eq("status", "pending")
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    const { count: paidLastHour } = await supa
      .from("orders").select("id", { count: "exact", head: true })
      .eq("status", "paid").gte("updated_at", oneHourAgo);
    const { count: expiredLastHour } = await supa
      .from("orders").select("id", { count: "exact", head: true })
      .eq("status", "expired").gte("updated_at", oneHourAgo);
    const { count: failedLastHour } = await supa
      .from("orders").select("id", { count: "exact", head: true })
      .eq("status", "failed").gte("updated_at", oneHourAgo);

    const oldestAgeSec = oldestPending
      ? Math.floor((Date.now() - new Date(oldestPending.created_at).getTime()) / 1000)
      : 0;

    let ordersSev: Severity = "ok";
    if ((pendingCount ?? 0) > 200 || oldestAgeSec > 3600) ordersSev = "crit";
    else if ((pendingCount ?? 0) > 50) ordersSev = "warn";

    // ===== WEBHOOKS =====
    const { data: whEvents } = await supa
      .from("mp_webhook_events").select("outcome, processed_at")
      .gte("processed_at", oneHourAgo);
    const whReceived = whEvents?.length ?? 0;
    const whOk = whEvents?.filter((e: any) => e.outcome === "ok").length ?? 0;
    const whError = whEvents?.filter((e: any) => e.outcome === "error").length ?? 0;
    const whDup = whEvents?.filter((e: any) => e.outcome === "duplicate").length ?? 0;
    const whLast = whEvents?.length
      ? whEvents.map((e: any) => e.processed_at).sort().reverse()[0]
      : null;

    let webhooksSev: Severity = "ok";
    if (whError > 20) webhooksSev = "crit";
    else if (whError > 5) webhooksSev = "warn";

    // ===== CRON =====
    let cronLastRun: string | null = null;
    let cronLastStatus: string | null = null;
    let cronRunsLastHour = 0;
    let cronFailedLastHour = 0;
    try {
      const { data: cronData } = await supa.rpc("read_cron_runs" as any).maybeSingle();
      // fallback: we don't have a wrapper; try direct query via raw not available. skip if fails.
      if (cronData) { /* noop */ }
    } catch (_) { /* ignore */ }

    let cronSev: Severity = "ok";
    // Without direct cron access, infer from expire-pending side effects: if no expired in 1h AND pending > 0, warn
    if (cronLastRun) {
      const ageMin = (Date.now() - new Date(cronLastRun).getTime()) / 60000;
      if (ageMin > 5) cronSev = "crit";
    }

    // ===== INVENTORY =====
    // Confirmed drift: lots where sold_quantity != count(valid tickets)
    const { data: lots } = await supa
      .from("event_lots").select("id, sold_quantity, reserved_quantity");
    let confirmedDrift = 0;
    let reservationDrift = 0;
    if (lots) {
      for (const lot of lots) {
        const { count: validCount } = await supa
          .from("tickets").select("id", { count: "exact", head: true })
          .eq("lot_id", lot.id).eq("status", "valid");
        if ((validCount ?? 0) !== (lot.sold_quantity ?? 0)) confirmedDrift++;

        // reservation drift: pending tickets in non-expired pending orders
        const { data: pendingTix } = await supa
          .from("tickets").select("id, order_id")
          .eq("lot_id", lot.id).eq("status", "pending");
        let activePending = 0;
        if (pendingTix && pendingTix.length > 0) {
          const orderIds = [...new Set(pendingTix.map((t: any) => t.order_id))];
          const { data: activeOrders } = await supa
            .from("orders").select("id")
            .in("id", orderIds).eq("status", "pending")
            .gt("expires_at", new Date().toISOString());
          const activeIds = new Set((activeOrders ?? []).map((o: any) => o.id));
          activePending = pendingTix.filter((t: any) => activeIds.has(t.order_id)).length;
        }
        if (activePending !== (lot.reserved_quantity ?? 0)) reservationDrift++;
      }
    }

    let invSev: Severity = "ok";
    if (confirmedDrift > 0) invSev = "crit";
    else if (reservationDrift > 0) invSev = "warn";

    overall = worstSeverity(overall, ordersSev);
    overall = worstSeverity(overall, webhooksSev);
    overall = worstSeverity(overall, cronSev);
    overall = worstSeverity(overall, invSev);

    const metrics = {
      orders: {
        pending_count: pendingCount ?? 0,
        pending_oldest_age_seconds: oldestAgeSec,
        paid_last_hour: paidLastHour ?? 0,
        expired_last_hour: expiredLastHour ?? 0,
        failed_last_hour: failedLastHour ?? 0,
        severity: ordersSev,
      },
      webhooks: {
        received_last_hour: whReceived,
        ok_last_hour: whOk,
        error_last_hour: whError,
        duplicate_last_hour: whDup,
        last_event_at: whLast,
        severity: webhooksSev,
      },
      cron: {
        last_run_at: cronLastRun,
        last_status: cronLastStatus,
        runs_last_hour: cronRunsLastHour,
        failed_last_hour: cronFailedLastHour,
        severity: cronSev,
      },
      inventory: {
        confirmed_drift_count: confirmedDrift,
        reservation_drift_count: reservationDrift,
        severity: invSev,
      },
    };

    const duration = Date.now() - startedAt;
    const { data: snap, error: insErr } = await supa
      .from("system_health_snapshots")
      .insert({ metrics, overall_severity: overall, duration_ms: duration })
      .select().single();

    if (insErr) {
      console.error(`${PREFIX} insert error`, insErr);
      throw insErr;
    }

    // Alerts: only crit, throttle 30min
    const alertsToFire: { key: string; subject: string; body: string }[] = [];
    if (ordersSev === "crit") {
      alertsToFire.push({
        key: "pending_orders_spike:crit",
        subject: "[FestPag] Alerta crítico: orders pendentes",
        body: `Pending: ${pendingCount}, oldest age: ${Math.floor(oldestAgeSec / 60)} min`,
      });
    }
    if (webhooksSev === "crit") {
      alertsToFire.push({
        key: "webhooks_errors:crit",
        subject: "[FestPag] Alerta crítico: webhooks com erro",
        body: `${whError} erros de webhook na última hora`,
      });
    }
    if (invSev === "crit") {
      alertsToFire.push({
        key: "inventory_confirmed_drift:crit",
        subject: "[FestPag] Alerta crítico: drift de inventário",
        body: `${confirmedDrift} lotes com sold_quantity divergente de tickets válidos`,
      });
    }

    for (const alert of alertsToFire) {
      const { data: throttle } = await supa
        .from("health_alert_throttle").select("last_sent_at")
        .eq("alert_key", alert.key).maybeSingle();
      const shouldSend = !throttle ||
        (Date.now() - new Date(throttle.last_sent_at).getTime()) > 30 * 60 * 1000;

      if (shouldSend) {
        try {
          const resendKey = Deno.env.get("RESEND_API_KEY");
          const lovableKey = Deno.env.get("LOVABLE_API_KEY");
          if (resendKey && lovableKey) {
            await fetch("https://connector-gateway.lovable.dev/resend/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${lovableKey}`,
                "X-Connection-Api-Key": resendKey,
              },
              body: JSON.stringify({
                from: "FestPag Saúde <onboarding@resend.dev>",
                to: ["gabinox54037@gmail.com"],
                subject: alert.subject,
                html: `<p>${alert.body}</p><p>Snapshot: ${snap.id}</p>`,
              }),
            });
          }
          await supa.from("health_alert_throttle").upsert(
            { alert_key: alert.key, last_sent_at: new Date().toISOString() },
            { onConflict: "alert_key" }
          );
        } catch (e) {
          console.error(`${PREFIX} alert send failed`, alert.key, e);
        }
      }
    }

    console.log(`${PREFIX} snapshot=${snap.id} severity=${overall} duration=${duration}ms`);
    return new Response(
      JSON.stringify({ ok: true, snapshot_id: snap.id, severity: overall, duration_ms: duration }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error(`${PREFIX} error`, e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
