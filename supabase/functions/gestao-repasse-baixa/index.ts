// Edge: gestao-repasse-baixa
// A porta da gestão interna (festpag-admin-hub) para dar a BAIXA de um repasse do
// produtor (OS-344). Irmã da `gestao-reembolso-baixa` (OS-112), no mesmo molde.
//
// Decisão do Gabriel (caixinha de 28/10/2026): o João paga o repasse do produtor pela
// gestão, numa tela só com os fechamentos do totem, e marca pago lá, com o comprovante,
// sem conta no admin do site. Esta porta só sabe fazer UMA coisa: marcar um pedido de
// repasse `requested` como `paid`, guardando o comprovante (obrigatório) e quem deu a
// baixa. Não cria pedido, não muda valor, não escreve em `notes` (o produtor lê esse
// campo). A leitura continua na `gestao-sales-export`, que segue só leitura.
//
// Quando a conta PIX mudou desde o último pagamento ou o titular não é a produtora, a
// baixa exige um motivo escrito ("pagar mesmo assim", decisão do Gabriel na mesma
// caixinha). A conferência é refeita no banco (`gestao_payout_dar_baixa`), com a linha
// travada: a tela pode estar velha.
//
// Autenticação: header x-service-token com o secret GESTAO_BAIXA_TOKEN, o mesmo da baixa
// do reembolso, que só as edges de baixa da gestão conhecem. Quem pode dar baixa (João e
// Gabriel) é conferido lá, no usuário logado da gestão, antes de chamar; aqui chega o
// nome de quem foi.
//
// Ordem: confere o pedido, sobe o comprovante no cofre `payout-proofs` (o mesmo que a
// tela do admin usa, na pasta do pedido) e só então grava a baixa, numa função só. Se a
// gravação falhar ou for recusada, o arquivo é apagado: não fica comprovante solto de
// baixa que não aconteceu.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-service-token",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const fail = (stage: string, error: string, status: number) =>
  json({ success: false, stage, error }, status);

// Comprovante de PIX ou TED: print ou PDF. 5 MB sobra.
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

  const payoutId = String(body?.payout_id ?? "");
  const quem = String(body?.quem ?? "").trim();
  const motivo = body?.motivo ? String(body.motivo).slice(0, 500) : null;
  const tipo = String(body?.comprovante?.tipo ?? "").toLowerCase();
  if (!UUID.test(payoutId)) return fail("input", "payout_id_invalido", 400);
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
    // Confere antes de subir o arquivo: pedido que não está esperando nem gasta storage.
    const { data: p, error: pErr } = await admin
      .from("payouts").select("id, status").eq("id", payoutId).maybeSingle();
    if (pErr) return fail("payout", pErr.message, 500);
    if (!p) return json({ ok: false, error: "payout_not_found" }, 404);
    if (p.status !== "requested") return json({ ok: false, error: "invalid_status", current_status: p.status }, 409);

    // Mesma pasta da tela do admin (`<payout_id>/`), com "gestao" no nome para saber a origem.
    const nome = nomeLimpo(String(body?.comprovante?.nome ?? `comprovante.${TIPOS[tipo]}`));
    const path = `${payoutId}/${Date.now()}-gestao-${nome}`;
    const up = await admin.storage.from("payout-proofs").upload(path, bytes, { contentType: tipo, upsert: false });
    if (up.error) return fail("upload", up.error.message, 500);

    const { data, error } = await admin.rpc("gestao_payout_dar_baixa", {
      p_payout_id: payoutId,
      p_quem: quem,
      p_comprovante_path: path,
      p_motivo: motivo,
    });
    if (error || !data?.ok) {
      await admin.storage.from("payout-proofs").remove([path]);
      if (error) return fail("baixa", error.message, 500);
      return json(data, data?.error === "invalid_status" ? 409 : 400);
    }
    console.log("[GESTAO-REPASSE-BAIXA]", JSON.stringify({ payout_id: payoutId, ok: true, com_motivo: Boolean(motivo) }));
    return json({ ...data, comprovante_path: path });
  } catch (e) {
    console.error("[GESTAO-REPASSE-BAIXA]", e instanceof Error ? e.message : e);
    return fail("internal", "internal", 500);
  }
});
