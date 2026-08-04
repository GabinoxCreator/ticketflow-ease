import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, ScanFace } from 'lucide-react';
import StepIndicator from './StepIndicator';
import StepCPF from './signup-steps/StepCPF';
import StepEmail from './signup-steps/StepEmail';
import StepWhatsApp from './signup-steps/StepWhatsApp';
import StepPassword from './signup-steps/StepPassword';
import FacialInviteModal from './FacialInviteModal';
import FacialCaptureFullscreen from './FacialCaptureFullscreen';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { openFestpayWallet, WALLET_ENABLED } from '@/lib/festpay';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface SignupWizardProps {
  redirect: string;
  onSwitchToLogin: () => void;
  // avisa o pai (Auth.tsx) que uma etapa pós-cadastro está aberta (facial e/ou
  // convite de carteira), pra ele segurar o auto-redirect enquanto isso. Também é
  // armado ANTES do signUp (o auto-login dispara o redirect do pai), então o gate
  // já está de pé quando a sessão é criada. Nome mantido por compatibilidade com
  // o Auth.tsx; hoje cobre as duas etapas.
  onShowWalletInvite?: (open: boolean) => void;
}

const SignupWizard: React.FC<SignupWizardProps> = ({
  redirect,
  onSwitchToLogin,
  onShowWalletInvite,
}) => {
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  // etapas opcionais pós-cadastro, nesta ordem: facial -> carteira.
  // convite da facial (opcional) e a captura em tela cheia
  const [showFacialInvite, setShowFacialInvite] = useState(false);
  const [showFacialCapture, setShowFacialCapture] = useState(false);
  // convite de carteira (opcional) mostrado ao concluir o cadastro com sucesso
  const [showWalletInvite, setShowWalletInvite] = useState(false);
  const [activatingWallet, setActivatingWallet] = useState(false);

  const [cpf, setCpf] = useState('');
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [email, setEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = async () => {
    setSubmitting(true);
    // arma o gate ANTES do signUp: o signUp faz auto-login (seta user no AuthContext),
    // o que dispararia o auto-redirect do Auth.tsx. Setando aqui, o gate já está de pé
    // quando a sessão é criada — sem corrida. Em caso de erro, liberamos abaixo.
    // Armado SEMPRE (não mais só com WALLET_ENABLED): a etapa da facial vem antes
    // do convite de carteira e existe mesmo com a carteira desativada — sem o gate,
    // o auto-redirect tiraria a pessoa da tela antes de a facial aparecer.
    onShowWalletInvite?.(true);
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
      onShowWalletInvite?.(false); // deu erro -> libera o gate, fica no formulário
      if (error.message.includes('already registered')) {
        toast.error('Este email já está cadastrado');
      } else {
        toast.error('Erro ao criar conta. Tente novamente.');
      }
    } else {
      toast.success('Conta criada com sucesso!');
      // primeira etapa opcional: convite da facial. Sair dela (ativando ou não)
      // cai em finishFacialStep, que segue pro fluxo antigo.
      setShowFacialInvite(true);
    }
  };

  // Fim da etapa da facial (ativou, pulou ou fechou) -> fluxo pós-cadastro de antes:
  // convite de carteira se habilitada, senão direto pro destino.
  const finishFacialStep = () => {
    setShowFacialCapture(false);
    setShowFacialInvite(false);
    if (WALLET_ENABLED) {
      setShowWalletInvite(true);
    } else {
      navigate(redirect);
    }
  };

  // "Ativar agora" -> mesmo fluxo do "Minha Carteira" (federação + redirect c/ return url).
  // Erro não trava: avisa e deixa a pessoa pular (pode ativar depois no menu).
  const handleActivateWallet = async () => {
    if (activatingWallet) return;
    setActivatingWallet(true);
    try {
      await openFestpayWallet({ activate: true }); // ativar: manda return + kyc=1 (facial direto)
    } catch (err) {
      console.error('Erro ao ativar carteira:', err);
      toast.error('Não foi possível ativar sua carteira agora. Você pode ativar depois em "Minha Carteira".');
      setActivatingWallet(false);
    }
  };

  // "Agora não" -> segue pro destino normal pós-cadastro, sem ativar
  const handleSkipWallet = () => navigate(redirect);

  // Captura em tela cheia (overlay) — vem depois do aceite no convite.
  if (showFacialCapture) {
    return <FacialCaptureFullscreen onDone={finishFacialStep} onSkip={finishFacialStep} />;
  }

  if (showFacialInvite) {
    return (
      <FacialInviteModal
        onActivate={() => setShowFacialCapture(true)}
        onSkip={finishFacialStep}
      />
    );
  }

  if (showWalletInvite) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 text-center"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-pink-500 text-primary-foreground">
          <ScanFace className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h3 className="font-display text-xl font-bold tracking-tight">Ative sua carteira</h3>
          <p className="text-sm text-muted-foreground">
            Pague com o rosto nos eventos. Rápido e sem dinheiro na mão.
          </p>
        </div>
        <div className="space-y-3 pt-2">
          <Button
            type="button"
            variant="hero"
            size="lg"
            className="w-full gap-2"
            onClick={handleActivateWallet}
            disabled={activatingWallet}
          >
            {activatingWallet ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Abrindo carteira…
              </>
            ) : (
              'Ativar agora'
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="w-full"
            onClick={handleSkipWallet}
            disabled={activatingWallet}
          >
            Agora não
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <StepIndicator
        currentStep={step}
        totalSteps={4}
        labels={['CPF', 'Email', 'WhatsApp', 'Senha']}
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
          <StepWhatsApp
            key="step3"
            whatsapp={whatsapp}
            onWhatsappChange={setWhatsapp}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <StepPassword
            key="step4"
            password={password}
            confirmPassword={confirmPassword}
            submitting={submitting}
            onPasswordChange={setPassword}
            onConfirmPasswordChange={setConfirmPassword}
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
