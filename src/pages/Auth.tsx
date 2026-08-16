import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Eye, EyeOff, Mail, Lock, ArrowLeft, Loader2, UserPlus, Sparkles } from 'lucide-react';
import logoFestpag from '@/assets/logo-festpag.png';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
import AuroraBackground from '@/components/auth/AuroraBackground';
import SignupWizard from '@/components/auth/SignupWizard';
import PasswordResetOTPFlow from '@/components/auth/PasswordResetOTPFlow';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

const Auth: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, user, isLoading } = useAuth();

  // ?mode=cadastrar já abre na aba de cadastro (usado pelo convite pós-curtida)
  const [activeTab, setActiveTab] = useState<'login' | 'cadastrar'>(
    searchParams.get('mode') === 'cadastrar' ? 'cadastrar' : 'login',
  );
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // gate do auto-redirect: enquanto o convite de carteira (pós-cadastro) estiver
  // ativo, o effect abaixo NÃO navega — senão o auto-login do signUp tiraria a
  // pessoa da tela antes do convite aparecer. Só o fluxo de cadastro liga isto.
  const [walletInviteOpen, setWalletInviteOpen] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Esqueci a senha
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  const redirect = searchParams.get('redirect') || '/';
  const mode = searchParams.get('mode');

  useEffect(() => {
    if (user && !isLoading && !walletInviteOpen) {
      navigate(redirect);
    }
  }, [user, isLoading, navigate, redirect, walletInviteOpen]);

  // B4.4a: Auto-open password reset dialog when ?mode=forgot
  useEffect(() => {
    if (mode === 'forgot') {
      const emailParam = searchParams.get('email');
      if (emailParam) setForgotEmail(emailParam);
      setForgotOpen(true);
    }
  }, [mode, searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      loginSchema.parse({ email: loginEmail, password: loginPassword });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
        return;
      }
    }
    setIsSubmitting(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setIsSubmitting(false);
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        toast.error('Email ou senha incorretos');
      } else {
        toast.error('Erro ao fazer login. Tente novamente.');
      }
    } else {
      toast.success('Login realizado com sucesso!');
      navigate(redirect);
    }
  };




  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative">
      <AuroraBackground />

      {/* Header */}
      <header className="p-4 z-10">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Voltar</span>
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-start justify-center p-4 pt-2 z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Logo */}
          <div className="text-center mb-6">
            <Link to="/">
              <img src={logoFestpag} alt="FestPag" className="h-[6.3rem] w-auto mx-auto" />
            </Link>
            <p className="text-muted-foreground mt-1">
              {activeTab === 'login' ? 'Faça seu login e bora curtir' : 'Crie sua conta em poucos passos'}
            </p>
          </div>

          {/* Premium glass card */}
          <div className="relative">
            {/* Glow */}
            <div
              className="absolute inset-0 rounded-3xl opacity-60 blur-2xl -z-10"
              style={{
                background:
                  'linear-gradient(135deg, hsl(var(--primary) / 0.4), hsl(330 85% 60% / 0.3))',
              }}
            />

            <div className="backdrop-blur-2xl bg-card/60 rounded-3xl shadow-2xl border border-border/50 overflow-hidden">
              {/* Tabs pílula */}
              <div className="p-2">
                <div className="relative flex bg-muted/50 rounded-2xl p-1">
                  {(['login', 'cadastrar'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`relative flex-1 py-2.5 text-sm font-medium rounded-xl transition-colors z-10 ${
                        activeTab === tab ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {activeTab === tab && (
                        <motion.div
                          layoutId="activePillTab"
                          className="absolute inset-0 rounded-xl bg-gradient-to-r from-[hsl(250,85%,60%)] to-[hsl(330,85%,60%)] shadow-lg"
                          style={{ boxShadow: '0 4px 20px hsl(var(--primary) / 0.4)' }}
                          transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                        />
                      )}
                      <span className="relative z-10">
                        {tab === 'login' ? 'Entrar' : 'Cadastrar'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6 pt-2">
                <AnimatePresence mode="wait">
                  {activeTab === 'login' ? (
                    <motion.form
                      key="login"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      onSubmit={handleLogin}
                      className="space-y-4"
                    >
                      <div className="space-y-2">
                        <Label htmlFor="login-email">Email</Label>
                        <div className="relative group">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                          <Input
                            id="login-email"
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
                        <div className="flex items-center justify-between">
                          <Label htmlFor="login-password">Senha</Label>
                          <button
                            type="button"
                            onClick={() => {
                              setForgotEmail(loginEmail);
                              setForgotOpen(true);
                            }}
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            Esqueci minha senha
                          </button>
                        </div>
                        <div className="relative group">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                          <Input
                            id="login-password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            className="pl-10 pr-10 h-12 bg-background/50"
                            required
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

                      <Button
                        type="submit"
                        variant="hero"
                        className="w-full"
                        size="lg"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Entrando...
                          </>
                        ) : (
                          'Entrar'
                        )}
                      </Button>

                      {/* Login social foi descontinuado: quem criou a conta por Google/Apple não
                          tem senha, então precisa criar uma pelo "Esqueci minha senha" (mesmo
                          e-mail = mesma conta, os ingressos continuam lá). */}
                      <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-3">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          <span className="font-medium text-foreground">Você entrava com Google ou Apple?</span>{' '}
                          Agora o acesso é com senha. Toque em{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setForgotEmail(loginEmail);
                              setForgotOpen(true);
                            }}
                            className="text-primary hover:underline font-medium"
                          >
                            Esqueci minha senha
                          </button>{' '}
                          e crie a sua usando o mesmo e-mail de sempre. Sua conta e seus ingressos continuam lá.
                        </p>
                      </div>

                      {/* CTA Cadastrar destacado */}
                      <div className="relative pt-4 mt-2">
                        <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-primary/30 to-[hsl(330,85%,60%)]/30 blur-md opacity-50" />
                        <Button
                          type="button"
                          variant="outline"
                          className="relative w-full h-12 gap-2 border-2 border-primary/40 hover:border-primary/70 hover:bg-primary/5 backdrop-blur-sm group"
                          onClick={() => setActiveTab('cadastrar')}
                        >
                          <Sparkles className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
                          <span className="font-semibold">Criar uma conta grátis</span>
                          <UserPlus className="h-4 w-4 text-primary" />
                        </Button>
                      </div>
                    </motion.form>
                  ) : (
                    <motion.div
                      key="cadastrar"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <SignupWizard
                        redirect={redirect}
                        onSwitchToLogin={() => setActiveTab('login')}
                        onShowWalletInvite={setWalletInviteOpen}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Dialog: Esqueci a senha (OTP via Resend) */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="sr-only">
            <DialogTitle>Recuperar senha</DialogTitle>
            <DialogDescription>
              Recupere sua senha por código enviado ao seu email.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2">
            <PasswordResetOTPFlow
              initialEmail={forgotEmail}
              onSuccess={() => {
                setForgotOpen(false);
                setForgotEmail('');
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
