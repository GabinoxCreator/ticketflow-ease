// redeploy 2026-08-12 — hardening: rate-limit fail-closed na verificação do OTP
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { maskEmail } from "../_shared/pii.ts";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  email: string;
  code: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, code }: RequestBody = await req.json();
    
    if (!email || !code) {
      throw new Error("Email and code are required");
    }

    console.log("[VERIFY-CODE] Verifying code for:", maskEmail(email));

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Rate limit fail-closed — mesmo padrão do verify-password-reset-code:
    // bloqueio por email APAGA os códigos pendentes (o código morre no lockout).
    // O bucket usa email normalizado; a busca abaixo segue com o email cru,
    // igual ao que o send-verification-code grava.
    const ip = getClientIp(req);
    const normalizedEmail = email.trim().toLowerCase();
    const rlEmail = await checkRateLimit(supabase, `otp-verify:signup:email:${normalizedEmail}`, 5, 900, 1800);
    if (!rlEmail.allowed) {
      if (!rlEmail.unavailable) {
        await supabase
          .from("email_verification_codes")
          .delete()
          .eq("email", email)
          .eq("verified", false);
        console.log("[VERIFY-CODE] Lockout: pending codes invalidated for", maskEmail(email));
      }
      return rateLimitResponse(rlEmail, corsHeaders);
    }
    const rlIp = await checkRateLimit(supabase, `otp-verify:signup:ip:${ip}`, 20, 900, 1800);
    if (!rlIp.allowed) return rateLimitResponse(rlIp, corsHeaders);

    // Find the verification code
    const { data: verificationData, error: fetchError } = await supabase
      .from("email_verification_codes")
      .select("*")
      .eq("email", email)
      .eq("code", code)
      .eq("verified", false)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (fetchError || !verificationData) {
      console.log("[VERIFY-CODE] Invalid or expired code");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Código inválido ou expirado" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Mark as verified
    await supabase
      .from("email_verification_codes")
      .update({ verified: true })
      .eq("id", verificationData.id);

    console.log("[VERIFY-CODE] Code verified successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Email verificado com sucesso",
        data: {
          email: verificationData.email,
          name: verificationData.name,
          cpf: verificationData.cpf,
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[VERIFY-CODE] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
