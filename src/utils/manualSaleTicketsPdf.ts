import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface SimpleTicketForPdf {
  ticket_code: string;
  lot_name: string;
  holder_name: string;
}

export interface SimpleEventForPdf {
  title: string;
  date: string;     // YYYY-MM-DD
  time: string;     // HH:MM:SS
  venue: string;
  city: string;
  state: string;
}

function drawBold(pdf: jsPDF, text: string, x: number, y: number, opts?: { align?: 'left' | 'center' | 'right' }) {
  pdf.setFont('helvetica', 'normal');
  pdf.text(text, x, y, opts);
  pdf.text(text, x + 0.15, y, opts);
}

function slugify(s: string, max = 40) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, max).replace(/-$/, '');
}

async function renderTicketPage(pdf: jsPDF, ticket: SimpleTicketForPdf, event: SimpleEventForPdf) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;

  const primary: [number, number, number] = [99, 102, 241];
  const accent: [number, number, number] = [79, 70, 229];
  const text: [number, number, number] = [55, 65, 81];
  const muted: [number, number, number] = [107, 114, 128];
  const line: [number, number, number] = [209, 213, 219];

  pdf.setFont('helvetica', 'normal');

  // header
  pdf.setFillColor(...primary);
  pdf.rect(0, 0, pageW, 32, 'F');
  pdf.setFillColor(...accent);
  pdf.rect(0, 28, pageW, 4, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(22);
  drawBold(pdf, 'FESTPAG', margin, 17);
  pdf.setFontSize(9);
  pdf.text('Plataforma de eventos', margin, 22);
  const badge = 'INGRESSO DIGITAL · VENDA MANUAL';
  pdf.setFontSize(8);
  const bw = pdf.getTextWidth(badge) + 8;
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(pageW - margin - bw, 11, bw, 7, 3.5, 3.5, 'F');
  pdf.setTextColor(...accent);
  drawBold(pdf, badge, pageW - margin - bw + 4, 16);

  // Title
  let y = 44;
  pdf.setTextColor(...text);
  pdf.setFontSize(18);
  const titleLines = pdf.splitTextToSize(event.title, pageW - margin * 2);
  titleLines.forEach((l: string, i: number) => drawBold(pdf, l, margin, y + i * 7));
  y += titleLines.length * 7 + 1;
  pdf.setFontSize(11);
  pdf.setTextColor(...muted);
  pdf.text(ticket.lot_name, margin, y);
  y += 8;

  // QR
  const qr = await QRCode.toDataURL(ticket.ticket_code, {
    errorCorrectionLevel: 'H', margin: 1, width: 400,
    color: { dark: '#000000', light: '#ffffff' },
  });
  const qrSize = 50;
  pdf.addImage(qr, 'PNG', margin, y, qrSize, qrSize);

  pdf.setTextColor(...text);
  pdf.setFontSize(12);
  drawBold(pdf, ticket.ticket_code.slice(0, 8).toUpperCase(), margin + qrSize / 2, y + qrSize + 6, { align: 'center' });
  pdf.setFontSize(7);
  pdf.setTextColor(...muted);
  pdf.text('Código do ingresso', margin + qrSize / 2, y + qrSize + 10, { align: 'center' });

  // Info
  const infoX = margin + qrSize + 10;
  let iy = y + 4;
  pdf.setFontSize(8); pdf.setTextColor(...accent); drawBold(pdf, 'DATA E HORÁRIO', infoX, iy);
  iy += 5; pdf.setFontSize(11); pdf.setTextColor(...text);
  const dt = new Date(event.date + 'T12:00:00');
  const dateTxt = format(dt, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  pdf.text(dateTxt.charAt(0).toUpperCase() + dateTxt.slice(1), infoX, iy);
  iy += 5; pdf.text(event.time.slice(0, 5), infoX, iy);
  iy += 9;
  pdf.setFontSize(8); pdf.setTextColor(...accent); drawBold(pdf, 'LOCAL', infoX, iy);
  iy += 5; pdf.setFontSize(11); pdf.setTextColor(...text);
  const venueLines = pdf.splitTextToSize(event.venue, pageW - infoX - margin);
  pdf.text(venueLines, infoX, iy);
  iy += venueLines.length * 5;
  pdf.text(`${event.city}/${event.state}`, infoX, iy);

  // Portador
  y = y + qrSize + 18;
  pdf.setDrawColor(...line); pdf.setLineDashPattern([1.2, 1.5], 0); pdf.setLineWidth(0.3);
  pdf.line(margin, y, pageW - margin, y); pdf.setLineDashPattern([], 0);
  y += 8;
  pdf.setFontSize(10); pdf.setTextColor(...accent); drawBold(pdf, 'DADOS DO PORTADOR', margin, y);
  y += 6;
  pdf.setTextColor(...muted); pdf.setFontSize(9); pdf.text('Nome:', margin, y);
  pdf.setTextColor(...text); pdf.setFontSize(10); drawBold(pdf, ticket.holder_name || '—', margin + 22, y);
  y += 8;

  // Footer
  const fy = pageH - 12;
  pdf.setDrawColor(...line); pdf.setLineWidth(0.3); pdf.line(margin, fy - 4, pageW - margin, fy - 4);
  pdf.setFontSize(8); pdf.setTextColor(...muted);
  pdf.text('Gerado por FestPag · festpag.com.br', margin, fy);
  pdf.text(`Emitido em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, pageW - margin, fy, { align: 'right' });
}

export async function generateManualSaleTicketsPDF(
  tickets: SimpleTicketForPdf[],
  event: SimpleEventForPdf,
): Promise<void> {
  if (tickets.length === 0) return;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  for (let i = 0; i < tickets.length; i++) {
    if (i > 0) pdf.addPage();
    await renderTicketPage(pdf, tickets[i], event);
  }
  const slug = slugify(event.title);
  pdf.save(`Ingressos-FestPag-${slug}.pdf`);
}
