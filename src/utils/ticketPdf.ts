import jsPDF from 'jspdf';
import { UserTicket, ticketEventDisplay } from '@/hooks/useUserTickets';
import { renderTicketPage, slugifyForFilename } from './ticketPdfTemplate';

export async function generateTicketPDF(ticket: UserTicket): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  // `ticket.event` pode ser nulo (evento não publicado não é legível pelo
  // cliente). O ingresso é válido de todo jeito, então o PDF sai — só sem os
  // dados do evento.
  const ev = ticket.event;
  await renderTicketPage(pdf, {
    event: {
      title: ticketEventDisplay(ev).title,
      date: ev?.date ?? '',
      time: ev?.time ?? '',
      venue: ev?.venue ?? '',
      city: ev?.city ?? '',
      state: ev?.state ?? '',
    },
    lot: { name: ticket.lot?.name ?? ticket.seat?.seat_type_name ?? 'INGRESSO' },
    seat: ticket.seat?.label
      ? { label: ticket.seat.label, typeName: ticket.seat.seat_type_name }
      : undefined,
    ticket: {
      ticket_code: ticket.ticket_code,
      holder_name: ticket.holder_name,
    },
    issuedAt: new Date(ticket.created_at),
    status: ticket.status,
  });
  const code = ticket.ticket_code.slice(0, 8).toUpperCase();
  pdf.save(
    `Ingresso-FestPag-${slugifyForFilename(ticketEventDisplay(ev).title)}-${code}.pdf`,
  );
}
