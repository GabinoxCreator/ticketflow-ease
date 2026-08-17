// Edge: debug-env — TEMPORÁRIA E DESCARTÁVEL (17/08/2026).
//
// Motivo: o valor de MARCEL_PIX_BASE (URL do provedor de pagamento do Marcel,
// usado na Confra do Bem) só existe como secret no ambiente das edges. O CLI do
// Supabase mostra apenas o hash. Esta função lê o env e devolve o valor UMA vez,
// para conferência — e é APAGADA logo em seguida.
//
// Segurança:
// - Allowlist fixa: só URLs de serviço do Marcel. Nunca devolve chave, token,
//   service role, senha ou qualquer secret de credencial.
// - Exige header x-debug-key com o token abaixo (gerado aleatório, vive minutos).
// - verify_jwt=false (chamada server-to-server), a auth é o header.
//
// ⚠️ NÃO deixar esta função no ar. Deletar após o uso.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-debug-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Token descartável — a função é deletada depois da leitura.
const DEBUG_KEY = "139cb6b428e1f5cbcfa14694a6148eae33c1be6f0afecba6";

// Só nomes de ENDPOINT (URL). Nada de key/token/secret entra nesta lista.
const ALLOWED = ["MARCEL_PIX_BASE", "MARCEL_FACE_URL", "MARCEL_CPF_BASE"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const key = req.headers.get("x-debug-key");
  if (!key || key !== DEBUG_KEY) return json({ error: "unauthorized" }, 401);

  const out: Record<string, string | null> = {};
  for (const name of ALLOWED) {
    out[name] = Deno.env.get(name) ?? null;
  }

  return json({ ok: true, env: out });
});
