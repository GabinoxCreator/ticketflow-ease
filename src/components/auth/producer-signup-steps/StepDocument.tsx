import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CreditCard, User, Building2, ArrowRight, ArrowLeft, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { formatCPF, validateCPF } from '@/utils/cpfValidator';
import { formatCNPJ, validateCNPJ } from '@/utils/cnpjValidator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ProducerAccountType } from './StepAccountType';

// Estado da conferência do documento na base oficial.
//   found       -> existe; o nome vem preenchido e confirmado
//   notfound    -> a base respondeu que NÃO existe -> trava o Continuar (é a conferência
//                  que o Gabriel pediu: não aceitar documento inventado)
//   unavailable -> a consulta não respondeu (API fora, timeout, limite). NÃO trava:
//                  uma queda da API de terceiro não pode impedir todo mundo de se
//                  cadastrar. Cai no preenchimento manual, como era antes.
type LookupState = 'idle' | 'busy' | 'found' | 'notfound' | 'unavailable';

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
  const [lookup, setLookup] = useState<LookupState>('idle');
  // Guarda o último documento consultado para não repetir a mesma chamada a cada
  // re-render, e para descartar resposta que chega atrasada depois de o usuário
  // já ter corrigido o número.
  const lastQueried = useRef<string>('');

  const handleDocChange = (val: string) => {
    const formatted = formatter(val);
    onDocumentChange(formatted);
    const nowValid = validator(formatted);
    setDocValid(nowValid);
    if (!nowValid) setLookup('idle');
  };

  // Consulta a base oficial assim que o documento fecha o dígito verificador. Documento
  // inválido nunca dispara chamada — o DV filtra antes, de graça.
  useEffect(() => {
    const digits = document.replace(/\D/g, '');
    if (!docValid || digits === lastQueried.current) return;

    lastQueried.current = digits;
    let cancelled = false;
    setLookup('busy');

    supabase.functions
      .invoke('document-lookup', { body: { type: isPJ ? 'cnpj' : 'cpf', document: digits } })
      .then(({ data, error }) => {
        // Resposta atrasada de um número que o usuário já trocou: ignorar.
        if (cancelled || digits !== lastQueried.current) return;

        // `error` aqui é rede ou status não-2xx (ex.: limite de consultas atingido).
        // Nada disso é culpa de quem está se cadastrando — trata como indisponível.
        if (error) { setLookup('unavailable'); return; }

        if (data?.ok && data?.data?.legal_name) {
          onFullNameChange(data.data.legal_name);
          setLookup('found');
          return;
        }
        setLookup(data?.reason === 'not_found' ? 'notfound' : 'unavailable');
      })
      .catch(() => { if (!cancelled) setLookup('unavailable'); });

    return () => { cancelled = true; };
    // onFullNameChange é estável (vem do wizard); incluir causaria reconsulta a cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, docValid, isPJ]);

  const handleNext = () => {
    if (!docValid) {
      toast.error(isPJ ? 'CNPJ inválido' : 'CPF inválido');
      return;
    }
    if (lookup === 'notfound') {
      toast.error(isPJ
        ? 'Este CNPJ não foi encontrado na base oficial. Confira o número.'
        : 'Este CPF não foi encontrado na base oficial. Confira o número.');
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
          {lookup === 'busy' && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-muted-foreground" />
          )}
          {lookup === 'notfound' && (
            <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-destructive" />
          )}
          {docValid && lookup !== 'busy' && lookup !== 'notfound' && (
            <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
          )}
        </div>

        {lookup === 'busy' && (
          <p className="text-xs text-muted-foreground">Conferindo na base oficial…</p>
        )}
        {lookup === 'found' && (
          <p className="text-xs text-green-600">
            ✓ {isPJ ? 'Empresa encontrada' : 'Documento confirmado'} — conferimos para você.
          </p>
        )}
        {lookup === 'notfound' && (
          <p className="text-xs text-destructive">
            Não encontramos este {docLabel} na base oficial. Confira o número digitado.
          </p>
        )}
        {lookup === 'unavailable' && (
          <p className="text-xs text-muted-foreground">
            Não conseguimos conferir agora — pode seguir e preencher {isPJ ? 'a razão social' : 'seu nome'} à mão.
          </p>
        )}
      </div>

      {docValid && lookup !== 'busy' && lookup !== 'notfound' && (
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
          disabled={!docValid || lookup === 'busy' || lookup === 'notfound' || fullName.trim().length < 3}
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
