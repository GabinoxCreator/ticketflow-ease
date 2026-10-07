// Edge: catraca-consulta
// Consulta SÓ DE LEITURA que a catraca com facial do Marcel faz antes e durante a
// portaria: para um evento, quem tem ingresso, quantos, CPF, nome e se a pessoa
// já tem facial cadastrada. Nasceu em 07/10/2026 (OS-176), para a apresentação do
// ecossistema: a `facial-checkin` responde uma pessoa por vez E já dá baixa no
// ingresso; faltava olhar sem queimar.
//
// NUNCA escreve: nenhum UPDATE, INSERT ou RPC que mude estado. Quem dá baixa
// continua sendo só a `facial-checkin` (e as portas do colaborador e do parceiro).
//
// Mesmo critério da `facial-checkin`, para as duas portas nunca discordarem:
// ingresso conta pelo `orders.customer_cpf` (dígitos) de pedido `paid`, status
// `valid` ou `used`; ingresso com reembolso em análise não conta como válido (o
// banco recusa a baixa dele).
//
// Auth: verify_jwt=false (quem chama é o servidor do Marcel, sem sessão Supabase),
// em troca exige x-api-key == MARCEL_CHECKIN_KEY, a mesma chave da portaria dele.
// Só a dele: a chave do nosso totem (TOTEM_CHECKIN_KEY) não lista ninguém. Sem o
// secret no ambiente, recusa tudo (fail-closed).
//
// LGPD: devolve só o necessário para a catraca (CPF, nome, contagem e se tem
// facial); nunca foto, e-mail ou telefone. Lista sempre presa a UM evento. O CPF
// nunca sai no log (só a contagem).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unformatCPF, validateCPF } from "../_shared/cpf.ts";
import { maskCpf } from "../_shared/pii.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGINA = 1000; // limite de linhas por leitura do PostgREST
const LOTE_IN = 150; // ids por filtro .in(), para a URL não estourar

type TicketRow = {
  id: string;
  status: string;
  created_at: string;
  orders: { customer_cpf: string | null; customer_name: string | null; user_id: string | null } | null;
};

type Pessoa = {
  cpf: string;
  nome: string | null;
  ingressos_validos: number;
  ingressos_usados: number;
  ingressos_em_reembolso: number;
  tem_facial: boolean;
  facial_enviada_ao_marcel: boolean;
};

