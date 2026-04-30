import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Eye, EyeOff, Mail, Lock, ArrowLeft, Loader2, Sparkles } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import AuroraBackground from '@/components/auth/AuroraBackground';
import ProducerSignupWizard from '@/components/auth/ProducerSignupWizard';
import PasswordResetOTPFlow from '@/components/auth/PasswordResetOTPFlow';
import logoFestpag from '@/assets/logo-festpag.png';

export default function ProducerAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isProdutor, signIn, isLoading } = useAuth();

  const initialTab = location.pathname.includes('/cadastro') ? 'signup' : 'login';
  const [tab, setTab] = useState<'login' | 'signup'>(initialTab);

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  // Sync tab when route changes
  useEffect(() => {
    setTab(location.pathname.includes('/cadastro') ? 'signup' : 'login');
  }, [location.pathname]);

  useEffect(() => {
    if (user && !isLoading) {
      if (isProdutor) {
        navigate('/produtor/dashboard');
      } else {
        toast.error('Esta conta não é de produtor. Faça cadastro como produtor.');
        setTab('signup');
        navigate('/area-do-produtor/cadastro', { replace: true });
      }
    }
  }, [user, isLoading, isProdutor, navigate]);

  const handleTabChange = (value: string) => {
    const next = value as 'login' | 'signup';
    setTab(next);
    navigate(next === 'login' ? '/area-do-produtor/login' : '/area-do-produtor/cadastro', {
      replace: true,
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    setIsSubmitting(false);
    if (error) {
      toast.error(
        error.message.includes('Invalid login') ? 'Email ou senha incorretos' : 'Erro ao fazer login',
      );
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;
    setIsSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsSubmitting(false);
    if (error) {
      toast.error('Erro ao enviar email de recuperação');
    } else {
      setResetSent(true);
      toast.success('Email de recuperação enviado!');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <AuroraBackground />

      <div className="min-h-screen flex flex-col">
        <header className="p-4">
          <Link
            to="/area-do-produtor"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Voltar</span>
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md"
          >
            {/* Logo + chip */}
            <div className="flex flex-col items-center gap-3 mb-6">
              <Link to="/" className="inline-block">
                <img src={logoFestpag} alt="FestPag" className="h-12 w-auto" />
              </Link>
              <div className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary rounded-full px-3 py-1 text-[11px] font-semibold backdrop-blur">
                <Sparkles className="w-3 h-3" />
                Área do Produtor
              </div>
            </div>

            {/* Glass card */}
            <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-xl shadow-2xl shadow-primary/10 overflow-hidden p-6">
              <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-background/40 border border-border/40">
                  <TabsTrigger value="login">Entrar</TabsTrigger>
                  <TabsTrigger value="signup">Criar conta</TabsTrigger>
                </TabsList>

                {/* LOGIN */}
                <TabsContent value="login" className="mt-5">
                  {forgotMode ? (
                    <div className="space-y-4">
                      <h2 className="font-display font-semibold text-lg">Recuperar senha</h2>
                      {resetSent ? (
                        <div className="text-center space-y-4">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                            <Mail className="w-6 h-6 text-primary" />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Enviamos um link de recuperação para <strong>{resetEmail}</strong>
                          </p>
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => {
                              setForgotMode(false);
                              setResetSent(false);
                            }}
                          >
                            Voltar ao login
                          </Button>
                        </div>
                      ) : (
                        <form onSubmit={handleForgotPassword} className="space-y-4">
                          <p className="text-sm text-muted-foreground">
                            Informe seu email para receber um link de recuperação.
                          </p>
                          <div className="space-y-2">
                            <Label>Email</Label>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                              <Input
                                type="email"
                                placeholder="seu@email.com"
                                value={resetEmail}
                                onChange={(e) => setResetEmail(e.target.value)}
                                className="pl-10"
                                required
                              />
                            </div>
                          </div>
                          <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Enviando...
                              </>
                            ) : (
                              'Enviar link'
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="w-full"
                            onClick={() => setForgotMode(false)}
                          >
                            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
                          </Button>
                        </form>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="text-center space-y-1 mb-2">
                        <h3 className="text-lg font-semibold">Bem-vindo de volta</h3>
                        <p className="text-sm text-muted-foreground">Acesse seu painel de produtor</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            type="email"
                            placeholder="seu@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="pl-10"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Senha</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pl-10 pr-10"
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

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setForgotMode(true);
                            setResetEmail(email);
                          }}
                          className="text-sm text-primary hover:underline"
                        >
                          Esqueceu sua senha?
                        </button>
                      </div>

                      <Button
                        type="submit"
                        variant="hero"
                        className="w-full"
                        size="lg"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Entrando...' : 'Entrar'}
                      </Button>

                      <div className="relative my-2">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border/60" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card/40 backdrop-blur px-2 text-muted-foreground">ou</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full gap-2"
                          size="lg"
                          onClick={async () => {
                            const { error } = await lovable.auth.signInWithOAuth('google', {
                              redirect_uri: window.location.origin,
                            });
                            if (error) toast.error('Erro ao entrar com Google');
                          }}
                        >
                          <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                              fill="#4285F4"
                            />
                            <path
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                              fill="#34A853"
                            />
                            <path
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                              fill="#FBBC05"
                            />
                            <path
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                              fill="#EA4335"
                            />
                          </svg>
                          Entrar com Google
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full gap-2"
                          size="lg"
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
                          Entrar com Apple
                        </Button>
                      </div>

                      <p className="text-center text-sm text-muted-foreground pt-1">
                        Não tem conta?{' '}
                        <button
                          type="button"
                          onClick={() => handleTabChange('signup')}
                          className="text-primary hover:underline font-medium"
                        >
                          Cadastre-se como produtor
                        </button>
                      </p>
                    </form>
                  )}
                </TabsContent>

                {/* SIGNUP */}
                <TabsContent value="signup" className="mt-5">
                  <ProducerSignupWizard onSwitchToLogin={() => handleTabChange('login')} />
                </TabsContent>
              </Tabs>
            </div>
          </motion.div>
        </main>
      </div>
    </>
  );
}
