import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { assinaturaDaFoto, bytesDaFoto, MODELO_ROSTO } from "../_shared/reconhecimento.ts";

// ============================================================
// facial-checkin-rosto — DE QUEM é este rosto, na portaria do NOSSO totem.
// OS-246, 16/10/2026.
//
// Decisão do Gabriel em 16/10: a portaria passa a ser só a nossa, com
// facial, usando a foto que a pessoa já mandou no cadastro facial do site
// (*"no cadastro a gente pega a facial da pessoa, podemos usar para o
// check-in"*). Até aqui essa foto ia só para a portaria do Marcel, e o
// nosso totem procurava o rosto na carteira FaceCashless, que quase
// ninguém tem.
//
// O que esta edge faz, e só isto:
//   1. tira a assinatura do rosto da foto que o totem mandou (o mesmo
//      reconhecimento NOSSO da carteira, OS-194: modelo aberto, sem empresa
//      de fora; ver `_shared/reconhecimento.ts`);
//   2. compara SÓ com quem tem ingresso válido num evento com a entrada
//      aberta agora (`checkin_rostos_candidatos`). Nunca contra a base
//      inteira: é o que o advogado pediu no parecer de 02/10;
//   3. devolve o CPF de quem é, para o SERVIDOR do totem (`totem-checkin`),
//      que mostra só o primeiro nome na tela e pede o "Sou eu". Quem queima o
//      ingresso continua sendo a `facial-checkin`, pelo CPF, no 2º passo.
//
// A assinatura da foto do cadastro é calculada aqui na primeira vez que ela
// é precisa e guardada em `facial_descriptors` (128 números, nunca a
// imagem). As fotos do cadastro não passam por aqui de novo depois disso.
// A foto que o totem manda vive só nesta chamada: não vai para banco,
// storage nem log.
//
// AUTENTICAÇÃO: só a chave do NOSSO totem (`TOTEM_CHECKIN_KEY`, a mesma que
// a `facial-checkin` aceita). A chave do Marcel não abre esta porta: ela
// devolve CPF a partir de um rosto, e isso é só nosso.
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const log = (step: string, d?: Record<string, unknown>) =>
  console.log(`[FACIAL-CHECKIN-ROSTO] ${step}${d ? ` - ${JSON.stringify(d)}` : ""}`);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = "facial-photos";

// Mesmos cortes da carteira (`merchant-resolve`), que já reconhecem no totem.
// Distância entre assinaturas: menor = mais parecido.
const FACE_MAX_DISTANCE = 0.45;
// Outra pessoa quase tão perto quanto a melhor = não dá para saber quem é.
const AMBIGUITY_MARGIN = 0.05;

// Tempo máximo gasto calculando assinaturas de fotos do cadastro que ainda
// não tinham (a primeira pessoa da noite paga esse custo; as seguintes não).
// O que não couber fica para a próxima chamada.
const ORCAMENTO_INDEXAR_MS = 9000;

type Candidato = {
  profile_id: string;
  cpf: string;
  nome: string | null;
  photo_path: string;
  descritor: number[] | null;
};

