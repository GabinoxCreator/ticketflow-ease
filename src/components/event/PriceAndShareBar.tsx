import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Props {
  fromPrice: number | null;
  shareTitle: string;
  shareText?: string;
  isBeneficent?: boolean;
}

const formatPrice = (price: number) =>
  price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const PriceAndShareBar = ({ fromPrice, shareTitle, shareText, isBeneficent }: Props) => {
  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, text: shareText, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado!');
    } catch {
      // user canceled share — ignore
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 py-4 border-y border-border/60">
      <div className="min-w-0">
        {fromPrice !== null && fromPrice > 0 ? (
          <>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{isBeneficent ? 'CONVITE A PARTIR DE' : 'A partir de'}</p>
            <p className="font-bold text-2xl gradient-text">{formatPrice(fromPrice)}</p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Confira os ingressos disponíveis</p>
        )}
      </div>
      <Button variant="outline" size="lg" onClick={handleShare} className="shrink-0">
        <Share2 className="w-4 h-4 mr-2" />
        Compartilhar
      </Button>
    </div>
  );
};

export default PriceAndShareBar;
