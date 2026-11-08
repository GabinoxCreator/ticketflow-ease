// O lugar de quem acabou de entrar, para o totem desenhar o caminho até a
// poltrona (OS-401, 07/11/2026, Balé da Bruna).
//
// O nosso totem de check-in (edge `totem-checkin` do projeto do totem) pede
// com `mapa: true` no corpo; o Marcel e o parceiro não pedem, e a resposta
// deles não muda. Volta só o que desenha o mapa: o id do mapa do evento
// (`events.table_map_id`), o rótulo e o centro de cada poltrona do evento, a
// poltrona de quem entrou e as outras da mesma compra (ou do mesmo CPF). Nada
// de pessoa: nem nome, nem CPF, nem o código do ingresso. Portas, corredores e
// palco não moram no banco; o totem tem a planta de cada mapa.
//
// Nunca lança: sem mapa (ingresso sem poltrona, falha de leitura), devolve
// null e o check-in segue como sempre. O ingresso já foi queimado antes daqui.

// deno-lint-ignore no-explicit-any
type Supa = any;

export interface MapaDoCheckin {
  mapa_id: string | null;
  /** [rótulo, centro x, centro y], coordenadas do mapa do site. */
  poltronas: [string, number, number][];
  minha: string;
  familia: string[];
  substantivo: string | null;
  evento: string | null;
  /** Hora de início do evento (sessão), como se lê: "18h30". */
  hora: string | null;
}

/** "18:30:00" → "18h30"; "20:00:00" → "20h". */
export function horaDoEvento(time: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  return m[2] === "00" ? `${h}h` : `${h}h${m[2]}`;
}

/** Mais que isso não é planta de teatro: não manda (e a leitura de 1 página não pegaria tudo). */
const POLTRONAS_MAX = 1000;

/**
 * Monta o mapa do ingresso `eventSeatId` no evento `eventId`. `familiaSeatIds`
 * são as poltronas (`tickets.event_seat_id`) dos outros ingressos que vão
 * aparecer marcados de leve (a família). Nunca lança.
 */
export async function mapaDoCheckin(
  supabase: Supa,
  eventId: string,
  eventSeatId: string | null | undefined,
  familiaSeatIds: (string | null | undefined)[],
  tag: string,
): Promise<MapaDoCheckin | null> {
  if (!eventSeatId) return null;
  try {
    const [ev, lugares] = await Promise.all([
      supabase.from("events").select("table_map_id, seat_noun, title, time").eq("id", eventId).maybeSingle(),
      supabase
        .from("event_seats")
        .select("id, label, x, y, width, height")
        .eq("event_id", eventId)
        .order("label", { ascending: true })
        .limit(POLTRONAS_MAX + 1),
    ]);
    if (ev.error || lugares.error) {
      console.error(`[${tag}] mapa: leitura falhou (segue sem mapa)`, ev.error ?? lugares.error);
      return null;
    }
    const linhas = (lugares.data ?? []) as {
      id: string;
      label: string | null;
      x: number | null;
      y: number | null;
      width: number | null;
      height: number | null;
    }[];
    if (linhas.length === 0 || linhas.length > POLTRONAS_MAX) return null;

    const rotuloDe = new Map<string, string>();
    const poltronas: [string, number, number][] = [];
    for (const s of linhas) {
      if (!s.label || s.x === null || s.y === null) continue;
      rotuloDe.set(s.id, s.label);
      // x/y do site são o canto de cima à esquerda (SeatNode.tsx): manda o centro.
      poltronas.push([s.label, Math.round(s.x + (s.width ?? 0) / 2), Math.round(s.y + (s.height ?? 0) / 2)]);
    }
    const minha = rotuloDe.get(eventSeatId);
    if (!minha) return null;
    const familia = Array.from(
      new Set(
        familiaSeatIds
          .map((id) => (id ? rotuloDe.get(id) : undefined))
          .filter((l): l is string => Boolean(l) && l !== minha),
      ),
    );
    const e = ev.data as { table_map_id?: string | null; seat_noun?: string | null; title?: string | null; time?: string | null } | null;
    return {
      mapa_id: e?.table_map_id ?? null,
      poltronas,
      minha,
      familia,
      substantivo: e?.seat_noun ?? null,
      evento: e?.title ?? null,
      hora: horaDoEvento(e?.time),
    };
  } catch (e) {
    console.error(`[${tag}] mapa: erro (segue sem mapa)`, (e as { name?: string })?.name);
    return null;
  }
}
