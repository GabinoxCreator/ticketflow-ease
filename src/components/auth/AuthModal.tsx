import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { validateCPF, formatCPF } from '@/utils/cpfValidator';
import {
  Eye, EyeOff, Mail, Lock, User, CreditCard, Phone,
  Loader2, ArrowLeft, ArrowRight, Check
} from 'lucide-react';
import PasswordResetOTPFlow from '@/components/auth/PasswordResetOTPFlow';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
}

type Tab = 'login' | 'signup';
type SignupStep = 'info' | 'cpf' | 'email' | 'password';

const SIGNUP_STEPS: SignupStep[] = ['info', 'cpf', 'email', 'password'];

export function AuthModal({ isOpen, onClose, onAuthenticated }: AuthModalProps) {
  const { user, signIn, signUp } = useAuth();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>('login');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  // Signup state
  const [signupStep, setSignupStep] = useState<SignupStep>('info');
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cpf, setCpf] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  // Email verification
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Watch for auth changes
  useEffect(() => {
    if (user && isOpen) {
      onAuthenticated();
    }
  }, [user, isOpen, onAuthenticated]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setForgotMode(false);
      setResetEmail('');
      setSignupStep('info');
      setEmailVerificationSent(false);
      setOtp('');
      setEmailVerified(false);
    }
  }, [isOpen]);

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (numbers.length <= 11) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  // ── Login ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) return;
    setIsSubmitting(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setIsSubmitting(false);
    if (error) {
      toast.error(error.message.includes('Invalid login') ? 'Email ou senha incorretos' : 'Erro ao fazer login');
    } else {
      toast.success('Login realizado!');
    }
  };

  // ── Social login ──
  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    const { error } = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (error) toast.error(`Erro ao entrar com ${provider === 'google' ? 'Google' : 'Apple'}`);
  };

  // ── Email verification ──
  const sendVerificationCode = useCallback(async () => {
    if (!signupEmail || cooldown > 0) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(signupEmail)) {
      toast.error('Email inválido');
      return;
    }
    setIsSendingCode(true);
    try {
      const { error } = await supabase.functions.invoke('send-verification-code', {
        body: { email: signupEmail, cpf: cpf.replace(/\D/g, ''), name: nome }
      });
      if (error) throw error;
      setEmailVerificationSent(true);
      setCooldown(60);
      toast.success('Código enviado!');
    } catch {
      toast.error('Erro ao enviar código');
    } finally {
      setIsSendingCode(false);
    }
  }, [signupEmail, cpf, nome, cooldown]);

  const verifyEmailCode = useCallback(async () => {
    if (otp.length !== 6) return;
    setIsVerifyingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-email-code', {
        body: { email: signupEmail, code: otp }
      });
      if (error) throw error;
      if (data.success) {
        setEmailVerified(true);
        toast.success('Email verificado!');
      } else {
        toast.error(data.error || 'Código inválido');
        setOtp('');
      }
    } catch {
      toast.error('Erro ao verificar código');
      setOtp('');
    } finally {
      setIsVerifyingEmail(false);
    }
  }, [otp, signupEmail]);

  // ── Signup ──
  const handleSignupNext = async () => {
    const idx = SIGNUP_STEPS.indexOf(signupStep);

    switch (signupStep) {
      case 'info':
        if (nome.trim().length < 3) { toast.error('Nome deve ter pelo menos 3 caracteres'); return; }
        if (whatsapp.replace(/\D/g, '').length < 10) { toast.error('WhatsApp inválido'); return; }
        break;
      case 'cpf':
        if (!validateCPF(cpf)) { toast.error('CPF inválido'); return; }
        break;
      case 'email':
        if (!emailVerified) { toast.error('Verifique seu email primeiro'); return; }
        break;
      case 'password':
        if (signupPassword.length < 6) { toast.error('Senha deve ter pelo menos 6 caracteres'); return; }
        if (signupPassword !== confirmPassword) { toast.error('As senhas não coincidem'); return; }
        setIsSubmitting(true);
        const { error } = await signUp({
          email: signupEmail,
          password: signupPassword,
          nome_completo: nome,
          cpf: cpf.replace(/\D/g, ''),
          whatsapp: whatsapp.replace(/\D/g, ''),
          tipo_conta: 'cliente',
        });
        setIsSubmitting(false);
        if (error) {
          toast.error(error.message.includes('already registered') ? 'Email já cadastrado' : 'Erro ao criar conta');
          return;
        }
        toast.success('Conta criada com sucesso!');
        return;
    }

    if (idx < SIGNUP_STEPS.length - 1) {
      setSignupStep(SIGNUP_STEPS[idx + 1]);
    }
  };

  const handleSignupBack = () => {
    const idx = SIGNUP_STEPS.indexOf(signupStep);
    if (idx > 0) setSignupStep(SIGNUP_STEPS[idx - 1]);
  };

  const stepIndex = SIGNUP_STEPS.indexOf(signupStep);

  const title = forgotMode ? 'Recuperar Senha' : tab === 'login' ? 'Entrar' : 'Criar Conta';
  const subtitle = forgotMode
    ? 'Enviaremos um código para seu email'
    : tab === 'login'
      ? 'Faça login para continuar sua compra'
      : 'Crie sua conta em poucos passos';

  // ── Render ──
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden border-border/50',
          isMobile
            ? 'w-screen h-screen max-w-none rounded-none top-0 left-0 translate-x-0 translate-y-0 bg-card'
            : 'sm:max-w-md rounded-3xl backdrop-blur-2xl bg-card/70 shadow-2xl',
        )}
      >
        {/* Desktop glow halo */}
        {!isMobile && (
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-1 rounded-[inherit] -z-10 opacity-60 blur-2xl"
            style={{
              background:
                'linear-gradient(135deg, hsl(var(--primary) / 0.4), hsl(330 85% 60% / 0.3))',
            }}
          />
        )}

        <div className={cn('flex flex-col', isMobile ? 'h-screen' : 'max-h-[85vh]')}>
          {/* Header */}
          <div
            className={cn(
              'border-b border-border/50',
              isMobile
                ? 'sticky top-0 z-10 bg-card/95 backdrop-blur-xl px-4 pt-4 pb-4'
                : 'px-6 pt-6 pb-4',
            )}
          >
            {isMobile ? (
              <div className="grid grid-cols-[40px_1fr_40px] items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Voltar"
                  className="h-10 w-10 inline-flex items-center justify-center rounded-full text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="text-center min-w-0">
                  <h2 className="font-display font-bold text-lg tracking-tight truncate">
                    {title}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
                </div>
                <div aria-hidden className="h-10 w-10" />
              </div>
            ) : (
              <>
                <h2 className="font-display font-bold text-2xl tracking-tight pr-8">
                  {title}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
              </>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {forgotMode ? (
              <PasswordResetOTPFlow
                initialEmail={resetEmail || loginEmail}
                onBack={() => setForgotMode(false)}
                onSuccess={() => {
                  setForgotMode(false);
                  setResetEmail('');
                }}
              />
            ) : (
              <>
                {/* Pill tabs */}
                <div className="relative flex bg-muted/50 rounded-2xl p-1 mb-6">
                  {(['login', 'signup'] as Tab[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTab(t)}
                      className={cn(
                        'relative flex-1 py-2.5 text-sm font-medium rounded-xl transition-colors z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        tab === t ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {tab === t && (
                        <motion.div
                          layoutId="authModalPillTab"
                          className="absolute inset-0 rounded-xl bg-gradient-to-r from-[hsl(250,85%,60%)] to-[hsl(330,85%,60%)] shadow-lg"
                          style={{ boxShadow: '0 4px 20px hsl(var(--primary) / 0.4)' }}
                          transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                        />
                      )}
                      <span className="relative z-10">
                        {t === 'login' ? 'Entrar' : 'Criar Conta'}
                      </span>
                    </button>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  {tab === 'login' ? (
                    <motion.form
                      key="login"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      onSubmit={handleLogin}
                      className="space-y-4"
                    >
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <div className="relative group">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                          <Input
                            type="email"
                            placeholder="seu@email.com"
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            className="pl-10 h-12 bg-background/50"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Senha</Label>
                        <div className="relative group">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            className="pl-10 pr-10 h-12 bg-background/50"
                            required
                          />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => { setForgotMode(true); setResetEmail(loginEmail); }}
                          className="text-sm text-primary hover:underline font-medium text-slate-50"
                        >
                          Esqueceu sua senha?
                        </button>
                      </div>

                      <Button type="submit" variant="hero" className="w-full" size="lg" disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Entrando...</> : 'Entrar'}
                      </Button>

                      <div className="relative my-2">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border/60" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">ou continue com</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <Button type="button" variant="glass" className="w-full gap-2 h-12" onClick={() => handleSocialLogin('google')}>
                          <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          Google
                        </Button>
                        <Button type="button" variant="glass" className="w-full gap-2 h-12" onClick={() => handleSocialLogin('apple')}>
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                          </svg>
                          Apple
                        </Button>
                      </div>
                    </motion.form>
                  ) : (
                    <motion.div
                      key="signup"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-5"
                    >
                      {/* Progress */}
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground font-medium">Etapa {stepIndex + 1} de {SIGNUP_STEPS.length}</p>
                        <div className="flex gap-1.5">
                          {SIGNUP_STEPS.map((_, i) => (
                            <div
                              key={i}
                              className={cn(
                                'h-1.5 flex-1 rounded-full transition-all duration-500',
                                i <= stepIndex
                                  ? 'bg-gradient-to-r from-[hsl(250,85%,60%)] to-[hsl(330,85%,60%)] shadow-[0_0_10px_hsl(var(--primary)/0.5)]'
                                  : 'bg-muted',
                              )}
                            />
                          ))}
                        </div>
                      </div>

                      <AnimatePresence mode="wait">
                        {signupStep === 'info' && (
                          <motion.div key="info" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                            <div className="space-y-2">
                              <Label>Nome Completo</Label>
                              <div className="relative group">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <Input placeholder="Seu nome completo" value={nome} onChange={(e) => setNome(e.target.value)} className="pl-10 h-12 bg-background/50" />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>WhatsApp</Label>
                              <div className="relative group">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <Input
                                  type="tel"
                                  placeholder="(00) 00000-0000"
                                  value={whatsapp}
                                  onChange={(e) => setWhatsapp(formatPhone(e.target.value))}
                                  className="pl-10 h-12 bg-background/50"
                                />
                              </div>
                            </div>
                          </motion.div>
                        )}

                        {signupStep === 'cpf' && (
                          <motion.div key="cpf" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                            <div className="space-y-2">
                              <Label>CPF</Label>
                              <div className="relative group">
                                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <Input
                                  placeholder="000.000.000-00"
                                  value={formatCPF(cpf)}
                                  onChange={(e) => setCpf(e.target.value.replace(/\D/g, '').slice(0, 11))}
                                  className="pl-10 h-12 bg-background/50"
                                  maxLength={14}
                                />
                              </div>
                              {cpf.length === 11 && !validateCPF(cpf) && (
                                <p className="text-sm text-destructive">CPF inválido</p>
                              )}
                            </div>
                          </motion.div>
                        )}

                        {signupStep === 'email' && (
                          <motion.div key="email" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                            <div className="space-y-2">
                              <Label>Email</Label>
                              <div className="relative group">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <Input
                                  type="email"
                                  placeholder="seu@email.com"
                                  value={signupEmail}
                                  onChange={(e) => { setSignupEmail(e.target.value); setEmailVerified(false); setEmailVerificationSent(false); setOtp(''); }}
                                  disabled={emailVerified}
                                  className="pl-10 h-12 bg-background/50"
                                />
                              </div>
                            </div>

                            {!emailVerified && (
                              <>
                                {!emailVerificationSent ? (
                                  <Button type="button" onClick={sendVerificationCode} disabled={isSendingCode || !signupEmail || cooldown > 0} variant="hero" size="lg" className="w-full">
                                    {isSendingCode ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</> : cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Enviar código de verificação'}
                                  </Button>
                                ) : (
                                  <div className="space-y-4">
                                    <p className="text-sm text-muted-foreground text-center">Digite o código de 6 dígitos enviado para seu email</p>
                                    <div className="flex justify-center">
                                      <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={isVerifyingEmail}>
                                        <InputOTPGroup>
                                          {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
                                        </InputOTPGroup>
                                      </InputOTP>
                                    </div>
                                    <Button type="button" onClick={verifyEmailCode} disabled={otp.length !== 6 || isVerifyingEmail} variant="hero" size="lg" className="w-full">
                                      {isVerifyingEmail ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verificando...</> : 'Verificar código'}
                                    </Button>
                                    <Button type="button" variant="ghost" onClick={sendVerificationCode} disabled={cooldown > 0 || isSendingCode} className="w-full">
                                      {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar código'}
                                    </Button>
                                  </div>
                                )}
                              </>
                            )}

                            {emailVerified && (
                              <div className="flex items-center gap-2 text-primary">
                                <Check className="w-5 h-5" />
                                <span className="text-sm font-medium">Email verificado!</span>
                              </div>
                            )}
                          </motion.div>
                        )}

                        {signupStep === 'password' && (
                          <motion.div key="password" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                            <div className="space-y-2">
                              <Label>Senha</Label>
                              <div className="relative group">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <Input
                                  type={showSignupPassword ? 'text' : 'password'}
                                  placeholder="Mínimo 6 caracteres"
                                  value={signupPassword}
                                  onChange={(e) => setSignupPassword(e.target.value)}
                                  className="pl-10 pr-10 h-12 bg-background/50"
                                />
                                <button type="button" onClick={() => setShowSignupPassword(!showSignupPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                  {showSignupPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Confirmar Senha</Label>
                              <div className="relative group">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <Input
                                  type="password"
                                  placeholder="Confirme sua senha"
                                  value={confirmPassword}
                                  onChange={(e) => setConfirmPassword(e.target.value)}
                                  className="pl-10 h-12 bg-background/50"
                                />
                              </div>
                              {confirmPassword && signupPassword !== confirmPassword && (
                                <p className="text-sm text-destructive">As senhas não coincidem</p>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Navigation */}
                      <div className="flex gap-3 pt-2">
                        {stepIndex > 0 && (
                          <Button type="button" variant="outline" onClick={handleSignupBack} size="lg" className="flex-1 gap-2">
                            <ArrowLeft className="w-4 h-4" /> Voltar
                          </Button>
                        )}
                        <Button
                          type="button"
                          onClick={handleSignupNext}
                          disabled={isSubmitting || (signupStep === 'email' && !emailVerified)}
                          variant="hero"
                          className="flex-1 gap-2"
                          size="lg"
                        >
                          {isSubmitting ? (
                            <><Loader2 className="w-4 h-4 animate-spin" />Criando...</>
                          ) : signupStep === 'password' ? (
                            'Criar Conta'
                          ) : (
                            <>Continuar <ArrowRight className="w-4 h-4" /></>
                          )}
                        </Button>
                      </div>

                      {/* Social divider */}
                      <div className="relative my-2">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border/60" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">ou continue com</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <Button type="button" variant="glass" className="w-full gap-2 h-12" onClick={() => handleSocialLogin('google')}>
                          <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          Google
                        </Button>
                        <Button type="button" variant="glass" className="w-full gap-2 h-12" onClick={() => handleSocialLogin('apple')}>
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                          </svg>
                          Apple
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
