import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// ============================================================
// festcash-push-facial — o lado do SITE da ponte com a carteira.
//
// Lê a foto facial que já está no nosso cofre privado e a empurra para o
// FestCashless, que a indexa na coleção consultada pelo totem.
//
// POR QUE PRECISA EXISTIR: hoje a foto do cadastro vai para o cofre e para a
// API do parceiro — e mais nada. Quem se cadastra aqui não é reconhecido no
// totem, o que parece defeito e é desenho. Esta função fecha isso.
//
// Serve para os dois casos:
//   - uma pessoa (`profile_id`), chamada no cadastro;
//   - um lote (`profile_ids`), para quem já tinha foto antes da ponte existir.
//
// A foto NÃO é devolvida a ninguém: ela sai do cofre, atravessa em memória e
// vai direto para a carteira. Nunca vira URL, nunca entra em resposta.
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-secret",
};

const BUCKET = "facial-photos";

// Teto do lote. Não é limitação técnica — é para uma chamada errada não
// varrer a base inteira de uma vez, e para o resultado caber numa leitura
// humana.
const MAX_LOTE = 50;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function secretMatches(received: string | null, expected: string): boolean {
  if (!received || received.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < received.length; i++) diff |= received.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const log = (step: string, d?: unknown) =>
  console.log(`[FESTCASH-PUSH-FACIAL] ${step}${d ? ` - ${JSON.stringify(d)}` : ""}`);

/** Base64 sem estourar a pilha com imagem grande (apply tem limite de args). */
function toBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const linkSecret = Deno.env.get("FESTPAG_FESTPAY_LINK_SECRET");
  const festcashUrl = Deno.env.get("FESTCASH_BASE_URL");
  if (!linkSecret || !festcashUrl) {
    return json({ ok: false, error: "Ponte não configurada" }, 500);
  }

  // Esta função lê biometria de qualquer pessoa da base: não é do cliente.
  // Quem chama é operação ou rotina, com o mesmo segredo da federação.
  if (!secretMatches(req.headers.get("x-admin-secret"), linkSecret)) {
    return json({ ok: false, error: "Não autorizado" }, 401);
  }

  let body: { profile_id?: string; profile_ids?: string[]; overwrite?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "JSON inválido" }, 400);
  }

  const ids = body.profile_id ? [body.profile_id] : (body.profile_ids ?? []);
  if (ids.length === 0) return json({ ok: false, error: "Informe profile_id ou profile_ids" }, 400);
  if (ids.length > MAX_LOTE) return json({ ok: false, error: `Máximo ${MAX_LOTE} por vez` }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: perfis, error: perfilErr } = await supabase
    .from("profiles")
    .select("id, cpf, facial_photo_path, facial_consent_at")
    .in("id", ids);

  if (perfilErr) {
    log("profiles query failed", { code: perfilErr.code });
    return json({ ok: false, error: "Falha ao ler perfis" }, 500);
  }

  const resultados: Array<Record<string, unknown>> = [];

  for (const p of perfis ?? []) {
    const marcador = { profile_id: p.id };

    // Sem consentimento registrado não passamos a foto adiante. É a única
    // trava que importa aqui: a pessoa autorizou a captura, e é esse registro
    // que prova.
    if (!p.facial_consent_at) {
      resultados.push({ ...marcador, ok: false, motivo: "sem_consentimento" });
      continue;
    }
    if (!p.facial_photo_path) {
      resultados.push({ ...marcador, ok: false, motivo: "sem_foto" });
      continue;
    }
    if (!p.cpf) {
      // Sem CPF não há como saber de quem é a carteira do outro lado.
      resultados.push({ ...marcador, ok: false, motivo: "sem_cpf" });
      continue;
    }

    const { data: arquivo, error: downErr } = await supabase.storage
      .from(BUCKET)
      .download(p.facial_photo_path);

    if (downErr || !arquivo) {
      resultados.push({ ...marcador, ok: false, motivo: "foto_nao_encontrada" });
      continue;
    }

    const base64 = toBase64(new Uint8Array(await arquivo.arrayBuffer()));

    try {
      const resp = await fetch(
        `${festcashUrl.replace(/\/$/, "")}/functions/v1/enroll-from-ingressos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-link-secret": linkSecret },
          body: JSON.stringify({
            cpf: p.cpf,
            image_base64: base64,
            overwrite: body.overwrite === true,
          }),
        },
      );
      const out = await resp.json();
      resultados.push({ ...marcador, ...out });
    } catch (_) {
      resultados.push({ ...marcador, ok: false, motivo: "festcash_inacessivel" });
    }
  }

  const enviados = resultados.filter((r) => r.ok).length;
  log("done", { pedidos: ids.length, enviados });

  return json({ ok: true, total: ids.length, enviados, resultados });
});
