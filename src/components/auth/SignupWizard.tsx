import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import StepIndicator from './StepIndicator';
import StepCPF from './signup-steps/StepCPF';
import StepEmail from './signup-steps/StepEmail';
import StepCredentials from './signup-steps/StepCredentials';
import StepConfirm from './signup-steps/StepConfirm';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface SignupWizardProps {
  redirect: string;
  onSwitchToLogin: () => void;
}

const SignupWizard: React.FC<SignupWizardProps> = ({ redirect, onSwitchToLogin }) => {
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const [cpf, setCpf] = useState('');
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [email, setEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = async () => {
    setSubmitting(true);
    const { error } = await signUp({
      email,
      password,
      nome_completo: nomeCompleto,
      cpf,
      whatsapp,
      tipo_conta: 'cliente',
    });
    setSubmitting(false);

    if (error) {
      if (error.message.includes('already registered')) {
        toast.error('Este email já está cadastrado');
      } else {
        toast.error('Erro ao criar conta. Tente novamente.');
      }
    } else {
      toast.success('Conta criada com sucesso!');
      navigate(redirect);
    }
  };

  return (
    <div className="space-y-6">
      <StepIndicator
        currentStep={step}
        totalSteps={4}
        labels={['CPF', 'Email', 'Senha', 'Confirmar']}
      />

      <AnimatePresence mode="wait">
        {step === 1 && (
          <StepCPF
            key="step1"
            cpf={cpf}
            nomeCompleto={nomeCompleto}
            onCpfChange={setCpf}
            onNomeChange={setNomeCompleto}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepEmail
            key="step2"
            email={email}
            nomeCompleto={nomeCompleto}
            cpf={cpf}
            emailVerified={emailVerified}
            onEmailChange={(v) => {
              setEmail(v);
              setEmailVerified(false);
            }}
            onVerified={() => setEmailVerified(true)}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <StepCredentials
            key="step3"
            whatsapp={whatsapp}
            password={password}
            confirmPassword={confirmPassword}
            onWhatsappChange={setWhatsapp}
            onPasswordChange={setPassword}
            onConfirmPasswordChange={setConfirmPassword}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <StepConfirm
            key="step4"
            data={{ cpf, nomeCompleto, email, whatsapp }}
            submitting={submitting}
            onBack={() => setStep(3)}
            onSubmit={handleSubmit}
          />
        )}
      </AnimatePresence>

      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-primary hover:underline font-medium"
        >
          Entrar
        </button>
      </p>
    </div>
  );
};

export default SignupWizard;
