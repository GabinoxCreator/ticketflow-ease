import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CreditCard, User, Building2, ArrowRight, ArrowLeft, CheckCircle2, Loader2, AlertCircle, CalendarDays } from 'lucide-react';
import { formatCPF, validateCPF } from '@/utils/cpfValidator';
import { formatCNPJ, validateCNPJ } from '@/utils/cnpjValidator';
import { maskNascimento, nascimentoParaIso, nascimentoCompleto } from '@/lib/nascimento';
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
//
// Pessoa física (OS-339, 28/10/2026): a base oficial passou a exigir a data de
// nascimento junto do CPF. A consulta só sai com CPF válido E data completa; a data
// vai só para a consulta, não é gravada.
type LookupState = 'idle' | 'busy' | 'found' | 'notfound' | 'unavailable';

interface StepDocumentProps {
  accountType: ProducerAccountType;
  document: string;
  fullName: string;
  /** Data de nascimento dd/mm/aaaa (só pessoa física). */
  birthDate: string;
  onDocumentChange: (v: string) => void;
  onBirthDateChange: (v: string) => void;
  onFullNameChange: (v: string) => void;
  /** Ficha da base oficial para este documento (OS-338), ou null. */
  onConferenciaChange?: (id: string | null) => void;
  onBack: () => void;
  onNext: () => void;
}

