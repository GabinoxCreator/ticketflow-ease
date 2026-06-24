import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  email: string;
  code: string;
  newPassword: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, code, newPassword }: RequestBody = await req.json();

    if (!email || !code || !newPassword) {
      return new Response(
        JSON.stringify({ success: false, error: "Email, código e nova senha são obrigatórios" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({ success: false, error: "A senha deve ter no mínimo 6 caracteres" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log("[VERIFY-RESET] Verifying code for:", normalizedEmail);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Localiza código válido
    const { data: codeData, error: fetchError } = await supabase
      .from("password_reset_codes")
      .select("*")
      .eq("email", normalizedEmail)
      .eq("code", code)
      .eq("verified", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (fetchError || !codeData) {
      console.log("[VERIFY-RESET] Invalid or expired code");
      return new Response(
        JSON.stringify({ success: false, error: "Código inválido ou expirado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Localiza o usuário pelo email. listUsers é paginado (default 50/página);
    // iteramos até achar ou esgotar as páginas — senão contas além da 1ª página
    // falham na troca de senha mesmo com código válido.
    let user: { id: string } | null = null;
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data: usersData, error: listError } = await supabase.auth.admin.listUsers({ page, perPage });
      if (listError) {
        console.error("[VERIFY-RESET] listUsers error:", listError);
        throw new Error("Failed to find user");
      }
      const found = usersData.users.find((u) => u.email?.toLowerCase() === normalizedEmail);
      if (found) { user = found; break; }
      if (usersData.users.length < perPage) break; // última página
      page++;
    }

    if (!user) {
      console.log("[VERIFY-RESET] User not found");
      return new Response(
        JSON.stringify({ success: false, error: "Usuário não encontrado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Atualiza a senha
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error("[VERIFY-RESET] updateUserById error:", updateError);
      throw new Error("Failed to update password");
    }

    // Marca código como usado
    await supabase
      .from("password_reset_codes")
      .update({ verified: true })
      .eq("id", codeData.id);

    console.log("[VERIFY-RESET] Password updated successfully");

    return new Response(
      JSON.stringify({ success: true, message: "Senha atualizada com sucesso" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("[VERIFY-RESET] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
