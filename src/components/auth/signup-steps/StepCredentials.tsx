import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Lock, Eye, EyeOff, ArrowLeft, ArrowRight } from 'lucide-react';
import WhatsAppInput from '@/components/WhatsAppInput';
import PasswordStrength, { getPasswordScore } from '@/components/auth/PasswordStrength';
import { toast } from 'sonner';

interface StepCredentialsProps {
  whatsapp: string;
  password: string;
  confirmPassword: string;
  onWhatsappChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onConfirmPasswordChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}

const StepCredentials: React.FC<StepCredentialsProps> = ({
  whatsapp,
  password,
  confirmPassword,
  onWhatsappChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onBack,
  onNext,
}) => {
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleNext = () => {
    if (whatsapp.replace(/\D/g, '').length < 10) {
      toast.error('Informe um WhatsApp válido');
      return;
    }
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
    onNext();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-5"
    >
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold">Quase lá!</h3>
        <p className="text-sm text-muted-foreground">
          Cadastre seu WhatsApp e crie uma senha
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="whatsapp">WhatsApp</Label>
        <WhatsAppInput value={whatsapp} onChange={onWhatsappChange} />
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
        <Button type="button" variant="outline" onClick={onBack} size="lg" className="flex-shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button type="button" onClick={handleNext} variant="hero" size="lg" className="flex-1">
          Continuar
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
};

export default StepCredentials;
