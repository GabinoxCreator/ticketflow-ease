// Edge: facial-limpar-orfas (OS-198, 08/10/2026)
// Apaga do bucket privado `facial-photos` a foto de quem NÃO tem mais conta.
//
// Por que existe: até a OS-198 a `delete-my-account` apagava o perfil e o login
// mas deixava a foto (dado biométrico, LGPD art. 11) no cofre. E conta apagada
// pelo painel do banco nunca passa pela edge. Achado da OS-194: 5 fotos órfãs.
// Daqui para frente o botão "excluir minha conta" já apaga a foto; esta função
// é a limpeza À MÃO do que sobrou (o Gabriel decidiu em 08/10 não agendar).
//
// Órfã = arquivo `<uuid>.jpg` cujo uuid NÃO tem login (auth) E NÃO tem perfil.
// Qualquer dúvida (erro ao conferir, nome fora do padrão) = não apaga.
//
// Por padrão SÓ LISTA. Para apagar: { "apagar": true, "nomes": ["<uuid>.jpg", ...] }.
// Apaga só os nomes pedidos que estiverem confirmados como órfãos nesta mesma
// chamada; o resto volta em `recusados`. Apaga pela API de storage (DELETE em
// storage.objects tira a linha e deixa o arquivo).
//
// Auth: verify_jwt=false (chamada administrativa de dentro do banco), em troca
// exige X-Cron-Secret == CRON_SECRET do Vault (get_cron_secret), fail-closed.
// Mesmo padrão da facial-resync. A resposta leva só nome de arquivo e data,
// nunca dado da pessoa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BUCKET = "facial-photos";
const NOME_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jpg$/i;
const PAGINA = 1000;
// Teto por chamada: uma chamada errada não varre o cofre inteiro de uma vez.
const MAX_APAGAR = 50;
const SYSTEM_ACTOR = "95628c4a-8040-44ed-83c5-d6a5b8793926";

type Arquivo = { nome: string; criado_em: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---------- 1. Auth: X-Cron-Secret (Vault), fail-closed ----------
    const cronFornecido = req.headers.get("x-cron-secret");
    let autorizado = false;
    if (cronFornecido) {
      try {
        const { data: doVault } = await admin.rpc("get_cron_secret");
        autorizado = !!doVault && cronFornecido === doVault;
      } catch { /* fica não autorizado */ }
    }
    if (!autorizado) return json({ error: "unauthorized" }, 401);

    // ---------- 2. Input ----------
    const body = (await req.json().catch(() => ({}))) as { apagar?: unknown; nomes?: unknown };
    const apagar = body?.apagar === true;
    let pedidos: string[] = [];
    if (apagar) {
      if (!Array.isArray(body.nomes) || body.nomes.length === 0) {
        return json({ error: "invalid_request", message: "para apagar, informe nomes" }, 400);
      }
      if (body.nomes.some((n) => typeof n !== "string" || !NOME_RE.test(n))) {
        return json({ error: "invalid_request", message: "nome fora do padrão <uuid>.jpg" }, 400);
      }
      pedidos = [...new Set(body.nomes as string[])];
      if (pedidos.length > MAX_APAGAR) {
        return json({ error: "invalid_request", message: `no máximo ${MAX_APAGAR} por chamada` }, 400);
      }
    }

    // ---------- 3. Tudo o que está no cofre ----------
    const arquivos: Arquivo[] = [];
    for (let offset = 0; ; offset += PAGINA) {
      const { data, error } = await admin.storage.from(BUCKET).list("", {
        limit: PAGINA,
        offset,
        sortBy: { column: "created_at", order: "asc" },
      });
      if (error) {
        console.error("[FACIAL-ORFAS] listagem falhou:", error.message);
        return json({ error: "internal_error" }, 500);
      }
      for (const o of data ?? []) {
        // Pasta (id nulo) não é foto; o padrão do cofre é tudo na raiz.
        if (o.id) arquivos.push({ nome: o.name, criado_em: o.created_at ?? null });
      }
      if ((data?.length ?? 0) < PAGINA) break;
    }

    // ---------- 4. Conferir dono de cada foto ----------
    const comPadrao = arquivos.filter((a) => NOME_RE.test(a.nome));
    const foraDoPadrao = arquivos.filter((a) => !NOME_RE.test(a.nome)).map((a) => a.nome);
    const uids = comPadrao.map((a) => a.nome.match(NOME_RE)![1].toLowerCase());

    const { data: perfis, error: perfisErr } = await admin.from("profiles").select("id").in("id", uids);
    if (perfisErr) {
      console.error("[FACIAL-ORFAS] leitura de perfis falhou:", perfisErr.message);
      return json({ error: "internal_error" }, 500);
    }
    const comPerfil = new Set((perfis ?? []).map((p: { id: string }) => p.id.toLowerCase()));

    const orfas: Arquivo[] = [];
    const naoConferidas: string[] = [];
    let comDono = 0;
    for (const a of comPadrao) {
      const uid = a.nome.match(NOME_RE)![1].toLowerCase();
      if (comPerfil.has(uid)) { comDono++; continue; }
      const { data: u, error: uErr } = await admin.auth.admin.getUserById(uid);
      if (!uErr && u?.user) { comDono++; continue; }
      // Só "não encontrado" prova que a conta não existe; outro erro = na dúvida, fica.
      if (uErr && (uErr as { status?: number }).status !== 404) {
        console.warn("[FACIAL-ORFAS] conferência do login falhou", { arquivo: a.nome, status: (uErr as { status?: number }).status });
        naoConferidas.push(a.nome);
        continue;
      }
      orfas.push(a);
    }

    // ---------- 5. Só listar (padrão) ----------
    if (!apagar) {
      return json({
        modo: "lista",
        total_no_cofre: arquivos.length,
        com_dono: comDono,
        orfas,
        nao_conferidas: naoConferidas,
        fora_do_padrao: foraDoPadrao,
      });
    }

    // ---------- 6. Apagar só os pedidos que são órfãos confirmados ----------
    const nomesOrfas = new Set(orfas.map((o) => o.nome.toLowerCase()));
    const aApagar = pedidos.filter((n) => nomesOrfas.has(n.toLowerCase()));
    const recusados = pedidos.filter((n) => !nomesOrfas.has(n.toLowerCase()));

    let apagados: string[] = [];
    if (aApagar.length > 0) {
      const { data: removidos, error: rmErr } = await admin.storage.from(BUCKET).remove(aApagar);
      if (rmErr) {
        console.error("[FACIAL-ORFAS] remoção falhou:", rmErr.message);
        return json({ error: "internal_error" }, 500);
      }
      apagados = (removidos ?? []).map((r: { name: string }) => r.name);
    }

    await admin.from("audit_logs").insert({
      actor_id: SYSTEM_ACTOR,
      action: "facial_photo_orphan_removed",
      target_type: "storage",
      target_id: null,
      metadata: { bucket: BUCKET, apagados, recusados, ordem: "OS-198" },
    }).then(({ error }) => { if (error) console.error("[FACIAL-ORFAS] audit warn:", error.message); });

    console.log("[FACIAL-ORFAS] limpeza", { apagados: apagados.length, recusados: recusados.length });
    return json({ modo: "apagar", apagados, recusados });
  } catch (error) {
    console.error("[FACIAL-ORFAS] error:", error instanceof Error ? error.message : String(error));
    return json({ error: "internal_error" }, 500);
  }
});
