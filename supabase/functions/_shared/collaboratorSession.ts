// Shared collaborator session validation.
// Uses SHA-256 (fast, deterministic, no WASM) and falls back to legacy bcrypt
// hashes with transparent auto-upgrade. This eliminates the intermittent
// bcrypt.compareSync failures on Deno that were causing "random" logouts.

// Switched from deno.land/x/bcrypt to npm:bcryptjs — the deno.land host was
// timing out during edge-function bundling, blocking all deploys. bcryptjs
// exposes the same compareSync(password, hash) signature, so verification of
// legacy bcrypt hashes is unchanged.
import bcrypt from "npm:bcryptjs@2.4.3";
const { compareSync } = bcrypt;

export type SessionValidation =
  | { valid: true }
  | { valid: false; expired: true; error: string }
  | { valid: false; transient: true; error: string };

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Colaborador desativado perde o acesso na hora (OS-105, 02/10/2026): a sessão
// dura 24h, então sem esta conferência quem já estava logado seguia vendendo e
// validando depois de desativado. Só roda DEPOIS do token conferido, para não
// contar a quem não tem sessão se um colaborador está ativo. Mesma regra do
// login (`is_active = true`); linha apagada conta como desativado.
// Nunca lança: erro de banco vira transient (503), que recusa sem deslogar.
async function ensureCollaboratorActive(
  supabase: any,
  collaboratorId: string,
): Promise<SessionValidation> {
  try {
    const { data: collaborator, error } = await supabase
      .from("collaborators")
      .select("is_active")
      .eq("id", collaboratorId)
      .maybeSingle();

    if (error) {
      return { valid: false, transient: true, error: error.message || "DB error" };
    }
    if (!collaborator || collaborator.is_active !== true) {
      return { valid: false, expired: true, error: "Acesso desativado. Fale com o produtor do evento." };
    }
    return { valid: true };
  } catch (_e) {
    return { valid: false, transient: true, error: "Erro temporário ao verificar sessão" };
  }
}

export async function validateCollaboratorSession(
  supabase: any,
  collaboratorId: string,
  sessionToken: string | undefined | null,
): Promise<SessionValidation> {
  if (!sessionToken) {
    return { valid: false, expired: true, error: "Token de sessão não fornecido" };
  }

  const { data: session, error: queryError } = await supabase
    .from("collaborator_sessions")
    .select("session_token_hash, expires_at")
    .eq("collaborator_id", collaboratorId)
    .maybeSingle();

  if (queryError) {
    // DB hiccup — do NOT log the user out for this.
    return { valid: false, transient: true, error: queryError.message || "DB error" };
  }
  if (!session) {
    return { valid: false, expired: true, error: "Sessão não encontrada. Faça login novamente." };
  }
  if (new Date(session.expires_at) < new Date()) {
    return { valid: false, expired: true, error: "Sessão expirada. Faça login novamente." };
  }

  const stored: string = session.session_token_hash;

  // New format: SHA-256 hex (64 lowercase hex chars).
  if (/^[0-9a-f]{64}$/.test(stored)) {
    const incoming = await hashToken(sessionToken);
    if (incoming === stored) return await ensureCollaboratorActive(supabase, collaboratorId);
    return { valid: false, expired: true, error: "Token de sessão inválido. Faça login novamente." };
  }

  // Legacy bcrypt hash — verify, then upgrade to SHA-256 silently.
  try {
    if (compareSync(sessionToken, stored)) {
      try {
        const upgraded = await hashToken(sessionToken);
        await supabase
          .from("collaborator_sessions")
          .update({ session_token_hash: upgraded })
          .eq("collaborator_id", collaboratorId);
      } catch (_e) {
        // Upgrade failure is not fatal; session still valid for this request.
      }
      return await ensureCollaboratorActive(supabase, collaboratorId);
    }
    return { valid: false, expired: true, error: "Token de sessão inválido. Faça login novamente." };
  } catch (_e) {
    // bcrypt WASM failure — treat as transient so we don't kick the user out.
    return { valid: false, transient: true, error: "Erro temporário ao verificar sessão" };
  }
}

/**
 * Convert a SessionValidation result to a Response. Functions can call this
 * directly when validation fails:
 *   const sv = await validateCollaboratorSession(...);
 *   if (!sv.valid) return sessionErrorResponse(sv, corsHeaders);
 */
export function sessionErrorResponse(
  sv: Exclude<SessionValidation, { valid: true }>,
  corsHeaders: Record<string, string>,
): Response {
  if ("transient" in sv) {
    return new Response(
      JSON.stringify({ error: sv.error, retry: true }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  return new Response(
    JSON.stringify({ error: sv.error, session_expired: true }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
