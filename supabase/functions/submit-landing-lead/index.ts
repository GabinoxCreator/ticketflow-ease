import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { z } from "https://esm.sh/zod@3.23.8";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  nome: z.string().trim().min(2).max(120),
  cidade: z.string().trim().min(2).max(120),
  tipo_evento: z.string().trim().min(1).max(80),
  telefone: z.string().trim().min(8).max(40),
});

const NOTIFY_TO = ["gabinox54037@gmail.com"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "invalid_input", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { nome, cidade, tipo_evento, telefone } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Rate limit per IP
    const ip = getClientIp(req);
    const rl = await checkRateLimit(supabase, `lead:ip:${ip}`, 5, 600, 1800);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const { data: lead, error: insertErr } = await supabase
      .from("landing_leads")
      .insert({ nome, cidade, tipo_evento, telefone })
      .select()
      .single();

    if (insertErr) {
      console.error("[submit-landing-lead] insert error", insertErr);
      return new Response(JSON.stringify({ error: "insert_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Notify team via Resend (non-blocking failure)
    try {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (resendKey) {
        const resend = new Resend(resendKey);
        const html = `
          <div style="font-family:Arial,sans-serif;color:#111;">
            <h2 style="color:#6B5CF0;margin:0 0 12px;">Novo lead FestPag</h2>
            <p><strong>Nome:</strong> ${escapeHtml(nome)}</p>
            <p><strong>Cidade:</strong> ${escapeHtml(cidade)}</p>
            <p><strong>Tipo de evento:</strong> ${escapeHtml(tipo_evento)}</p>
            <p><strong>Telefone:</strong> ${escapeHtml(telefone)}</p>
            <hr/>
            <p style="font-size:12px;color:#666;">Recebido em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
          </div>
        `;
        await resend.emails.send({
          from: "FestPag <naoresponda@festpag.com.br>",
          to: NOTIFY_TO,
          subject: `Novo lead FestPag — ${nome}, ${cidade}`,
          html,
        });
      } else {
        console.warn("[submit-landing-lead] RESEND_API_KEY not configured, skipping notification");
      }
    } catch (mailErr) {
      console.error("[submit-landing-lead] mail error", mailErr);
    }

    return new Response(JSON.stringify({ ok: true, id: lead.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[submit-landing-lead] error", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
