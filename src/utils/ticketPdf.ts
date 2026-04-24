import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { UserTicket } from '@/hooks/useUserTickets';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function slugify(input: string, max = 40): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-zA-Z0-9\s-]/g, '') // remove caracteres especiais
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, max)
    .replace(/-$/, '');
}

function toTitleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/** Cor por status, em [r, g, b] (jsPDF não aceita hsl) */
function statusColors(status: UserTicket['status']) {
  switch (status) {
    case 'valid':
      return {
        primary: [16, 185, 129] as [number, number, number], // emerald-500
        accent: [5, 150, 105] as [number, number, number], // emerald-600
        label: 'VÁLIDO',
      };
    case 'used':
      return {
        primary: [220, 38, 38] as [number, number, number], // red-600
        accent: [153, 27, 27] as [number, number, number], // red-800
        label: 'UTILIZADO',
      };
    case 'cancelled':
      return {
        primary: [113, 113, 122] as [number, number, number], // zinc-500
        accent: [63, 63, 70] as [number, number, number], // zinc-700
        label: 'CANCELADO',
      };
    default:
      return {
        primary: [99, 102, 241] as [number, number, number], // indigo-500
        accent: [79, 70, 229] as [number, number, number],
        label: 'PENDENTE',
      };
  }
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

export async function generateTicketPDF(ticket: UserTicket): Promise<void> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;

  const colors = statusColors(ticket.status);
  const textGray = [55, 65, 81] as [number, number, number]; // gray-700
  const mutedGray = [107, 114, 128] as [number, number, number]; // gray-500
  const lineGray = [209, 213, 219] as [number, number, number]; // gray-300

  /* ============================ HEADER =========================== */
  pdf.setCharSpace(0); // garante char spacing zero (evita rendering com espaços extras)
  const headerH = 32;
  pdf.setFillColor(...colors.primary);
  pdf.rect(0, 0, pageW, headerH, 'F');

  // Faixa decorativa inferior do header
  pdf.setFillColor(...colors.accent);
  pdf.rect(0, headerH - 4, pageW, 4, 'F');

  // Logo / marca
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.text('FESTPAG', margin, 16);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Plataforma de eventos', margin, 22);

  // Badge à direita
  const badgeText = `INGRESSO DIGITAL · ${colors.label}`;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  const badgeW = pdf.getTextWidth(badgeText) + 8;
  const badgeX = pageW - margin - badgeW;
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(badgeX, 11, badgeW, 7, 3.5, 3.5, 'F');
  pdf.setTextColor(...colors.accent);
  pdf.text(badgeText, badgeX + 4, 16);

  /* ====================== TÍTULO DO EVENTO ======================= */
  let y = headerH + 12;
  pdf.setTextColor(...textGray);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  const titleLines = pdf.splitTextToSize(ticket.event.title, contentW);
  pdf.text(titleLines, margin, y);
  y += titleLines.length * 8;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(...mutedGray);
  pdf.text(ticket.lot.name, margin, y);
  y += 8;

  /* ===================== QR CODE + INFO BOX ====================== */
  const qrSize = 50;
  const qrX = margin;
  const qrY = y + 2;

  const qrDataUrl = await QRCode.toDataURL(ticket.ticket_code, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 400,
    color: { dark: '#000000', light: '#ffffff' },
  });
  pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

  // Selo "UTILIZADO"/"CANCELADO" sobre o QR
  if (ticket.status === 'used' || ticket.status === 'cancelled') {
    pdf.setFillColor(255, 255, 255);
    pdf.setGState(new (pdf as any).GState({ opacity: 0.7 }));
    pdf.rect(qrX, qrY + qrSize / 2 - 6, qrSize, 12, 'F');
    pdf.setGState(new (pdf as any).GState({ opacity: 1 }));
    pdf.setTextColor(...colors.primary);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text(colors.label, qrX + qrSize / 2, qrY + qrSize / 2 + 1.5, {
      align: 'center',
    });
  }

  // Código abaixo do QR
  pdf.setTextColor(...textGray);
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(13);
  pdf.text(ticket.ticket_code.slice(0, 8).toUpperCase(), qrX + qrSize / 2, qrY + qrSize + 6, {
    align: 'center',
  });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(...mutedGray);
  pdf.text('Código do ingresso', qrX + qrSize / 2, qrY + qrSize + 10, { align: 'center' });

  // Bloco de info ao lado do QR
  const infoX = qrX + qrSize + 10;
  let infoY = qrY + 4;

  // Data
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...colors.accent);
  pdf.text('DATA E HORÁRIO', infoX, infoY);
  infoY += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(...textGray);
  const eventDate = new Date(ticket.event.date + 'T12:00:00');
  const dateText = toTitleCase(format(eventDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR }));
  pdf.text(dateText, infoX, infoY);
  infoY += 5;
  pdf.text(`${ticket.event.time.slice(0, 5)}`, infoX, infoY);
  infoY += 9;

  // Local
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...colors.accent);
  pdf.text('LOCAL', infoX, infoY);
  infoY += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(...textGray);
  const venueLines = pdf.splitTextToSize(ticket.event.venue, contentW - (infoX - margin));
  pdf.text(venueLines, infoX, infoY);
  infoY += venueLines.length * 5;
  pdf.text(`${ticket.event.city}/${ticket.event.state}`, infoX, infoY);

  y = qrY + qrSize + 18;

  /* =================== DIVISÓRIA TRACEJADA ======================= */
  const dashedLine = (yy: number) => {
    pdf.setDrawColor(...lineGray);
    pdf.setLineDashPattern([1.2, 1.5], 0);
    pdf.setLineWidth(0.3);
    pdf.line(margin, yy, pageW - margin, yy);
    pdf.setLineDashPattern([], 0);
  };

  dashedLine(y);
  y += 8;

  /* ==================== DADOS DO PORTADOR ======================== */
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...colors.accent);
  pdf.text('DADOS DO PORTADOR', margin, y);
  y += 6;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(...textGray);

  const drawField = (label: string, value: string, yy: number) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...mutedGray);
    pdf.setFontSize(9);
    pdf.text(label, margin, yy);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...textGray);
    pdf.setFontSize(10);
    pdf.text(value, margin + 30, yy);
  };

  drawField('Nome:', ticket.holder_name || '—', y);
  y += 5.5;
  drawField('E-mail:', ticket.holder_email || '—', y);
  y += 5.5;
  drawField('Telefone:', ticket.holder_phone || '—', y);
  y += 8;

  dashedLine(y);
  y += 8;

  /* ==================== INFO DA COMPRA =========================== */
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...colors.accent);
  pdf.text('INFORMAÇÕES DA COMPRA', margin, y);
  y += 6;

  drawField('Lote:', ticket.lot.name, y);
  y += 5.5;
  drawField('Valor pago:', formatBRL(ticket.lot.price), y);
  y += 5.5;
  const purchaseDate = format(new Date(ticket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  drawField('Data da compra:', purchaseDate, y);
  y += 5.5;
  if (ticket.status === 'used' && ticket.validated_at) {
    drawField(
      'Validado em:',
      format(new Date(ticket.validated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
      y
    );
    y += 5.5;
  }
  y += 3;

  dashedLine(y);
  y += 8;

  /* ==================== COMO USAR ================================ */
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...colors.accent);
  pdf.text('COMO USAR SEU INGRESSO', margin, y);
  y += 6;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor(...textGray);
  const instructions = [
    '1. Apresente este QR Code na entrada do evento.',
    '2. Tenha um documento com foto em mãos para conferência.',
    '3. O ingresso é pessoal e intransferível.',
    '4. Chegue com antecedência para evitar filas.',
  ];
  instructions.forEach((line) => {
    pdf.text(line, margin, y);
    y += 5;
  });
  y += 3;

  dashedLine(y);
  y += 8;

  /* ==================== IMPORTANTE =============================== */
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(220, 38, 38);
  pdf.text('IMPORTANTE', margin, y);
  y += 6;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...textGray);
  const warnings = [
    '• Não compartilhe a imagem do QR Code com terceiros.',
    '• Cada ingresso permite apenas UMA entrada no evento.',
    '• Em caso de dúvidas, entre em contato: contato.festpag@gmail.com',
  ];
  warnings.forEach((line) => {
    const lines = pdf.splitTextToSize(line, contentW);
    pdf.text(lines, margin, y);
    y += lines.length * 4.5;
  });

  /* ==================== FOOTER =================================== */
  const footerY = pageH - 12;
  pdf.setDrawColor(...lineGray);
  pdf.setLineWidth(0.3);
  pdf.line(margin, footerY - 4, pageW - margin, footerY - 4);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...mutedGray);
  pdf.text('Gerado por FestPag · ingressosrp.com.br', margin, footerY);
  pdf.text(
    `Emitido em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    pageW - margin,
    footerY,
    { align: 'right' }
  );

  /* ==================== SAVE ===================================== */
  const eventSlug = slugify(ticket.event.title);
  const code = ticket.ticket_code.slice(0, 8).toUpperCase();
  const filename = `Ingresso-FestPag-${eventSlug}-${code}.pdf`;
  pdf.save(filename);
}
