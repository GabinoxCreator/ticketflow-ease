// facial-enroll — captura da foto facial no cadastro (FestPay, biometria 1:1).
// Dado biométrico = dado pessoal SENSÍVEL (LGPD art. 11): a foto vai só para o
// bucket PRIVADO `facial-photos`, nunca para uma coluna/URL pública, e o path é
// sempre derivado do id do TOKEN (nunca do body) — ninguém sobrescreve a foto de
// terceiro. `facial_consent_at` registra o momento do consentimento específico.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BUCKET = "facial-photos";
const MAX_BYTES = 1024 * 1024; // 1 MB decodificado

// Decodifica base64 puro (sem prefixo data-URI). Retorna null se não decodificar.
function decodeBase64(input: string): Uint8Array | null {
  try {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch (_) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    // PASSO 1 — sessão do cliente (o alvo é sempre o dono do token).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "Não autenticado" }, 401);
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (userErr || !caller) return json({ success: false, error: "Sessão inválida" }, 401);

    // PASSO 2 — payload.
    let body: { photo_base64?: unknown };
    try {
      body = await req.json();
    } catch (_) {
      return json({ success: false, error: "Corpo da requisição inválido (JSON esperado)" }, 400);
    }
    const photoBase64 = body?.photo_base64;
    if (typeof photoBase64 !== "string" || photoBase64.length === 0) {
      return json({ success: false, error: "photo_base64 obrigatório (string base64 pura)" }, 400);
    }
    // Base64 puro: prefixo data-URI é rejeitado explicitamente (contrato do endpoint).
    if (photoBase64.startsWith("data:")) {
      return json({ success: false, error: "photo_base64 deve ser base64 puro, sem prefixo data-URI" }, 400);
    }

    const bytes = decodeBase64(photoBase64);
    if (!bytes) return json({ success: false, error: "photo_base64 não é base64 válido" }, 400);
    if (bytes.length === 0) return json({ success: false, error: "Imagem vazia" }, 400);
    if (bytes.length > MAX_BYTES) {
      return json({ success: false, error: "Imagem maior que o limite de 1 MB" }, 400);
    }
    // Magic bytes de JPEG (FF D8) — não aceitamos outro formato.
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      return json({ success: false, error: "Imagem deve ser JPEG" }, 400);
    }

    const uid = caller.id;
    const path = `${uid}.jpg`;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // PASSO 3 — grava no bucket privado (upsert: recaptura substitui a anterior).
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (upErr) {
      console.error("[FACIAL-ENROLL] storage upload error:", upErr.message);
      return json({ success: false, error: "Falha ao armazenar a foto" }, 500);
    }

    // PASSO 4 — vincula ao perfil + carimba o consentimento.
    const { error: profErr } = await admin
      .from("profiles")
      .update({ facial_photo_path: path, facial_consent_at: new Date().toISOString() })
      .eq("id", uid);
    if (profErr) {
      console.error("[FACIAL-ENROLL] profile update error:", profErr.message);
      return json({ success: false, error: "Falha ao atualizar o perfil" }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error("[FACIAL-ENROLL] unexpected:", err instanceof Error ? err.message : String(err));
    return json({ success: false, error: "Erro inesperado" }, 500);
  }
});
