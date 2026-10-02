// Edge: gestao-reembolso-baixa
// A ÚNICA porta de escrita da gestão interna (festpag-admin-hub) neste projeto (OS-112).
//
// Decisão do Gabriel (02/10/2026): o João dá a baixa do reembolso na própria gestão, sem
// conta no site. Esta porta só sabe fazer uma coisa: marcar um reembolso `aprovado` como
// `pago`, guardando o comprovante (obrigatório) e quem deu a baixa. Não aprova, não recusa,
// não mexe em pedido nem em ingresso. A leitura continua na `gestao-sales-export`, que segue
// só leitura: por isso esta é uma função separada, com segredo próprio.
//
// Autenticação: header x-service-token com o secret GESTAO_BAIXA_TOKEN, que só a edge
// `ingressos-baixa` da gestão conhece. Quem pode dar baixa (João e Gabriel) é conferido
// lá, no usuário logado da gestão, antes de chamar; aqui chega o nome de quem foi.
//
// Ordem: sobe o comprovante no cofre `payout-proofs` (o mesmo que a tela do site usa) e só
// então grava a baixa, numa função só (`gestao_reembolso_dar_baixa`). Se a gravação falhar,
// o arquivo é apagado: não fica comprovante solto de baixa que não aconteceu.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-service-token",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const fail = (stage: string, error: string, status: number) =>
  json({ success: false, stage, error }, status);

// Comprovante de PIX ou de estorno: print ou PDF. 5 MB sobra para os dois.
const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS: Record<string, string> = {
  "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  "image/heic": "heic", "image/heif": "heif",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nomeLimpo(nome: string) {
  const base = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
  return base.replace(/^-+|-+$/g, "").slice(-80) || "comprovante";
}

function deBase64(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64.replace(/^data:[^,]*,/, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expected = Deno.env.get("GESTAO_BAIXA_TOKEN");
  if (!expected) return fail("auth", "service_token_not_configured", 503);
  if (req.headers.get("x-service-token") !== expected) return fail("auth", "unauthorized", 401);
  if (req.method !== "POST") return fail("input", "method_not_allowed", 405);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return fail("input", "corpo_invalido", 400); }

  const reembolsoId = String(body?.reembolso_id ?? "");
  const quem = String(body?.quem ?? "").trim();
  const observacao = body?.observacao ? String(body.observacao) : null;
  const tipo = String(body?.comprovante?.tipo ?? "").toLowerCase();
  if (!UUID.test(reembolsoId)) return fail("input", "reembolso_id_invalido", 400);
  if (!quem) return fail("input", "quem_obrigatorio", 400);
  if (!TIPOS[tipo]) return fail("input", "tipo_de_arquivo_nao_aceito", 400);
  const bytes = deBase64(String(body?.comprovante?.base64 ?? ""));
  if (!bytes || bytes.length === 0) return fail("input", "comprovante_obrigatorio", 400);
  if (bytes.length > MAX_BYTES) return fail("input", "arquivo_grande_demais", 413);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    // Confere antes de subir o arquivo: reembolso que não está aprovado nem gasta storage.
    const { data: r, error: rErr } = await admin
      .from("reembolsos").select("id, status").eq("id", reembolsoId).maybeSingle();
    if (rErr) return fail("reembolso", rErr.message, 500);
    if (!r) return json({ ok: false, error: "reembolso_nao_encontrado" }, 404);
    if (r.status !== "aprovado") return json({ ok: false, error: "invalid_status", current_status: r.status }, 409);

    // Mesma pasta da tela do site (`reembolsos/<id>/`), com "gestao" no nome para saber a origem.
    const nome = nomeLimpo(String(body?.comprovante?.nome ?? `comprovante.${TIPOS[tipo]}`));
    const path = `reembolsos/${reembolsoId}/${Date.now()}-gestao-${nome}`;
    const up = await admin.storage.from("payout-proofs").upload(path, bytes, { contentType: tipo, upsert: false });
    if (up.error) return fail("upload", up.error.message, 500);

    const { data, error } = await admin.rpc("gestao_reembolso_dar_baixa", {
      p_reembolso_id: reembolsoId,
      p_quem: quem,
      p_comprovante_path: path,
      p_observacao: observacao,
    });
    if (error || !data?.ok) {
      await admin.storage.from("payout-proofs").remove([path]);
      if (error) return fail("baixa", error.message, 500);
      return json(data, data?.error === "invalid_status" ? 409 : 400);
    }
    return json({ ...data, comprovante_path: path });
  } catch (e) {
    console.error("[GESTAO-REEMBOLSO-BAIXA]", e instanceof Error ? e.message : e);
    return fail("internal", "internal", 500);
  }
});
