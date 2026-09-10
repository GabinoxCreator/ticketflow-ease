/*
 * AuthModalV2 — o FluxoConta dentro de um modal, aberto pela compra do ingresso.
 *
 * Abre na aba CRIAR CONTA de propósito (10/09/2026, ordem do Gabriel): quem
 * travou no "ir para pagamento" quase sempre ainda não tem conta. Quem já tem
 * acha o caminho no cartão destacado embaixo do primeiro passo.
 */
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
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
    <Dialog open={isOpen} onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden border-border/60',
          isMobile ? 'max-w-full h-screen rounded-none' : 'sm:max-w-[468px] rounded-3xl',
        )}
      >
        {/*
          * Título para leitor de tela. Sem ele o Radix avisa no console
          * ("DialogContent requires a DialogTitle") — foi o que apareceu na
          * conferência de produção de 10/09.
          */}
        <VisuallyHidden>
          <DialogTitle>Entrar ou criar a sua conta FestPag</DialogTitle>
        </VisuallyHidden>
        <FluxoConta
          ativo={isOpen}
          abaInicial="cadastro"
          onFechar={onClose}
          onAuthenticated={onAuthenticated}
        />
      </DialogContent>
    </Dialog>
  );
}
