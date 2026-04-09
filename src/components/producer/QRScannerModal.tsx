import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Search, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface QRScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (code: string) => void;
}

export function QRScannerModal({ open, onOpenChange, onScan }: QRScannerModalProps) {
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (open) {
      // Small delay to let DOM render
      setTimeout(() => startScanner(), 300);
    }
    return () => {
      stopScanner();
    };
  }, [open]);

  const startScanner = async () => {
    try {
      setCameraError(null);
      const scanner = new Html5Qrcode('qr-reader-modal');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          await stopScanner();
          onScan(decodedText.trim());
          onOpenChange(false);
        },
        () => {}
      );
      setScanning(true);
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError(err.message || 'Não foi possível acessar a câmera');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      onOpenChange(false);
      setManualCode('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) stopScanner(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escanear QR Code</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            id="qr-reader-modal"
            className="w-full aspect-square bg-muted rounded-lg overflow-hidden"
          />

          {!scanning && !cameraError && (
            <Button className="w-full gap-2" onClick={startScanner}>
              <Camera className="h-4 w-4" />
              Iniciar Câmera
            </Button>
          )}

          {scanning && (
            <p className="text-center text-sm text-muted-foreground">
              Aponte a câmera para o QR Code do ingresso
            </p>
          )}

          {cameraError && (
            <div className="text-center space-y-2">
              <p className="text-sm text-destructive">{cameraError}</p>
              <Button variant="outline" size="sm" onClick={startScanner}>Tentar novamente</Button>
            </div>
          )}

          <div className="border-t pt-4">
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <Input
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                placeholder="Código do ingresso..."
                className="font-mono"
              />
              <Button type="submit" size="sm" disabled={!manualCode.trim()}>
                <Search className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
