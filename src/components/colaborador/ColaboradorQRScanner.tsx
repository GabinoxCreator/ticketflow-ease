import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, Flashlight } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { buildWindowMessage } from '@/lib/checkinWindow';
import CheckinResultModal, { CheckinResultData } from './CheckinResultModal';
import AbadaResultModal, { AbadaResultData } from './AbadaResultModal';
import { formatSeatLabel } from '@/utils/seatLabel';

interface ColaboradorQRScannerProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  collaboratorId: string;
  sessionToken: string;
  onSessionExpired: () => void;
  onCheckinDone?: () => void;
  // 'checkin' (padrão) = fluxo de portaria, intocado. 'abada' = retirada de abadá:
  // mesma câmera, mas chama collaborator-redeem-abada e mostra o AbadaResultModal.
  mode?: 'checkin' | 'abada';
}

export default function ColaboradorQRScanner({
  open,
  onClose,
  eventId,
  collaboratorId,
  sessionToken,
  onSessionExpired,
  onCheckinDone,
  mode = 'checkin',
}: ColaboradorQRScannerProps) {
  const [result, setResult] = useState<CheckinResultData | null>(null);
  const [abadaResult, setAbadaResult] = useState<AbadaResultData | null>(null);
  const [validating, setValidating] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const recentScans = useRef(new Map<string, number>());
  const isProcessing = useRef(false);
  // Timestamp em que a câmera ficou pronta (start resolveu). Enquanto estiver
  // dentro da janela de aquecimento, ignoramos decodes — os primeiros frames
  // pós-(re)start saem borrados no autofoco e podem gerar leitura ruim.
  const readyAt = useRef(0);

  const DEBOUNCE_MS = 5000;
  // Só no fluxo de abadá: a câmera religa sozinha após o resultado mirando o
  // MESMO QR, então descartamos os frames instáveis da re-inicialização.
  const WARMUP_MS = mode === 'abada' ? 800 : 0;

  const validateTicket = useCallback(async (code: string) => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    setValidating(true);

    // Pause the scanner immediately so it stops trying to read while we validate
    if (scannerRef.current) {
      try { await scannerRef.current.pause(true); } catch {}
    }

    try {
      if (mode === 'abada') {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/collaborator-redeem-abada`,
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
              source: 'qr',
            }),
          }
        );

        const data = await response.json();
        if (data.session_expired) {
          onSessionExpired();
          return;
        }

        let ar: AbadaResultData;
        if (data.success) {
          ar = { type: 'success', holderName: data.holder_name, redeemedAt: data.abada_redeemed_at };
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        } else if (data.already_redeemed) {
          ar = { type: 'already', holderName: data.holder_name, redeemedAt: data.abada_redeemed_at };
          if (navigator.vibrate) navigator.vibrate(300);
        } else {
          ar = {
            type: 'error',
            message: data.error || 'Não foi possível liberar a camiseta.',
            holderName: data.ticket?.holder_name,
          };
          if (navigator.vibrate) navigator.vibrate(300);
        }

        setAbadaResult(ar);
        return;
      }

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
      const seatLabel = formatSeatLabel(data.ticket?.seat_label, data.ticket?.seat_type_name) ?? undefined;
      if (data.success) {
        r = {
          type: 'success',
          message: 'Pode entrar!',
          holderName: data.ticket?.holder_name,
          lotName: data.ticket?.lot_name,
          seatLabel,
          ticketCode: data.ticket?.ticket_code,
        };
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        onCheckinDone?.();
      } else if (data.reason === 'before_window' || data.reason === 'after_window') {
        r = {
          type: 'window_closed',
          message: buildWindowMessage(data.reason, data.starts_at, data.ends_at),
          holderName: data.ticket?.holder_name,
          seatLabel,
        };
        if (navigator.vibrate) navigator.vibrate(300);
      } else if (data.error?.includes('já foi utilizado')) {
        r = {
          type: 'already_used',
          message: 'Esse ingresso já passou pela portaria.',
          holderName: data.ticket?.holder_name,
          lotName: data.ticket?.lot_name,
          seatLabel,
          validatedAt: data.ticket?.validated_at,
        };
        if (navigator.vibrate) navigator.vibrate(300);
      } else if (data.ticket?.status === 'pending') {
        r = {
          type: 'pending_payment',
          message: 'Pagamento ainda não confirmado.',
          holderName: data.ticket?.holder_name,
          lotName: data.ticket?.lot_name,
          seatLabel,
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
          seatLabel,
        };
        if (navigator.vibrate) navigator.vibrate(300);
      }

      setResult(r);
    } catch {
      if (mode === 'abada') {
        setAbadaResult({ type: 'error', message: 'Sem conexão. Tente novamente.' });
      } else {
        setResult({ type: 'error', message: 'Sem conexão. Tente novamente.' });
      }
    } finally {
      isProcessing.current = false;
      setValidating(false);
    }
  }, [eventId, collaboratorId, sessionToken, onSessionExpired, onCheckinDone, mode]);

  const onScan = useCallback((code: string) => {
    const now = Date.now();
    // Janela de aquecimento (só abadá): descarta os primeiros ~800ms após o
    // start, incluindo os restarts automáticos pós-resultado.
    if (WARMUP_MS > 0 && (readyAt.current === 0 || now - readyAt.current < WARMUP_MS)) return;
    const last = recentScans.current.get(code);
    if (last && now - last < DEBOUNCE_MS) return;
    recentScans.current.set(code, now);
    if (navigator.vibrate) navigator.vibrate(50);
    validateTicket(code);
  }, [validateTicket, WARMUP_MS]);

  useEffect(() => {
    if (!open) return;
    if (result || abadaResult) return; // don't (re)start while showing result
    let mounted = true;
    const containerId = 'colaborador-qr-reader';

    const startScanner = async () => {
      try {
        setCameraError(null);
        readyAt.current = 0; // câmera ainda não pronta — segura o aquecimento
        const scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10 },
          (decodedText) => { if (mounted) onScan(decodedText); },
          () => {}
        );
        if (mounted) readyAt.current = Date.now(); // início da janela de aquecimento
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
  }, [open, onScan, result, abadaResult]);

  // Stop camera as soon as a result appears (prevents iOS black-screenshot artifact)
  useEffect(() => {
    if ((result || abadaResult) && scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
  }, [result, abadaResult]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Hide html5-qrcode default UI chrome — keep only the live <video>, our custom frame is the single visual frame */}
      <style>{`
        #colaborador-qr-reader { border: none !important; padding: 0 !important; }
        #colaborador-qr-reader > div:not(:has(video)) { display: none !important; }
        #colaborador-qr-reader img { display: none !important; }
        #colaborador-qr-reader video { width: 100% !important; height: 100% !important; object-fit: cover !important; }
      `}</style>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
        <div className="text-white">
          <p className="text-xs uppercase tracking-wider opacity-70 font-semibold">
            {mode === 'abada' ? 'Retirada de camiseta' : 'Scanner'}
          </p>
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
      <div className="flex-1 relative overflow-hidden">
        <div id="colaborador-qr-reader" className="w-full h-full" />

        {/* Solid backdrop while showing result — avoids iOS black screenshot over live <video> */}
        {(result || abadaResult) && <div className="absolute inset-0 bg-slate-950 z-20" />}

        {/* Frame overlay */}
        {!cameraError && !result && !abadaResult && (
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
            <p className="text-white text-xl font-bold mb-2">
              {mode === 'abada' ? 'Liberando camiseta…' : 'Validando ingresso…'}
            </p>
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

      {mode === 'abada' && (
        <AbadaResultModal
          result={abadaResult}
          onClose={() => setAbadaResult(null)}
        />
      )}
    </div>
  );
}
