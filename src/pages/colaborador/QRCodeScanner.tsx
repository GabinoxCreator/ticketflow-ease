import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Search, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useColaboradorAuth } from '@/contexts/ColaboradorAuthContext';

interface TicketResult {
  found: boolean;
  ticket?: {
    id: string;
    ticket_code: string;
    holder_name: string;
    holder_email?: string;
    status: string;
    validated_at?: string;
    lot_name?: string;
    event_title?: string;
  };
  error?: string;
  success?: boolean;
  message?: string;
}

export default function QRCodeScanner() {
  const navigate = useNavigate();
  const { id: eventId } = useParams<{ id: string }>();
  const { collaborator, events, session, logout } = useColaboradorAuth();

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TicketResult | null>(null);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);

  const event = events.find(e => e.id === eventId);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const startScanner = async () => {
    if (!scannerContainerRef.current) return;

    try {
      setCameraError(null);
      setResult(null);
      
      scannerRef.current = new Html5Qrcode('qr-reader');
      
      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          // Stop scanner after successful scan
          await stopScanner();
          handleTicketCode(decodedText);
        },
        () => {} // Ignore failures
      );
      
      setScanning(true);
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError(err.message || 'Não foi possível acessar a câmera');
      setShowManualInput(true);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch (e) {
        // Ignore
      }
    }
    setScanning(false);
  };

  const handleTicketCode = async (code: string, action: 'check' | 'validate' = 'check') => {
    if (!code.trim() || !collaborator || !session) return;

    setIsLoading(true);
    setResult(null);

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
            collaborator_id: collaborator.id,
            session_token: session.token, // SECURITY: Pass session token for server validation
            action,
          }),
        }
      );

      const data = await response.json();
      
      // Handle session expiration
      if (data.session_expired) {
        logout();
        navigate('/colaborador/login');
        return;
      }
      
      setResult(data);

      if (action === 'validate' && data.success) {
        // Play success sound or vibrate
        if (navigator.vibrate) {
          navigator.vibrate(200);
        }
      }
    } catch (error) {
      console.error('Error validating ticket:', error);
      setResult({ found: false, error: 'Erro de conexão' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleValidate = () => {
    if (result?.ticket?.ticket_code) {
      handleTicketCode(result.ticket.ticket_code, 'validate');
    }
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleTicketCode(manualCode.trim());
    }
  };

  const resetScanner = async () => {
    setResult(null);
    setManualCode('');
    if (!showManualInput) {
      await startScanner();
    }
  };

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="font-medium mb-2">Evento não encontrado</h3>
            <Button onClick={() => navigate('/colaborador/dashboard')}>Voltar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 -ml-2 mb-2"
            onClick={() => navigate(`/colaborador/evento/${eventId}`)}
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <h1 className="font-bold">Ler QR Code</h1>
          <p className="text-sm text-muted-foreground line-clamp-1">{event.title}</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {/* Scanner Area */}
        {!showManualInput && !result && (
          <Card>
            <CardContent className="p-4">
              <div
                id="qr-reader"
                ref={scannerContainerRef}
                className="w-full aspect-square bg-muted rounded-lg overflow-hidden"
              />
              
              {!scanning && !cameraError && (
                <Button
                  className="w-full mt-4 gap-2"
                  onClick={startScanner}
                >
                  <Camera className="w-4 h-4" />
                  Iniciar Câmera
                </Button>
              )}

              {scanning && (
                <p className="text-center text-sm text-muted-foreground mt-4">
                  Aponte a câmera para o QR Code do ingresso
                </p>
              )}

              {cameraError && (
                <div className="text-center mt-4">
                  <p className="text-sm text-destructive mb-2">{cameraError}</p>
                  <Button variant="outline" onClick={startScanner}>
                    Tentar novamente
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Manual Search Button */}
        {!showManualInput && !result && (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => {
              stopScanner();
              setShowManualInput(true);
            }}
          >
            <Search className="w-4 h-4" />
            Buscar por Código
          </Button>
        )}

        {/* Manual Input */}
        {showManualInput && !result && (
          <Card>
            <CardContent className="p-4">
              <form onSubmit={handleManualSearch} className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Digite o código do ingresso
                  </label>
                  <Input
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                    placeholder="Ex: ABC12345"
                    className="text-center text-lg tracking-wider font-mono"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    O código está no ingresso do cliente (8 caracteres)
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowManualInput(false);
                      setManualCode('');
                    }}
                  >
                    Usar Câmera
                  </Button>
                  <Button type="submit" className="flex-1 gap-2" disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    Buscar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {isLoading && (
          <Card>
            <CardContent className="py-12 text-center">
              <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
              <p className="mt-4 text-muted-foreground">Verificando ingresso...</p>
            </CardContent>
          </Card>
        )}

        {/* Result */}
        <AnimatePresence>
          {result && !isLoading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Card className={
                result.success ? 'border-green-500 bg-green-500/10' :
                result.error && result.found ? 'border-yellow-500 bg-yellow-500/10' :
                result.error ? 'border-destructive bg-destructive/10' :
                result.ticket?.status === 'valid' ? 'border-green-500 bg-green-500/10' :
                result.ticket?.status === 'used' ? 'border-yellow-500 bg-yellow-500/10' :
                'border-destructive bg-destructive/10'
              }>
                <CardContent className="p-6 text-center">
                  {result.success ? (
                    <>
                      <CheckCircle2 className="w-16 h-16 mx-auto text-green-500 mb-4" />
                      <h3 className="text-xl font-bold text-green-500 mb-2">
                        Ingresso Validado!
                      </h3>
                    </>
                  ) : result.error && !result.found ? (
                    <>
                      <XCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
                      <h3 className="text-xl font-bold text-destructive mb-2">
                        Ingresso Não Encontrado
                      </h3>
                    </>
                  ) : result.ticket?.status === 'used' ? (
                    <>
                      <AlertCircle className="w-16 h-16 mx-auto text-yellow-500 mb-4" />
                      <h3 className="text-xl font-bold text-yellow-500 mb-2">
                        Ingresso Já Utilizado
                      </h3>
                    </>
                  ) : result.ticket?.status === 'cancelled' ? (
                    <>
                      <XCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
                      <h3 className="text-xl font-bold text-destructive mb-2">
                        Ingresso Cancelado
                      </h3>
                    </>
                  ) : result.ticket?.status === 'valid' ? (
                    <>
                      <CheckCircle2 className="w-16 h-16 mx-auto text-green-500 mb-4" />
                      <h3 className="text-xl font-bold text-green-500 mb-2">
                        Ingresso Válido
                      </h3>
                    </>
                  ) : null}

                  {result.ticket && (
                    <div className="mt-4 space-y-2 text-left bg-background/50 rounded-lg p-4">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Nome:</span>
                        <span className="font-medium">{result.ticket.holder_name}</span>
                      </div>
                      {result.ticket.lot_name && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Lote:</span>
                          <span className="font-medium">{result.ticket.lot_name}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Código:</span>
                        <span className="font-mono text-sm">
                          {result.ticket.ticket_code.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                      {result.ticket.validated_at && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Validado em:</span>
                          <span className="text-sm">
                            {new Date(result.ticket.validated_at).toLocaleString('pt-BR')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-6 space-y-2">
                    {result.ticket?.status === 'valid' && !result.success && (
                      <Button
                        className="w-full gap-2"
                        size="lg"
                        onClick={handleValidate}
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        Validar Ingresso
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={resetScanner}
                    >
                      Escanear Outro
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
