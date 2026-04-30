import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Página legada de redefinição de senha (magic link do Supabase).
 * Agora redireciona para /auth, onde o novo fluxo OTP via email está disponível.
 */
const ResetPassword = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/auth?mode=forgot', { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <p className="text-muted-foreground">Redirecionando...</p>
    </div>
  );
};

export default ResetPassword;
