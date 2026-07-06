// Mascaramento de PII para logs (LGPD: nunca logar dado pessoal cru).
// Preserva o suficiente pra depurar (1ª letra + domínio) sem expor o titular.

export function maskEmail(email: unknown): string {
  if (typeof email !== "string" || !email.includes("@")) return "***";
  const [user, domain] = email.split("@");
  const head = user.slice(0, 1);
  return `${head}***@${domain}`;
}

export function maskPhone(phone: unknown): string {
  if (typeof phone !== "string") return "***";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-4)}`;
}
