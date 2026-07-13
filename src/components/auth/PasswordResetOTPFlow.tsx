import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { OTPInput } from 'input-otp';
import { Mail, Lock, Loader2, ArrowLeft, Eye, EyeOff, CheckCircle2, KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import { cn } from '@/lib/utils';

interface PasswordResetOTPFlowProps {
  /** Email pré-preenchido, opcional. */
  initialEmail?: string;
  /** Callback ao concluir com sucesso. */
  onSuccess?: () => void;
  /** Callback ao clicar em "voltar" no primeiro passo. */
  onBack?: () => void;
}

type Phase = 'email' | 'otp' | 'password' | 'success';

interface PremiumSlotProps {
  char: string | null;
  hasFakeCaret: boolean;
  isActive: boolean;
}

const PremiumSlot: React.FC<PremiumSlotProps> = ({ char, hasFakeCaret, isActive }) => {
  const filled = !!char;
  return (
    <div
      className={cn(
        'relative flex h-14 w-12 items-center justify-center rounded-xl border-2 text-xl font-semibold transition-all duration-200',
        'bg-background/40 text-foreground',
        !filled && !isActive && 'border-border/60',
        filled && !isActive && 'border-primary/50 bg-primary/5',
        isActive &&
          'border-primary ring-2 ring-primary/40 shadow-[0_0_20px_hsl(var(--primary)/0.35)] scale-105',
      )}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-0.5 bg-primary animate-pulse rounded-full" />
        </div>
      )}
    </div>
  );
};

const emailSchema = z.string().email('Email inválido');

/**
 * Mapeia status + corpo da edge send-password-reset-code para mensagem PT-BR.
 * A edge é a fonte da verdade do rate limit (429 / 503); o front só traduz.
 */
const resetErrorMessage = (status: number, body: any): string => {
  const code = body?.error;
  if (status === 429 || code === 'rate_limited') {
    const secs = body?.retry_after_seconds;
    if (secs) {
      const mins = Math.max(1, Math.ceil(secs / 60));
      return `Você já pediu vários códigos. Aguarde ${mins} min e tente de novo.`;
    }
    return 'Você já pediu vários códigos. Aguarde alguns minutos e tente de novo.';
  }
  if (status === 503 || code === 'rate_limit_unavailable') {
    return 'Serviço indisponível no momento, tente em instantes.';
  }
  if (status === 400) {
    return 'Informe um e-mail válido.';
  }
  return 'Não foi possível enviar o código agora. Tente novamente em instantes.';
};

const PasswordResetOTPFlow: React.FC<PasswordResetOTPFlowProps> = ({
  initialEmail = '',
  onSuccess,
  onBack,
}) => {
  const [phase, setPhase] = useState<Phase>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const otpRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (phase === 'otp') {
      const input = otpRef.current?.querySelector('input');
      input?.focus();
    }
  }, [phase]);

  const sendCode = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setSending(true);
    try {
      // Raw fetch (não supabase.functions.invoke) para ler status + corpo reais
      // e traduzir o rate limit da edge em mensagem amigável.
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-password-reset-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        },
      );
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        toast.error(resetErrorMessage(resp.status, data));
        return;
      }

      toast.success('Se o email existir, um código foi enviado.');
      setPhase('otp');
      setCooldown(60);
    } catch {
      // Falha de rede / fetch lançou
      toast.error('Não foi possível enviar o código agora. Tente novamente em instantes.');
    } finally {
      setSending(false);
    }
  };

  const submitNewPassword = async () => {
    if (code.length !== 6) {
      toast.error('Digite o código completo');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-password-reset-code', {
        body: {
          email: email.trim().toLowerCase(),
          code,
          newPassword,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Código inválido');
      setPhase('success');
      toast.success('Senha redefinida com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Código inválido ou expirado');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-5">
      <AnimatePresence mode="wait">
        {phase === 'email' && (
          <motion.div
            key="email"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-5"
          >
            <div className="text-center space-y-1">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <KeyRound className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Recuperar senha</h3>
              <p className="text-sm text-muted-foreground">
                Digite seu email para receber um código de 6 dígitos
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-12"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex gap-2">
              {onBack && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onBack}
                  size="lg"
                  className="flex-shrink-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="hero"
                size="lg"
                onClick={sendCode}
                disabled={sending || cooldown > 0}
                className="flex-1"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : cooldown > 0 ? (
                  `Reenviar em ${cooldown}s`
                ) : (
                  'Enviar código'
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {phase === 'otp' && (
          <motion.div
            key="otp"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-5"
          >
            <div className="text-center space-y-1">
              <h3 className="text-lg font-semibold">Digite o código</h3>
              <p className="text-sm text-muted-foreground">
                Enviado para <span className="text-primary font-medium">{email}</span>
              </p>
            </div>

            <div ref={otpRef} className="flex justify-center py-2">
              <OTPInput
                maxLength={6}
                value={code}
                onChange={setCode}
                containerClassName="flex items-center gap-2"
                render={({ slots }) => (
                  <div className="flex items-center gap-2">
                    {slots.map((slot, idx) => (
                      <PremiumSlot key={idx} {...slot} />
                    ))}
                  </div>
                )}
              />
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
                variant="hero"
                size="lg"
                onClick={() => setPhase('password')}
                disabled={code.length !== 6}
                className="flex-1"
              >
                Continuar
              </Button>
            </div>
          </motion.div>
        )}

        {phase === 'password' && (
          <motion.div
            key="password"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-5"
          >
            <div className="text-center space-y-1">
              <h3 className="text-lg font-semibold">Nova senha</h3>
              <p className="text-sm text-muted-foreground">
                Escolha uma senha forte com no mínimo 6 caracteres
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-new-password">Nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="reset-new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-10 pr-10 h-12"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-confirm-password">Confirmar senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="reset-confirm-password"
                  type="password"
                  placeholder="Confirme a senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 h-12"
                />
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-sm text-destructive">As senhas não coincidem</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPhase('otp')}
                size="lg"
                className="flex-shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="hero"
                size="lg"
                onClick={submitNewPassword}
                disabled={verifying}
                className="flex-1"
              >
                {verifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Redefinir senha'
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {phase === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-5 text-center py-4"
          >
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Senha redefinida!</h3>
              <p className="text-sm text-muted-foreground">
                Você já pode entrar com a nova senha.
              </p>
            </div>
            <Button
              type="button"
              variant="hero"
              size="lg"
              className="w-full"
              onClick={() => onSuccess?.()}
            >
              Continuar
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PasswordResetOTPFlow;
