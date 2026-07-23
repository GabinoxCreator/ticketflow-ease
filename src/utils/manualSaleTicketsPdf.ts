import jsPDF from 'jspdf';
import { renderTicketPage, slugifyForFilename } from './ticketPdfTemplate';

export interface SimpleTicketForPdf {
  ticket_code: string;
  lot_name: string;
  holder_name: string;
}

export interface SimpleEventForPdf {
  title: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  state: string;
}

export async function generateManualSaleTicketsPDF(
  tickets: SimpleTicketForPdf[],
  event: SimpleEventForPdf,
): Promise<void> {
  if (tickets.length === 0) return;
  // compress:true corrige dívida conhecida — sem isso o PDF sai ~2,1MB/ingresso.
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const issuedAt = new Date();
  for (let i = 0; i < tickets.length; i++) {
    if (i > 0) pdf.addPage();
    const t = tickets[i];
    await renderTicketPage(pdf, {
      event,
      lot: { name: t.lot_name },
      ticket: { ticket_code: t.ticket_code, holder_name: t.holder_name },
      issuedAt,
    });
  }
  pdf.save(`Ingressos-FestPag-${slugifyForFilename(event.title)}.pdf`);
}