const StepDocument: React.FC<StepDocumentProps> = ({
  accountType,
  document,
  fullName,
  birthDate,
  onDocumentChange,
  onBirthDateChange,
  onFullNameChange,
  onConferenciaChange,
  onBack,
  onNext,
}) => {
  const isPJ = accountType === 'pj';
  const validator = isPJ ? validateCNPJ : validateCPF;
  const formatter = isPJ ? formatCNPJ : formatCPF;
  const [docValid, setDocValid] = useState(validator(document));
  const [lookup, setLookup] = useState<LookupState>('idle');
  // Pessoa física: a data em 'aaaa-mm-dd', ou null enquanto não é uma data de verdade.
  const birthIso = isPJ ? null : nascimentoParaIso(birthDate);
  const birthInvalid = !isPJ && nascimentoCompleto(birthDate) && !birthIso;
  // Pronto para consultar: CPF/CNPJ válido e, na pessoa física, a data também.
  const readyToQuery = docValid && (isPJ || !!birthIso);
  // Guarda o último documento consultado para não repetir a mesma chamada a cada
  // re-render, e para descartar resposta que chega atrasada depois de o usuário
  // já ter corrigido o número.
  const lastQueried = useRef<string>('');

  const handleDocChange = (val: string) => {
    const formatted = formatter(val);
    // A ficha é do documento consultado: mudou o número, ela não vale mais. E a
    // consulta é esquecida junto: quem apaga um dígito e digita de novo (volta ao
    // mesmo número) consulta outra vez e ganha ficha nova (revisão 2 da OS-338).
    if (formatted.replace(/\D/g, '') !== document.replace(/\D/g, '')) {
      onConferenciaChange?.(null);
      lastQueried.current = '';
    }
    onDocumentChange(formatted);
    const nowValid = validator(formatted);
    setDocValid(nowValid);
    if (!nowValid) setLookup('idle');
  };

  const handleBirthChange = (val: string) => {
    const masked = maskNascimento(val);
    // Mesma regra do documento: a ficha é da consulta com esta data. Mudou, não vale mais.
    if (masked !== birthDate) {
      onConferenciaChange?.(null);
      lastQueried.current = '';
    }
    onBirthDateChange(masked);
    if (!nascimentoParaIso(masked)) setLookup('idle');
  };

  // Consulta a base oficial assim que o documento fecha o dígito verificador. Documento
  // inválido nunca dispara chamada — o DV filtra antes, de graça.
  useEffect(() => {
    const digits = document.replace(/\D/g, '');
    // A chave da consulta é o documento e, na pessoa física, a data junto.
    const key = isPJ ? digits : `${digits}|${birthIso ?? ''}`;
    if (!readyToQuery || key === lastQueried.current) return;

    lastQueried.current = key;
    let cancelled = false;
    setLookup('busy');

    const body = isPJ
      ? { type: 'cnpj', document: digits }
      : { type: 'cpf', document: digits, birth_date: birthIso };

    supabase.functions
      .invoke('document-lookup', { body })
      .then(({ data, error }) => {
        // Resposta atrasada de um número (ou data) que o usuário já trocou: ignorar.
        if (cancelled || key !== lastQueried.current) return;

        // `error` aqui é rede ou status não-2xx (ex.: limite de consultas atingido).
        // Nada disso é culpa de quem está se cadastrando — trata como indisponível.
        if (error) { setLookup('unavailable'); return; }

        if (data?.ok && data?.data?.legal_name) {
          onFullNameChange(data.data.legal_name);
          onConferenciaChange?.(typeof data.conferencia === 'string' ? data.conferencia : null);
          setLookup('found');
          return;
        }
        setLookup(data?.reason === 'not_found' ? 'notfound' : 'unavailable');
      })
      .catch(() => { if (!cancelled) setLookup('unavailable'); });

    return () => { cancelled = true; };
    // onFullNameChange é estável (vem do wizard); incluir causaria reconsulta a cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, docValid, isPJ, birthIso, readyToQuery]);

  const handleNext = () => {
    if (!docValid) {
      toast.error(isPJ ? 'CNPJ inválido' : 'CPF inválido');
      return;
    }
    if (!isPJ && !birthIso) {
      toast.error('Informe sua data de nascimento');
      return;
    }
    if (lookup === 'notfound') {
      toast.error(isPJ
        ? 'Este CNPJ não foi encontrado na base oficial. Confira o número.'
        : 'Este CPF não foi encontrado na base oficial com esta data de nascimento. Confira os dois.');
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

  const lookupMessages = (
    <>
      {lookup === 'busy' && (
        <p className="text-xs text-muted-foreground">Conferindo na base oficial…</p>
      )}
      {lookup === 'found' && (
        <p className="text-xs text-green-600">
          ✓ {isPJ ? 'Empresa encontrada na base oficial.' : 'Documento encontrado na base oficial.'}
        </p>
      )}
      {lookup === 'notfound' && (
        <p className="text-xs text-destructive">
          {isPJ
            ? 'Não encontramos este CNPJ na base oficial. Confira o número digitado.'
            : 'Não encontramos este CPF com esta data de nascimento na base oficial. Confira os dois.'}
        </p>
      )}
      {lookup === 'unavailable' && (
        <p className="text-xs text-muted-foreground">
          Não conseguimos conferir agora. Pode seguir e preencher {isPJ ? 'a razão social' : 'seu nome'} à mão.
        </p>
      )}
    </>
  );

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
          {isPJ ? 'Informe o CNPJ e a razão social' : 'Informe seu CPF, data de nascimento e nome completo'}
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

        {isPJ && lookupMessages}
      </div>

      {!isPJ && docValid && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-2"
        >
          <Label htmlFor="birthDate">Data de nascimento</Label>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              id="birthDate"
              type="text"
              inputMode="numeric"
              autoComplete="bday"
              placeholder="dd/mm/aaaa"
              value={birthDate}
              onChange={(e) => handleBirthChange(e.target.value)}
              className="pl-10"
              maxLength={10}
              autoFocus={!birthIso}
            />
          </div>
          {birthInvalid ? (
            <p className="text-xs text-destructive">Data de nascimento inválida. Use dia/mês/ano.</p>
          ) : lookup === 'idle' ? (
            <p className="text-xs text-muted-foreground">Usamos só para conferir o seu CPF na base oficial.</p>
          ) : null}
          {lookupMessages}
        </motion.div>
      )}

      {readyToQuery && lookup !== 'busy' && lookup !== 'notfound' && (
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
          disabled={!readyToQuery || lookup === 'busy' || lookup === 'notfound' || fullName.trim().length < 3}
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
