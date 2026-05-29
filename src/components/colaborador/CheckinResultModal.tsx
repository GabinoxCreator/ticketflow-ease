import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Clock, Ban, ArrowRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';

export type CheckinResultType =
  | 'success'
  | 'already_used'
  | 'pending_payment'
  | 'window_closed'
  | 'invalid'
  | 'error';

export interface CheckinResultData {
  type: CheckinResultType;
  message: string;
  holderName?: string;
  lotName?: string;
  validatedAt?: string;
  ticketCode?: string;
}

interface CheckinResultModalProps {
  result: CheckinResultData | null;
  onClose: () => void;
  onNext?: () => void;
  autoCloseSuccessMs?: number;
}

const config: Record<
  CheckinResultType,
  { bg: string; ring: string; icon: typeof CheckCircle2; title: string }
> = {
  success: {
    bg: 'bg-emerald-500',
    ring: 'ring-emerald-300',
    icon: CheckCircle2,
    title: 'Check-in liberado',
  },
  already_used: {
    bg: 'bg-amber-500',
    ring: 'ring-amber-300',
    icon: AlertCircle,
    title: 'Ingresso já utilizado',
  },
  pending_payment: {
    bg: 'bg-orange-500',
    ring: 'ring-orange-300',
    icon: Clock,
    title: 'Pagamento pendente',
  },
  window_closed: {
    bg: 'bg-rose-600',
    ring: 'ring-rose-300',
    icon: Ban,
    title: 'Fora da janela de check-in',
  },
  invalid: {
    bg: 'bg-red-600',
    ring: 'ring-red-300',
    icon: XCircle,
    title: 'Ingresso inválido',
  },
  error: {
    bg: 'bg-red-600',
    ring: 'ring-red-300',
    icon: XCircle,
    title: 'Erro ao validar',
  },
};

export default function CheckinResultModal({
  result,
  onClose,
  onNext,
  autoCloseSuccessMs = 5000,
}: CheckinResultModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!result) return;
    if (result.type === 'success' && autoCloseSuccessMs > 0) {
      const totalSec = Math.ceil(autoCloseSuccessMs / 1000);
      setSecondsLeft(totalSec);
      const interval = setInterval(() => {
        setSecondsLeft((s) => (s > 1 ? s - 1 : 0));
      }, 1000);
      const t = setTimeout(() => onClose(), autoCloseSuccessMs);
      return () => {
        clearTimeout(t);
        clearInterval(interval);
      };
    }
  }, [result, autoCloseSuccessMs, onClose]);

  const isSuccess = result?.type === 'success';
  const totalSec = Math.ceil(autoCloseSuccessMs / 1000);
  const ringCircumference = 2 * Math.PI * 46;
  const ringProgress = isSuccess
    ? ringCircumference * (1 - secondsLeft / totalSec)
    : 0;

  return (
    <AnimatePresence>
      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => result.type !== 'success' && onClose()}
        >
          <motion.div
            initial={{ scale: 0.85, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-sm rounded-3xl ${config[result.type].bg} text-white shadow-2xl ring-4 ${config[result.type].ring} ring-opacity-40`}
          >
            <button
              aria-label="Fechar"
              onClick={onClose}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="px-6 pt-8 pb-6 text-center">
              <motion.div
                initial={{ scale: 0.4, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                className="relative mx-auto w-28 h-28 flex items-center justify-center mb-5"
              >
                {isSuccess && (
                  <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="46"
                      fill="none"
                      stroke="rgba(255,255,255,0.25)"
                      strokeWidth="4"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="46"
                      fill="none"
                      stroke="white"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringProgress}
                      style={{ transition: 'stroke-dashoffset 1s linear' }}
                    />
                  </svg>
                )}
                <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center relative">
                  {isSuccess && secondsLeft > 0 ? (
                    <span className="text-5xl font-extrabold tabular-nums">{secondsLeft}</span>
                  ) : (
                    (() => {
                      const Icon = config[result.type].icon;
                      return <Icon className="w-14 h-14" strokeWidth={2.5} />;
                    })()
                  )}
                </div>
              </motion.div>

              <h2 className="text-2xl font-extrabold leading-tight mb-1">
                {config[result.type].title}
              </h2>
              <p className="text-white/90 text-sm mb-5 px-2">{result.message}</p>

              {(result.holderName || result.lotName || result.validatedAt) && (
                <div className="bg-white/15 rounded-2xl p-4 text-left space-y-1.5 mb-5">
                  {result.holderName && (
                    <p className="text-lg font-bold leading-tight break-words">
                      {result.holderName}
                    </p>
                  )}
                  {result.lotName && (
                    <p className="text-sm text-white/90">{result.lotName}</p>
                  )}
                  {result.ticketCode && (
                    <p className="text-xs font-mono text-white/80">
                      {result.ticketCode.slice(0, 8).toUpperCase()}
                    </p>
                  )}
                  {result.validatedAt && (
                    <p className="text-xs text-white/80">
                      Validado em{' '}
                      {new Date(result.validatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}

                    </p>
                  )}
                </div>
              )}

              {isSuccess ? (
                <button
                  onClick={onClose}
                  className="text-white/80 hover:text-white text-sm font-medium underline-offset-2 hover:underline"
                >
                  Fechar agora
                </button>
              ) : onNext ? (
                <Button
                  onClick={() => {
                    onClose();
                    onNext();
                  }}
                  size="lg"
                  variant="secondary"
                  className="w-full h-12 bg-white text-slate-900 hover:bg-white/90 font-semibold gap-2"
                >
                  Próximo check-in
                  <ArrowRight className="w-5 h-5" />
                </Button>
              ) : (
                <Button
                  onClick={onClose}
                  size="lg"
                  variant="secondary"
                  className="w-full h-12 bg-white text-slate-900 hover:bg-white/90 font-semibold"
                >
                  OK, entendi
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
