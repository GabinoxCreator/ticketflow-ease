// A porta de cada sessão quando um evento tem várias sessões no MESMO dia (OS-401,
// 07/11/2026, Balé da Bruna).
//
// Por que existe. A janela de check-in (`is_event_checkin_open`) abre à 0h do dia do
// evento e fecha 15 h depois do início. O Balé tem duas sessões no mesmo dia (18h30 e
// 20h30, eventos separados): as duas ficavam com a entrada aberta o dia inteiro, e um
// convite da 2ª sessão passava no totem durante a 1ª. Decisão do Gabriel de 07/11
// ("Pelo horário, sozinho"): até o meio do caminho entre os inícios (19h30 no Balé) só
// entra a 1ª sessão; dali em diante, só a 2ª. Ninguém mexe no totem.
//
// Quem conta como "sessões do mesmo evento": os eventos da mesma lista de alunos
// (`listas_alunos_eventos`, hoje só o Balé) que caem no mesmo dia. Evento fora de lista,
// ou sozinho no dia, não muda NADA (a função devolve "sem regra"). O corte é calculado
// pelos horários de início do banco, nunca cravado no código. Datas e horas do banco são
// de Brasília (sem horário de verão desde 2019: -03:00), como na `is_event_checkin_open`.

// deno-lint-ignore no-explicit-any
type Supa = any;

export interface PortaDaSessao {
  /** A porta desta sessão está aberta agora? */
  aberta: boolean;
  /** A hora de início desta sessão, como se lê: "20h30". */
  sessao: string;
  /** Fechada: ainda vai abrir, ou já passou o corte para a sessão seguinte. */
  motivo?: "ainda_nao_abriu" | "ja_fechou";
  /** Quando abre (ainda não abriu) ou quando fechou (já fechou): "19h30". */
  abre_em?: string;
  fechou_em?: string;
}

const BRASILIA = "-03:00";

/** Hora de Brasília como se lê: 20:30 → "20h30"; 20:00 → "20h". */
export function horaComoSeLe(d: Date): string {
  const local = new Date(d.getTime() - 3 * 3600_000); // Brasília, sem horário de verão
  const h = local.getUTCHours();
  const m = local.getUTCMinutes();
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** Início de uma sessão (data e hora do banco, em Brasília). */
export function inicioDaSessao(date: string, time: string | null): Date | null {
  if (!date || !time) return null;
  const hora = time.length === 5 ? `${time}:00` : time.slice(0, 8);
  const d = new Date(`${date}T${hora}${BRASILIA}`);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Regra pura: dadas as sessões do mesmo dia (id e início), a porta de cada uma agora.
 * Com menos de 2 sessões não há regra (mapa vazio). O corte entre duas sessões
 * seguidas é o meio do caminho entre os inícios.
 */
export function portasDoDia(sessoes: { id: string; inicio: Date }[], agora: Date): Map<string, PortaDaSessao> {
  const out = new Map<string, PortaDaSessao>();
  const ordem = [...sessoes].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  if (ordem.length < 2) return out;
  for (let i = 0; i < ordem.length; i++) {
    const abre = i === 0 ? null : new Date((ordem[i - 1].inicio.getTime() + ordem[i].inicio.getTime()) / 2);
    const fecha = i === ordem.length - 1 ? null : new Date((ordem[i].inicio.getTime() + ordem[i + 1].inicio.getTime()) / 2);
    const sessao = horaComoSeLe(ordem[i].inicio);
    if (abre && agora.getTime() < abre.getTime()) {
      out.set(ordem[i].id, { aberta: false, sessao, motivo: "ainda_nao_abriu", abre_em: horaComoSeLe(abre) });
    } else if (fecha && agora.getTime() >= fecha.getTime()) {
      out.set(ordem[i].id, { aberta: false, sessao, motivo: "ja_fechou", fechou_em: horaComoSeLe(fecha) });
    } else {
      out.set(ordem[i].id, { aberta: true, sessao });
    }
  }
  return out;
}

/**
 * A porta de cada evento pedido. Evento que não é sessão de um dia com outras sessões
 * não aparece no mapa devolvido (= sem regra). Erro de leitura devolve "erro": quem
 * chama trata como a janela indisponível (fail-closed, como a `is_event_checkin_open`).
 */
export async function portasDasSessoes(
  supabase: Supa,
  eventIds: string[],
  tag: string,
  agora: Date = new Date(Date.now()),
): Promise<Map<string, PortaDaSessao> | "erro"> {
  const pedidos = Array.from(new Set(eventIds.filter(Boolean)));
  const out = new Map<string, PortaDaSessao>();
  if (pedidos.length === 0) return out;
  try {
    const { data: deles, error: e1 } = await supabase
      .from("listas_alunos_eventos")
      .select("event_id, lista_id")
      .in("event_id", pedidos);
    if (e1) {
      console.error(`[${tag}] sessões: leitura da lista falhou`, e1);
      return "erro";
    }
    const listas = Array.from(new Set((deles ?? []).map((l: { lista_id: string }) => l.lista_id)));
    if (listas.length === 0) return out; // nenhum evento pedido é sessão de lista: sem regra

    const { data: irmas, error: e2 } = await supabase
      .from("listas_alunos_eventos")
      .select("event_id, lista_id")
      .in("lista_id", listas);
    if (e2) {
      console.error(`[${tag}] sessões: leitura das sessões falhou`, e2);
      return "erro";
    }
    const idsDasSessoes = Array.from(new Set((irmas ?? []).map((l: { event_id: string }) => l.event_id)));
    const { data: evs, error: e3 } = await supabase
      .from("events")
      .select("id, date, time, status")
      .in("id", idsDasSessoes);
    if (e3) {
      console.error(`[${tag}] sessões: leitura dos horários falhou`, e3);
      return "erro";
    }
    const evento = new Map<string, { date: string; time: string | null; status: string | null }>();
    for (const e of evs ?? []) evento.set(e.id, e);

    // Por lista e por dia: só as sessões PUBLICADAS contam (rascunho e encerrada
    // não cortam a outra: uma sessão despublicada não pode continuar dividindo o dia).
    const grupos = new Map<string, { id: string; inicio: Date }[]>();
    for (const l of irmas ?? []) {
      const e = evento.get(l.event_id);
      if (!e || e.status !== "published") continue;
      const inicio = inicioDaSessao(e.date, e.time);
      if (!inicio) continue;
      const chave = `${l.lista_id}|${e.date}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push({ id: l.event_id, inicio });
    }
    for (const sessoes of grupos.values()) {
      for (const [id, porta] of portasDoDia(sessoes, agora)) {
        if (pedidos.includes(id)) out.set(id, porta);
      }
    }
    return out;
  } catch (e) {
    console.error(`[${tag}] sessões: erro`, (e as { name?: string })?.name);
    return "erro";
  }
}

/** A frase para quem está na porta (o nosso totem lê `sessao`; o porteiro lê `message`). */
export function fraseDaSessao(p: PortaDaSessao): string {
  return p.motivo === "ainda_nao_abriu"
    ? `Ingresso da sessão das ${p.sessao}. A entrada dessa sessão abre às ${p.abre_em}.`
    : `Ingresso da sessão das ${p.sessao}. A entrada dessa sessão fechou às ${p.fechou_em}. Procure a equipe.`;
}
