import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CreditCard, User, ArrowRight, CheckCircle2 } from 'lucide-react';
import { formatCPF, validateCPF } from '@/utils/cpfValidator';
import { toast } from 'sonner';

interface StepCPFProps {
  cpf: string;
  nomeCompleto: string;
  onCpfChange: (v: string) => void;
  onNomeChange: (v: string) => void;
  onNext: () => void;
}

const StepCPF: React.FC<StepCPFProps> = ({
  cpf,
  nomeCompleto,
  onCpfChange,
  onNomeChange,
  onNext,
}) => {
  const [cpfValid, setCpfValid] = useState(validateCPF(cpf));
  const [checking, setChecking] = useState(false);

  const handleCpfChange = (val: string) => {
    const formatted = formatCPF(val);
    onCpfChange(formatted);
    const valid = validateCPF(formatted);
    setCpfValid(valid);
  };

  const handleNext = () => {
    if (!cpfValid) {
      toast.error('CPF inválido');
      return;
    }
    if (nomeCompleto.trim().length < 3) {
      toast.error('Informe seu nome completo');
      return;
    }
    setChecking(true);
    // Placeholder para futura integração de API CPF→nome
    setTimeout(() => {
      setChecking(false);
      onNext();
    }, 300);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-5"
    >
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold">Vamos começar</h3>
        <p className="text-sm text-muted-foreground">
          Informe seu CPF e nome completo
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cpf">CPF</Label>
        <div className="relative">
          <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="cpf"
            type="text"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => handleCpfChange(e.target.value)}
            className="pl-10 pr-10"
            maxLength={14}
            autoFocus
          />
          {cpfValid && (
            <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
          )}
        </div>
      </div>

      {cpfValid && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-2"
        >
          <Label htmlFor="nome">Nome completo</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              id="nome"
              type="text"
              placeholder="Como aparece no seu RG"
              value={nomeCompleto}
              onChange={(e) => onNomeChange(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Use seu nome real para validação na entrada do evento.
          </p>
        </motion.div>
      )}

      <Button
        type="button"
        onClick={handleNext}
        disabled={!cpfValid || nomeCompleto.trim().length < 3 || checking}
        variant="hero"
        className="w-full"
        size="lg"
      >
        {checking ? 'Validando...' : 'Continuar'}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </motion.div>
  );
};

export default StepCPF;
