/**
 * Format check-in window in pt-BR using America/Sao_Paulo timezone.
 * The "same day" comparison must be done in São Paulo time, not the browser's local TZ.
 */
export function formatCheckinWindow(starts: Date, ends: Date): string {
  const d = (x: Date) =>
    x.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const t = (x: Date) =>
    x.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  const sameDay = d(starts) === d(ends);
  return sameDay
    ? `Check-in permitido em ${d(starts)}, das ${t(starts)} às ${t(ends)}.`
    : `Check-in permitido de ${d(starts)} ${t(starts)} até ${d(ends)} ${t(ends)}.`;
}

export function buildWindowMessage(
  reason: 'before_window' | 'after_window' | string,
  starts_at?: string | null,
  ends_at?: string | null
): string {
  const prefix =
    reason === 'before_window'
      ? 'Check-in ainda não liberado.'
      : reason === 'after_window'
        ? 'Janela de check-in encerrada.'
        : 'Check-in indisponível.';
  if (starts_at && ends_at) {
    return `${prefix} ${formatCheckinWindow(new Date(starts_at), new Date(ends_at))}`;
  }
  return prefix;
}
