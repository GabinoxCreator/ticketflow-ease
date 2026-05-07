import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, Flashlight } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { buildWindowMessage } from '@/lib/checkinWindow';
import CheckinResultModal, { CheckinResultData } from './CheckinResultModal';

interface ColaboradorQRScannerProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  collaboratorId: string;
  sessionToken: string;
  onSessionExpired: () => void;
  onCheckinDone?: () => void;
}

export default function ColaboradorQRScanner({
  open,
  onClose,
  eventId,
  collaboratorId,
  sessionToken,
  onSessionExpired,
  onCheckinDone,
}: ColaboradorQRScannerProps) {
  const [result, setResult] = useState<CheckinResultData | null>(null);
  const [validating, setValidating] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const recentScans = useRef(new Map<string, number>());
  const isProcessing = useRef(false);

  const DEBOUNCE_MS = 5000;

  const validateTicket = useCallback(async (code: string) => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    setValidating(true);

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

      let r: CheckinResultData;
      if (data.success) {
        r = {
          type: 'success',
          message: 'Pode entrar!',
          holderName: data.ticket?.holder_name,
          lotName: data.ticket?.lot_name,
          ticketCode: data.ticket?.ticket_code,
        };
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        onCheckinDone?.();
      } else if (data.reason === 'before_window' || data.reason === 'after_window') {
        r = {
          type: 'window_closed',
          message: buildWindowMessage(data.reason, data.starts_at, data.ends_at),
          holderName: data.ticket?.holder_name,
        };
        if (navigator.vibrate) navigator.vibrate(300);
      } else if (data.error?.includes('já foi utilizado')) {
        r = {
          type: 'already_used',
          message: 'Esse ingresso já passou pela portaria.',
          holderName: data.ticket?.holder_name,
          lotName: data.ticket?.lot_name,
          validatedAt: data.ticket?.validated_at,
        };
        if (navigator.vibrate) navigator.vibrate(300);
      } else if (data.ticket?.status === 'pending') {
        r = {
          type: 'pending_payment',
          message: 'Pagamento ainda não confirmado.',
          holderName: data.ticket?.holder_name,
          lotName: data.ticket?.lot_name,
        };
        if (navigator.vibrate) navigator.vibrate(300);
      } else if (data.error?.includes('não encontrado') || !data.found) {
        r = {
          type: 'invalid',
          message: 'Não encontramos esse ingresso para o evento.',
        };
        if (navigator.vibrate) navigator.vibrate([100, 100, 100, 100, 100]);
      } else {
        r = {
          type: 'error',
          message: data.error || 'Não foi possível validar agora.',
          holderName: data.ticket?.holder_name,
        };
        if (navigator.vibrate) navigator.vibrate(300);
      }

      setResult(r);
    } catch {
      setResult({ type: 'error', message: 'Sem conexão. Tente novamente.' });
    } finally {
      isProcessing.current = false;
      setValidating(false);
    }
  }, [eventId, collaboratorId, sessionToken, onSessionExpired, onCheckinDone]);

  const onScan = useCallback((code: string) => {
    const now = Date.now();
    const last = recentScans.current.get(code);
    if (last && now - last < DEBOUNCE_MS) return;
    recentScans.current.set(code, now);
    if (navigator.vibrate) navigator.vibrate(50);
    validateTicket(code);
  }, [validateTicket]);

  useEffect(() => {
    if (!open) return;
    if (result) return; // don't (re)start while showing result
    let mounted = true;
    const containerId = 'colaborador-qr-reader';

    const startScanner = async () => {
      try {
        setCameraError(null);
        const scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10 },
          (decodedText) => { if (mounted) onScan(decodedText); },
          () => {}
        );
      } catch (err: any) {
        if (mounted) setCameraError(err.message || 'Não foi possível acessar a câmera');
      }
    };

    const timer = setTimeout(startScanner, 100);
    return () => {
      mounted = false;
      clearTimeout(timer);
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [open, onScan, result]);

  // Stop camera as soon as a result appears (prevents iOS black-screenshot artifact)
  useEffect(() => {
    if (result && scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
  }, [result]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
        <div className="text-white">
          <p className="text-xs uppercase tracking-wider opacity-70 font-semibold">Scanner</p>
          <p className="text-sm font-semibold">Aponte para o QR Code</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar scanner"
          className="w-11 h-11 rounded-full bg-white/15 backdrop-blur flex items-center justify-center active:bg-white/25"
        >
          <X className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* Scanner */}
      <div className="flex-1 relative">
        <div id="colaborador-qr-reader" className="w-full h-full" />

        {/* Frame overlay */}
        {!cameraError && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-72 h-72 max-w-[80vw] max-h-[80vw]">
              <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-white rounded-tl-2xl" />
              <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-white rounded-tr-2xl" />
              <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-white rounded-bl-2xl" />
              <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-white rounded-br-2xl" />
            </div>
          </div>
        )}

        {validating && (
          <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-sm flex flex-col items-center justify-center z-30 px-8">
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-white/15" />
              <div className="absolute inset-0 rounded-full border-4 border-t-primary border-r-primary border-b-transparent border-l-transparent animate-spin" />
            </div>
            <p className="text-white text-xl font-bold mb-2">Validando ingresso…</p>
            <p className="text-white/70 text-sm text-center">Aguarde a confirmação</p>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-8">
            <div className="text-center text-white max-w-xs">
              <Flashlight className="w-14 h-14 mx-auto mb-4 opacity-60" />
              <p className="text-lg font-semibold mb-2">Câmera indisponível</p>
              <p className="text-sm opacity-70 mb-6">{cameraError}</p>
              <button
                onClick={onClose}
                className="px-6 py-3 bg-white text-slate-900 rounded-xl font-semibold"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>

      <CheckinResultModal
        result={result}
        onClose={() => setResult(null)}
      />
    </div>
  );
}
