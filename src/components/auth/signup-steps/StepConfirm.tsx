import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle2, Loader2, Sparkles } from 'lucide-react';

interface SignupData {
  cpf: string;
  nomeCompleto: string;
  email: string;
  whatsapp: string;
}

interface StepConfirmProps {
  data: SignupData;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

const StepConfirm: React.FC<StepConfirmProps> = ({ data, submitting, onBack, onSubmit }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-5"
    >
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold flex items-center justify-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Confirme seus dados
        </h3>
        <p className="text-sm text-muted-foreground">
          Revise as informações antes de finalizar
        </p>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
        <Row label="Nome" value={data.nomeCompleto} />
        <Row label="CPF" value={data.cpf} />
        <Row
          label="Email"
          value={
            <span className="inline-flex items-center gap-1.5">
              {data.email}
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            </span>
          }
        />
        <Row label="WhatsApp" value={data.whatsapp} />
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
          onClick={onSubmit}
          disabled={submitting}
          variant="hero"
          size="lg"
          className="flex-1"
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

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-foreground text-right truncate">{value}</span>
  </div>
);

export default StepConfirm;
