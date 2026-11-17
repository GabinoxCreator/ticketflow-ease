import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { useEventoTemPedido, EVENTO_COM_PEDIDO_NAO_SE_EXCLUI } from '@/hooks/useEventoTemPedido';

interface Props {
  /** Evento a excluir. null = janela fechada. */
  eventId: string | null;
  eventTitle?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (eventId: string) => void;
}

// A janela do "Excluir evento" das listas (OS-408). Confere antes se o evento tem
// pedido: se tem, o banco recusaria de qualquer jeito, então a janela explica e não
// oferece o botão. Se a conferência falhar, oferece: quem trava de verdade é o banco.
export function ExcluirEventoDialog({ eventId, eventTitle, onOpenChange, onConfirm }: Props) {
  // Guarda o último evento enquanto a janela fecha, para o texto não trocar na animação.
  const [alvo, setAlvo] = useState<string | null>(eventId);
  useEffect(() => { if (eventId) setAlvo(eventId); }, [eventId]);
  const { data: temPedido, isLoading } = useEventoTemPedido(eventId ?? alvo, !!(eventId ?? alvo));

  return (
    <AlertDialog open={!!eventId} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {isLoading ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir evento?</AlertDialogTitle>
              <AlertDialogDescription className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Conferindo se o evento já tem pedido...
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : temPedido ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Este evento não pode ser excluído</AlertDialogTitle>
              <AlertDialogDescription>{EVENTO_COM_PEDIDO_NAO_SE_EXCLUI}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Entendi</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir evento?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. {eventTitle ? `O evento "${eventTitle}"` : 'O evento'} e todos os
                seus lotes serão permanentemente excluídos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => eventId && onConfirm(eventId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
