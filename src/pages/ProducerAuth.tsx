import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Eye, EyeOff, Mail, Lock, ArrowLeft, Loader2, Sparkles } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

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
                    <PasswordResetOTPFlow
                      initialEmail={resetEmail || email}
                      onBack={() => setForgotMode(false)}
                      onSuccess={() => {
                        setForgotMode(false);
                        setResetEmail('');
                      }}
                    />
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
