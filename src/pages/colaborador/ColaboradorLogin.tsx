import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import logoFestpag from '@/assets/logo-festpag.png';
import { motion } from 'framer-motion';
import { useColaboradorAuth } from '@/contexts/ColaboradorAuthContext';

export default function ColaboradorLogin() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useColaboradorAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (isAuthenticated) {
    navigate('/colaborador/eventos', { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const result = await login(username, password);
    if (result.success) {
      navigate('/colaborador/eventos');
    } else {
      setError(result.error || 'Erro ao fazer login');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-br from-white via-slate-50 to-indigo-50/40">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        {/* Logo + subtítulo */}
        <div className="text-center mb-6">
          <img src={logoFestpag} alt="FestPag" className="h-10 w-auto mx-auto mb-3" />
          <p className="text-sm text-slate-500">Acesso do colaborador</p>
        </div>

        {/* Card claro */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl shadow-indigo-500/5 p-6 sm:p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="text-[11px] font-semibold uppercase tracking-wider text-slate-600"
              >
                Usuário
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="seu_usuario"
                required
                autoComplete="username"
                autoCapitalize="none"
                className="w-full h-12 px-3.5 rounded-lg bg-slate-50/70 border border-slate-200 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-[11px] font-semibold uppercase tracking-wider text-slate-600"
              >
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full h-12 px-3.5 pr-11 rounded-lg bg-slate-50/70 border border-slate-200 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !username || !password}
              className="w-full h-12 mt-1 rounded-lg bg-gradient-to-br from-primary to-indigo-600 text-white font-semibold text-base flex items-center justify-center gap-2 shadow-md shadow-primary/20 transition active:scale-[0.99] hover:shadow-lg hover:shadow-primary/25 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-md"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Validando…
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-5">
          Problemas para acessar? Fale com o produtor do evento.
        </p>
      </motion.div>
    </div>
  );
}
