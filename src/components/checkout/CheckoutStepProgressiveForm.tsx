import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Check, User, Mail, Phone, Lock, CreditCard, Loader2, ArrowLeft, Pencil } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { validateCPF, formatCPF } from '@/utils/cpfValidator';

interface CheckoutStepProgressiveFormProps {
  onComplete: (data: { cpf: string; name: string; email: string; phone: string; password: string }) => void;
  initialData?: {
    cpf?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
}

type Step = 'cpf' | 'name' | 'email' | 'phone' | 'password';

interface FormData {
  cpf: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

const STEPS: Step[] = ['cpf', 'name', 'email', 'phone', 'password'];

const STEP_CONFIG = {
  cpf: { label: 'CPF', icon: CreditCard, index: 1 },
  name: { label: 'Nome Completo', icon: User, index: 2 },
  email: { label: 'Email', icon: Mail, index: 3 },
  phone: { label: 'WhatsApp', icon: Phone, index: 4 },
  password: { label: 'Criar Senha', icon: Lock, index: 5 },
};

export const CheckoutStepProgressiveForm: React.FC<CheckoutStepProgressiveFormProps> = ({
  onComplete,
  initialData
}) => {
  const [currentStep, setCurrentStep] = useState<Step>('cpf');
  const [formData, setFormData] = useState<FormData>({
    cpf: initialData?.cpf || '',
    name: initialData?.name || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    password: '',
    confirmPassword: '',
  });
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set());
  
