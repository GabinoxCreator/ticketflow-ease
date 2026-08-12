// Convite de cadastro depois da curtida (funil, decisão do Gabriel em 12/08):
// o like do visitante sem conta é registrado NA HORA (sem fricção) e só então
// aparece este convite. Quem dispensar continua com a curtida — nada é desfeito.
// Ao criar a conta, o like anônimo é adotado pela conta nova
// (RPC claim_my_anonymous_likes), então a curtida não vira duplicada.
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const SNOOZE_KEY = 'festpag_like_invite_snoozed_at';
const SNOOZE_DAYS = 7;

/** Não insistir: no máximo um convite a cada 7 dias por navegador. */
export function shouldShowLikeInvite(): boolean {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return true;
    const last = Number(raw);
    if (!Number.isFinite(last)) return true;
    return Date.now() - last > SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false; // storage indisponível: não incomoda
  }
}

export function markLikeInviteShown() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
  } catch {
    /* storage indisponível: segue sem registrar */
  }
}

interface LikeSignupInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTitle?: string | null;
}

export function LikeSignupInviteDialog({
  open,
  onOpenChange,
  eventTitle,
}: LikeSignupInviteDialogProps) {
  const navigate = useNavigate();

  const goToSignup = () => {
    const back = window.location.pathname + window.location.search;
    onOpenChange(false);
    navigate(`/login?mode=cadastrar&redirect=${encodeURIComponent(back)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Heart className="h-6 w-6 fill-primary text-primary" aria-hidden />
          </div>
          <DialogTitle className="text-center">Curtida registrada! 🎉</DialogTitle>
          <DialogDescription className="text-center">
            {eventTitle ? (
              <>
                Quer acompanhar <b>{eventTitle}</b>? Crie sua conta para receber avisos de
                novos lotes e comprar mais rápido.
              </>
            ) : (
              <>
                Quer acompanhar este evento? Crie sua conta para receber avisos de novos
                lotes e comprar mais rápido.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Agora não
          </Button>
          <Button onClick={goToSignup}>Criar minha conta</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
