// Script de QA: gera o PDF de teste fora do navegador
// usa apenas as libs server-friendly: jspdf + qrcode

import { writeFileSync } from 'fs';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

// Mock ticket — três variações para QA
const tickets = [
  {
    id: '1',
    ticket_code: '3241bbc3-aaaa-bbbb-cccc-dddddddddddd',
    holder_name: 'Gabriel Fernandes da Silva Junior',
    holder_email: 'gabriel.fernandes@email.com',
    holder_phone: '(17) 99999-1234',
    status: 'valid',
    validated_at: null,
    created_at: '2026-04-10T14:32:00Z',
    event: {
      id: 'e1',
      title: 'Samba do Brasileiro — Especial Feriado',
      date: '2026-04-18',
      time: '18:00:00',
      venue: 'Made in Brazil Bar',
      city: 'São José do Rio Preto',
      state: 'SP',
      image_url: null,
    },
    lot: { name: '2º Lote — Pista', price: 80 },
  },
  {
    id: '2',
    ticket_code: '779655e6-aaaa-bbbb-cccc-dddddddddddd',
    holder_name: 'Maria Oliveira',
    holder_email: 'maria@email.com',
    holder_phone: '(11) 98765-4321',
    status: 'used',
    validated_at: '2026-03-08T19:45:00Z',
    created_at: '2026-02-20T10:15:00Z',
    event: {
      id: 'e2',
      title: 'O Povo Pede Samba',
      date: '2026-03-08',
      time: '18:00:00',
      venue: 'Espaço Cultural Vila Madalena',
      city: 'São Paulo',
      state: 'SP',
      image_url: null,
    },
    lot: { name: 'Ingresso Antecipado', price: 60 },
  },
  {
    id: '3',
    ticket_code: '11223344-aaaa-bbbb-cccc-dddddddddddd',
    holder_name: 'João',
    holder_email: null,
    holder_phone: null,
    status: 'cancelled',
    validated_at: null,
    created_at: '2026-01-15T08:00:00Z',
    event: {
      id: 'e3',
      title: 'Festa de Verão',
      date: '2026-02-14',
      time: '22:00:00',
      venue: 'Praia Local',
      city: 'Cabo Frio',
      state: 'RJ',
      image_url: null,
    },
    lot: { name: 'Pista', price: 120 },
  },
];

