import { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { formatCPF, unformatCPF, validateCPF } from '@/utils/cpfValidator';
import { useCustomerLookupByCPF } from '@/hooks/useCustomerLookupByCPF';

export interface BuyerData {
  name: string;
  cpf: string;
  email: string;
  whatsapp: string;
}

interface Props {
  eventId: string;
  value: BuyerData;
  onChange: (v: BuyerData) => void;
  onCancel: () => void;
  onContinue: () => void;
}

function formatPhone(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function StepBuyerData({ eventId, value, onChange, onCancel, onContinue }: Props) {
  const { result: lookup, isLoading: lookingUp } = useCustomerLookupByCPF(eventId, value.cpf);

  // Auto-prefill once when a lookup match arrives and the user hasn't typed those fields yet
  useEffect(() => {
    if (!lookup) return;
    onChange({
      name: value.name.trim() ? value.name : lookup.name ?? value.name,
      cpf: value.cpf,
      email: value.email.trim() ? value.email : lookup.email ?? value.email,
      whatsapp: value.whatsapp.trim() ? value.whatsapp : formatPhone(lookup.whatsapp ?? value.whatsapp ?? ''),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup]);

  const cpfDigits = unformatCPF(value.cpf);
  const cpfOk = cpfDigits.length === 11 && validateCPF(cpfDigits);
  const emailOk = /^\S+@\S+\.\S+$/.test(value.email.trim());
  const nameOk = value.name.trim().length >= 3;
  const canContinue = cpfOk && emailOk && nameOk;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="ms-name">Nome completo *</Label>
        <Input
          id="ms-name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="Ana Silva"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ms-cpf">CPF *</Label>
        <div className="relative">
          <Input
            id="ms-cpf"
            inputMode="numeric"
            value={value.cpf}
            onChange={(e) => onChange({ ...value, cpf: formatCPF(e.target.value) })}
            placeholder="000.000.000-00"
            maxLength={14}
          />
          {lookingUp && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        {cpfDigits.length === 11 && !cpfOk && (
          <p className="text-xs text-destructive">CPF inválido.</p>
        )}
        {lookup && (
          <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 mt-1">
            Cliente recorrente
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ms-email">Email *</Label>
        <Input
          id="ms-email"
          type="email"
          value={value.email}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
          placeholder="ana@email.com"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ms-wa">WhatsApp <span className="text-muted-foreground">(opcional)</span></Label>
        <Input
          id="ms-wa"
          inputMode="numeric"
          value={value.whatsapp}
          onChange={(e) => onChange({ ...value, whatsapp: formatPhone(e.target.value) })}
          placeholder="(17) 99999-9999"
          maxLength={15}
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button
          onClick={onContinue}
          disabled={!canContinue}
          className="bg-gradient-to-r from-primary to-pink-500 hover:opacity-90 text-white"
        >
          Continuar →
        </Button>
      </div>
    </div>
  );
}
