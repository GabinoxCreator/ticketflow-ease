import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, 
  Mail, 
  Phone, 
  Lock, 
  CheckCircle2, 
  AlertCircle, 
  ChevronDown,
  ArrowRight,
  RefreshCw,
  CreditCard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { formatCPF, validateCPF, unformatCPF } from '@/utils/cpfValidator';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CheckoutStepProgressiveFormProps {
  onComplete: (data: {
    cpf: string;
    name: string;
    email: string;
    phone: string;
    password?: string;
  }) => void;
  initialData?: {
    cpf?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
}

type Step = 'cpf' | 'name' | 'email' | 'phone' | 'password';

interface StepState {
  value: string;
  isValid: boolean;
  isComplete: boolean;
  error: string;
}

export function CheckoutStepProgressiveForm({ 
  onComplete,
  initialData 
}: CheckoutStepProgressiveFormProps) {
  // Step states
  const [cpf, setCpf] = useState<StepState>({
    value: initialData?.cpf || '',
    isValid: false,
    isComplete: false,
    error: ''
  });
  const [name, setName] = useState<StepState>({
    value: initialData?.name || '',
    isValid: false,
    isComplete: false,
    error: ''
  });
  const [email, setEmail] = useState<StepState>({
    value: initialData?.email || '',
    isValid: false,
    isComplete: false,
    error: ''
  });
  const [phone, setPhone] = useState<StepState>({
    value: initialData?.phone || '',
    isValid: false,
    isComplete: false,
    error: ''
  });
  const [password, setPassword] = useState<StepState>({
    value: '',
    isValid: false,
    isComplete: false,
    error: ''
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Email verification states
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  
  // Current active step
  const [activeStep, setActiveStep] = useState<Step>('cpf');
  
  // Refs for auto-focus
  const cpfRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Auto-focus when step changes
  useEffect(() => {
    const refs: Record<Step, React.RefObject<HTMLInputElement>> = {
      cpf: cpfRef,
      name: nameRef,
      email: emailRef,
      phone: phoneRef,
      password: passwordRef
    };
    
    setTimeout(() => {
      refs[activeStep]?.current?.focus();
    }, 300);
  }, [activeStep]);

  // Format phone number
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  // Handlers
  const handleCPFChange = (value: string) => {
    const formatted = formatCPF(value);
    const digits = unformatCPF(value);
    
    let isValid = false;
    let error = '';
    
    if (digits.length === 11) {
      if (validateCPF(digits)) {
        isValid = true;
      } else {
        error = 'CPF inválido';
      }
    }
    
    setCpf({ value: formatted, isValid, isComplete: false, error });
  };

  const handleCPFComplete = () => {
    const digits = unformatCPF(cpf.value);
    if (digits.length === 11 && validateCPF(digits)) {
      setCpf(prev => ({ ...prev, isComplete: true }));
      setActiveStep('name');
    } else {
      setCpf(prev => ({ ...prev, error: 'CPF inválido' }));
    }
  };

  const handleNameChange = (value: string) => {
    const isValid = value.trim().length >= 3;
    setName({ 
      value, 
      isValid, 
      isComplete: false, 
      error: '' 
    });
  };

  const handleNameComplete = () => {
    if (name.value.trim().length >= 3) {
      setName(prev => ({ ...prev, isComplete: true }));
      setActiveStep('email');
    } else {
      setName(prev => ({ ...prev, error: 'Nome deve ter pelo menos 3 caracteres' }));
    }
  };

  const handleEmailChange = (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(value);
    setEmail({ 
      value, 
      isValid, 
      isComplete: false, 
      error: '' 
    });
    // Reset verification when email changes
    setEmailVerificationSent(false);
    setOtp('');
  };

  const sendVerificationCode = async () => {
    if (!email.isValid) {
      setEmail(prev => ({ ...prev, error: 'Email inválido' }));
      return;
    }
    
    setIsSendingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-verification-code', {
        body: { 
          email: email.value, 
          name: name.value, 
          cpf: unformatCPF(cpf.value) 
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast.success('Código enviado para seu email!');
      setEmailVerificationSent(true);
      setCooldown(60);
    } catch (error: any) {
      console.error('Error sending code:', error);
      toast.error(error.message || 'Erro ao enviar código');
    } finally {
      setIsSendingCode(false);
    }
  };

  const verifyEmailCode = async () => {
    if (otp.length !== 6) {
      toast.error('Digite o código completo');
      return;
    }

    setIsVerifyingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-email-code', {
        body: { email: email.value, code: otp },
      });

      if (error) throw error;
      
      if (data?.success) {
        toast.success('Email verificado!');
        setEmail(prev => ({ ...prev, isComplete: true }));
        setActiveStep('phone');
      } else {
        toast.error(data?.error || 'Código inválido');
      }
    } catch (error: any) {
      console.error('Error verifying code:', error);
      toast.error('Código inválido ou expirado');
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhone(value);
    const digits = value.replace(/\D/g, '');
    const isValid = digits.length >= 10 && digits.length <= 11;
    setPhone({ 
      value: formatted, 
      isValid, 
      isComplete: false, 
      error: '' 
    });
  };

  const handlePhoneComplete = () => {
    const digits = phone.value.replace(/\D/g, '');
    if (digits.length >= 10) {
      setPhone(prev => ({ ...prev, isComplete: true }));
      setActiveStep('password');
    } else {
      setPhone(prev => ({ ...prev, error: 'Telefone inválido' }));
    }
  };

  const handlePasswordChange = (value: string) => {
    const isValid = value.length >= 6;
    setPassword({ 
      value, 
      isValid, 
      isComplete: false, 
      error: '' 
    });
  };

  const handleFinalSubmit = () => {
    // Validate password
    if (password.value.length < 6) {
      setPassword(prev => ({ ...prev, error: 'Senha deve ter pelo menos 6 caracteres' }));
      return;
    }
    
    if (password.value !== confirmPassword) {
      setPassword(prev => ({ ...prev, error: 'Senhas não conferem' }));
      return;
    }

    setPassword(prev => ({ ...prev, isComplete: true }));
    
    onComplete({
      cpf: unformatCPF(cpf.value),
      name: name.value.trim(),
      email: email.value.trim(),
      phone: phone.value.replace(/\D/g, ''),
      password: password.value
    });
  };

  // Check if all steps are complete
  const allComplete = cpf.isComplete && name.isComplete && email.isComplete && phone.isComplete;

  // Step component
  const StepSection = ({ 
    step, 
    icon: Icon, 
    label, 
    isComplete, 
    isActive, 
    children,
    onEdit
  }: {
    step: Step;
    icon: React.ElementType;
    label: string;
    isComplete: boolean;
    isActive: boolean;
    children: React.ReactNode;
    onEdit?: () => void;
  }) => {
    const canOpen = step === 'cpf' || 
      (step === 'name' && cpf.isComplete) ||
      (step === 'email' && name.isComplete) ||
      (step === 'phone' && email.isComplete) ||
      (step === 'password' && phone.isComplete);

    return (
      <div 
        className={cn(
          "border rounded-lg transition-all duration-300",
          isActive ? "border-primary bg-card shadow-sm" : "border-border",
          isComplete && "border-green-500/50 bg-green-500/5"
        )}
      >
        <button
          type="button"
          onClick={() => canOpen && (isComplete ? onEdit?.() : setActiveStep(step))}
          disabled={!canOpen}
          className={cn(
            "w-full flex items-center justify-between p-4 text-left",
            !canOpen && "opacity-50 cursor-not-allowed"
          )}
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
              isComplete ? "bg-green-500 text-white" : 
              isActive ? "bg-primary text-primary-foreground" : 
              "bg-muted text-muted-foreground"
            )}>
              {isComplete ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
            </div>
            <span className={cn(
              "font-medium",
              isComplete && "text-green-600 dark:text-green-400"
            )}>
              {label}
            </span>
          </div>
          <ChevronDown className={cn(
            "w-5 h-5 text-muted-foreground transition-transform",
            isActive && "rotate-180"
          )} />
        </button>
        
        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-0">
                {children}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-3"
    >
      <div className="text-center mb-6">
        <h2 className="font-display font-bold text-xl">Complete seus dados</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Preencha as informações para continuar
        </p>
      </div>

      {/* Step 1: CPF */}
      <StepSection 
        step="cpf" 
        icon={CreditCard} 
        label="CPF" 
        isComplete={cpf.isComplete}
        isActive={activeStep === 'cpf'}
        onEdit={() => setActiveStep('cpf')}
      >
        <div className="space-y-3">
          <div className="relative">
            <Input
              ref={cpfRef}
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf.value}
              onChange={(e) => handleCPFChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCPFComplete()}
              maxLength={14}
              className={cn(
                'pr-10',
                cpf.error && 'border-destructive',
                cpf.isValid && 'border-green-500'
              )}
            />
            {cpf.isValid && (
              <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
            )}
          </div>
          {cpf.error && (
            <p className="text-destructive text-sm flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {cpf.error}
            </p>
          )}
          <Button 
            onClick={handleCPFComplete} 
            disabled={!cpf.isValid}
            className="w-full"
          >
            Continuar <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </StepSection>

      {/* Step 2: Name */}
      <StepSection 
        step="name" 
        icon={User} 
        label="Nome Completo" 
        isComplete={name.isComplete}
        isActive={activeStep === 'name'}
        onEdit={() => setActiveStep('name')}
      >
        <div className="space-y-3">
          <Input
            ref={nameRef}
            type="text"
            placeholder="Seu nome completo"
            value={name.value}
            onChange={(e) => handleNameChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNameComplete()}
            className={cn(name.error && 'border-destructive')}
          />
          {name.error && (
            <p className="text-destructive text-sm flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {name.error}
            </p>
          )}
          <Button 
            onClick={handleNameComplete} 
            disabled={!name.isValid}
            className="w-full"
          >
            Continuar <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </StepSection>

      {/* Step 3: Email with Verification */}
      <StepSection 
        step="email" 
        icon={Mail} 
        label="Email" 
        isComplete={email.isComplete}
        isActive={activeStep === 'email'}
        onEdit={() => setActiveStep('email')}
      >
        <div className="space-y-3">
          <Input
            ref={emailRef}
            type="email"
            placeholder="seu@email.com"
            value={email.value}
            onChange={(e) => handleEmailChange(e.target.value)}
            className={cn(email.error && 'border-destructive')}
            disabled={emailVerificationSent}
          />
          {email.error && (
            <p className="text-destructive text-sm flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {email.error}
            </p>
          )}
          
          {!emailVerificationSent ? (
            <Button 
              onClick={sendVerificationCode} 
              disabled={!email.isValid || isSendingCode}
              className="w-full"
            >
              {isSendingCode ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>Enviar código de verificação</>
              )}
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                Digite o código enviado para <span className="font-medium text-primary">{email.value}</span>
              </p>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={otp}
                  onChange={setOtp}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button 
                onClick={verifyEmailCode} 
                disabled={otp.length !== 6 || isVerifyingEmail}
                className="w-full"
              >
                {isVerifyingEmail ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  <>Verificar código</>
                )}
              </Button>
              <div className="flex justify-between items-center text-sm">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={sendVerificationCode}
                  disabled={cooldown > 0 || isSendingCode}
                >
                  {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar código'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEmailVerificationSent(false);
                    setOtp('');
                  }}
                >
                  Alterar email
                </Button>
              </div>
            </div>
          )}
        </div>
      </StepSection>

      {/* Step 4: Phone */}
      <StepSection 
        step="phone" 
        icon={Phone} 
        label="WhatsApp" 
        isComplete={phone.isComplete}
        isActive={activeStep === 'phone'}
        onEdit={() => setActiveStep('phone')}
      >
        <div className="space-y-3">
          <Input
            ref={phoneRef}
            type="tel"
            inputMode="numeric"
            placeholder="(00) 00000-0000"
            value={phone.value}
            onChange={(e) => handlePhoneChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePhoneComplete()}
            maxLength={15}
            className={cn(phone.error && 'border-destructive')}
          />
          {phone.error && (
            <p className="text-destructive text-sm flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {phone.error}
            </p>
          )}
          <Button 
            onClick={handlePhoneComplete} 
            disabled={!phone.isValid}
            className="w-full"
          >
            Continuar <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </StepSection>

      {/* Step 5: Password */}
      <StepSection 
        step="password" 
        icon={Lock} 
        label="Criar Senha" 
        isComplete={password.isComplete}
        isActive={activeStep === 'password'}
        onEdit={() => setActiveStep('password')}
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="password" className="text-sm text-muted-foreground mb-1.5 block">
              Senha (mínimo 6 caracteres)
            </Label>
            <Input
              ref={passwordRef}
              id="password"
              type="password"
              placeholder="••••••"
              value={password.value}
              onChange={(e) => handlePasswordChange(e.target.value)}
              className={cn(password.error && 'border-destructive')}
            />
          </div>
          <div>
            <Label htmlFor="confirmPassword" className="text-sm text-muted-foreground mb-1.5 block">
              Confirmar senha
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFinalSubmit()}
            />
          </div>
          {password.error && (
            <p className="text-destructive text-sm flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {password.error}
            </p>
          )}
          <Button 
            onClick={handleFinalSubmit} 
            disabled={!password.isValid || !confirmPassword}
            className="w-full"
            variant="hero"
            size="lg"
          >
            Continuar para Pagamento <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </StepSection>
    </motion.div>
  );
}
