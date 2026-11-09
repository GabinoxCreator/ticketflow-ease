import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Só roda quando o produtor confirma. "Voltar" e fechar não gravam nada. */
  onConfirm: () => void;
}

// Despublicar para a venda na hora: antes era um clique só, sem pergunta (OS-408).
// Texto aprovado pelo Gabriel em 09/11/2026.
export function TirarDoArDialog({ open, onOpenChange, onConfirm }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Tirar este evento do ar?</AlertDialogTitle>
          <AlertDialogDescription>
            O evento sai do site e para de vender agora. Quem já comprou continua com o ingresso.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Tirar do ar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
