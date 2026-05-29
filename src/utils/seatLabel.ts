/**
 * Formata o label de uma mesa/assento para exibição.
 * - Se label começa com seat_type_name, mostra só o label (evita redundância).
 * - Senão, "<label> · <seat_type_name>".
 * - Retorna null se ambos vazios.
 */
export function formatSeatLabel(
  label?: string | null,
  typeName?: string | null,
): string | null {
  const l = label?.trim();
  const t = typeName?.trim();
  if (!l && !t) return null;
  if (!l) return t!;
  if (!t) return l;
  if (l.toLowerCase().startsWith(t.toLowerCase())) return l;
  return `${l} · ${t}`;
}
