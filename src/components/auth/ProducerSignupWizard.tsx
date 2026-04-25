import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import StepIndicator from './StepIndicator';
import StepAccountType, { ProducerAccountType } from './producer-signup-steps/StepAccountType';
import StepDocument from './producer-signup-steps/StepDocument';
import StepEmail from './signup-steps/StepEmail';
import StepWhatsApp from './signup-steps/StepWhatsApp';
import StepPassword from './signup-steps/StepPassword';
import { useAuth } from '@/contexts/AuthContext';

interface ProducerSignupWizardProps {
  onSwitchToLogin: () => void;
}

const ProducerSignupWizard: React.FC<ProducerSignupWizardProps> = ({ onSwitchToLogin }) => {
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const [accountType, setAccountType] = useState<ProducerAccountType | null>(null);
  const [document, setDocument] = useState('');
  const [fullName, setFullName] = useState('');
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
      nome_completo: fullName,
      cpf: document, // CPF or CNPJ — stored in profiles.cpf and feeds producer_profiles.brand_name via trigger
      whatsapp,
      tipo_conta: 'produtor',
    });
    setSubmitting(false);

    if (error) {
      if (error.message.includes('already registered')) {
        toast.error('Este email já está cadastrado');
      } else {
        toast.error('Erro ao criar conta. Tente novamente.');
      }
    } else {
      toast.success('Conta de produtor criada com sucesso!');
      navigate('/produtor/dashboard');
    }
  };

  return (
    <div className="space-y-6">
      <StepIndicator
        currentStep={step}
        totalSteps={5}
        labels={['Tipo', 'Dados', 'Email', 'WhatsApp', 'Senha']}
      />

      <AnimatePresence mode="wait">
        {step === 1 && (
          <StepAccountType
            key="step1"
            accountType={accountType}
            onAccountTypeChange={setAccountType}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && accountType && (
          <StepDocument
            key="step2"
            accountType={accountType}
            document={document}
            fullName={fullName}
            onDocumentChange={setDocument}
            onFullNameChange={setFullName}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <StepEmail
            key="step3"
            email={email}
            nomeCompleto={fullName}
            cpf={document}
            emailVerified={emailVerified}
            onEmailChange={(v) => {
              setEmail(v);
              setEmailVerified(false);
            }}
            onVerified={() => setEmailVerified(true)}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <StepWhatsApp
            key="step4"
            whatsapp={whatsapp}
            onWhatsappChange={setWhatsapp}
            onBack={() => setStep(3)}
            onNext={() => setStep(5)}
          />
        )}
        {step === 5 && (
          <StepPassword
            key="step5"
            password={password}
            confirmPassword={confirmPassword}
            submitting={submitting}
            onPasswordChange={setPassword}
            onConfirmPasswordChange={setConfirmPassword}
            onBack={() => setStep(4)}
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

export default ProducerSignupWizard;
