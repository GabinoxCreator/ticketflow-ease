import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Mail, RefreshCw, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CheckoutStepEmailVerificationProps {
  email: string;
  name: string;
  cpf: string;
  onVerified: () => void;
  onBack: () => void;
}

export function CheckoutStepEmailVerification({
  email,
  name,
  cpf,
  onVerified,
  onBack,
}: CheckoutStepEmailVerificationProps) {
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [hasSent, setHasSent] = useState(false);

  useEffect(() => {
    // Send code on mount
    if (!hasSent) {
      sendCode();
      setHasSent(true);
    }
  }, [hasSent]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const sendCode = async () => {
    setIsResending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-verification-code', {
        body: { email, name, cpf },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast.success('Código enviado para seu email!');
      setCooldown(60);
    } catch (error: any) {
      console.error('Error sending code:', error);
      toast.error(error.message || 'Erro ao enviar código');
    } finally {
      setIsResending(false);
    }
  };

  const verifyCode = async () => {
    if (otp.length !== 6) {
      toast.error('Digite o código completo');
      return;
    }

    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-email-code', {
        body: { email, code: otp },
      });

      if (error) throw error;
      
      if (data?.success) {
        toast.success('Email verificado com sucesso!');
        onVerified();
      } else {
        toast.error(data?.error || 'Código inválido');
      }
    } catch (error: any) {
      console.error('Error verifying code:', error);
      toast.error('Código inválido ou expirado');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      <div className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
          <Mail className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Verifique seu email</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Enviamos um código de 6 dígitos para
          </p>
          <p className="font-medium text-primary">{email}</p>
        </div>
      </div>

      <div className="flex justify-center">
        <InputOTP
          maxLength={6}
          value={otp}
          onChange={setOtp}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>

      <Button
        onClick={verifyCode}
        disabled={otp.length !== 6 || isVerifying}
        className="w-full"
        size="lg"
      >
        {isVerifying ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Verificando...
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Verificar Código
          </>
        )}
      </Button>

      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-2">
          Não recebeu o código?
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={sendCode}
          disabled={cooldown > 0 || isResending}
        >
          {cooldown > 0 ? (
            `Reenviar em ${cooldown}s`
          ) : isResending ? (
            'Enviando...'
          ) : (
            'Reenviar código'
          )}
        </Button>
      </div>

      <Button
        variant="outline"
        onClick={onBack}
        className="w-full"
      >
        Alterar email
      </Button>
    </motion.div>
  );
}
