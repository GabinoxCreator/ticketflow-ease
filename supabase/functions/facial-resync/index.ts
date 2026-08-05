// Edge: facial-resync
// Reenvia pro Marcel as faciais que ficaram pendentes — perfis com foto no bucket
// (`facial_photo_path`) e sem carimbo de sincronia (`facial_synced_at` nulo).
//
// Existem porque o push do cadastro é BEST-EFFORT: a `facial-enroll` grava a foto
// e o consentimento e segue mesmo se o Marcel estiver fora, sem secret ou recusando.
// Esta função é a segunda tentativa, administrativa e idempotente — reprocessar um
// perfil já sincronizado é no-op (ele nem entra na lista de pendentes).
//
// O push é o MESMO helper da facial-enroll (_shared/marcelFace.ts): mesma URL,
// mesma x-api-key, mesmo timeout, mesma leitura de resposta. Não existe segunda
// implementação do push.
//
// Auth: verify_jwt=false (chamada administrativa server-to-server), em troca exige
// x-api-key == FACIAL_RESYNC_KEY. Sem o secret no ambiente, recusa tudo.
//
// LGPD: CPF e e-mail entram no payload do push, mas NUNCA saem na resposta nem no
// log — resultado é por user_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { pushToMarcelSafe } from "../_shared/marcelFace.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BUCKET = "facial-photos";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type PendingProfile = {
  id: string;
  cpf: string | null;
  email: string | null;
  whatsapp: string | null;
  facial_photo_path: string;
};

// Bytes -> base64 puro. Em blocos porque String.fromCharCode(...arr) com centenas
// de milhares de argumentos estoura a pilha (foto de 1 MB faz isso).
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    // ---------- 1. Auth: x-api-key vs secret em env (fail-closed) ----------
    const secret = Deno.env.get("FACIAL_RESYNC_KEY");
    if (!secret) {
      console.error("[FACIAL-RESYNC] FACIAL_RESYNC_KEY ausente — recusando");
      return json({ error: "service_unavailable" }, 500);
    }
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey || apiKey !== secret) {
      return json({ error: "unauthorized" }, 401);
    }

    // ---------- 2. Input (tudo opcional) ----------
    // Body ausente/inválido é tratado como {} — chamada sem corpo é o caso comum
    // (reprocessar o lote seguinte).
    const body = (await req.json().catch(() => ({}))) as { user_id?: unknown; limit?: unknown };

    let userId: string | null = null;
    if (body?.user_id !== undefined && body?.user_id !== null && body?.user_id !== "") {
      if (typeof body.user_id !== "string" || !UUID_RE.test(body.user_id)) {
        return json({ error: "invalid_request", message: "user_id inválido" }, 400);
      }
      userId = body.user_id;
    }

    let limit = DEFAULT_LIMIT;
    if (body?.limit !== undefined && body?.limit !== null) {
      const n = Number(body.limit);
      if (!Number.isFinite(n) || n < 1) {
        return json({ error: "invalid_request", message: "limit inválido" }, 400);
      }
      limit = Math.min(Math.floor(n), MAX_LIMIT);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---------- 3. Pendentes ----------
    // Critério de pendência: TEM foto e NÃO tem carimbo de sincronia. Com user_id,
    // o mesmo critério — pedir resync de quem já sincronizou devolve lista vazia.
    // Ordem por consentimento mais antigo: quem esperou mais vai primeiro.
    let query = admin
      .from("profiles")
      .select("id, cpf, email, whatsapp, facial_photo_path")
      .not("facial_photo_path", "is", null)
      .is("facial_synced_at", null)
      .order("facial_consent_at", { ascending: true })
      .limit(limit);
    if (userId) query = query.eq("id", userId);

    const { data: rows, error: listErr } = await query;
    if (listErr) {
      console.error("[FACIAL-RESYNC] listagem falhou:", listErr.message);
      return json({ error: "internal_error" }, 500);
    }

    const pending = (rows ?? []) as PendingProfile[];
    const results: Array<{ user_id: string; synced: boolean; reason?: string }> = [];

    // ---------- 4. Processamento SEQUENCIAL ----------
    // Um de cada vez, de propósito: em paralelo isso vira um martelo na Cloud
    // Function do Marcel. Falha de UM perfil nunca aborta o lote.
    for (const profile of pending) {
      const uid = profile.id;

      // 4.1 baixa a foto do bucket privado
      const { data: blob, error: dlErr } = await admin.storage
        .from(BUCKET)
        .download(profile.facial_photo_path);
      if (dlErr || !blob) {
        // Foto sumiu do bucket (apagada, path errado): registra e segue.
        console.warn("[FACIAL-RESYNC] download falhou", { uid, error: dlErr?.message });
        results.push({ user_id: uid, synced: false, reason: "photo_unavailable" });
        continue;
      }

      let imageBase64: string;
      try {
        imageBase64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
      } catch (err) {
        console.warn("[FACIAL-RESYNC] leitura da foto falhou", {
          uid,
          error: err instanceof Error ? err.message : String(err),
        });
        results.push({ user_id: uid, synced: false, reason: "photo_unreadable" });
        continue;
      }

      // 4.2 push (mesmo helper da facial-enroll; nunca lança)
      const push = await pushToMarcelSafe(
        {
          uid,
          cpf: profile.cpf,
          email: profile.email,
          telefone: profile.whatsapp,
          imageBase64,
        },
        "FACIAL-RESYNC",
      );

      if (!push.ok) {
        results.push({ user_id: uid, synced: false, ...(push.reason ? { reason: push.reason } : {}) });
        continue;
      }

      // 4.3 carimbo de sincronia
      const { error: updErr } = await admin
        .from("profiles")
        .update({ facial_synced_at: new Date().toISOString() })
        .eq("id", uid);
      if (updErr) {
        // Push deu certo mas o carimbo não: o perfil continua pendente e cai no
        // próximo lote. Reenviar de novo é inofensivo (o Marcel regrava o mesmo uid).
        console.error("[FACIAL-RESYNC] carimbo facial_synced_at falhou", { uid, error: updErr.message });
        results.push({ user_id: uid, synced: false, reason: "stamp_failed" });
        continue;
      }

      results.push({ user_id: uid, synced: true });
    }

    const synced = results.filter((r) => r.synced).length;
    console.log("[FACIAL-RESYNC] lote concluído", {
      processed: results.length,
      synced,
      failed: results.length - synced,
      scoped_to_user: !!userId,
    });

    return json({
      processed: results.length,
      synced,
      failed: results.length - synced,
      results,
    });
  } catch (error) {
    console.error("[FACIAL-RESYNC] error:", error);
    return json({ error: "internal_error" }, 500);
  }
});
