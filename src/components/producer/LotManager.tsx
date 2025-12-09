import { useState } from 'react';
import { Plus, Edit, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { EventLot, LotFormData } from '@/hooks/useEventLots';
import { cn } from '@/lib/utils';

interface LotManagerProps {
  lots: EventLot[];
  onAdd: (data: LotFormData) => void;
  onUpdate: (id: string, data: Partial<LotFormData>) => void;
  onDelete: (id: string) => void;
  isLoading?: boolean;
}

const emptyLot: LotFormData = {
  name: '',
  price: 0,
  total_quantity: 100,
  is_active: true,
};

export function LotManager({ lots, onAdd, onUpdate, onDelete, isLoading }: LotManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<EventLot | null>(null);
  const [formData, setFormData] = useState<LotFormData>(emptyLot);

  const handleOpenDialog = (lot?: EventLot) => {
    if (lot) {
      setEditingLot(lot);
      setFormData({
        name: lot.name,
        price: lot.price,
        original_price: lot.original_price || undefined,
        total_quantity: lot.total_quantity,
        start_date: lot.start_date || undefined,
        end_date: lot.end_date || undefined,
        description: lot.description || undefined,
        is_active: lot.is_active,
      });
    } else {
      setEditingLot(null);
      setFormData(emptyLot);
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingLot) {
      onUpdate(editingLot.id, formData);
    } else {
      onAdd(formData);
    }
    setIsDialogOpen(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Lotes de Ingressos</h3>
        <Button onClick={() => handleOpenDialog()} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Lote
        </Button>
      </div>

      {lots.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <p className="text-muted-foreground mb-4">
              Nenhum lote criado ainda. Adicione um lote para começar a vender ingressos.
            </p>
            <Button onClick={() => handleOpenDialog()} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Criar Primeiro Lote
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lots.map((lot) => (
            <Card key={lot.id} className={cn(!lot.is_active && 'opacity-60')}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{lot.name}</CardTitle>
                    {!lot.is_active && (
                      <span className="text-xs text-muted-foreground">Inativo</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleOpenDialog(lot)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => onDelete(lot.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">
                      {formatCurrency(lot.price)}
                    </span>
                    {lot.original_price && lot.original_price > lot.price && (
                      <span className="text-sm text-muted-foreground line-through">
                        {formatCurrency(lot.original_price)}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{lot.sold_quantity}</span>
                    {' / '}
                    {lot.total_quantity} vendidos
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min((lot.sold_quantity / lot.total_quantity) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingLot ? 'Editar Lote' : 'Novo Lote'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lot-name">Nome do Lote *</Label>
              <Input
                id="lot-name"
                placeholder="Ex: 1º Lote"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lot-price">Preço *</Label>
                <Input
                  id="lot-price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lot-original-price">Preço Original</Label>
                <Input
                  id="lot-original-price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={formData.original_price || ''}
                  onChange={(e) => setFormData({ ...formData, original_price: parseFloat(e.target.value) || undefined })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lot-quantity">Quantidade *</Label>
              <Input
                id="lot-quantity"
                type="number"
                min="1"
                placeholder="100"
                value={formData.total_quantity}
                onChange={(e) => setFormData({ ...formData, total_quantity: parseInt(e.target.value) || 1 })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lot-description">Descrição</Label>
              <Textarea
                id="lot-description"
                placeholder="Descrição do lote (opcional)"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="lot-active">Lote Ativo</Label>
              <Switch
                id="lot-active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={!formData.name || formData.price <= 0}>
              {editingLot ? 'Salvar' : 'Criar Lote'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
