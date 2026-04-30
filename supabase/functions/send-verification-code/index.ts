import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  email: string;
  name: string;
  cpf: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, name, cpf }: RequestBody = await req.json();
    
    if (!email) {
      throw new Error("Email is required");
    }

    console.log("[SEND-CODE] Generating code for:", email);

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Delete any existing codes for this email
    await supabase
      .from("email_verification_codes")
      .delete()
      .eq("email", email);

    // Insert new code
    const { error: insertError } = await supabase
      .from("email_verification_codes")
      .insert({
        email,
        code,
        name,
        cpf,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("[SEND-CODE] Insert error:", insertError);
      throw new Error("Failed to store verification code");
    }

    console.log("[SEND-CODE] Code stored, sending email...");

    // Send email with code
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    
    const { error: emailError } = await resend.emails.send({
      from: "FestPag <naoresponda@festpag.com.br>",
      to: [email],
      subject: `${code} é o seu código de verificação - FestPag`,
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

          <h2 style="color: #1f2937;">Olá, ${name}!</h2>

          <p style="color: #4b5563; font-size: 16px;">
            Use o código acima para concluir a sua compra com segurança.
          </p>

          <p style="color: #6b7280; font-size: 14px;">
            Este código expira em <strong>10 minutos</strong>.
          </p>

          <p style="color: #6b7280; font-size: 14px;">
            Se você não solicitou este código, ignore este email.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} FestPag. Todos os direitos reservados.
          </p>
        </div>
      `,
    });

    if (emailError) {
      console.error("[SEND-CODE] Email error:", emailError);
      throw new Error("Failed to send verification email");
    }

    console.log("[SEND-CODE] Email sent successfully");

    return new Response(
      JSON.stringify({ success: true, message: "Código enviado com sucesso" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[SEND-CODE] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
