// OS-155: separa "tentativa que não virou venda" de cancelamento de verdade.
// Cada QR novo de PIX ou nova tentativa de cartão vira um pedido; muitos deles são
// da mesma pessoa, que acabou comprando. Aqui agrupamos por pessoa.
import type { Order } from '@/hooks/useEventOrders';

export interface AttemptPerson {
  key: string;
  name: string;
  email: string;
  phone: string | null;
  attempts: Order[];
  lastAttemptAt: string;
  totalAmount: number;
}

const digits = (v?: string | null) => (v || '').replace(/\D/g, '');

/** Identificadores da pessoa: CPF, conta, e-mail e telefone (os que existirem). */
function identifiers(o: Order): string[] {
  const ids: string[] = [];
  const cpf = digits(o.customer_cpf);
  if (cpf.length === 11) ids.push(`cpf:${cpf}`);
  if (o.user_id) ids.push(`user:${o.user_id}`);
  const email = (o.customer_email || '').trim().toLowerCase();
  if (email) ids.push(`email:${email}`);
  const phone = digits(o.customer_phone);
  if (phone.length >= 10) ids.push(`tel:${phone.slice(-11)}`);
  return ids;
}

export function reasonOf(o: Order): string {
  return o.status === 'expired' ? 'PIX venceu sem pagamento' : 'Cartão recusado';
}

export function analyzeAttempts(attempts: Order[], paid: Order[]) {
  const paidIds = new Set<string>();
  paid.forEach((o) => identifiers(o).forEach((i) => paidIds.add(i)));

  const boughtLater = new Set<string>();
  attempts.forEach((o) => {
    if (identifiers(o).some((i) => paidIds.has(i))) boughtLater.add(o.id);
  });

  // Agrupa tentativas da mesma pessoa (qualquer identificador em comum).
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  attempts.forEach((o) => {
    const ids = identifiers(o);
    const keys = ids.length ? ids : [`order:${o.id}`];
    keys.forEach((k) => { if (!parent.has(k)) parent.set(k, k); });
    keys.slice(1).forEach((k) => union(keys[0], k));
  });

  const groups = new Map<string, Order[]>();
  attempts.forEach((o) => {
    const ids = identifiers(o);
    const root = find(ids.length ? ids[0] : `order:${o.id}`);
    groups.set(root, [...(groups.get(root) || []), o]);
  });

  const notReturned: AttemptPerson[] = [];
  groups.forEach((list, key) => {
    if (list.some((o) => boughtLater.has(o.id))) return;
    const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const last = sorted[0];
    notReturned.push({
      key,
      name: last.customer_name,
      email: last.customer_email,
      phone: last.customer_phone,
      attempts: sorted,
      lastAttemptAt: last.created_at,
      totalAmount: Math.max(...list.map((o) => Number(o.total_amount) || 0)),
    });
  });
  notReturned.sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt));

  return { boughtLater, notReturned };
}
