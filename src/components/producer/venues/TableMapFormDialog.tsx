import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import {
  useCreateTableMap,
  useUpdateTableMap,
  type TableMap,
  type TableMapFormData,
} from '@/hooks/useTableMaps';

const schema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100),
  background_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use formato #RRGGBB')
    .optional(),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  map?: TableMap | null;
}

export function TableMapFormDialog({ open, onOpenChange, venueId, map }: Props) {
  const isEdit = !!map;
  const navigate = useNavigate();
  const [form, setForm] = useState<TableMapFormData>({
    name: '',
    background_color: '#ffffff',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMut = useCreateTableMap();
  const updateMut = useUpdateTableMap();
  const saving = createMut.isPending || updateMut.isPending;

  useEffect(() => {
    if (open) {
      setErrors({});
      setForm({
        name: map?.name ?? '',
        background_color: map?.background_color ?? '#ffffff',
      });
    }
  }, [open, map]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      Object.entries(parsed.error.flatten().fieldErrors).forEach(([k, v]) => {
        if (v?.[0]) fe[k] = v[0];
      });
      setErrors(fe);
      return;
    }
    try {
      if (isEdit && map) {
        await updateMut.mutateAsync({ id: map.id, formData: parsed.data });
        onOpenChange(false);
      } else {
        const created = await createMut.mutateAsync({
          venue_id: venueId,
          name: parsed.data.name,
        });
        onOpenChange(false);
        navigate(`/produtor/locais/${venueId}/mapas/${created.id}/editor`);
      }
    } catch {
      /* toast handled in hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar mapa' : 'Novo mapa'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'A orientação (paisagem/retrato) só pode ser alterada pelo botão "Girar 90°" dentro do editor — assim as posições dos assentos são recalculadas junto.'
              : 'Crie um mapa em branco. O editor abrirá em seguida para você posicionar os assentos.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="map-name">Nome *</Label>
            <Input
              id="map-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex.: Mapa Principal"
              autoFocus
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>
          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="map-bg">Cor de fundo</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="map-bg"
                  type="color"
                  className="h-10 w-16 p-1"
                  value={form.background_color ?? '#ffffff'}
                  onChange={(e) =>
                    setForm({ ...form, background_color: e.target.value })
                  }
                />
                <Input
                  value={form.background_color ?? '#ffffff'}
                  onChange={(e) =>
                    setForm({ ...form, background_color: e.target.value })
                  }
                  placeholder="#ffffff"
                  className="flex-1"
                />
              </div>
              {errors.background_color && (
                <p className="text-xs text-destructive">
                  {errors.background_color}
                </p>
              )}
            </div>
          )}
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
              {saving
                ? 'Salvando...'
                : isEdit
                  ? 'Salvar'
                  : 'Criar e abrir editor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