function secretMatches(received: string | null, expected: string): boolean {
  if (!received || received.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < received.length; i++) diff |= received.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function distancia(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

function primeiroNome(nome: string | null): string {
  const p = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // ---------- 1. Auth (fail-closed) ----------
  const chave = Deno.env.get("TOTEM_CHECKIN_KEY");
  if (!chave) {
    console.error("[FACIAL-CHECKIN-ROSTO] TOTEM_CHECKIN_KEY ausente, recusando");
    return json({ error: "service_unavailable" }, 500);
  }
  if (!secretMatches(req.headers.get("x-api-key"), chave)) return json({ error: "unauthorized" }, 401);

  // ---------- 2. Entrada ----------
  let body: { image_base64?: unknown; event_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const bytes = typeof body.image_base64 === "string" ? bytesDaFoto(body.image_base64) : null;
  if (!bytes) return json({ ok: false, reason: "invalid_image" }, 400);

  let eventId: string | null = null;
  if (body.event_id !== undefined && body.event_id !== null && body.event_id !== "") {
    if (typeof body.event_id !== "string" || !UUID_RE.test(body.event_id)) {
      return json({ error: "invalid_request", message: "event_id inválido" }, 400);
    }
    eventId = body.event_id;
  }

  const t0 = Date.now();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---------- 3. O rosto da foto do totem ----------
  const capturado = await assinaturaDaFoto(bytes);
  if (!capturado.ok) {
    if (capturado.reason === "engine_failed") return json({ ok: false, reason: "search_failed" }, 502);
    if (capturado.reason === "invalid_image") return json({ ok: false, reason: "invalid_image" }, 400);
    return json({ ok: false, reason: "no_face" });
  }

  // ---------- 4. Quem pode ser, agora ----------
  const { data: rows, error: candErr } = await supabase.rpc("checkin_rostos_candidatos", {
    _modelo: MODELO_ROSTO,
    _event_id: eventId,
  });
  if (candErr) {
    log("candidates failed", { code: candErr.code });
    return json({ ok: false, reason: "lookup_failed" }, 503);
  }
  const candidatos = ((rows ?? []) as Candidato[]).map((c) => ({
    ...c,
    descritor: c.descritor ? c.descritor.map(Number) : null,
  }));

  // ---------- 5. Assinatura das fotos do cadastro que ainda não tinham ----------
  let indexados = 0;
  let semRosto = 0;
  for (const c of candidatos) {
    if (c.descritor) continue;
    if (Date.now() - t0 > ORCAMENTO_INDEXAR_MS) break;
    const { data: foto, error: dlErr } = await supabase.storage.from(BUCKET).download(c.photo_path);
    if (dlErr || !foto) {
      log("photo download failed", { code: (dlErr as { statusCode?: string } | null)?.statusCode ?? null });
      continue;
    }
    const assinatura = await assinaturaDaFoto(new Uint8Array(await foto.arrayBuffer()));
    if (!assinatura.ok) {
      if (assinatura.reason === "engine_failed") break;
      semRosto++;
      continue;
    }
    c.descritor = assinatura.descritor;
    indexados++;
    const { error: upErr } = await supabase.from("facial_descriptors").upsert({
      profile_id: c.profile_id,
      photo_path: c.photo_path,
      modelo: MODELO_ROSTO,
      descritor: assinatura.descritor,
      created_at: new Date().toISOString(),
    });
    if (upErr) log("descriptor save failed", { code: upErr.code });
  }
  const pendentes = candidatos.filter((c) => !c.descritor).length;

  // ---------- 6. Comparar ----------
  const ranking = candidatos
    .filter((c) => c.descritor)
    .map((c) => ({ c, d: distancia(capturado.descritor, c.descritor!) }))
    .sort((a, b) => a.d - b.d);

  // Log de calibração: só números, nunca nome nem CPF.
  log("match", {
    candidatos: candidatos.length,
    indexados_agora: indexados,
    fotos_sem_rosto: semRosto,
    pendentes,
    melhores: ranking.slice(0, 3).map((r) => Number(r.d.toFixed(3))),
    ms: Date.now() - t0,
  });

  const melhor = ranking[0];
  if (!melhor || melhor.d > FACE_MAX_DISTANCE) {
    return json({
      ok: false,
      reason: "face_not_found",
      pendentes,
      debug_best_distance: melhor ? Number(melhor.d.toFixed(3)) : null,
    });
  }

  const rival = ranking.find((r) => r.c.cpf !== melhor.c.cpf && r.d <= melhor.d + AMBIGUITY_MARGIN);
  if (rival) {
    log("ambiguous, refusing", { distances: [melhor.d, rival.d].map((d) => Number(d.toFixed(3))) });
    return json({ ok: false, reason: "ambiguous" });
  }

  return json({
    ok: true,
    cpf: melhor.c.cpf,
    first_name: primeiroNome(melhor.c.nome),
    similarity: Number(Math.max(0, 100 * (1 - melhor.d)).toFixed(1)),
  });
});
