import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import logoUrl from '@/assets/logo-festpag.png';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface TicketPdfData {
  event: {
    title: string;
    date: string;   // YYYY-MM-DD
    time: string;   // HH:MM(:SS)
    venue: string;
    city: string;
    state: string;
  };
  lot: { name: string };
  ticket: {
    ticket_code: string;
    holder_name: string;
  };
  issuedAt?: Date;
  status?: 'valid' | 'used' | 'cancelled' | 'pending';
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const COLORS = {
  textDark: [26, 26, 26] as [number, number, number],
  textMuted: [138, 138, 138] as [number, number, number],
  textSecondary: [85, 85, 85] as [number, number, number],
  brandDark: [45, 27, 105] as [number, number, number],
  brandPurple: [155, 91, 255] as [number, number, number],
  brandPurpleDeep: [107, 63, 207] as [number, number, number],
  gradientStart: [77, 124, 255] as [number, number, number],
  gradientMid: [155, 91, 255] as [number, number, number],
  gradientEnd: [255, 91, 200] as [number, number, number],
  bgSubtle: [250, 250, 250] as [number, number, number],
  bgTint: [250, 247, 255] as [number, number, number],
  borderSubtle: [236, 236, 236] as [number, number, number],
  borderDashed: [208, 200, 232] as [number, number, number],
  footerGray: [160, 160, 160] as [number, number, number],
};

const M = { top: 12, right: 14, bottom: 8, left: 14 };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function drawBold(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  options?: { align?: 'left' | 'center' | 'right' }
) {
  pdf.text(text, x, y, options);
  pdf.text(text, x + 0.12, y, options);
}

function toTitleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Insert thin spaces between characters to fake letter-spacing. */
function spaced(text: string, sep = ' '): string {
  return text.split('').join(sep);
}

/** Interpolate between [a,b,c] colors at t in [0,1] across 3 stops (0, 0.55, 1). */
function gradientAt(t: number): [number, number, number] {
  const [a, b, c] =
    t <= 0.55
      ? [COLORS.gradientStart, COLORS.gradientMid, t / 0.55] as const
      : [COLORS.gradientMid, COLORS.gradientEnd, (t - 0.55) / 0.45] as const;
  const k = c as number;
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

/* ------------------------------------------------------------------ */
/* Logo cache (load once per session)                                  */
/* ------------------------------------------------------------------ */

let cachedLogo: { dataUrl: string; w: number; h: number } | null = null;

async function loadLogo(): Promise<typeof cachedLogo> {
  if (cachedLogo) return cachedLogo;
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    // Get intrinsic size
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
    cachedLogo = { dataUrl, w: dims.w, h: dims.h };
    return cachedLogo;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Drawing primitives                                                  */
/* ------------------------------------------------------------------ */

function drawGradientPill(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string
) {
  const r = h / 2;
  // Pill background built from many thin vertical bands clipped by a rounded rect.
  // jsPDF lacks easy clipping, so we approximate by drawing the pill on top of bands
  // that are *inside* the bounding box. The visible region is the rounded rect, and
  // any spillover at the corners is masked by drawing the rect's stroke last.
  const strips = 60;
  const stripW = w / strips;
  for (let i = 0; i < strips; i++) {
    const t = i / (strips - 1);
    const [rr, gg, bb] = gradientAt(t);
    pdf.setFillColor(rr, gg, bb);
    // Reduce vertical extent at the rounded edges so we don't paint outside the pill
    const cx = x + i * stripW + stripW / 2;
    const dxFromCenter = Math.abs(cx - (x + w / 2));
    const halfFlat = w / 2 - r;
    let topY = y;
    let bandH = h;
    if (dxFromCenter > halfFlat) {
      // We're inside one of the rounded caps; shrink the band to fit the arc.
      const dx = dxFromCenter - halfFlat;
      // arc: y = r - sqrt(r^2 - dx^2)
      const inset = r - Math.sqrt(Math.max(0, r * r - dx * dx));
      topY = y + inset;
      bandH = h - inset * 2;
    }
    pdf.rect(cx - stripW / 2, topY, stripW + 0.05, bandH, 'F');
  }
  // Label
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(9.5);
  pdf.setFont('helvetica', 'bold');
  pdf.text(label, x + w / 2, y + h / 2 + 1.4, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
}

function drawDashedRoundedRect(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: [number, number, number]
) {
  pdf.setDrawColor(...color);
  pdf.setLineWidth(0.3);
  pdf.setLineDashPattern([1.4, 1.2], 0);
  pdf.roundedRect(x, y, w, h, r, r, 'S');
  pdf.setLineDashPattern([], 0);
}

/* ------------------------------------------------------------------ */
/* Main renderer                                                       */
/* ------------------------------------------------------------------ */

export async function renderTicketPage(pdf: jsPDF, data: TicketPdfData) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - M.left - M.right;
  const cx = pageW / 2;

  pdf.setFont('helvetica', 'normal');

  /* -------------------- HEADER: LOGO + TAGLINE -------------------- */
  let y = M.top;
  const logo = await loadLogo();
  if (logo) {
    const logoW = 44;
    const logoH = (logo.h / logo.w) * logoW;
    pdf.addImage(logo.dataUrl, 'PNG', cx - logoW / 2, y, logoW, logoH);
    y += logoH + 3;
  } else {
    pdf.setTextColor(...COLORS.brandDark);
    pdf.setFontSize(20);
    drawBold(pdf, 'FESTPAG', cx, y + 6, { align: 'center' });
    y += 10;
  }

  pdf.setFontSize(7.5);
  pdf.setTextColor(...COLORS.textMuted);
  pdf.text(spaced('INGRESSO DIGITAL', '  '), cx, y, { align: 'center' });
  y += 4;

  pdf.setDrawColor(...COLORS.borderSubtle);
  pdf.setLineWidth(0.3);
  pdf.line(M.left, y, pageW - M.right, y);
  y += 6;

  /* -------------------- EVENT NAME -------------------------------- */
  pdf.setTextColor(...COLORS.brandDark);
  pdf.setFontSize(20);
  const titleLines: string[] = pdf.splitTextToSize(data.event.title, contentW);
  titleLines.forEach((line, i) => {
    drawBold(pdf, line, cx, y + 6 + i * 7.5, { align: 'center' });
  });
  y += titleLines.length * 7.5 + 2;

  /* -------------------- LOT BADGE --------------------------------- */
  pdf.setFontSize(9.5);
  const lotLabel = (data.lot.name || 'INGRESSO').toUpperCase();
  const labelW = pdf.getTextWidth(lotLabel);
  const badgeH = 6.5;
  const badgeW = Math.max(labelW + 14, 32);
  drawGradientPill(pdf, cx - badgeW / 2, y, badgeW, badgeH, lotLabel);
  y += badgeH + 6;

  /* -------------------- QR CODE ----------------------------------- */
  const qrSize = 70;
  const framePad = 4;
  const frameSize = qrSize + framePad * 2;
  const frameX = cx - frameSize / 2;
  const frameY = y;

  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(...COLORS.borderSubtle);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(frameX, frameY, frameSize, frameSize, 3, 3, 'FD');

  const qrDataUrl = await QRCode.toDataURL(data.ticket.ticket_code, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 600,
    color: { dark: '#000000', light: '#ffffff' },
  });
  pdf.addImage(qrDataUrl, 'PNG', cx - qrSize / 2, frameY + framePad, qrSize, qrSize);

  /* -------------------- STATUS STAMP (optional) ------------------- */
  if (data.status === 'used' || data.status === 'cancelled') {
    const label = data.status === 'used' ? 'UTILIZADO' : 'CANCELADO';
    const color: [number, number, number] =
      data.status === 'used' ? [220, 38, 38] : [113, 113, 122];
    const GState = (pdf as any).GState;
    if (GState) pdf.setGState(new GState({ opacity: 0.88 }));
    pdf.setFillColor(255, 255, 255);
    const stampH = 18;
    pdf.rect(frameX, frameY + frameSize / 2 - stampH / 2, frameSize, stampH, 'F');
    if (GState) pdf.setGState(new GState({ opacity: 1 }));
    pdf.setTextColor(...color);
    pdf.setFontSize(20);
    drawBold(pdf, label, cx, frameY + frameSize / 2 + 2.5, { align: 'center' });
  }

  y = frameY + frameSize + 6;

  /* -------------------- TICKET CODE ------------------------------- */
  const shortCode = data.ticket.ticket_code
    .replace(/-/g, '')
    .slice(0, 8)
    .toUpperCase();
  pdf.setFont('courier', 'bold');
  pdf.setTextColor(...COLORS.textDark);
  pdf.setFontSize(17);
  pdf.text(spaced(shortCode, '  '), cx, y, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  y += 3.5;
  pdf.setFontSize(7);
  pdf.setTextColor(...COLORS.textMuted);
  pdf.text(spaced('CÓDIGO DO INGRESSO', ' '), cx, y, { align: 'center' });
  y += 5;

  /* -------------------- INFO GRID --------------------------------- */
  const gridPad = 5;
  const gridX = M.left;
  const gridW = contentW;
  const gridY = y;
  const colW = (gridW - gridPad * 2) / 2;
  const rowH = 13;
  const gridH = gridPad * 2 + rowH * 2;

  pdf.setFillColor(...COLORS.bgSubtle);
  pdf.roundedRect(gridX, gridY, gridW, gridH, 3, 3, 'F');

  const eventDate = new Date(data.event.date + 'T12:00:00');
  const dateLong = toTitleCase(
    format(eventDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  );
  const timeStr = (data.event.time || '').slice(0, 5);
  const issued = data.issuedAt ?? new Date();
  const issuedStr = format(issued, "dd/MM/yyyy", { locale: ptBR });
  const issuedTime = format(issued, "HH:mm", { locale: ptBR });

  const cells: Array<{ label: string; v1: string; v2?: string }> = [
    { label: 'DATA E HORÁRIO', v1: dateLong, v2: timeStr ? `às ${timeStr}` : '' },
    {
      label: 'LOCAL',
      v1: data.event.venue,
      v2: `${data.event.city}/${data.event.state}`,
    },
    { label: 'PORTADOR', v1: data.ticket.holder_name || '—' },
    { label: 'EMITIDO EM', v1: issuedStr, v2: `às ${issuedTime}` },
  ];

  cells.forEach((cell, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cellX = gridX + gridPad + col * colW;
    const cellY = gridY + gridPad + row * rowH;
    pdf.setFontSize(7);
    pdf.setTextColor(...COLORS.textMuted);
    drawBold(pdf, cell.label, cellX, cellY + 2.5);
    pdf.setFontSize(10);
    pdf.setTextColor(...COLORS.textDark);
    const v1Lines: string[] = pdf.splitTextToSize(cell.v1, colW - 2);
    drawBold(pdf, v1Lines[0] ?? '—', cellX, cellY + 7);
    if (cell.v2) {
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COLORS.textSecondary);
      pdf.text(cell.v2, cellX, cellY + 11);
    }
  });

  y = gridY + gridH + 5;

  /* -------------------- INSTRUCTIONS CARD ------------------------- */
  const instructions = [
    'Apresente este QR Code na entrada do evento — pode ser direto da tela do celular ou impresso.',
    'Garanta que o QR Code esteja nítido e completamente visível para leitura na portaria.',
    'Este ingresso é pessoal e intransferível, válido para uma única entrada.',
    'Em caso de dúvidas, entre em contato com a produção do evento.',
  ];
  const cardPadX = 6;
  const cardPadY = 5;
  // Pre-measure lines
  pdf.setFontSize(8.5);
  const innerW = contentW - cardPadX * 2 - 4;
  const wrapped = instructions.map((t) => pdf.splitTextToSize(t, innerW) as string[]);
  const lineH = 4.2;
  const itemGap = 1.5;
  const titleH = 5;
  const cardContentH =
    titleH + 2 + wrapped.reduce((s, ls) => s + ls.length * lineH + itemGap, 0);
  const cardH = cardContentH + cardPadY * 2;

  // Background then dashed border
  pdf.setFillColor(...COLORS.bgTint);
  pdf.roundedRect(M.left, y, contentW, cardH, 3, 3, 'F');
  drawDashedRoundedRect(pdf, M.left, y, contentW, cardH, 3, COLORS.borderDashed);

  let cy = y + cardPadY + 3;
  pdf.setFontSize(8.5);
  pdf.setTextColor(...COLORS.brandPurpleDeep);
  drawBold(pdf, spaced('ORIENTAÇÕES DE USO', ' '), M.left + cardPadX, cy);
  cy += titleH;

  pdf.setFontSize(8.5);
  pdf.setTextColor(68, 68, 68);
  wrapped.forEach((lines) => {
    // bullet
    pdf.setFillColor(...COLORS.brandPurple);
    pdf.circle(M.left + cardPadX + 1.2, cy + 1.6, 0.85, 'F');
    lines.forEach((line, i) => {
      pdf.text(line, M.left + cardPadX + 4.2, cy + 2 + i * lineH);
    });
    cy += lines.length * lineH + itemGap;
  });

  y += cardH + 5;

  /* -------------------- FOOTER ------------------------------------ */
  const footerY = pageH - M.bottom;
  pdf.setDrawColor(...COLORS.borderSubtle);
  pdf.setLineWidth(0.3);
  pdf.line(M.left, footerY - 4, pageW - M.right, footerY - 4);
  pdf.setFontSize(7.5);
  pdf.setTextColor(...COLORS.footerGray);
  drawBold(pdf, 'FestPag · festpag.com.br', M.left, footerY);
  pdf.text('Plataforma de eventos', pageW - M.right, footerY, { align: 'right' });
}

/* ------------------------------------------------------------------ */
/* Convenience: filename slug                                          */
/* ------------------------------------------------------------------ */

export function slugifyForFilename(input: string, max = 40): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, max)
    .replace(/-$/, '');
}
