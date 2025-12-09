import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useGuestListMutations } from '@/hooks/useGuestLists';
import { toast } from 'sonner';
import { Clock, Link as LinkIcon } from 'lucide-react';

interface AddGuestListDialogProps {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddGuestListDialog({ eventId, open, onOpenChange }: AddGuestListDialogProps) {
  const [name, setName] = useState('');
  const [validUntilTime, setValidUntilTime] = useState('23:00');
  const [maxGuests, setMaxGuests] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { createList } = useGuestListMutations();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error('Digite um nome para a lista');
      return;
    }

    setIsSubmitting(true);

    try {
      await createList.mutateAsync({
        event_id: eventId,
        name: name.trim(),
        valid_until_time: validUntilTime,
        max_guests: maxGuests ? parseInt(maxGuests) : null,
      });

      toast.success('Lista criada com sucesso!');
      onOpenChange(false);
      setName('');
      setValidUntilTime('23:00');
      setMaxGuests('');
    } catch (error) {
      toast.error('Erro ao criar lista');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nova Lista de Cortesia</DialogTitle>
            <DialogDescription>
              Crie uma lista e compartilhe o link para convidados se inscreverem
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Lista</Label>
              <Input
                id="name"
                placeholder="Ex: Lista VIP, Aniversariantes"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="validUntil" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Válida até (horário)
              </Label>
              <Input
                id="validUntil"
                type="time"
                value={validUntilTime}
                onChange={(e) => setValidUntilTime(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A lista será válida na data do evento até este horário
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxGuests">Limite de Convidados (opcional)</Label>
              <Input
                id="maxGuests"
                type="number"
                min="1"
                placeholder="Sem limite"
                value={maxGuests}
                onChange={(e) => setMaxGuests(e.target.value)}
              />
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2 text-sm">
                <LinkIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Link será gerado automaticamente</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Criando...' : 'Criar Lista'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