  // Email verification state
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  
  // Refs for auto-focus
  const cpfInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Auto-focus on step change
  useEffect(() => {
    const timeout = setTimeout(() => {
      switch (currentStep) {
        case 'cpf':
          cpfInputRef.current?.focus();
          break;
        case 'name':
          nameInputRef.current?.focus();
          break;
        case 'email':
          emailInputRef.current?.focus();
          break;
        case 'phone':
          phoneInputRef.current?.focus();
          break;
        case 'password':
          passwordInputRef.current?.focus();
          break;
      }
    }, 100);
    return () => clearTimeout(timeout);
  }, [currentStep]);

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (numbers.length <= 11) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 'cpf':
        return validateCPF(formData.cpf);
      case 'name':
        return formData.name.trim().length >= 3;
      case 'email':
        return emailVerified;
      case 'phone':
        return formData.phone.replace(/\D/g, '').length >= 10;
      case 'password':
        return formData.password.length >= 6 && formData.password === formData.confirmPassword;
      default:
        return false;
    }
  };

  const sendVerificationCode = useCallback(async () => {
    if (!formData.email || cooldown > 0) return;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error('Por favor, insira um email válido');
      return;
    }

    setIsSendingCode(true);
    try {
      const { error } = await supabase.functions.invoke('send-verification-code', {
        body: { 
          email: formData.email,
          cpf: formData.cpf.replace(/\D/g, ''),
          name: formData.name
        }
      });

      if (error) throw error;

      setEmailVerificationSent(true);
      setCooldown(60);
      toast.success('Código enviado para seu email!');
    } catch (error) {
      console.error('Error sending verification code:', error);
      toast.error('Erro ao enviar código. Tente novamente.');
    } finally {
      setIsSendingCode(false);
    }
  }, [formData.email, formData.cpf, formData.name, cooldown]);

  const verifyEmailCode = useCallback(async () => {
    if (otp.length !== 6) return;

    setIsVerifyingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-email-code', {
        body: { email: formData.email, code: otp }
      });

      if (error) throw error;

      if (data.valid) {
        setEmailVerified(true);
        toast.success('Email verificado com sucesso!');
      } else {
        toast.error('Código inválido ou expirado');
        setOtp('');
      }
    } catch (error) {
      console.error('Error verifying code:', error);
      toast.error('Erro ao verificar código');
      setOtp('');
    } finally {
      setIsVerifyingEmail(false);
    }
  }, [otp, formData.email]);

  const handleNext = () => {
    if (!validateCurrentStep()) return;

    setCompletedSteps(prev => new Set([...prev, currentStep]));
    
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1]);
    } else {
      // All steps completed
      onComplete({
        cpf: formData.cpf.replace(/\D/g, ''),
        name: formData.name,
        email: formData.email,
        phone: formData.phone.replace(/\D/g, ''),
        password: formData.password,
      });
    }
  };

  const handleBack = () => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1]);
    }
  };

  const handleEditStep = (step: Step) => {
    setCurrentStep(step);
  };

  const currentStepIndex = STEPS.indexOf(currentStep) + 1;
  const config = STEP_CONFIG[currentStep];
  const Icon = config.icon;

  const renderCompletedSummary = () => {
    const stepsToShow = STEPS.filter(step => completedSteps.has(step) && step !== currentStep);
    if (stepsToShow.length === 0) return null;

    return (
      <div className="space-y-2 mb-6">
        {stepsToShow.map(step => {
          const stepConfig = STEP_CONFIG[step];
          const StepIcon = stepConfig.icon;
          let value = '';
          
          switch (step) {
            case 'cpf':
              value = formatCPF(formData.cpf);
              break;
            case 'name':
              value = formData.name;
              break;
            case 'email':
              value = formData.email;
              break;
            case 'phone':
              value = formData.phone;
              break;
            case 'password':
              value = '••••••••';
              break;
          }

          return (
            <div 
              key={step}
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-4 h-4 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{stepConfig.label}</p>
                  <p className="text-sm font-medium">{value}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEditStep(step)}
                className="h-8 w-8 p-0"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'cpf':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cpf-input">CPF</Label>
              <Input
                id="cpf-input"
                ref={cpfInputRef}
                type="text"
                placeholder="000.000.000-00"
                value={formatCPF(formData.cpf)}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 11);
                  setFormData(prev => ({ ...prev, cpf: value }));
                }}
                className="text-lg h-12"
              />
              {formData.cpf.length === 11 && !validateCPF(formData.cpf) && (
                <p className="text-sm text-destructive">CPF inválido</p>
              )}
            </div>
          </div>
        );

      case 'name':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name-input">Nome Completo</Label>
              <Input
                id="name-input"
                ref={nameInputRef}
                type="text"
                placeholder="Seu nome completo"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="text-lg h-12"
              />
              {formData.name.length > 0 && formData.name.length < 3 && (
                <p className="text-sm text-destructive">Nome deve ter pelo menos 3 caracteres</p>
              )}
            </div>
          </div>
        );

      case 'email':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-input">Email</Label>
              <Input
                id="email-input"
                ref={emailInputRef}
                type="email"
                placeholder="seu@email.com"
                value={formData.email}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, email: e.target.value }));
                  setEmailVerified(false);
                  setEmailVerificationSent(false);
                  setOtp('');
                }}
                disabled={emailVerified}
                className="text-lg h-12"
              />
            </div>

            {!emailVerified && (
              <>
                {!emailVerificationSent ? (
                  <Button
                    type="button"
                    onClick={sendVerificationCode}
                    disabled={isSendingCode || !formData.email || cooldown > 0}
                    className="w-full"
                  >
                    {isSendingCode ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : cooldown > 0 ? (
                      `Reenviar em ${cooldown}s`
                    ) : (
                      'Enviar código de verificação'
                    )}
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground text-center">
                      Digite o código de 6 dígitos enviado para seu email
                    </p>
                    <div className="flex justify-center">
                      <InputOTP
                        maxLength={6}
                        value={otp}
                        onChange={setOtp}
                        disabled={isVerifyingEmail}
                      >
                        <InputOTPGroup>
                          {[0, 1, 2, 3, 4, 5].map((index) => (
                            <InputOTPSlot key={index} index={index} />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    <Button
                      type="button"
                      onClick={verifyEmailCode}
                      disabled={otp.length !== 6 || isVerifyingEmail}
                      className="w-full"
                    >
                      {isVerifyingEmail ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Verificando...
                        </>
                      ) : (
                        'Verificar código'
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={sendVerificationCode}
                      disabled={cooldown > 0 || isSendingCode}
                      className="w-full"
                    >
                      {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar código'}
                    </Button>
                  </div>
                )}
              </>
            )}

            {emailVerified && (
              <div className="flex items-center gap-2 text-primary">
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">Email verificado!</span>
              </div>
            )}
          </div>
        );

      case 'phone':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone-input">WhatsApp</Label>
              <Input
                id="phone-input"
                ref={phoneInputRef}
                type="tel"
                placeholder="(00) 00000-0000"
                value={formData.phone}
                onChange={(e) => {
                  const formatted = formatPhone(e.target.value);
                  setFormData(prev => ({ ...prev, phone: formatted }));
                }}
                className="text-lg h-12"
              />
              <p className="text-xs text-muted-foreground">
                Seus ingressos serão enviados para este número
              </p>
            </div>
          </div>
        );

      case 'password':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password-input">Senha</Label>
              <Input
                id="password-input"
                ref={passwordInputRef}
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                className="text-lg h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password-input">Confirmar Senha</Label>
              <Input
                id="confirm-password-input"
                type="password"
                placeholder="Digite a senha novamente"
                value={formData.confirmPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                className="text-lg h-12"
              />
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="text-sm text-destructive">As senhas não coincidem</p>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const isNextDisabled = () => {
    if (currentStep === 'email' && !emailVerified) return true;
    return !validateCurrentStep();
  };

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Etapa {currentStepIndex} de {STEPS.length}</span>
        </div>
        <div className="flex gap-1">
          {STEPS.map((step, index) => (
            <div
              key={step}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                index < currentStepIndex
                  ? 'bg-primary'
                  : index === currentStepIndex - 1
                  ? 'bg-primary'
                  : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Completed steps summary */}
      {renderCompletedSummary()}

      {/* Current step header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">{config.label}</h3>
      </div>

      {/* Current step content */}
      {renderCurrentStep()}

      {/* Navigation buttons */}
      <div className="flex gap-3 pt-4">
        {currentStepIndex > 1 && (
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            className="flex-1"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        )}
        <Button
          type="button"
          onClick={handleNext}
          disabled={isNextDisabled()}
          className="flex-1"
        >
          {currentStepIndex === STEPS.length ? 'Continuar para Pagamento' : 'Continuar'}
        </Button>
      </div>
    </div>
  );
};
