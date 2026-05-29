import jsPDF from 'jspdf';
import { UserTicket } from '@/hooks/useUserTickets';
import { renderTicketPage, slugifyForFilename } from './ticketPdfTemplate';

export async function generateTicketPDF(ticket: UserTicket): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await renderTicketPage(pdf, {
    event: {
      title: ticket.event.title,
      date: ticket.event.date,
      time: ticket.event.time,
      venue: ticket.event.venue,
      city: ticket.event.city,
      state: ticket.event.state,
    },
    lot: { name: ticket.lot.name },
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
    `Ingresso-FestPag-${slugifyForFilename(ticket.event.title)}-${code}.pdf`,
  );
}
