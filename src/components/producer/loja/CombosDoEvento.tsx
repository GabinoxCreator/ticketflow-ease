import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Boxes, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { EventLot } from '@/hooks/useEventLots';
import { useCombosDoEvento, useInvalidarLoja } from '@/hooks/useLojaDoEvento';
import { nomeDoLote, problemasDoCombo, somaDasPartes } from '@/lib/loja/combos';
import {
  lojaDb,
  nomeDoProduto,
  reais,
  NOME_DO_ESTADO,
  type ComboCompleto,
  type EstadoNaLoja,
  type ItemDoCombo,
  type ProdutoNoEventoCompleto,
} from '@/lib/loja/tipos';
import { cn } from '@/lib/utils';
import { ComboDialog } from './ComboDialog';

const CORES_DO_ESTADO: Record<EstadoNaLoja, string> = {
  active: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  draft: 'bg-muted text-muted-foreground border-border',
};

interface Props {
  eventId: string;
  produtos: ProdutoNoEventoCompleto[];
  lots: EventLot[];
}

export function CombosDoEvento({ eventId, produtos, lots }: Props) {
  const { data: combos, isLoading } = useCombosDoEvento(eventId);
  const invalidar = useInvalidarLoja(eventId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ComboCompleto | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const nomeDoItem = (i: ItemDoCombo): string => {
    if (i.kind === 'lot') {
      const lote = lots.find((l) => l.id === i.lot_id);
      return lote ? `Ingresso ${nomeDoLote(lote)}` : 'Ingresso que não existe mais';
    }
    const ep = produtos.find((p) => p.id === i.event_product_id);
    return ep ? nomeDoProduto(ep.product) : 'Produto que não está mais no evento';
  };

  const mudarEstado = useMutation({
    mutationFn: async ({ combo, novo }: { combo: ComboCompleto; novo: EstadoNaLoja }) => {
      if (novo === 'active') {
        // O banco não confere combo na ativação: esta é a trava.
        const problemas = problemasDoCombo(combo.price, combo.items, lots, produtos);
        if (problemas.length > 0) throw new Error('Ainda falta: ' + problemas.join('; ') + '.');
      }
      const { error } = await lojaDb
        .from('event_bundles')
        .update({ status: novo, updated_at: new Date().toISOString() })
        .eq('id', combo.id);
      if (error) throw error;
    },
    onSuccess: (_d, { novo }) => {
      invalidar();
      toast.success(novo === 'active' ? 'Combo à venda!' : 'Combo pausado. Ele saiu da página do evento.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await lojaDb.from('event_bundles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success('Combo excluído.');
    },
    onError: (e: Error) => toast.error('Erro ao excluir combo: ' + e.message),
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-xl font-bold">Combos</h3>
          <p className="text-sm text-muted-foreground">
            Junte ingresso e produto, ou produtos entre si, por um preço fechado.
          </p>
        </div>
        <Button variant="hero" className="shrink-0" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Novo combo
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !combos || combos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <Boxes className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold">Nenhum combo criado</p>
          <p className="text-sm text-muted-foreground">
            Exemplo: convite + camiseta por R$ 150,00, ou copo + camiseta para quem já tem o convite.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {combos.map((c) => {
            const problemas = problemasDoCombo(c.price, c.items, lots, produtos);
            const soma = somaDasPartes(c.items);
            const aVenda = c.status === 'active';
            return (
              <div key={c.id} className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Boxes className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{c.name}</span>
                      <Badge variant="outline" className={cn('text-xs', CORES_DO_ESTADO[c.status])}>
                        {NOME_DO_ESTADO[c.status] ?? c.status}
                      </Badge>
                      <span className="font-mono font-bold">{reais(c.price)}</span>
                    </div>
                    {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setDialogOpen(true); }}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>

                {c.items.length > 0 && (
                  <ul className="text-sm space-y-1">
                    {c.items.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate">{i.quantity} × {nomeDoItem(i)}</span>
                        <span className="font-mono text-muted-foreground shrink-0">{reais(i.unit_face_share)} cada</span>
                      </li>
                    ))}
                    <li className="flex items-center justify-between gap-3 pt-1 border-t border-border/50 font-medium">
                      <span>Soma das partes</span>
                      <span className="font-mono">{reais(soma / 100)}</span>
                    </li>
                  </ul>
                )}

                {problemas.length > 0 && (
                  <div
                    className={cn(
                      'rounded-lg border p-3',
                      aVenda ? 'border-destructive/30 bg-destructive/10' : 'border-amber-500/30 bg-amber-500/10',
                    )}
                  >
                    <p className="text-sm font-medium mb-1">
                      {aVenda
                        ? 'Este combo está à venda, mas tem problema. Pause e corrija:'
                        : 'Para ativar o combo, falta:'}
                    </p>
                    <ul className="text-sm list-disc pl-5 space-y-0.5">
                      {problemas.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex justify-end">
                  {aVenda ? (
                    <Button
                      variant="outline"
                      disabled={mudarEstado.isPending}
                      onClick={() => mudarEstado.mutate({ combo: c, novo: 'paused' })}
                    >
                      <Pause className="w-4 h-4 mr-2" />
                      Pausar venda
                    </Button>
                  ) : (
                    <Button
                      variant="hero"
                      disabled={problemas.length > 0 || mudarEstado.isPending}
                      onClick={() => mudarEstado.mutate({ combo: c, novo: 'active' })}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Ativar combo
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ComboDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        eventId={eventId}
        combo={editing}
        proximaOrdem={combos?.length ?? 0}
        lots={lots}
        produtos={produtos}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir combo?</AlertDialogTitle>
            <AlertDialogDescription>
              O combo sai da página do evento. Os pedidos já feitos com ele continuam valendo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) { excluir.mutate(deleteId); setDeleteId(null); } }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
