/*
 * AuthModalV2 — o FluxoConta dentro de um modal, aberto pela compra no EventDetails.
 * Desde a virada de 09/09 é o ÚNICO modal de conta do site (o AuthModal antigo saiu).
 * Cheio na tela do celular; cartão com brilho no desktop.
 */
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { FluxoConta } from '@/components/auth/FluxoConta';

interface AuthModalV2Props {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
}

export function AuthModalV2({ isOpen, onClose, onAuthenticated }: AuthModalV2Props) {
  const isMobile = useIsMobile();
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden border-border/50',
          isMobile
            ? 'w-screen h-screen max-w-none rounded-none top-0 left-0 translate-x-0 translate-y-0 bg-card'
            : 'sm:max-w-md rounded-3xl backdrop-blur-2xl bg-card/70 shadow-2xl',
        )}
      >
        {!isMobile && (
          <div aria-hidden className="pointer-events-none absolute -inset-1 rounded-[inherit] -z-10 opacity-60 blur-2xl"
            style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.4), hsl(330 85% 60% / 0.3))' }} />
        )}
        <FluxoConta ativo={isOpen} onFechar={onClose} onAuthenticated={onAuthenticated} />
      </DialogContent>
    </Dialog>
  );
}
