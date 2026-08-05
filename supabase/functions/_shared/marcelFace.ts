// Push da foto facial pra API de reconhecimento do Marcel.
//
// ÚNICA implementação do push — usada por `facial-enroll` (no cadastro) e por
// `facial-resync` (reenvio dos pendentes). Não criar uma segunda: URL, chave,
// timeout e leitura da resposta têm que ser os mesmos nos dois caminhos, senão
// um deles diverge em silêncio.
//
// Secrets: MARCEL_FACE_URL (endpoint) e MARCEL_FACE_KEY (header x-api-key).

// Push externo não pode segurar quem chamou (no cadastro, é gente esperando).
export const MARCEL_TIMEOUT_MS = 8000;

export interface MarcelFacePayload {
  uid: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  imageBase64: string; // base64 PURO, sem prefixo data-URI
}

export interface MarcelPushResult {
  ok: boolean;
  // slug curto do motivo da recusa (ex.: 'no_face'), quando a API informa
  reason?: string;
}

// Extrai SÓ o campo `error` da resposta do Marcel (slug curto tipo 'no_face').
// Nunca o corpo inteiro: a resposta pode ecoar o payload (CPF, e-mail, telefone).
// O corte em 40 chars é cinto de segurança — se um dia vier texto livre no lugar
// do slug, não vaza parágrafo nenhum pro log nem pro front.
export function extractReason(data: unknown): string | undefined {
  const err = (data as { error?: unknown } | null)?.error;
  if (typeof err !== "string" || err.length === 0) return undefined;
  return err.slice(0, 40);
}

// Push best-effort: NUNCA lança — todo caminho de erro vira console.warn +
// { ok: false }. A API aceita base64 sem prefixo data-URI e CPF com ou sem
// máscara, então mandamos os valores como estão no perfil.
// `logTag` é só o prefixo do log, pra cada edge se identificar.
export async function pushToMarcelSafe(
  payload: MarcelFacePayload,
  logTag = "MARCEL-FACE",
): Promise<MarcelPushResult> {
  const url = Deno.env.get("MARCEL_FACE_URL");
  if (!url) {
    console.warn(`[${logTag}] MARCEL_FACE_URL ausente — push pulado`, { uid: payload.uid });
    return { ok: false };
  }
  // A API autentica por header x-api-key. Sem a key o push só tomaria 401, então
  // nem tentamos — mesmo tratamento da URL ausente (avisa e segue).
  const apiKey = Deno.env.get("MARCEL_FACE_KEY");
  if (!apiKey) {
    console.warn(`[${logTag}] MARCEL_FACE_KEY ausente — push pulado`, { uid: payload.uid });
    return { ok: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MARCEL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    // Corpo lido só pra extrair o slug de erro (extractReason descarta o resto).
    const data = await res.json().catch(() => null);
    const reason = extractReason(data);

    if (res.status !== 200) {
      console.warn(`[${logTag}] Marcel HTTP != 200`, {
        uid: payload.uid,
        status: res.status,
        reason,
      });
      return { ok: false, reason };
    }
    if ((data as { ok?: unknown } | null)?.ok !== true) {
      console.warn(`[${logTag}] Marcel respondeu ok != true`, { uid: payload.uid, reason });
      return { ok: false, reason };
    }
    return { ok: true };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    console.warn(`[${logTag}] Marcel ${aborted ? "timeout" : "falhou"}`, {
      uid: payload.uid,
      timeout_ms: aborted ? MARCEL_TIMEOUT_MS : undefined,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}
