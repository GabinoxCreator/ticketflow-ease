import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCPF, validateCPF, unformatCPF } from '@/utils/cpfValidator';
import { cn } from '@/lib/utils';

interface CheckoutStepCPFProps {
  initialCPF?: string;
  initialName?: string;
  initialEmail?: string;
  requireName?: boolean;
  requireEmail?: boolean;
  onContinue: (cpf: string, name: string, email: string) => void;
}

export function CheckoutStepCPF({ 
  initialCPF = '', 
  initialName = '',
  initialEmail = '',
  requireName = false,
  requireEmail = false,
  onContinue 
}: CheckoutStepCPFProps) {
  const [cpf, setCPF] = useState(initialCPF);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [cpfError, setCpfError] = useState('');
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isValid, setIsValid] = useState(false);

  const handleCPFChange = (value: string) => {
    const formatted = formatCPF(value);
    setCPF(formatted);
    
    const digits = unformatCPF(value);
    if (digits.length === 11) {
      if (validateCPF(digits)) {
        setCpfError('');
        setIsValid(true);
      } else {
        setCpfError('CPF inválido');
        setIsValid(false);
      }
    } else {
      setCpfError('');
      setIsValid(false);
    }
  };

  const handleSubmit = () => {
    let hasError = false;

    const digits = unformatCPF(cpf);
    if (digits.length !== 11 || !validateCPF(digits)) {
      setCpfError('CPF inválido');
      hasError = true;
    }

    if (requireName) {
      if (name.trim().length < 3) {
        setNameError('Nome deve ter pelo menos 3 caracteres');
        hasError = true;
      } else {
        setNameError('');
      }
    }

    if (requireEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setEmailError('Email inválido');
        hasError = true;
      } else {
        setEmailError('');
      }
    }

    if (!hasError) {
      onContinue(digits, name.trim(), email.trim());
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="w-8 h-8 text-primary" />
        </div>
        <h2 className="font-display font-bold text-xl">
          {requireName || requireEmail ? 'Complete seus dados' : 'Confirme seu CPF'}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Precisamos {requireName || requireEmail ? 'de algumas informações' : 'do seu CPF'} para emitir o ingresso
        </p>
      </div>

      <div className="space-y-4">
        {requireName && (
          <div className="space-y-2">
            <Label htmlFor="name">Nome completo</Label>
            <Input
              id="name"
              type="text"
              placeholder="Seu nome completo"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError('');
              }}
              className={cn(nameError && 'border-destructive')}
            />
            {nameError && (
              <p className="text-destructive text-sm flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {nameError}
              </p>
            )}
          </div>
        )}

        {requireEmail && (
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError('');
              }}
              className={cn(emailError && 'border-destructive')}
            />
            {emailError && (
              <p className="text-destructive text-sm flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {emailError}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="cpf">CPF</Label>
          <div className="relative">
            <Input
              id="cpf"
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => handleCPFChange(e.target.value)}
              maxLength={14}
              className={cn(
                'pr-10',
                cpfError && 'border-destructive',
                isValid && 'border-green-500'
              )}
            />
            {isValid && (
              <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
            )}
          </div>
          {cpfError && (
            <p className="text-destructive text-sm flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {cpfError}
            </p>
          )}
        </div>
      </div>

      <Button
        variant="hero"
        size="lg"
        className="w-full"
        onClick={handleSubmit}
      >
        Continuar
        <ArrowRight className="w-5 h-5 ml-2" />
      </Button>
    </motion.div>
  );
}
