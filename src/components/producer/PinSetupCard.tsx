import { useState } from 'react';
import { Lock, CheckCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useStripeConnect } from '@/hooks/useStripeConnect';

export function PinSetupCard() {
  const { status, setPin, isLoading } = useStripeConnect();
  const [isEditing, setIsEditing] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const hasExistingPin = status?.has_pin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      setError('O PIN deve ter exatamente 4 dígitos numéricos');
      return;
    }

    if (newPin !== confirmPin) {
      setError('Os PINs não coincidem');
      return;
    }

    if (hasExistingPin && currentPin.length !== 4) {
      setError('Digite seu PIN atual');
      return;
    }

    setIsSaving(true);
    const success = await setPin(newPin, hasExistingPin ? currentPin : undefined);
    setIsSaving(false);

    if (success) {
      setIsEditing(false);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setError('');
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              PIN de Segurança
              {hasExistingPin && (
                <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                  Configurado
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              PIN de 4 dígitos para confirmar operações sensíveis
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!isEditing ? (
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-muted/50">
              {hasExistingPin ? (
                <CheckCircle className="w-10 h-10 text-green-500" />
              ) : (
                <Lock className="w-10 h-10 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-4">
              <p className="text-muted-foreground">
                {hasExistingPin
                  ? 'Seu PIN está configurado. Use-o para confirmar saques e outras operações financeiras.'
                  : 'Configure um PIN de 4 dígitos para proteger suas operações financeiras.'}
              </p>
              <Button onClick={() => setIsEditing(true)}>
                {hasExistingPin ? 'Alterar PIN' : 'Configurar PIN'}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
            {hasExistingPin && (
              <div className="space-y-2">
                <Label htmlFor="current-pin">PIN Atual</Label>
                <div className="relative">
                  <Input
                    id="current-pin"
                    type={showPins ? 'text' : 'password'}
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    maxLength={4}
                    className="pr-10"
                  />
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="new-pin">Novo PIN</Label>
              <div className="relative">
                <Input
                  id="new-pin"
                  type={showPins ? 'text' : 'password'}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  maxLength={4}
                  className="pr-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-pin">Confirmar PIN</Label>
              <div className="relative">
                <Input
                  id="confirm-pin"
                  type={showPins ? 'text' : 'password'}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  maxLength={4}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPins(!showPins)}
                >
                  {showPins ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar PIN'
                )}
              </Button>
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
