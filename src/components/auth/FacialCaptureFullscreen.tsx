import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2, RefreshCw, ScanFace, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Captura da facial em tela cheia (etapa opcional do cadastro).
//
// Duas regras mandam aqui:
//  1) NADA trava o cadastro. O MediaPipe é um AUXÍLIO de enquadramento, não um
//     requisito: se a lib não carregar (CDN fora, browser sem WASM) ou não subir
//     em ~3s, o botão de captura habilita mesmo assim (ver `assistTimedOut`).
//  2) A câmera é desligada em TODO caminho de saída (desmontar, X, sucesso) —
//     `stopCamera()` é chamado no cleanup do efeito, que cobre todos eles.
//
// O upload vai pra edge `facial-enroll` com a sessão do usuário (verify_jwt=true);
// a edge valida JPEG/1MB e grava no bucket privado.

interface FacialCaptureFullscreenProps {
  // concluída com sucesso (foto gravada) -> segue o fluxo pós-cadastro
  onDone: () => void;
  // fechou/pulou -> equivale ao "Agora não" do convite
  onSkip: () => void;
}

// ESM + wasm do MediaPipe direto do CDN (sem dependência nova no bundle). Import
// dinâmico com @vite-ignore pra o Vite não tentar resolver a URL em build.
const MP_VERSION = '0.10.14';
const MP_MODULE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MP_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

// Prazo pro auxílio de enquadramento aparecer. Estourou -> libera a captura.
const ASSIST_TIMEOUT_MS = 3000;
// Geometria do oval (fração do frame) e tolerâncias da checagem de centralização.
const OVAL_CENTER_Y = 0.46;
const MAX_OFFSET_X = 0.16;
const MAX_OFFSET_Y = 0.18;
const MIN_FACE_WIDTH = 0.2;
// Lado maior da foto enviada.
const MAX_SIDE = 720;
const JPEG_QUALITY = 0.85;

// 'no_face': o reconhecimento não achou rosto na foto. NÃO é bloqueio — a foto já
// está salva; é só a chance de tirar outra antes de seguir.
type Stage = 'camera' | 'preview' | 'sending' | 'no_face' | 'success';

// Superfície mínima do MediaPipe que usamos (a lib vem do CDN, sem tipos no bundle).
interface MpBoundingBox {
  originX: number;
  originY: number;
  width: number;
  height: number;
}
interface MpFaceDetector {
  detectForVideo: (
    video: HTMLVideoElement,
    timestampMs: number,
  ) => { detections?: Array<{ boundingBox?: MpBoundingBox }> };
  close?: () => void;
}
interface MpVisionModule {
  FilesetResolver: { forVisionTasks: (wasmPath: string) => Promise<unknown> };
  FaceDetector: {
    createFromOptions: (fileset: unknown, options: unknown) => Promise<MpFaceDetector>;
  };
}

// Extrai a mensagem do corpo da resposta quando a edge devolve != 2xx. Nunca lança:
// se não der pra ler, o caller cai na mensagem genérica.
async function readEdgeError(error: unknown): Promise<string | null> {
  const context = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
  if (!context?.json) return null;
  try {
    const body = await context.json();
    return body?.error ?? null;
  } catch (_) {
    return null;
  }
}