function emLotes<T>(lista: T[], tamanho = LOTE_IN): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    // ---------- 1. Auth: x-api-key vs secret em env (fail-closed) ----------
    const chave = Deno.env.get("MARCEL_CHECKIN_KEY");
    if (!chave) {
      console.error("[CATRACA-CONSULTA] MARCEL_CHECKIN_KEY ausente — recusando");
      return json({ error: "service_unavailable" }, 500);
    }
    if (req.headers.get("x-api-key") !== chave) {
      return json({ error: "unauthorized" }, 401);
    }

    // ---------- 2. Input ----------
    let body: { event_id?: unknown; cpf?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_body" }, 400);
    }

    const eventId = typeof body?.event_id === "string" ? body.event_id : "";
    if (!UUID_RE.test(eventId)) {
      return json({ error: "invalid_request", message: "event_id obrigatório (uuid)" }, 400);
    }

    let cpfFiltro: string | null = null;
    if (body?.cpf !== undefined && body?.cpf !== null && body?.cpf !== "") {
      const digitos = unformatCPF(typeof body.cpf === "string" ? body.cpf : "");
      if (!validateCPF(digitos)) {
        return json({ error: "invalid_request", message: "cpf inválido" }, 400);
      }
      cpfFiltro = digitos;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---------- 3. Evento e janela de check-in ----------
    const { data: evento, error: eventoErr } = await supabase
      .from("events")
      .select("id, title, date, time")
      .eq("id", eventId)
      .maybeSingle();
    if (eventoErr) {
      console.error("[CATRACA-CONSULTA] evento", { event_id: eventId, error: eventoErr });
      return json({ error: "internal_error" }, 503);
    }
    if (!evento) return json({ error: "event_not_found" }, 404);

    // Só informa: a consulta responde com a janela aberta ou fechada (a catraca
    // pode puxar a lista na véspera). Quem barra fora da janela é a facial-checkin.
    const { data: janelaRows } = await supabase.rpc("is_event_checkin_open", { _event_id: eventId });
    const janela = Array.isArray(janelaRows) ? janelaRows[0] : janelaRows;

    // ---------- 4. Ingressos do evento (paginado) ----------
    const tickets: TicketRow[] = [];
    for (let de = 0; ; de += PAGINA) {
      let q = supabase
        .from("tickets")
        .select("id, status, created_at, orders!inner(customer_cpf, customer_name, user_id, status)")
        .eq("event_id", eventId)
        .in("status", ["valid", "used"])
        .eq("orders.status", "paid")
        .order("id", { ascending: true })
        .range(de, de + PAGINA - 1);
      if (cpfFiltro) q = q.eq("orders.customer_cpf", cpfFiltro);
      const { data, error } = await q;
      if (error) {
        console.error("[CATRACA-CONSULTA] ingressos", { event_id: eventId, error });
        return json({ error: "internal_error" }, 503);
      }
      const pagina = (data ?? []) as unknown as TicketRow[];
      tickets.push(...pagina);
      if (pagina.length < PAGINA) break;
    }

    // ---------- 5. Reembolso em análise (não conta como válido) ----------
    const validosIds = tickets.filter((t) => t.status === "valid").map((t) => t.id);
    const emReembolso = new Set<string>();
    for (const lote of emLotes(validosIds)) {
      const { data, error } = await supabase
        .from("reembolso_ingressos")
        .select("ticket_id, reembolsos!inner(status)")
        .in("ticket_id", lote)
        .eq("reembolsos.status", "solicitado");
      if (error) {
        // Falhar fechado: sem saber do reembolso, não dá para dizer quantos valem.
        console.error("[CATRACA-CONSULTA] reembolso", { event_id: eventId, error: error.message });
        return json({ error: "internal_error" }, 503);
      }
      for (const r of (data ?? []) as { ticket_id: string }[]) emReembolso.add(r.ticket_id);
    }

    // ---------- 6. Agrupar por CPF ----------
    // Ingresso de pedido sem CPF não passa na facial: entra só na contagem
    // `ingressos_sem_cpf`, para quem monta a portaria saber que existe.
    const porCpf = new Map<string, Pessoa & { _nomeEm: string; _users: Set<string> }>();
    let semCpf = 0;
    for (const t of tickets) {
      const cpf = unformatCPF(t.orders?.customer_cpf ?? "");
      if (cpf.length !== 11) {
        semCpf++;
        continue;
      }
      let p = porCpf.get(cpf);
      if (!p) {
        p = {
          cpf,
          nome: null,
          ingressos_validos: 0,
          ingressos_usados: 0,
          ingressos_em_reembolso: 0,
          tem_facial: false,
          facial_enviada_ao_marcel: false,
          _nomeEm: "",
          _users: new Set(),
        };
        porCpf.set(cpf, p);
      }
      if (t.status === "used") p.ingressos_usados++;
      else if (emReembolso.has(t.id)) p.ingressos_em_reembolso++;
      else p.ingressos_validos++;
      // Nome do pedido mais recente do CPF (é o que a pessoa digitou por último).
      const nome = t.orders?.customer_name?.trim();
      if (nome && t.created_at >= p._nomeEm) {
        p.nome = nome;
        p._nomeEm = t.created_at;
      }
      if (t.orders?.user_id) p._users.add(t.orders.user_id);
    }

    // ---------- 7. Tem facial? ----------
    // A facial mora no perfil (foto + consentimento; `facial_synced_at` = já foi
    // para o Marcel). Um CPF pode ter mais de uma conta: vale qualquer uma, achada
    // pelo CPF do perfil ou pela conta que fez o pedido.
    const cpfs = [...porCpf.keys()];
    const userIds = [...new Set([...porCpf.values()].flatMap((p) => [...p._users]))];
    type Perfil = { id: string; cpf: string | null; facial_synced_at: string | null };
    const perfis: Perfil[] = [];
    const lerPerfis = async (coluna: "cpf" | "id", valores: string[]) => {
      for (const lote of emLotes(valores)) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, cpf, facial_synced_at")
          .in(coluna, lote)
          .not("facial_photo_path", "is", null)
          .not("facial_consent_at", "is", null);
        if (error) throw error;
        perfis.push(...((data ?? []) as Perfil[]));
      }
    };
    try {
      await lerPerfis("cpf", cpfs);
      await lerPerfis("id", userIds);
    } catch (error) {
      console.error("[CATRACA-CONSULTA] perfis", { event_id: eventId, error });
      return json({ error: "internal_error" }, 503);
    }
    const facialPorCpf = new Map<string, boolean>(); // cpf -> já enviada ao Marcel?
    const facialPorUser = new Map<string, boolean>();
    for (const pf of perfis) {
      const enviada = Boolean(pf.facial_synced_at);
      const cpf = unformatCPF(pf.cpf ?? "");
      if (cpf) facialPorCpf.set(cpf, (facialPorCpf.get(cpf) ?? false) || enviada);
      facialPorUser.set(pf.id, enviada);
    }

    const pessoas: Pessoa[] = [...porCpf.values()].map(({ _nomeEm: _n, _users, ...p }) => {
      const flags = [facialPorCpf.get(p.cpf), ...[..._users].map((u) => facialPorUser.get(u))]
        .filter((f): f is boolean => f !== undefined);
      return { ...p, tem_facial: flags.length > 0, facial_enviada_ao_marcel: flags.some(Boolean) };
    }).sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));

    console.log("[CATRACA-CONSULTA] ok", {
      event_id: eventId,
      cpf: cpfFiltro ? maskCpf(cpfFiltro) : null,
      pessoas: pessoas.length,
      ingressos: tickets.length,
    });

    return json({
      evento: {
        id: evento.id,
        nome: evento.title,
        data: evento.date,
        hora: evento.time ?? null,
        checkin_aberto: Boolean(janela?.is_open),
        checkin_abre_em: janela?.starts_at ?? null,
        checkin_fecha_em: janela?.ends_at ?? null,
      },
      gerado_em: new Date().toISOString(),
      total_pessoas: pessoas.length,
      total_ingressos_validos: pessoas.reduce((s, p) => s + p.ingressos_validos, 0),
      ingressos_sem_cpf: semCpf,
      pessoas,
    });
  } catch (error) {
    console.error("[CATRACA-CONSULTA] error:", error);
    return json({ error: "internal_error" }, 500);
  }
});
