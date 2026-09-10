/*
 * /login — a única porta de entrada do cliente (desde a virada de 09/09/2026).
 *
 * Antes havia duas abas (Entrar com e-mail + senha / Cadastrar em 4 passos) e,
 * por um dia, um botão a mais. O Gabriel cortou: "quero uma coisa só". A página
 * agora é o FluxoConta embutido no cartão: CPF (ou celular, ou e-mail) → senha
 * (ou o cadastro, se não há conta) → código no WhatsApp ou e-mail → dentro.
 *
 * `?redirect=` continua valendo (ProtectedRoute manda para cá). `?mode=cadastrar`
 * e `?mode=forgot` levam ao mesmo lugar: a primeira tela pergunta quem é você e o
 * fluxo decide. O produtor continua com a entrada dele em /area-do-produtor/login.
 */
import React, { useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Loader2 } from 'lucide-react';
import logoFestpag from '@/assets/logo-festpag.png';
import AuroraBackground from '@/components/auth/AuroraBackground';
import { FluxoConta } from '@/components/auth/FluxoConta';

const Auth: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isLoading } = useAuth();
  const redirect = searchParams.get('redirect') || '/';

  useEffect(() => {
    if (user && !isLoading) navigate(redirect);
  }, [user, isLoading, navigate, redirect]);

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

      <header className="p-4 z-10">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
          <span>Voltar</span>
        </Link>
      </header>

      <main className="flex-1 flex items-start justify-center p-4 pt-2 z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="text-center mb-6">
            <Link to="/">
              <img src={logoFestpag} alt="FestPag" className="h-[6.3rem] w-auto mx-auto" />
            </Link>
            <p className="text-muted-foreground mt-1">Entre ou crie sua conta em poucos passos</p>
          </div>

          <div className="relative">
            <div
              className="absolute inset-0 rounded-3xl opacity-60 blur-2xl -z-10"
              style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.4), hsl(330 85% 60% / 0.3))' }}
            />
            <div className="backdrop-blur-2xl bg-card/60 rounded-3xl shadow-2xl border border-border/50 overflow-hidden">
              <FluxoConta
                embutido
                onFechar={() => navigate('/')}
                onAuthenticated={() => navigate(redirect)}
              />
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-5">
            Produtor de eventos?{' '}
            <Link to="/area-do-produtor/login" className="text-primary hover:underline font-medium">
              Entre por aqui
            </Link>
            .
          </p>
        </motion.div>
      </main>
    </div>
  );
};

export default Auth;
