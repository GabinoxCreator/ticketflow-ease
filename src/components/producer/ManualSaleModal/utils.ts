import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function formatWhatsAppDeepLink(whatsapp: string | null | undefined, message: string) {
  if (!whatsapp) return null;
  let digits = String(whatsapp).replace(/\D/g, '');
  if (!digits) return null;
  if (!digits.startsWith('55')) digits = '55' + digits;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppMessage(args: {
  buyerFirstName: string;
  eventTitle: string;
  eventDate: string;   // YYYY-MM-DD
  eventTime: string;   // HH:MM:SS
  venue: string;
  city: string;
  items: { lot_name: string; quantity: number }[];
  total: number;
  methodLabel: string;
}): string {
  const date = new Date(args.eventDate + 'T12:00:00');
  const dateStr = format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  const time = args.eventTime.slice(0, 5);
  const itemsLines = args.items.map((i) => `🎟️ ${i.quantity}x ${i.lot_name}`).join('\n');
  const totalStr = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(args.total);
  return [
    `Oi, ${args.buyerFirstName}! 👋`,
    '',
    `Sua compra na ${args.eventTitle} foi confirmada! 🎉`,
    '',
    `📅 ${dateStr}, ${time}`,
    `📍 ${args.venue}, ${args.city}`,
    '',
    itemsLines,
    '',
    `Total: ${totalStr} (${args.methodLabel} recebido ✓)`,
    '',
    'Seus ingressos com QR Code estão em anexo (PDF)',
    'e também já foram enviados pro seu email.',
    '',
    'Qualquer dúvida, é só me chamar!',
  ].join('\n');
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
  cartao: 'Cartão',
  outro: 'Outro',
};
