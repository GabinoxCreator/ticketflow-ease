import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Mail, ArrowRight, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';

interface StepEmailProps {
  email: string;
  nomeCompleto: string;
  cpf: string;
  emailVerified: boolean;
  onEmailChange: (v: string) => void;
  onVerified: () => void;
  onBack: () => void;
  onNext: () => void;
}

const emailSchema = z.string().email('Email inválido');

const StepEmail: React.FC<StepEmailProps> = ({
  email,
  nomeCompleto,
  cpf,
  emailVerified,
  onEmailChange,
  onVerified,
  onBack,
  onNext,
}) => {
  const [phase, setPhase] = useState<'email' | 'otp'>(emailVerified ? 'email' : 'email');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-verification-code', {
        body: { email, name: nomeCompleto, cpf },
      });
      if (error) throw error;
      toast.success('Código enviado para seu email');
      setPhase('otp');
      setCooldown(45);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar código');
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    if (code.length !== 6) return;
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-email-code', {
        body: { email, code },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Código inválido');
      toast.success('Email verificado!');
      onVerified();
      onNext();
    } catch (err: any) {
      toast.error(err.message || 'Código inválido ou expirado');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-5"
    >
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold">
          {phase === 'email' ? 'Confirme seu email' : 'Digite o código'}
        </h3>
        <p className="text-sm text-muted-foreground">
          {phase === 'email'
            ? 'Vamos enviar um código para confirmar'
            : `Enviado para ${email}`}
        </p>
      </div>

      {phase === 'email' ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onBack} size="lg" className="flex-shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              onClick={sendCode}
              disabled={sending}
              variant="hero"
              size="lg"
              className="flex-1"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar código'}
              {!sending && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={code} onChange={setCode}>
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

          <div className="text-center text-sm">
            <button
              type="button"
              onClick={sendCode}
              disabled={cooldown > 0 || sending}
              className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar código'}
            </button>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPhase('email')}
              size="lg"
              className="flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              onClick={verifyCode}
              disabled={code.length !== 6 || verifying}
              variant="hero"
              size="lg"
              className="flex-1"
            >
              {verifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Verificar <CheckCircle2 className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </motion.div>
  );
};

export default StepEmail;
