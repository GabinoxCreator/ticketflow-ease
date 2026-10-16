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
// A assinatura de cada foto do cadastro é preparada ANTES, pelo modo
// `preparar` (uma foto por chamada, tarefa do banco a cada 2 minutos), e
// guardada em `facial_descriptors` (128 números, nunca a imagem). Na porta só
// se compara. Calcular várias fotos na hora passava do limite da função.
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

// deno-lint-ignore no-explicit-any
type Supa = any;

/** Prepara a assinatura de UMA foto do cadastro facial que ainda não tem. */
async function prepararUma(supabase: Supa): Promise<Response> {
  const t0 = Date.now();
  const { data, error } = await supabase.rpc("checkin_rostos_a_preparar", { _modelo: MODELO_ROSTO, _limite: 1 });
  if (error) {
    log("prepare list failed", { code: error.code });
    return json({ ok: false, reason: "lookup_failed" }, 503);
  }
  const alvo = ((data ?? []) as { profile_id: string; photo_path: string; pendentes: number }[])[0];
  if (!alvo) return json({ ok: true, preparadas: 0, pendentes: 0 });

  const falhou = async (motivo: string) => {
    await supabase.from("facial_descriptor_falhas").upsert({
      profile_id: alvo.profile_id,
      photo_path: alvo.photo_path,
      motivo,
      created_at: new Date().toISOString(),
    });
    log("prepare failed", { motivo, ms: Date.now() - t0 });
    return json({ ok: true, preparadas: 0, falhou: motivo, pendentes: Number(alvo.pendentes) - 1 });
  };

  const { data: foto, error: dlErr } = await supabase.storage.from(BUCKET).download(alvo.photo_path);
  if (dlErr || !foto) return await falhou("foto_nao_baixou");

  const assinatura = await assinaturaDaFoto(new Uint8Array(await foto.arrayBuffer()));
  if (!assinatura.ok) {
    // Motor fora do ar não é culpa da foto: não marca falha, tenta na próxima.
    if (assinatura.reason === "engine_failed") return json({ ok: false, reason: "search_failed" }, 502);
    return await falhou(assinatura.reason);
  }

  const { error: upErr } = await supabase.from("facial_descriptors").upsert({
    profile_id: alvo.profile_id,
    photo_path: alvo.photo_path,
    modelo: MODELO_ROSTO,
    descritor: assinatura.descritor,
    created_at: new Date().toISOString(),
  });
  if (upErr) {
    log("descriptor save failed", { code: upErr.code });
    return json({ ok: false, reason: "save_failed" }, 500);
  }
  log("prepared", { ms: Date.now() - t0, pendentes: Number(alvo.pendentes) - 1 });
  return json({ ok: true, preparadas: 1, pendentes: Number(alvo.pendentes) - 1, ms: Date.now() - t0 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // ---------- 1. Entrada ----------
  let body: { image_base64?: unknown; event_id?: unknown; preparar?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---------- modo preparar: UMA foto do cadastro vira assinatura ----------
  // Chamado pela tarefa do banco a cada 2 minutos. Não recebe nem devolve
  // nada pessoal (só contagens), por isso não pede chave.
  if (body.preparar === true) return await prepararUma(supabase);

  // ---------- 2. Auth (fail-closed) ----------
  const chave = Deno.env.get("TOTEM_CHECKIN_KEY");
  if (!chave) {
    console.error("[FACIAL-CHECKIN-ROSTO] TOTEM_CHECKIN_KEY ausente, recusando");
    return json({ error: "service_unavailable" }, 500);
  }
  if (!secretMatches(req.headers.get("x-api-key"), chave)) return json({ error: "unauthorized" }, 401);

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

  // As fotos do cadastro sem assinatura ficam de fora desta vez: quem prepara
  // é o modo `preparar` (uma por chamada). Calcular várias aqui passava do
  // limite de processamento da função (16/10, primeiro teste no totem).
  const pendentes = candidatos.filter((c) => !c.descritor).length;

  // ---------- 6. Comparar ----------
  const ranking = candidatos
    .filter((c) => c.descritor)
    .map((c) => ({ c, d: distancia(capturado.descritor, c.descritor!) }))
    .sort((a, b) => a.d - b.d);

  // Log de calibração: só números, nunca nome nem CPF.
  log("match", {
    candidatos: candidatos.length,
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
