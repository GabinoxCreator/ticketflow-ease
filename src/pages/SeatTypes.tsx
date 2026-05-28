import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSeatTypes, type SeatTypeFormData } from '@/hooks/useSeatTypes';
import { toast } from 'sonner';
import {
  Armchair,
  Plus,
  Pencil,
  Trash2,
  Circle,
  Square,
  Users,
  Tag,
  AlertTriangle,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const EMPTY_FORM: SeatTypeFormData = {
  name: '',
  description: '',
  base_capacity: 1,
  max_capacity: 1,
  base_price: 0,
  extra_price: 0,
  shape: 'rect',
  default_width: 80,
  default_height: 80,
  default_color: '#3b82f6',
  icon: '',
  is_active: true,
};

export default function SeatTypes() {
  const navigate = useNavigate();
  const { seatTypes, isLoading, createSeatType, updateSeatType, deleteSeatType } = useSeatTypes();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<SeatTypeFormData>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (seatType: NonNullable<typeof seatTypes>[number]) => {
    setEditingId(seatType.id);
    setFormData({
      name: seatType.name,
      description: seatType.description || '',
      base_capacity: seatType.base_capacity,
      max_capacity: seatType.max_capacity,
      base_price: Number(seatType.base_price),
      extra_price: Number(seatType.extra_price),
      shape: seatType.shape as 'rect' | 'circle',
      default_width: seatType.default_width,
      default_height: seatType.default_height,
      default_color: seatType.default_color || '#3b82f6',
      icon: seatType.icon || '',
      is_active: seatType.is_active,
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'Nome é obrigatório';
    if ((formData.base_capacity ?? 0) <= 0) errs.base_capacity = 'Capacidade base deve ser maior que 0';
    if ((formData.max_capacity ?? 0) < (formData.base_capacity ?? 0)) {
      errs.max_capacity = 'Capacidade máxima deve ser maior ou igual à base';
    }
    if ((formData.base_price ?? 0) < 0) errs.base_price = 'Preço base não pode ser negativo';
    if ((formData.extra_price ?? 0) < 0) errs.extra_price = 'Preço extra não pode ser negativo';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    if (editingId) {
      updateSeatType.mutate({ id: editingId, data: formData });
    } else {
      createSeatType.mutate(formData);
    }
    setDialogOpen(false);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteSeatType.mutate(deleteId);
    setDeleteId(null);
  };

  const ShapeIcon = formData.shape === 'circle' ? Circle : Square;

  return (
    <ProducerLayout>
      <Helmet>
        <title>Tipos de Assento | FestPag</title>
      </Helmet>

      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-background to-pink-500/10 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-pink-500 flex items-center justify-center shadow-lg shrink-0">
                <Armchair className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tipos de Assento</h1>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Configure mesas, cadeiras, bistrôs e outros tipos de reserva para seus eventos
                </p>
              </div>
            </div>
            <Button onClick={openCreate} className="shrink-0">
              <Plus className="w-4 h-4 mr-2" />
              Novo Tipo
            </Button>
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full rounded-2xl" />
            ))}
          </div>
        ) : seatTypes && seatTypes.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {seatTypes.map((st) => (
              <Card
                key={st.id}
                className={cn(
                  'rounded-2xl border-border/60 overflow-hidden transition-all duration-200',
                  !st.is_active && 'opacity-60'
                )}
              >
                <div
                  className="h-2"
                  style={{ backgroundColor: st.default_color || '#3b82f6' }}
                />
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${st.default_color}20` || '#3b82f620' }}
                      >
                        <Armchair className="h-5 w-5" style={{ color: st.default_color || '#3b82f6' }} />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base font-semibold truncate">{st.name}</CardTitle>
                        <p className="text-xs text-muted-foreground truncate">
                          {st.shape === 'circle' ? 'Círculo' : 'Retângulo'} • {st.default_width}×{st.default_height}px
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(st)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(st.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {st.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{st.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Users className="h-3 w-3" />
                      {st.base_capacity}–{st.max_capacity} pessoas
                    </Badge>
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Tag className="h-3 w-3" />
                      R$ {Number(st.base_price).toFixed(2)}
                      {Number(st.extra_price) > 0 && ` + R$ ${Number(st.extra_price).toFixed(2)}`}
                    </Badge>
                    {!st.is_active && (
                      <Badge variant="outline" className="text-xs">Inativo</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="rounded-2xl border-border/60">
            <CardContent className="p-12 text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                <Armchair className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Nenhum tipo de assento configurado</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Crie tipos de assento (mesa, cadeira, bistrô, etc.) para usá-los no mapa de reservas dos seus eventos.
                </p>
              </div>
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Criar primeiro tipo
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Tipo de Assento' : 'Novo Tipo de Assento'}</DialogTitle>
            <DialogDescription>
              Configure as propriedades deste tipo de assento para uso nos mapas de reservas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="st-name">Nome *</Label>
              <Input
                id="st-name"
                value={formData.name}
                onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                placeholder="Ex: Mesa VIP 4 lugares"
                className={cn(formErrors.name && 'border-destructive')}
              />
              {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="st-description">Descrição</Label>
              <Textarea
                id="st-description"
                value={formData.description}
                onChange={(e) => setFormData((d) => ({ ...d, description: e.target.value }))}
                placeholder="Descrição opcional para identificação"
                rows={2}
              />
            </div>

            {/* Capacity */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="st-base-cap">Capacidade base *</Label>
                <Input
                  id="st-base-cap"
                  type="number"
                  min={1}
                  value={formData.base_capacity}
                  onChange={(e) => setFormData((d) => ({ ...d, base_capacity: parseInt(e.target.value) || 1 }))}
                  className={cn(formErrors.base_capacity && 'border-destructive')}
                />
                {formErrors.base_capacity && <p className="text-xs text-destructive">{formErrors.base_capacity}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="st-max-cap">Capacidade máxima *</Label>
                <Input
                  id="st-max-cap"
                  type="number"
                  min={1}
                  value={formData.max_capacity}
                  onChange={(e) => setFormData((d) => ({ ...d, max_capacity: parseInt(e.target.value) || 1 }))}
                  className={cn(formErrors.max_capacity && 'border-destructive')}
                />
                {formErrors.max_capacity && <p className="text-xs text-destructive">{formErrors.max_capacity}</p>}
              </div>
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="st-base-price">Preço base (R$)</Label>
                <Input
                  id="st-base-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.base_price}
                  onChange={(e) => setFormData((d) => ({ ...d, base_price: parseFloat(e.target.value) || 0 }))}
                  className={cn(formErrors.base_price && 'border-destructive')}
                />
                {formErrors.base_price && <p className="text-xs text-destructive">{formErrors.base_price}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="st-extra-price">Preço extra/lugar (R$)</Label>
                <Input
                  id="st-extra-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.extra_price}
                  onChange={(e) => setFormData((d) => ({ ...d, extra_price: parseFloat(e.target.value) || 0 }))}
                  className={cn(formErrors.extra_price && 'border-destructive')}
                />
                {formErrors.extra_price && <p className="text-xs text-destructive">{formErrors.extra_price}</p>}
              </div>
            </div>

            {/* Shape + Color + Dimensions */}
            <div className="space-y-4 p-4 rounded-xl bg-muted/40 border border-border/50">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                Aparência no mapa
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Formato</Label>
                  <Select
                    value={formData.shape}
                    onValueChange={(v: 'rect' | 'circle') => setFormData((d) => ({ ...d, shape: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rect">
                        <div className="flex items-center gap-2">
                          <Square className="h-4 w-4" />
                          Retângulo
                        </div>
                      </SelectItem>
                      <SelectItem value="circle">
                        <div className="flex items-center gap-2">
                          <Circle className="h-4 w-4" />
                          Círculo
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="st-color">Cor padrão</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="st-color"
                      type="color"
                      value={formData.default_color || '#3b82f6'}
                      onChange={(e) => setFormData((d) => ({ ...d, default_color: e.target.value }))}
                      className="w-12 h-10 p-1 shrink-0"
                    />
                    <Input
                      value={formData.default_color || '#3b82f6'}
                      onChange={(e) => setFormData((d) => ({ ...d, default_color: e.target.value }))}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="st-width">Largura padrão (px)</Label>
                  <Input
                    id="st-width"
                    type="number"
                    min={20}
                    value={formData.default_width}
                    onChange={(e) => setFormData((d) => ({ ...d, default_width: parseInt(e.target.value) || 80 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="st-height">Altura padrão (px)</Label>
                  <Input
                    id="st-height"
                    type="number"
                    min={20}
                    value={formData.default_height}
                    onChange={(e) => setFormData((d) => ({ ...d, default_height: parseInt(e.target.value) || 80 }))}
                  />
                </div>
              </div>

              {/* Preview */}
              <div className="flex items-center justify-center py-4">
                <div
                  className={cn(
                    'flex items-center justify-center shadow-md border-2 border-white/20',
                    formData.shape === 'circle' ? 'rounded-full' : 'rounded-lg'
                  )}
                  style={{
                    width: Math.min(formData.default_width || 80, 120),
                    height: Math.min(formData.default_height || 80, 120),
                    backgroundColor: formData.default_color || '#3b82f6',
                  }}
                >
                  <ShapeIcon className="text-white/90" style={{ width: Math.min((formData.default_width || 80) * 0.4, 40), height: Math.min((formData.default_height || 80) * 0.4, 40) }} />
                </div>
              </div>
            </div>

            {/* Active switch */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50">
              <div>
                <Label className="text-sm font-medium">Ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Tipos inativos não aparecem para seleção em novos mapas
                </p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData((d) => ({ ...d, is_active: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createSeatType.isPending || updateSeatType.isPending}
            >
              {(createSeatType.isPending || updateSeatType.isPending) && (
                <span className="animate-spin mr-2">⏳</span>
              )}
              {editingId ? 'Salvar alterações' : 'Criar tipo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Excluir tipo de assento?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Se este tipo estiver em uso em algum mapa, a exclusão será bloqueada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteId(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteSeatType.isPending}
            >
              {deleteSeatType.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProducerLayout>
  );
}