// Replica simplificada do generateTicketPDF (suficiente para QA visual)
async function generate(ticket, outPath) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;

  const colors = (() => {
    if (ticket.status === 'valid') return { primary: [16, 185, 129], accent: [5, 150, 105], label: 'VALIDO' };
    if (ticket.status === 'used') return { primary: [220, 38, 38], accent: [153, 27, 27], label: 'UTILIZADO' };
    if (ticket.status === 'cancelled') return { primary: [113, 113, 122], accent: [63, 63, 70], label: 'CANCELADO' };
    return { primary: [99, 102, 241], accent: [79, 70, 229], label: 'PENDENTE' };
  })();

  const headerH = 32;
  pdf.setFillColor(...colors.primary);
  pdf.rect(0, 0, pageW, headerH, 'F');
  pdf.setFillColor(...colors.accent);
  pdf.rect(0, headerH - 4, pageW, 4, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.text('FESTPAG', margin, 16);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Plataforma de eventos', margin, 22);

  const badgeText = `INGRESSO DIGITAL | ${colors.label}`;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  const badgeW = pdf.getTextWidth(badgeText) + 8;
  const badgeX = pageW - margin - badgeW;
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(badgeX, 11, badgeW, 7, 3.5, 3.5, 'F');
  pdf.setTextColor(...colors.accent);
  pdf.text(badgeText, badgeX + 4, 16);

  let y = headerH + 12;
  pdf.setTextColor(55, 65, 81);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  const titleLines = pdf.splitTextToSize(ticket.event.title, contentW);
  pdf.text(titleLines, margin, y);
  y += titleLines.length * 8;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(107, 114, 128);
  pdf.text(ticket.lot.name, margin, y);
  y += 8;

  const qrSize = 50;
  const qrX = margin;
  const qrY = y + 2;
  const qrDataUrl = await QRCode.toDataURL(ticket.ticket_code, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 400,
  });
  pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

  if (ticket.status === 'used' || ticket.status === 'cancelled') {
    pdf.setFillColor(255, 255, 255);
    pdf.setGState(new pdf.GState({ opacity: 0.7 }));
    pdf.rect(qrX, qrY + qrSize / 2 - 6, qrSize, 12, 'F');
    pdf.setGState(new pdf.GState({ opacity: 1 }));
    pdf.setTextColor(...colors.primary);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text(colors.label, qrX + qrSize / 2, qrY + qrSize / 2 + 1.5, { align: 'center' });
  }

  pdf.setTextColor(55, 65, 81);
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(13);
  pdf.text(ticket.ticket_code.slice(0, 8).toUpperCase(), qrX + qrSize / 2, qrY + qrSize + 6, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(107, 114, 128);
  pdf.text('Codigo do ingresso', qrX + qrSize / 2, qrY + qrSize + 10, { align: 'center' });

  const infoX = qrX + qrSize + 10;
  let infoY = qrY + 4;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...colors.accent);
  pdf.text('DATA E HORARIO', infoX, infoY);
  infoY += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(55, 65, 81);
  pdf.text(`${ticket.event.date} - ${ticket.event.time.slice(0, 5)}`, infoX, infoY);
  infoY += 9;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...colors.accent);
  pdf.text('LOCAL', infoX, infoY);
  infoY += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(55, 65, 81);
  const venueLines = pdf.splitTextToSize(ticket.event.venue, contentW - (infoX - margin));
  pdf.text(venueLines, infoX, infoY);
  infoY += venueLines.length * 5;
  pdf.text(`${ticket.event.city}/${ticket.event.state}`, infoX, infoY);

  y = qrY + qrSize + 18;

  const dashedLine = (yy) => {
    pdf.setDrawColor(209, 213, 219);
    pdf.setLineDashPattern([1.2, 1.5], 0);
    pdf.setLineWidth(0.3);
    pdf.line(margin, yy, pageW - margin, yy);
    pdf.setLineDashPattern([], 0);
  };

  dashedLine(y); y += 8;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...colors.accent);
  pdf.text('DADOS DO PORTADOR', margin, y); y += 6;

  const drawField = (label, value, yy) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(107, 114, 128);
    pdf.setFontSize(9);
    pdf.text(label, margin, yy);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(55, 65, 81);
    pdf.setFontSize(10);
    pdf.text(value, margin + 30, yy);
  };

  drawField('Nome:', ticket.holder_name || '-', y); y += 5.5;
  drawField('E-mail:', ticket.holder_email || '-', y); y += 5.5;
  drawField('Telefone:', ticket.holder_phone || '-', y); y += 8;

  dashedLine(y); y += 8;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...colors.accent);
  pdf.text('INFORMACOES DA COMPRA', margin, y); y += 6;
  drawField('Lote:', ticket.lot.name, y); y += 5.5;
  drawField('Valor pago:', `R$ ${ticket.lot.price.toFixed(2)}`, y); y += 5.5;
  drawField('Data da compra:', ticket.created_at, y); y += 5.5;
  if (ticket.status === 'used' && ticket.validated_at) {
    drawField('Validado em:', ticket.validated_at, y); y += 5.5;
  }
  y += 3;

  dashedLine(y); y += 8;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...colors.accent);
  pdf.text('COMO USAR SEU INGRESSO', margin, y); y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor(55, 65, 81);
  ['1. Apresente este QR Code na entrada do evento.',
   '2. Tenha um documento com foto em maos para conferencia.',
   '3. O ingresso e pessoal e intransferivel.',
   '4. Chegue com antecedencia para evitar filas.'].forEach((line) => {
    pdf.text(line, margin, y); y += 5;
  });
  y += 3;

  dashedLine(y); y += 8;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(220, 38, 38);
  pdf.text('IMPORTANTE', margin, y); y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(55, 65, 81);
  ['- Nao compartilhe a imagem do QR Code com terceiros.',
   '- Cada ingresso permite apenas UMA entrada no evento.',
   '- Em caso de duvidas: contato.festpag@gmail.com'].forEach((line) => {
    const lines = pdf.splitTextToSize(line, contentW);
    pdf.text(lines, margin, y); y += lines.length * 4.5;
  });

  const footerY = pageH - 12;
  pdf.setDrawColor(209, 213, 219);
  pdf.setLineWidth(0.3);
  pdf.line(margin, footerY - 4, pageW - margin, footerY - 4);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(107, 114, 128);
  pdf.text('Gerado por FestPag | ingressosrp.com.br', margin, footerY);
  pdf.text(`Emitido em ${new Date().toISOString()}`, pageW - margin, footerY, { align: 'right' });

  writeFileSync(outPath, Buffer.from(pdf.output('arraybuffer')));
}

(async () => {
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    await generate(t, `/tmp/qa-ticket-${t.status}.pdf`);
    console.log(`Generated /tmp/qa-ticket-${t.status}.pdf`);
  }
})();
