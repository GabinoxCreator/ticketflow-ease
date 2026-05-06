import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  email: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email }: RequestBody = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log("[SEND-RESET] Request for:", normalizedEmail);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Rate limit
    const ip = getClientIp(req);
    const rlEmail = await checkRateLimit(supabase, `otp:email:${normalizedEmail}`, 3, 900, 1800);
    if (!rlEmail.allowed) return rateLimitResponse(rlEmail.retryAfter, corsHeaders);
    const rlIp = await checkRateLimit(supabase, `otp:ip:${ip}`, 10, 900, 1800);
    if (!rlIp.allowed) return rateLimitResponse(rlIp.retryAfter, corsHeaders);

    // Verifica se o usuário existe (sem revelar para o cliente)
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error("[SEND-RESET] listUsers error:", listError);
      // Por segurança, retorna sucesso mesmo em erro interno
      return new Response(
        JSON.stringify({ success: true, message: "Se o email existir, um código foi enviado." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const userExists = usersData.users.some(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    if (!userExists) {
      console.log("[SEND-RESET] User not found, returning generic success");
      // NÃO revela que o usuário não existe (anti-enumeração)
      return new Response(
        JSON.stringify({ success: true, message: "Se o email existir, um código foi enviado." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Gera código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    // Apaga códigos anteriores do mesmo email
    await supabase
      .from("password_reset_codes")
      .delete()
      .eq("email", normalizedEmail);

    // Insere novo código
    const { error: insertError } = await supabase
      .from("password_reset_codes")
      .insert({
        email: normalizedEmail,
        code,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("[SEND-RESET] Insert error:", insertError);
      throw new Error("Failed to store reset code");
    }

    console.log("[SEND-RESET] Code stored, sending email...");

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    const { error: emailError } = await resend.emails.send({
      from: "FestPag <naoresponda@festpag.com.br>",
      to: [normalizedEmail],
      subject: `${code} é o seu código para redefinir a senha - FestPag`,
      html: `
        <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:transparent;opacity:0;">
          Seu código FestPag: ${code} (expira em 10 minutos)
        </div>

        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="https://festpag.com.br/logo-festpag.png" alt="FestPag" width="160" style="display:inline-block; max-width:160px; height:auto;" />
          </div>

          <div style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); border-radius: 12px; padding: 30px; text-align: center; margin: 0 0 30px 0;">
            <p style="margin: 0 0 8px 0; color: rgba(255,255,255,0.85); font-size: 13px; letter-spacing: 2px; text-transform: uppercase;">
              Seu código
            </p>
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: white;">
              ${code}
            </span>
          </div>

          <h2 style="color: #1f2937;">Redefinição de senha</h2>

          <p style="color: #4b5563; font-size: 16px;">
            Recebemos uma solicitação para redefinir a senha da sua conta.
            Use o código acima para criar uma nova senha.
          </p>

          <p style="color: #6b7280; font-size: 14px;">
            Este código expira em <strong>10 minutos</strong>.
          </p>

          <p style="color: #6b7280; font-size: 14px;">
            Se você <strong>não solicitou</strong> a redefinição de senha, ignore este email — sua senha continuará a mesma.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} FestPag. Todos os direitos reservados.
          </p>
        </div>
      `,
    });

    if (emailError) {
      console.error("[SEND-RESET] Email error:", emailError);
      throw new Error("Failed to send reset email");
    }

    console.log("[SEND-RESET] Email sent successfully");

    return new Response(
      JSON.stringify({ success: true, message: "Se o email existir, um código foi enviado." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("[SEND-RESET] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
