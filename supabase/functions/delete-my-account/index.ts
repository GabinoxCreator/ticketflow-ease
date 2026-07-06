// delete-my-account — direito de eliminação do titular (LGPD art. 18).
// Só o PRÓPRIO usuário logado se exclui: o alvo é o id do token (nunca do body),
// então ninguém apaga conta de terceiro. Respeita o princípio "pedido nunca é
// apagado": orders/tickets NÃO são deletados — são ANONIMIZADOS (perde-se o
// vínculo e a PII, mantém-se o registro contábil/fiscal, cuja base legal é
// obrigação legal, não consentimento). Ordem importa: anonimiza ANTES de apagar
// o auth user, pra um eventual ON DELETE CASCADE não levar o pedido junto.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { maskEmail } from "../_shared/pii.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

    // Identifica o caller pelo token (alvo da exclusão = ele mesmo).
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (userErr || !caller) return json({ error: "Sessão inválida" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const uid = caller.id;
    // Placeholder determinístico: some com a PII, mantém a linha rastreável por id.
    const anonTag = `[conta removida ${uid.slice(0, 8)}]`;

    // 1) Anonimiza pedidos (NOT NULL name/email → placeholder; resto → null).
    const { error: ordErr } = await admin
      .from("orders")
      .update({
        user_id: null,
        customer_name: anonTag,
        customer_email: `removido+${uid}@festpag.invalid`,
        customer_phone: null,
        customer_cpf: null,
      })
      .eq("user_id", uid);
    if (ordErr) {
      console.error("[DELETE-ACCOUNT] orders anon error:", ordErr.message);
      return json({ error: "Falha ao anonimizar pedidos" }, 500);
    }

    // 2) Anonimiza ingressos (holder_name NOT NULL → placeholder).
    const { error: tkErr } = await admin
      .from("tickets")
      .update({
        user_id: null,
        holder_name: anonTag,
        holder_email: null,
        holder_phone: null,
      })
      .eq("user_id", uid);
    if (tkErr) {
      console.error("[DELETE-ACCOUNT] tickets anon error:", tkErr.message);
      return json({ error: "Falha ao anonimizar ingressos" }, 500);
    }

    // 3) Auditoria ANTES de destruir o vínculo (o ator é o próprio titular).
    await admin.from("audit_logs").insert({
      actor_id: uid,
      action: "account_deleted_by_owner",
      target_type: "user",
      target_id: uid,
      metadata: { email_masked: maskEmail(caller.email), at: new Date().toISOString() },
    }).then(({ error }) => { if (error) console.error("[DELETE-ACCOUNT] audit warn:", error.message); });

    // 4) Apaga o perfil (PII do titular).
    const { error: profErr } = await admin.from("profiles").delete().eq("id", uid);
    if (profErr) {
      console.error("[DELETE-ACCOUNT] profile delete error:", profErr.message);
      return json({ error: "Falha ao remover perfil" }, 500);
    }

    // 5) Apaga o usuário de auth (login). Feito por último: se cascatear, os
    //    pedidos/ingressos já estão anonimizados (não perdem o registro).
    const { error: authDelErr } = await admin.auth.admin.deleteUser(uid);
    if (authDelErr) {
      console.error("[DELETE-ACCOUNT] auth delete error:", authDelErr.message);
      return json({ error: "Falha ao remover login" }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    console.error("[DELETE-ACCOUNT] unexpected:", err instanceof Error ? err.message : String(err));
    return json({ error: "Erro inesperado" }, 500);
  }
});
