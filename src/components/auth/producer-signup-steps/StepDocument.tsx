import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CreditCard, User, Building2, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { formatCPF, validateCPF } from '@/utils/cpfValidator';
import { formatCNPJ, validateCNPJ } from '@/utils/cnpjValidator';
import { toast } from 'sonner';
import type { ProducerAccountType } from './StepAccountType';

interface StepDocumentProps {
  accountType: ProducerAccountType;
  document: string;
  fullName: string;
  onDocumentChange: (v: string) => void;
  onFullNameChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}

const StepDocument: React.FC<StepDocumentProps> = ({
  accountType,
  document,
  fullName,
  onDocumentChange,
  onFullNameChange,
  onBack,
  onNext,
}) => {
  const isPJ = accountType === 'pj';
  const validator = isPJ ? validateCNPJ : validateCPF;
  const formatter = isPJ ? formatCNPJ : formatCPF;
  const [docValid, setDocValid] = useState(validator(document));

  const handleDocChange = (val: string) => {
    const formatted = formatter(val);
    onDocumentChange(formatted);
    setDocValid(validator(formatted));
  };

  const handleNext = () => {
    if (!docValid) {
      toast.error(isPJ ? 'CNPJ inválido' : 'CPF inválido');
      return;
    }
    if (fullName.trim().length < 3) {
      toast.error(isPJ ? 'Informe a razão social' : 'Informe seu nome completo');
      return;
    }
    onNext();
  };

  const docLabel = isPJ ? 'CNPJ' : 'CPF';
  const docPlaceholder = isPJ ? '00.000.000/0000-00' : '000.000.000-00';
  const docMaxLength = isPJ ? 18 : 14;
  const nameLabel = isPJ ? 'Razão social' : 'Nome completo';
  const namePlaceholder = isPJ ? 'Empresa Ltda' : 'Como aparece no seu RG';
  const NameIcon = isPJ ? Building2 : User;
  const nameHint = isPJ
    ? 'Nome da empresa que aparecerá em recibos e repasses.'
    : 'Use seu nome real para validação e repasses.';

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-5"
    >
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold">
          {isPJ ? 'Dados da empresa' : 'Seus dados'}
        </h3>
        <p className="text-sm text-muted-foreground">
          {isPJ ? 'Informe o CNPJ e a razão social' : 'Informe seu CPF e nome completo'}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="document">{docLabel}</Label>
        <div className="relative">
          <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="document"
            type="text"
            inputMode="numeric"
            placeholder={docPlaceholder}
            value={document}
            onChange={(e) => handleDocChange(e.target.value)}
            className="pl-10 pr-10"
            maxLength={docMaxLength}
            autoFocus
          />
          {docValid && (
            <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
          )}
        </div>
      </div>

      {docValid && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-2"
        >
          <Label htmlFor="fullName">{nameLabel}</Label>
          <div className="relative">
            <NameIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              id="fullName"
              type="text"
              placeholder={namePlaceholder}
              value={fullName}
              onChange={(e) => onFullNameChange(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground">{nameHint}</p>
        </motion.div>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack} size="lg" className="flex-shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          onClick={handleNext}
          disabled={!docValid || fullName.trim().length < 3}
          variant="hero"
          size="lg"
          className="flex-1"
        >
          Continuar
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
};

export default StepDocument;
