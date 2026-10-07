import { useState } from 'react';
import { Lock, CheckCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { RecuperarPinDialog } from './RecuperarPinDialog';
import { atualizarMeuPin, chamarPin, mensagemDoPin, useMeuPin } from '@/lib/pinRepasse';

// OS-166: o PIN é criado e trocado por função do banco (definir_meu_pin), que
// confere o PIN atual com limite de tentativas. O navegador não lê o PIN guardado.
export function PinSetupCard() {
  const queryClient = useQueryClient();
  const { data: meuPin, isLoading } = useMeuPin();
  // PIN no formato antigo conta como "sem PIN": é criado de novo, sem o atual.
  const hasPin = !!meuPin?.tem_pin && !meuPin?.refazer;
  const [esqueci, setEsqueci] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

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

    if (hasPin && currentPin.length !== 4) {
      setError('Digite seu PIN atual');
      return;
    }

    setIsSaving(true);
    const r = await chamarPin('definir_meu_pin', {
      _pin_novo: newPin,
      _pin_atual: hasPin ? currentPin : null,
    });
    setIsSaving(false);
    if (!r.ok) {
      // Aqui nada é trocado se o PIN atual estiver errado: a frase aprovada vale.
      setError(mensagemDoPin(r.error));
      setCurrentPin('');
      return;
    }
    toast.success('PIN configurado com sucesso');
    setIsEditing(false);
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    await atualizarMeuPin(queryClient);
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
              {hasPin && (
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
              {hasPin ? (
                <CheckCircle className="w-10 h-10 text-green-500" />
              ) : (
                <Lock className="w-10 h-10 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-4">
              <p className="text-muted-foreground">
                {hasPin
                  ? 'Seu PIN está configurado. Use-o para confirmar operações financeiras.'
                  : 'Configure um PIN de 4 dígitos para proteger suas operações financeiras.'}
              </p>
              {hasPin && meuPin?.email_recuperacao && (
                <p className="text-sm text-muted-foreground">
                  Se esquecer o PIN, o código para criar outro vai para {meuPin.email_recuperacao}.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => setIsEditing(true)}>
                  {hasPin ? 'Alterar PIN' : 'Configurar PIN'}
                </Button>
                {hasPin && (
                  <button type="button" className="text-sm text-primary hover:underline" onClick={() => setEsqueci(true)}>
                    Esqueceu o PIN?
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
            {hasPin && (
              <div className="space-y-2">
                <Label htmlFor="current-pin">PIN Atual</Label>
                <Input
                  id="current-pin"
                  type={showPins ? 'text' : 'password'}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  maxLength={4}
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="new-pin">Novo PIN</Label>
              <Input
                id="new-pin"
                type={showPins ? 'text' : 'password'}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                maxLength={4}
              />
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

            {error && <p className="text-sm text-destructive">{error}</p>}

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
      <RecuperarPinDialog
        open={esqueci}
        onOpenChange={setEsqueci}
        emailMascarado={meuPin?.email_recuperacao ?? null}
      />
    </Card>
  );
}
