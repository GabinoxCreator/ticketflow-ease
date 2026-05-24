import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useGuestListMutations } from '@/hooks/useGuestLists';
import { Users } from 'lucide-react';
import { toast } from 'sonner';

interface BulkAddGuestsDialogProps {
  listId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_NAME_LEN = 120;

function parseNames(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim().slice(0, MAX_NAME_LEN);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function BulkAddGuestsDialog({ listId, open, onOpenChange }: BulkAddGuestsDialogProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { addEntriesBulk } = useGuestListMutations();

  const names = useMemo(() => parseNames(text), [text]);

  const handleSubmit = async () => {
    if (names.length === 0) return;
    setSubmitting(true);
    try {
      await addEntriesBulk.mutateAsync({ listId, names });
      toast.success(`${names.length} convidado${names.length > 1 ? 's' : ''} adicionado${names.length > 1 ? 's' : ''}`);
      setText('');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao adicionar convidados');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar convidados em massa</DialogTitle>
          <DialogDescription>
            Cole os nomes abaixo, um por linha. Linhas vazias e duplicadas são ignoradas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            placeholder={'Franciele Ruiz\nAmanda Junielle\nBeatriz Rodrigues Silva\n...'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            className="font-mono text-sm"
            disabled={submitting}
          />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {names.length > 0
              ? `${names.length} convidado${names.length > 1 ? 's' : ''} será${names.length > 1 ? 'ão' : ''} adicionado${names.length > 1 ? 's' : ''}`
              : 'Nenhum nome detectado ainda'}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={names.length === 0 || submitting}>
            {submitting ? 'Adicionando...' : `Adicionar ${names.length || ''}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
