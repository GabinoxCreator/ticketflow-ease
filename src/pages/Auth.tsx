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
import { lovable } from '@/integrations/lovable/index';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
import AuroraBackground from '@/components/auth/AuroraBackground';
import SignupWizard from '@/components/auth/SignupWizard';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

const Auth: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, user, isLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<'login' | 'cadastrar'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Esqueci a senha
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [sendingReset, setSendingReset] = useState(false);

  const redirect = searchParams.get('redirect') || '/';

  useEffect(() => {
    if (user && !isLoading) {
      navigate(redirect);
    }
  }, [user, isLoading, navigate, redirect]);

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

  const handleSendReset = async () => {
    const parsed = z.string().email('Email inválido').safeParse(forgotEmail);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);
    if (error) {
      toast.error('Erro ao enviar email. Tente novamente.');
    } else {
      toast.success('Email de recuperação enviado!');
      setForgotOpen(false);
      setForgotEmail('');
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

                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border/60" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card/80 backdrop-blur px-2 text-muted-foreground">ou continue com</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          type="button"
                          variant="glass"
                          className="w-full gap-2 h-12"
                          onClick={async () => {
                            const { error } = await lovable.auth.signInWithOAuth('google', {
                              redirect_uri: window.location.origin,
                            });
                            if (error) toast.error('Erro ao entrar com Google');
                          }}
                        >
                          <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                          </svg>
                          Google
                        </Button>

                        <Button
                          type="button"
                          variant="glass"
                          className="w-full gap-2 h-12"
                          onClick={async () => {
                            const { error } = await lovable.auth.signInWithOAuth('apple', {
                              redirect_uri: window.location.origin,
                            });
                            if (error) toast.error('Erro ao entrar com Apple');
                          }}
                        >
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                          </svg>
                          Apple
                        </Button>
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
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Dialog: Esqueci a senha */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Recuperar senha
            </DialogTitle>
            <DialogDescription>
              Digite seu email e enviaremos um link para redefinir sua senha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="pl-10 h-12"
                  autoFocus
                />
              </div>
            </div>
            <Button
              type="button"
              variant="hero"
              className="w-full"
              size="lg"
              onClick={handleSendReset}
              disabled={sendingReset}
            >
              {sendingReset ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar link de recuperação'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
