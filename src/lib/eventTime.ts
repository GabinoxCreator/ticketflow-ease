import { fromZonedTime } from 'date-fns-tz';

/**
 * Centraliza toda lógica de tempo de evento em America/Sao_Paulo.
 *
 * Por que `fromZonedTime`: a coluna `events.date` é `date` e `events.time` é
 * `time without time zone` — strings que representam horário-de-parede em São
 * Paulo. Para comparar com "agora" precisamos do INSTANTE UTC equivalente
 * NAQUELA data específica (resolvendo DST se voltar). `fromZonedTime` resolve
 * o offset NA data do evento, não no `now`.
 */

export const APP_TZ = 'America/Sao_Paulo';

export interface EventTimeFields {
  date: string; // YYYY-MM-DD
  time?: string | null; // HH:mm[:ss]
  end_date?: string | null;
  end_time?: string | null;
}

const normalizeTime = (t?: string | null, fallback = '00:00:00'): string => {
  if (!t) return fallback;
  if (t.length === 5) return `${t}:00`;
  return t.slice(0, 8);
};

/** Interpreta `${date}T${time}` como horário-de-parede em SP e devolve o instante UTC. */
export function spWallToInstant(date: string, time?: string | null, fallback = '00:00:00'): Date {
  return fromZonedTime(`${date}T${normalizeTime(time, fallback)}`, APP_TZ);
}

/** Instante UTC de início do evento. */
export function getEventStartInstant(e: EventTimeFields): Date {
  return spWallToInstant(e.date, e.time, '00:00:00');
}

/**
 * Instante UTC de fim do evento.
 * - Se `end_date` presente: usa `end_date` + `end_time` (fallback 23:59).
 * - Caso contrário: início + 6h de buffer.
 */
export function getEventEndInstant(e: EventTimeFields): Date {
  if (e.end_date) {
    return spWallToInstant(e.end_date, e.end_time, '23:59:00');
  }
  const start = getEventStartInstant(e);
  return new Date(start.getTime() + 6 * 60 * 60 * 1000);
}

/** Formata `YYYY-MM-DD` (event.date) no fuso SP. */
export function formatEventDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric' },
): string {
  // Ancora ao meio-dia para evitar off-by-one antes do Intl aplicar o timeZone.
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: APP_TZ }).format(d);
}

/** Formata um timestamptz (ISO string ou Date) no fuso SP. */
export function formatInSaoPaulo(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: APP_TZ }).format(d);
}
