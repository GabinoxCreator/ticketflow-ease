import { memo } from 'react';
import { Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { DonationCampaign } from '@/data/donationCampaigns';
import { trackDonationClick } from '@/lib/donationTelemetry';

interface DonationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: DonationCampaign;
  /** Só no evento beneficente: habilita telemetria do clique "Copiar PIX". */
  isBeneficent?: boolean;
}

// Memoizado — geração do SVG é pesada e não deve re-renderizar com o estado do pai
const DonationQrCode = memo(({ value }: { value: string }) => (
  <QRCodeSVG value={value} size={208} level="M" includeMargin={false} />
));
DonationQrCode.displayName = 'DonationQrCode';

function copyToClipboardFallback(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function DonationModal({ open, onOpenChange, campaign, isBeneficent = false }: DonationModalProps) {
  const handleCopy = () => {
    // Telemetria só no evento beneficente (fire-and-forget, não bloqueia o copy).
    if (isBeneficent) trackDonationClick(campaign.slug, 'copiar_pix');

    // UI otimista — não bloqueia aguardando o clipboard
    toast.success('PIX copia e cola copiado!');

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(campaign.pixCopyPaste).catch(() => {
        if (!copyToClipboardFallback(campaign.pixCopyPaste)) {
          toast.error('Não foi possível copiar. Selecione o código manualmente.');
        }
      });
    } else if (!copyToClipboardFallback(campaign.pixCopyPaste)) {
      toast.error('Não foi possível copiar. Selecione o código manualmente.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white text-neutral-900 max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="text-xl font-bold text-neutral-900">
            {campaign.title}
          </DialogTitle>
          <DialogDescription className="text-xs font-semibold uppercase tracking-[0.2em] text-pink-600">
            {campaign.subtitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* QR Code */}
          <div className="flex justify-center">
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <DonationQrCode value={campaign.pixCopyPaste} />
            </div>
          </div>

          {/* Chave PIX */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              {campaign.pixKeyLabel}
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-neutral-900">
              {campaign.pixKey}
            </p>
          </div>

          {/* Copiar PIX copia e cola */}
          <Button
            size="lg"
            className="w-full bg-pink-600 text-white hover:bg-pink-700"
            onClick={handleCopy}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copiar PIX copia e cola
          </Button>

          {/* Para quem vai a doação */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Sua doação vai para
            </p>
            <dl className="mt-2 space-y-1 text-sm text-neutral-700">
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">Recebedor</dt>
                <dd className="text-right font-medium text-neutral-900">
                  {campaign.recipientName}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">CNPJ/CPF</dt>
                <dd className="text-right font-medium text-neutral-900">
                  {campaign.recipientDocument}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">Banco</dt>
                <dd className="text-right font-medium text-neutral-900">
                  {campaign.recipientBank}
                </dd>
              </div>
            </dl>
          </div>

          {/* Rodapé */}
          <p className="text-center text-xs italic text-neutral-500">{campaign.footer}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DonationModal;
