import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, XCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';

// Modal próprio da retirada de abadá (baseado no CheckinResultModal).
// success = verde "Abadá liberado" · already = amarelo "Abadá já retirado" · error = vermelho.
export type AbadaResultType = 'success' | 'already' | 'error';

export interface AbadaResultData {
  type: AbadaResultType;
  message?: string;      // usado no erro
  holderName?: string;
  redeemedAt?: string;   // ISO do abada_redeemed_at
}

const config: Record<AbadaResultType, { bg: string; ring: string; icon: typeof CheckCircle2; title: string }> = {
  success: { bg: 'bg-emerald-500', ring: 'ring-emerald-300', icon: CheckCircle2, title: 'Camiseta liberada' },
  already: { bg: 'bg-amber-500', ring: 'ring-amber-300', icon: AlertCircle, title: 'Camiseta já retirada' },
  error: { bg: 'bg-red-600', ring: 'ring-red-300', icon: XCircle, title: 'Não foi possível' },
};

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null;

export default function AbadaResultModal({
  result,
  onClose,
  autoCloseSuccessMs = 5000,
}: {
  result: AbadaResultData | null;
  onClose: () => void;
  autoCloseSuccessMs?: number;
}) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!result) return;
    if (result.type === 'success' && autoCloseSuccessMs > 0) {
      const totalSec = Math.ceil(autoCloseSuccessMs / 1000);
      setSecondsLeft(totalSec);
      const interval = setInterval(() => setSecondsLeft((s) => (s > 1 ? s - 1 : 0)), 1000);
      const t = setTimeout(() => onClose(), autoCloseSuccessMs);
      return () => { clearTimeout(t); clearInterval(interval); };
    }
  }, [result, autoCloseSuccessMs, onClose]);

  const isSuccess = result?.type === 'success';

  return (
    <AnimatePresence>
      {result && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => result.type !== 'success' && onClose()}
        >
          <motion.div
            initial={{ scale: 0.85, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-sm rounded-3xl ${config[result.type].bg} text-white shadow-2xl ring-4 ${config[result.type].ring} ring-opacity-40`}
          >
            <button aria-label="Fechar" onClick={onClose}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition">
              <X className="w-5 h-5" />
            </button>

            <div className="px-6 pt-8 pb-6 text-center">
              <motion.div
                initial={{ scale: 0.4, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                className="relative mx-auto w-24 h-24 flex items-center justify-center mb-5"
              >
                <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center">
                  {isSuccess && secondsLeft > 0 ? (
                    <span className="text-5xl font-extrabold tabular-nums">{secondsLeft}</span>
                  ) : (
                    (() => { const Icon = config[result.type].icon; return <Icon className="w-14 h-14" strokeWidth={2.5} />; })()
                  )}
                </div>
              </motion.div>

              <h2 className="text-2xl font-extrabold leading-tight mb-1">{config[result.type].title}</h2>
              {result.type === 'error' && <p className="text-white/90 text-sm mb-5 px-2">{result.message}</p>}

              {(result.holderName || result.redeemedAt) && (
                <div className="bg-white/15 rounded-2xl p-4 text-left space-y-1.5 mb-5">
                  {result.holderName && (
                    <p className="text-lg font-bold leading-tight break-words">{result.holderName}</p>
                  )}
                  {result.redeemedAt && (
                    <p className="text-xs text-white/80">
                      {result.type === 'success' ? 'Retirada agora · ' : 'Retirada em '}
                      {fmt(result.redeemedAt)}
                    </p>
                  )}
                </div>
              )}

              {isSuccess ? (
                <button onClick={onClose}
                  className="text-white/80 hover:text-white text-sm font-medium underline-offset-2 hover:underline">
                  Fechar agora
                </button>
              ) : (
                <Button onClick={onClose} size="lg" variant="secondary"
                  className="w-full h-12 bg-white text-slate-900 hover:bg-white/90 font-semibold">
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
