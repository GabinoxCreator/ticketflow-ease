import { useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PinVerificationDialogProps {
  open: boolean;
  onVerified: () => void;
  hasPin: boolean;
  onPinCreated: () => void;
}

export function PinVerificationDialog({ 
  open, 
  onVerified, 
  hasPin,
  onPinCreated 
}: PinVerificationDialogProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');

  const handleVerifyPin = async () => {
    if (pin.length !== 4) {
      setError('O PIN deve ter 4 dígitos');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const { data, error } = await supabase.functions.invoke('verify-producer-pin', {
        body: { pin }
      });

      if (error) throw error;

      if (data.valid) {
        toast.success('PIN verificado com sucesso!');
        onVerified();
      } else {
        setError('PIN incorreto. Tente novamente.');
        setPin('');
      }
    } catch (err: any) {
      console.error('Error verifying PIN:', err);
      setError('Erro ao verificar PIN. Tente novamente.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCreatePin = async () => {
    if (pin.length !== 4) {
      setError('O PIN deve ter 4 dígitos');
      return;
    }

    if (pin !== confirmPin) {
      setError('Os PINs não coincidem');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const { error } = await supabase.functions.invoke('set-producer-pin', {
        body: { pin }
      });

      if (error) throw error;

      toast.success('PIN criado com sucesso!');
      onPinCreated();
      onVerified();
    } catch (err: any) {
      console.error('Error creating PIN:', err);
      setError('Erro ao criar PIN. Tente novamente.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePinChange = (value: string, setter: (v: string) => void) => {
    if (/^\d{0,4}$/.test(value)) {
      setter(value);
      setError('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 rounded-full bg-primary/10">
              {hasPin ? (
                <Lock className="w-8 h-8 text-primary" />
              ) : (
                <ShieldCheck className="w-8 h-8 text-primary" />
              )}
            </div>
          </div>
          <DialogTitle className="text-center">
            {hasPin ? 'Verificação de Segurança' : 'Criar PIN de Segurança'}
          </DialogTitle>
          <DialogDescription className="text-center">
            {hasPin 
              ? 'Digite seu PIN de 4 dígitos para acessar a área financeira'
              : 'Crie um PIN de 4 dígitos para proteger suas informações financeiras'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {hasPin ? 'PIN' : 'Novo PIN'}
            </label>
            <div className="relative">
              <Input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => handlePinChange(e.target.value, setPin)}
                placeholder="••••"
                maxLength={4}
                className="text-center text-2xl tracking-widest pr-10"
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowPin(!showPin)}
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {!hasPin && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Confirmar PIN</label>
              <Input
                type={showPin ? 'text' : 'password'}
                value={confirmPin}
                onChange={(e) => handlePinChange(e.target.value, setConfirmPin)}
                placeholder="••••"
                maxLength={4}
                className="text-center text-2xl tracking-widest"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <Button
            className="w-full"
            onClick={hasPin ? handleVerifyPin : handleCreatePin}
            disabled={isVerifying || pin.length !== 4 || (!hasPin && confirmPin.length !== 4)}
          >
            {isVerifying ? 'Verificando...' : hasPin ? 'Verificar' : 'Criar PIN'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