const FacialCaptureFullscreen: React.FC<FacialCaptureFullscreenProps> = ({ onDone, onSkip }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<MpFaceDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(-1);
  // evita setState depois do unmount (loop de detecção é assíncrono)
  const aliveRef = useRef(true);

  const [stage, setStage] = useState<Stage>('camera');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [centered, setCentered] = useState(false);
  const [assistTimedOut, setAssistTimedOut] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null); // base64 PURO (sem data-URI)

  // Câmera pronta o suficiente pra capturar: com o auxílio funcionando, exige rosto
  // centralizado; sem ele (falhou/estourou o prazo), libera direto.
  const canCapture = stage === 'camera' && !cameraError && (centered || assistTimedOut);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      detectorRef.current?.close?.();
    } catch (_) {
      /* fechar o detector nunca pode quebrar a saída */
    }
    detectorRef.current = null;
  }, []);

  // --- câmera + auxílio de enquadramento -----------------------------------
  useEffect(() => {
    aliveRef.current = true;

    // Prazo do auxílio: independente do carregamento, em 3s a captura libera.
    const assistTimer = setTimeout(() => {
      if (aliveRef.current) setAssistTimedOut(true);
    }, ASSIST_TIMEOUT_MS);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (!aliveRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {
            /* autoplay pode falhar em alguns browsers; o frame ainda renderiza */
          });
        }
      } catch (err) {
        console.error('[FACIAL] getUserMedia falhou:', err);
        if (aliveRef.current) {
          setCameraError(
            'Não foi possível acessar a câmera. Verifique a permissão do navegador.',
          );
        }
        return;
      }

      // Auxílio de enquadramento — best-effort do começo ao fim.
      try {
        const vision = (await import(/* @vite-ignore */ MP_MODULE_URL)) as unknown as MpVisionModule;
        const fileset = await vision.FilesetResolver.forVisionTasks(MP_WASM_URL);
        const detector = await vision.FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MP_MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
        });
        if (!aliveRef.current) {
          detector.close?.();
          return;
        }
        detectorRef.current = detector;
        rafRef.current = requestAnimationFrame(detectLoop);
      } catch (err) {
        // CDN fora, WASM bloqueado, GPU indisponível: segue sem auxílio.
        console.warn('[FACIAL] MediaPipe indisponível, seguindo sem auxílio:', err);
        if (aliveRef.current) setAssistTimedOut(true);
      }
    })();

    return () => {
      aliveRef.current = false;
      clearTimeout(assistTimer);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loop de detecção: marca `centered` quando o rosto está dentro do oval e grande
  // o bastante. Qualquer exceção aqui derruba só o auxílio, nunca a captura.
  const detectLoop = useCallback(() => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!aliveRef.current || !video || !detector) return;

    if (video.readyState >= 2 && video.currentTime !== lastTsRef.current) {
      lastTsRef.current = video.currentTime;
      try {
        const res = detector.detectForVideo(video, performance.now());
        const box = res?.detections?.[0]?.boundingBox;
        if (box && video.videoWidth > 0) {
          const cx = (box.originX + box.width / 2) / video.videoWidth;
          const cy = (box.originY + box.height / 2) / video.videoHeight;
          const w = box.width / video.videoWidth;
          setCentered(
            Math.abs(cx - 0.5) < MAX_OFFSET_X &&
              Math.abs(cy - OVAL_CENTER_Y) < MAX_OFFSET_Y &&
              w >= MIN_FACE_WIDTH,
          );
        } else {
          setCentered(false);
        }
      } catch (err) {
        console.warn('[FACIAL] detecção falhou, liberando captura:', err);
        setAssistTimedOut(true);
        detectorRef.current = null;
        return;
      }
    }
    rafRef.current = requestAnimationFrame(detectLoop);
  }, []);

  // --- captura --------------------------------------------------------------
  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      toast.error('Não foi possível processar a foto. Tente novamente.');
      return;
    }
    // Sem espelhar: o preview é espelhado só pra parecer um espelho; a foto
    // gravada é a imagem real (é ela que vai pro reconhecimento).
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    setPhoto(dataUrl.split(',')[1] ?? ''); // base64 PURO, sem prefixo data-URI
    setStage('preview');
  };

  const handleRetake = () => {
    setPhoto(null);
    setStage('camera');
  };

  // Fim da etapa: desliga a câmera, mostra a confirmação e segue o cadastro.
  const goToSuccess = () => {
    stopCamera();
    setStage('success');
    // respiro curto pra pessoa ver a confirmação antes de seguir
    setTimeout(() => {
      if (aliveRef.current) onDone();
    }, 1400);
  };

  const handleConfirm = async () => {
    if (!photo) return;
    setStage('sending');
    try {
      const { data, error } = await supabase.functions.invoke('facial-enroll', {
        body: { photo_base64: photo },
      });
      // Em status != 2xx o supabase-js entrega um erro genérico ("non-2xx status")
      // e guarda a resposta em error.context — é lá que está o nosso { error }
      // descritivo (JPEG inválido, > 1 MB, sessão inválida). Sem isso a pessoa via
      // uma mensagem inútil.
      if (error) throw new Error((await readEdgeError(error)) || error.message);
      if (data?.success !== true) throw new Error(data?.error || 'Falha ao salvar a foto');

      // A foto JÁ está salva neste ponto (success: true). Só o push pro
      // reconhecimento pode ter recusado: se foi por não achar rosto, vale oferecer
      // uma recaptura — a câmera segue ligada de propósito. Qualquer outro motivo
      // (timeout, indisponibilidade) é mudo e re-sincronizável depois.
      if (data?.synced === false && data?.sync_reason === 'no_face') {
        setStage('no_face');
        return;
      }

      goToSuccess();
    } catch (err) {
      console.error('[FACIAL] envio falhou:', err);
      const msg = err instanceof Error ? err.message : '';
      toast.error(msg || 'Não foi possível salvar sua foto. Tente novamente.');
      setStage('preview'); // volta pro preview: dá pra tentar de novo ou pular
    }
  };

  const handleClose = () => {
    stopCamera();
    onSkip();
  };

  // --- UI -------------------------------------------------------------------
  // PORTAL OBRIGATÓRIO: `position: fixed` se ancora no ancestral mais próximo que
  // tiver transform/filter/perspective, e o wizard vive dentro de motion.div
  // animados (Auth.tsx) — no lugar de ocupar a tela, o overlay ficava espremido
  // dentro do card no iOS. Montando em document.body não há ancestral transformado,
  // então `inset-0` volta a ser a viewport. Só a árvore de renderização muda: o
  // componente continua filho do wizard em estado/props, então onDone/onSkip
  // seguem iguais.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-neutral-950 text-white">
      {/* topo */}
      <div className="relative z-20 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ScanFace className="h-5 w-5 text-primary" />
          Acesso facial
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Fechar captura"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* vídeo (espelhado só na exibição) */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 h-full w-full scale-x-[-1] object-cover ${
            stage === 'camera' ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* preview da foto capturada */}
        {photo && stage !== 'camera' && (
          <img
            src={`data:image/jpeg;base64,${photo}`}
            alt="Foto capturada"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {/* moldura oval + instruções */}
        {stage === 'camera' && !cameraError && (
          <div className="pointer-events-none absolute inset-0">
            <div
              className={`absolute left-1/2 h-[62%] w-[74%] max-w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-[3px] transition-colors duration-300 ${
                centered ? 'border-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.35)]' : 'border-white/70'
              }`}
              style={{ top: `${OVAL_CENTER_Y * 100}%` }}
            />
            <div className="absolute inset-x-0 bottom-6 space-y-3 px-6 text-center">
              <AnimatePresence mode="wait">
                {centered ? (
                  <motion.div
                    key="ok"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mx-auto flex w-fit items-center gap-2 rounded-full bg-emerald-500/90 px-4 py-1.5 text-sm font-medium"
                  >
                    <Check className="h-4 w-4" strokeWidth={3} />
                    Rosto centralizado
                  </motion.div>
                ) : (
                  <motion.div
                    key="guide"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <p className="text-base font-semibold">Posicione seu rosto</p>
                    <p className="text-sm text-white/70">Centralize dentro da moldura</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* erro de câmera */}
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-sm text-white/80">{cameraError}</p>
            <Button type="button" variant="secondary" size="lg" onClick={handleClose}>
              Continuar sem facial
            </Button>
          </div>
        )}

        {/* rosto não identificado — convite a repetir, nunca um bloqueio */}
        {stage === 'no_face' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-950/85 px-8 text-center">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20">
                <ScanFace className="h-8 w-8 text-amber-400" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-semibold">
                  Não conseguimos identificar seu rosto nessa foto
                </p>
                <p className="text-sm text-white/70">Quer tirar outra?</p>
              </div>
            </motion.div>
          </div>
        )}

        {/* enviando / sucesso */}
        {(stage === 'sending' || stage === 'success') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-950/80 px-8 text-center">
            {stage === 'sending' ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-white/80">Salvando sua foto…</p>
              </>
            ) : (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-4"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500">
                  <Check className="h-8 w-8" strokeWidth={3} />
                </div>
                <p className="text-lg font-semibold">Facial ativada!</p>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* ações */}
      <div className="space-y-3 px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4">
        {stage === 'camera' && !cameraError && (
          <>
            <Button
              type="button"
              variant="hero"
              size="lg"
              className="w-full gap-2"
              onClick={handleCapture}
              disabled={!canCapture}
            >
              <ScanFace className="h-4 w-4" />
              Tirar foto
            </Button>
            <button
              type="button"
              onClick={handleClose}
              className="w-full text-sm text-white/60 transition-colors hover:text-white"
            >
              Agora não
            </button>
          </>
        )}

        {stage === 'preview' && (
          <>
            <Button
              type="button"
              variant="hero"
              size="lg"
              className="w-full gap-2"
              onClick={handleConfirm}
            >
              <Check className="h-4 w-4" />
              Usar esta
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full gap-2 text-white hover:bg-white/10 hover:text-white"
              onClick={handleRetake}
            >
              <RefreshCw className="h-4 w-4" />
              Tirar outra
            </Button>
            <button
              type="button"
              onClick={handleClose}
              className="w-full text-sm text-white/60 transition-colors hover:text-white"
            >
              Pular por enquanto
            </button>
          </>
        )}

        {stage === 'no_face' && (
          <>
            <Button
              type="button"
              variant="hero"
              size="lg"
              className="w-full gap-2"
              onClick={handleRetake}
            >
              <RefreshCw className="h-4 w-4" />
              Tirar outra
            </Button>
            {/* A foto continua salva: seguir aqui nunca perde o cadastro. */}
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full text-white hover:bg-white/10 hover:text-white"
              onClick={goToSuccess}
            >
              Continuar assim
            </Button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default FacialCaptureFullscreen;
