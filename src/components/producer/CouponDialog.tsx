import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EventCoupon, CouponFormData } from '@/hooks/useEventCoupons';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: EventCoupon | null;
  onSubmit: (data: CouponFormData) => Promise<unknown> | void;
  isSubmitting?: boolean;
}

export function CouponDialog({ open, onOpenChange, initial, onSubmit, isSubmitting }: Props) {
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState<string>('10');
  const [maxUses, setMaxUses] = useState<string>('');
  const [validUntil, setValidUntil] = useState<string>('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (open) {
      setCode(initial?.code || '');
      setType((initial?.discount_type as any) || 'percent');
      setValue(initial ? String(initial.discount_value) : '10');
      setMaxUses(initial?.max_uses != null ? String(initial.max_uses) : '');
      setValidUntil(initial?.valid_until ? initial.valid_until.slice(0, 16) : '');
      setActive(initial?.is_active ?? true);
    }
  }, [open, initial]);

  const handleSave = async () => {
    if (!code.trim() || !value) return;
    await onSubmit({
      code: code.trim(),
      discount_type: type,
      discount_value: Number(value),
      max_uses: maxUses ? Number(maxUses) : null,
      valid_until: validUntil ? new Date(validUntil).toISOString() : null,
      is_active: active,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar cupom' : 'Novo cupom'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="code">Código</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="EX: BLACKFRIDAY"
              className="mt-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Porcentagem (%)</SelectItem>
                  <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="value">{type === 'percent' ? 'Desconto (%)' : 'Desconto (R$)'}</Label>
              <Input
                id="value"
                type="number"
                min="0.01"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="maxUses">Limite de usos</Label>
              <Input
                id="maxUses"
                type="number"
                min="1"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Ilimitado"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="validUntil">Válido até</Label>
              <Input
                id="validUntil"
                type="datetime-local"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Ativo</p>
              <p className="text-xs text-muted-foreground">Quando inativo, o cupom não pode ser aplicado.</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="hero" onClick={handleSave} disabled={isSubmitting || !code.trim() || !value}>
            {initial ? 'Salvar' : 'Criar cupom'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
