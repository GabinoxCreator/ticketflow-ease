import { useState, useEffect, useRef, useCallback } from 'react';
import { X, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { AnimatePresence, motion } from 'framer-motion';
import { buildWindowMessage } from '@/lib/checkinWindow';

interface ScanResult {
  type: 'success' | 'already_used' | 'invalid' | 'error' | 'window_closed';
  message: string;
  holderName?: string;
  lotName?: string;
  validatedAt?: string;
}

interface ColaboradorQRScannerProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  collaboratorId: string;
  sessionToken: string;
  onSessionExpired: () => void;
}

export default function ColaboradorQRScanner({
  open,
  onClose,
  eventId,
  collaboratorId,
  sessionToken,
  onSessionExpired,
}: ColaboradorQRScannerProps) {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const recentScans = useRef(new Map<string, number>());
  const resultTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessing = useRef(false);

  const DEBOUNCE_MS = 5000;
  const RESULT_DISPLAY_MS = 3000;

  const validateTicket = useCallback(async (code: string) => {
    if (isProcessing.current) return;
    isProcessing.current = true;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/collaborator-validate-ticket`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            ticket_code: code.trim(),
            event_id: eventId,
            collaborator_id: collaboratorId,
            session_token: sessionToken,
            action: 'validate',
            source: 'scanner_qr',
          }),
        }
      );

      const data = await response.json();

      if (data.session_expired) {
        onSessionExpired();
        return;
      }

      let result: ScanResult;

      if (data.success) {
        result = {
          type: 'success',
          message: 'Check-in realizado!',
          holderName: data.ticket?.holder_name,
          lotName: data.ticket?.lot_name,
        };
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      } else if (data.reason === 'before_window' || data.reason === 'after_window') {
        result = {
          type: 'window_closed',
          message: buildWindowMessage(data.reason, data.starts_at, data.ends_at),
          holderName: data.ticket?.holder_name,
        };
        if (navigator.vibrate) navigator.vibrate(300);
      } else if (data.error?.includes('já foi utilizado')) {
        result = {
          type: 'already_used',
          message: 'Ingresso já utilizado',
          holderName: data.ticket?.holder_name,
          validatedAt: data.ticket?.validated_at,
        };
        if (navigator.vibrate) navigator.vibrate(300);
      } else if (data.error?.includes('não encontrado') || !data.found) {
        result = {
          type: 'invalid',
          message: data.error || 'Ingresso não encontrado',
        };
        if (navigator.vibrate) navigator.vibrate([100, 100, 100, 100, 100]);
      } else {
        result = {
          type: 'error',
          message: data.error || 'Erro na validação',
          holderName: data.ticket?.holder_name,
        };
        if (navigator.vibrate) navigator.vibrate(300);
      }

      setScanResult(result);

      if (resultTimeout.current) clearTimeout(resultTimeout.current);
      resultTimeout.current = setTimeout(() => {
        setScanResult(null);
      }, RESULT_DISPLAY_MS);
    } catch {
      setScanResult({ type: 'error', message: 'Erro de conexão' });
      if (resultTimeout.current) clearTimeout(resultTimeout.current);
      resultTimeout.current = setTimeout(() => setScanResult(null), RESULT_DISPLAY_MS);
    } finally {
      isProcessing.current = false;
    }
  }, [eventId, collaboratorId, sessionToken, onSessionExpired]);

  const onScan = useCallback((code: string) => {
    const now = Date.now();
    const lastScan = recentScans.current.get(code);
    if (lastScan && now - lastScan < DEBOUNCE_MS) return;
    recentScans.current.set(code, now);
    validateTicket(code);
  }, [validateTicket]);

  useEffect(() => {
    if (!open) return;

    let mounted = true;
    const containerId = 'colaborador-qr-reader';

    const startScanner = async () => {
      try {
        setCameraError(null);
        const scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 280, height: 280 } },
          (decodedText) => {
            if (mounted) onScan(decodedText);
          },
          () => {}
        );
      } catch (err: any) {
        if (mounted) setCameraError(err.message || 'Não foi possível acessar a câmera');
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(startScanner, 100);

    return () => {
      mounted = false;
      clearTimeout(timer);
      if (resultTimeout.current) clearTimeout(resultTimeout.current);
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [open, onScan]);

  if (!open) return null;

  const resultConfig = {
    success: {
      bg: 'bg-green-500',
      icon: CheckCircle2,
      textColor: 'text-white',
    },
    already_used: {
      bg: 'bg-yellow-500',
      icon: AlertCircle,
      textColor: 'text-white',
    },
    window_closed: {
      bg: 'bg-red-600',
      icon: AlertCircle,
      textColor: 'text-white',
    },
    invalid: {
      bg: 'bg-red-600',
      icon: XCircle,
      textColor: 'text-white',
    },
    error: {
      bg: 'bg-red-600',
      icon: XCircle,
      textColor: 'text-white',
    },
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 w-12 h-12 rounded-full bg-black/60 flex items-center justify-center"
      >
        <X className="w-7 h-7 text-white" />
      </button>

      {/* Scanner */}
      <div className="flex-1 flex items-center justify-center relative">
        <div id="colaborador-qr-reader" className="w-full h-full" />

        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-8">
            <div className="text-center text-white">
              <XCircle className="w-16 h-16 mx-auto mb-4 opacity-60" />
              <p className="text-lg mb-2">Câmera indisponível</p>
              <p className="text-sm opacity-70">{cameraError}</p>
              <button
                onClick={onClose}
                className="mt-6 px-6 py-3 bg-white/20 rounded-lg text-white"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {/* Scan guide overlay */}
        {!cameraError && !scanResult && (
          <div className="absolute bottom-8 left-0 right-0 text-center pointer-events-none">
            <p className="text-white text-sm bg-black/50 inline-block px-4 py-2 rounded-full">
              Aponte para o QR Code do ingresso
            </p>
          </div>
        )}
      </div>

      {/* Result overlay */}
      <AnimatePresence>
        {scanResult && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`absolute bottom-0 left-0 right-0 ${resultConfig[scanResult.type].bg} p-6 rounded-t-3xl`}
          >
            <div className="flex items-center gap-4 text-white">
              {(() => {
                const Icon = resultConfig[scanResult.type].icon;
                return <Icon className="w-12 h-12 flex-shrink-0" />;
              })()}
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold">{scanResult.message}</p>
                {scanResult.holderName && (
                  <p className="text-white/90 truncate">{scanResult.holderName}</p>
                )}
                {scanResult.lotName && (
                  <p className="text-white/80 text-sm">{scanResult.lotName}</p>
                )}
                {scanResult.validatedAt && (
                  <p className="text-white/70 text-sm">
                    Validado em: {new Date(scanResult.validatedAt).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
