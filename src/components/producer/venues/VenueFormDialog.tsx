import { useEffect, useState } from 'react';
import { z } from 'zod';
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
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateVenue,
  useUpdateVenue,
  type Venue,
  type VenueFormData,
} from '@/hooks/useVenues';

const schema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100),
  address: z.string().trim().max(255).optional().or(z.literal('')),
  city: z.string().trim().max(100).optional().or(z.literal('')),
  state: z
    .string()
    .trim()
    .max(2, 'Use a sigla (2 letras)')
    .optional()
    .or(z.literal('')),
  capacity: z
    .union([z.number().int().min(0).max(1_000_000), z.nan()])
    .optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venue?: Venue | null;
}

const emptyForm: VenueFormData = {
  name: '',
  address: '',
  city: '',
  state: '',
  capacity: null,
  notes: '',
};

export function VenueFormDialog({ open, onOpenChange, venue }: Props) {
  const isEdit = !!venue;
  const [form, setForm] = useState<VenueFormData>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMut = useCreateVenue();
  const updateMut = useUpdateVenue();
  const saving = createMut.isPending || updateMut.isPending;

  useEffect(() => {
    if (open) {
      setErrors({});
      setForm(
        venue
          ? {
              name: venue.name,
              address: venue.address ?? '',
              city: venue.city ?? '',
              state: venue.state ?? '',
              capacity: venue.capacity,
              notes: venue.notes ?? '',
            }
          : emptyForm,
      );
    }
  }, [open, venue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({
      ...form,
      capacity:
        form.capacity === null || form.capacity === undefined
          ? undefined
          : Number(form.capacity),
    });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      Object.entries(parsed.error.flatten().fieldErrors).forEach(([k, v]) => {
        if (v?.[0]) fe[k] = v[0];
      });
      setErrors(fe);
      return;
    }
    const payload: VenueFormData = {
      name: parsed.data.name,
      address: parsed.data.address || null,
      city: parsed.data.city || null,
      state: parsed.data.state ? parsed.data.state.toUpperCase() : null,
      capacity:
        parsed.data.capacity && !Number.isNaN(parsed.data.capacity)
          ? parsed.data.capacity
          : null,
      notes: parsed.data.notes || null,
    };
    try {
      if (isEdit && venue) {
        await updateMut.mutateAsync({ id: venue.id, formData: payload });
      } else {
        await createMut.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      /* toast handled in hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar local' : 'Novo local'}</DialogTitle>
          <DialogDescription>
            Locais são reutilizáveis entre eventos. Cada local pode ter vários mapas
            de assentos.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="venue-name">Nome *</Label>
            <Input
              id="venue-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex.: Salão Principal"
              autoFocus
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="venue-address">Endereço</Label>
            <Input
              id="venue-address"
              value={form.address ?? ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            {errors.address && (
              <p className="text-xs text-destructive">{errors.address}</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="venue-city">Cidade</Label>
              <Input
                id="venue-city"
                value={form.city ?? ''}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
              {errors.city && (
                <p className="text-xs text-destructive">{errors.city}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="venue-state">UF</Label>
              <Input
                id="venue-state"
                maxLength={2}
                value={form.state ?? ''}
                onChange={(e) =>
                  setForm({ ...form, state: e.target.value.toUpperCase() })
                }
              />
              {errors.state && (
                <p className="text-xs text-destructive">{errors.state}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="venue-capacity">Capacidade total (opcional)</Label>
            <Input
              id="venue-capacity"
              type="number"
              min={0}
              value={form.capacity ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  capacity: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
            {errors.capacity && (
              <p className="text-xs text-destructive">{errors.capacity}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="venue-notes">Observações</Label>
            <Textarea
              id="venue-notes"
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            {errors.notes && (
              <p className="text-xs text-destructive">{errors.notes}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar local'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
