import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, User, Building2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ProducerAccountType = 'pf' | 'pj';

interface StepAccountTypeProps {
  accountType: ProducerAccountType | null;
  onAccountTypeChange: (t: ProducerAccountType) => void;
  onNext: () => void;
}

const options: Array<{
  id: ProducerAccountType;
  icon: React.ElementType;
  title: string;
  description: string;
}> = [
  {
    id: 'pf',
    icon: User,
    title: 'Pessoa Física',
    description: 'Sou produtor individual ou autônomo',
  },
  {
    id: 'pj',
    icon: Building2,
    title: 'Pessoa Jurídica',
    description: 'Tenho CNPJ, casa de show ou empresa de eventos',
  },
];

const StepAccountType: React.FC<StepAccountTypeProps> = ({
  accountType,
  onAccountTypeChange,
  onNext,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-5"
    >
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold">Como você atua?</h3>
        <p className="text-sm text-muted-foreground">
          Vamos personalizar seu cadastro de produtor
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map((opt) => {
          const Icon = opt.icon;
          const selected = accountType === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onAccountTypeChange(opt.id)}
              className={cn(
                'relative text-left rounded-2xl border-2 p-4 transition-all duration-200',
                'bg-background/40 backdrop-blur-sm',
                'hover:border-primary/50 hover:bg-primary/5',
                selected
                  ? 'border-primary shadow-[0_0_20px_hsl(var(--primary)/0.35)] bg-primary/5'
                  : 'border-border/60',
              )}
            >
              {selected && (
                <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Check className="h-3.5 w-3.5" />
                </div>
              )}
              <div
                className={cn(
                  'inline-flex items-center justify-center h-11 w-11 rounded-xl mb-3 border',
                  selected
                    ? 'bg-gradient-to-br from-primary/30 to-accent/20 border-primary/40 text-primary'
                    : 'bg-card/60 border-border/60 text-muted-foreground',
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <h4 className="font-semibold text-sm text-foreground">{opt.title}</h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {opt.description}
              </p>
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        onClick={onNext}
        disabled={!accountType}
        variant="hero"
        size="lg"
        className="w-full"
      >
        Continuar
        <ArrowRight className="h-4 w-4" />
      </Button>
    </motion.div>
  );
};

export default StepAccountType;
