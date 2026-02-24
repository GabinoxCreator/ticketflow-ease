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
      from: "IngressosRP <contato@ingressosrp.com.br>",
      to: [email],
      subject: "Seu código de verificação - IngressosRP",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #7c3aed; margin: 0;">IngressosRP</h1>
          </div>
          
          <h2 style="color: #1f2937;">Olá, ${name}!</h2>
          
          <p style="color: #4b5563; font-size: 16px;">
            Seu código de verificação para concluir a compra é:
          </p>
          
          <div style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: white;">
              ${code}
            </span>
          </div>
          
          <p style="color: #6b7280; font-size: 14px;">
            Este código expira em <strong>10 minutos</strong>.
          </p>
          
          <p style="color: #6b7280; font-size: 14px;">
            Se você não solicitou este código, ignore este email.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} IngressosRP. Todos os direitos reservados.
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
