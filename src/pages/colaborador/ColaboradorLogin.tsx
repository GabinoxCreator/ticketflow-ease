import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import logoFestpag from '@/assets/logo-festpag.png';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-6">
          <img src={logoFestpag} alt="FestPag" className="h-11 w-auto mx-auto mb-3" />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            Área do Colaborador
          </div>
        </div>

        <Card className="border-slate-200 dark:border-slate-800 shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Entrar para operar</CardTitle>
            <CardDescription>
              Use as credenciais fornecidas pelo produtor do evento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-lg">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-sm font-medium">Usuário</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ex: portaria01"
                  required
                  autoComplete="username"
                  className="h-11"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="h-11 pr-11"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full gap-2 h-12 text-base font-semibold"
                disabled={isLoading}
              >
                {isLoading ? (
                  'Entrando...'
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Entrar
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Sem acesso? Solicite ao produtor do evento.
        </p>
      </motion.div>
    </div>
  );
}
