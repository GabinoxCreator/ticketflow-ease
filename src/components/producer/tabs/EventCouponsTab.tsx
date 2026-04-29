import { useState } from 'react';
import { Plus, Pencil, Trash2, Tag, Percent, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useEventCoupons, type EventCoupon } from '@/hooks/useEventCoupons';
import { CouponDialog } from '@/components/producer/CouponDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props { eventId: string; }

export function EventCouponsTab({ eventId }: Props) {
  const { coupons, isLoading, createCoupon, updateCoupon, deleteCoupon } = useEventCoupons(eventId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EventCoupon | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-xl font-bold">Cupons de desconto</h3>
          <p className="text-sm text-muted-foreground">Crie cupons em valor ou porcentagem para este evento.</p>
        </div>
        <Button variant="hero" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Novo cupom
        </Button>
      </div>

      {coupons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <Tag className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold">Nenhum cupom criado</p>
          <p className="text-sm text-muted-foreground">Clique em "Novo cupom" para começar.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {coupons.map((c) => {
            const isPercent = c.discount_type === 'percent';
            const expired = c.valid_until && new Date(c.valid_until).getTime() < Date.now();
            const exhausted = c.max_uses != null && c.uses_count >= c.max_uses;
            return (
              <div key={c.id} className="rounded-xl border border-border bg-card/50 p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  {isPercent ? <Percent className="w-5 h-5 text-primary" /> : <DollarSign className="w-5 h-5 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold">{c.code}</span>
                    {!c.is_active && <Badge variant="secondary">Inativo</Badge>}
                    {expired && <Badge variant="destructive">Expirado</Badge>}
                    {exhausted && <Badge variant="destructive">Esgotado</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {isPercent ? `${c.discount_value}% OFF` : `R$ ${Number(c.discount_value).toFixed(2)} OFF`}
                    {' · '}
                    {c.uses_count}{c.max_uses != null ? ` / ${c.max_uses}` : ''} usos
                    {c.valid_until && ` · até ${formatDate(c.valid_until)}`}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setDialogOpen(true); }}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteId(c.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <CouponDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        isSubmitting={createCoupon.isPending || updateCoupon.isPending}
        onSubmit={async (data) => {
          if (editing) await updateCoupon.mutateAsync({ id: editing.id, data });
          else await createCoupon.mutateAsync(data);
          setDialogOpen(false);
        }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cupom?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) { deleteCoupon.mutate(deleteId); setDeleteId(null); } }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
