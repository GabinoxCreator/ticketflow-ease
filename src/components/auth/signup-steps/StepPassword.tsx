import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Lock, Eye, EyeOff, ArrowLeft, Loader2 } from 'lucide-react';
import PasswordStrength, { getPasswordScore } from '@/components/auth/PasswordStrength';
import { toast } from 'sonner';

interface StepPasswordProps {
  password: string;
  confirmPassword: string;
  submitting: boolean;
  onPasswordChange: (v: string) => void;
  onConfirmPasswordChange: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}

const StepPassword: React.FC<StepPasswordProps> = ({
  password,
  confirmPassword,
  submitting,
  onPasswordChange,
  onConfirmPasswordChange,
  onBack,
  onSubmit,
}) => {
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = () => {
    if (password.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres');
      return;
    }
    if (getPasswordScore(password) < 2) {
      toast.error('Senha muito fraca, tente uma mais forte');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    onSubmit();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-5"
    >
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold">Crie sua senha</h3>
        <p className="text-sm text-muted-foreground">
          Use uma senha forte para proteger sua conta
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="password"
            type={showPwd ? 'text' : 'password'}
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className="pl-10 pr-10"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowPwd(!showPwd)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPwd ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        <PasswordStrength password={password} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirmar senha</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="confirm-password"
            type={showConfirm ? 'text' : 'password'}
            placeholder="Repita a senha"
            value={confirmPassword}
            onChange={(e) => onConfirmPasswordChange(e.target.value)}
            className="pl-10 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          size="lg"
          className="flex-shrink-0"
          disabled={submitting}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          variant="hero"
          size="lg"
          className="flex-1"
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Criando conta...
            </>
          ) : (
            'Criar minha conta'
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center leading-relaxed">
        Ao clicar em <span className="font-medium text-foreground">Criar minha conta</span>, você concorda com nossos{' '}
        <a href="/termos" target="_blank" className="text-primary hover:underline">
          termos de uso
        </a>{' '}
        e{' '}
        <a href="/privacidade" target="_blank" className="text-primary hover:underline">
          política de privacidade
        </a>
        .
      </p>
    </motion.div>
  );
};

export default StepPassword;
