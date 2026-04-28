import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { PayoutRow } from '@/hooks/useProducerFinance';

interface Props {
  payout: PayoutRow;
  eventTitle?: string;
  producerName?: string;
}

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function PayoutPdfButton({ payout, eventTitle, producerName }: Props) {
  const handleDownload = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header band
    doc.setFillColor(99, 102, 241);
    doc.rect(0, 0, pageWidth, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Comprovante de Repasse', 14, 19);

    // Producer
    doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    let y = 44;
    if (producerName) {
      doc.text(`Produtor: ${producerName}`, 14, y);
      y += 7;
    }
    if (eventTitle) {
      doc.text(`Evento: ${eventTitle}`, 14, y);
      y += 7;
    }
    doc.text(`Repasse #: ${payout.id.slice(0, 8).toUpperCase()}`, 14, y);
    y += 7;

    const paidDate = payout.paid_at
      ? format(new Date(payout.paid_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })
      : '—';
    doc.text(`Data do pagamento: ${paidDate}`, 14, y);
    y += 7;
    doc.text(`Status: ${payout.status}`, 14, y);
    y += 12;

    // Bank
    const bank = payout.bank_account_snapshot || {};
    doc.setFont('helvetica', 'bold');
    doc.text('Dados Bancários', 14, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    if (bank.bank_name) { doc.text(`Banco: ${bank.bank_name}`, 14, y); y += 6; }
    if (bank.account_holder_name) { doc.text(`Titular: ${bank.account_holder_name}`, 14, y); y += 6; }
    if (bank.agency) { doc.text(`Agência: ${bank.agency}`, 14, y); y += 6; }
    if (bank.account_number) { doc.text(`Conta: ${bank.account_number}`, 14, y); y += 6; }
    if (bank.pix_key) { doc.text(`PIX: ${bank.pix_key}`, 14, y); y += 6; }
    y += 6;

    // Values box
    doc.setDrawColor(99, 102, 241);
    doc.setLineWidth(0.5);
    doc.rect(14, y, pageWidth - 28, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Receita Bruta', 18, y + 8);
    doc.text(formatBRL(Number(payout.gross_amount)), pageWidth - 18, y + 8, { align: 'right' });
    doc.text('Taxa Plataforma', 18, y + 16);
    doc.text(`- ${formatBRL(Number(payout.platform_fee))}`, pageWidth - 18, y + 16, { align: 'right' });
    doc.setDrawColor(220, 220, 220);
    doc.line(18, y + 22, pageWidth - 18, y + 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Valor Transferido', 18, y + 32);
    doc.text(formatBRL(Number(payout.net_amount)), pageWidth - 18, y + 32, { align: 'right' });

    if (payout.notes) {
      y += 50;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.text(`Obs.: ${payout.notes}`, 14, y);
    }

    // Footer
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('FestPag · Gerado automaticamente', 14, doc.internal.pageSize.getHeight() - 10);

    doc.save(`repasse-${payout.id.slice(0, 8)}.pdf`);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleDownload}>
      <Download className="w-4 h-4 mr-1.5" />
      PDF
    </Button>
  );
}
