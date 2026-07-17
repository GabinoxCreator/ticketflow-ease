import { useState } from 'react';
import { Shirt, Info } from 'lucide-react';
import ColaboradorQRScanner from './ColaboradorQRScanner';

interface ColaboradorAbadaTabProps {
  eventId: string;
  collaboratorId: string;
  sessionToken: string;
  onSessionExpired: () => void;
}

// Aba de retirada de abadá: mesma câmera do check-in (ColaboradorQRScanner em
// mode="abada"), que chama collaborator-redeem-abada e mostra o AbadaResultModal.
// A retirada NÃO consome o ingresso — ele segue 'valid' para a portaria no dia.
export default function ColaboradorAbadaTab({
  eventId,
  collaboratorId,
  sessionToken,
  onSessionExpired,
}: ColaboradorAbadaTabProps) {
  const [scannerOpen, setScannerOpen] = useState(false);

  return (
    <>
      <div className="space-y-4">
        {/* Big scan button (tema âmbar, distinto do modo portaria) */}
        <button
          onClick={() => setScannerOpen(true)}
          className="group w-full rounded-2xl bg-gradient-to-br from-amber-500 via-amber-500 to-orange-600 text-white p-5 flex items-center gap-4 shadow-lg shadow-amber-500/25 active:scale-[0.98] hover:shadow-xl hover:shadow-amber-500/30 transition-all"
        >
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0 ring-1 ring-white/30">
            <Shirt className="w-8 h-8" strokeWidth={2.2} />
          </div>
          <div className="text-left flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wider font-bold opacity-80">
              Retirada de camiseta
            </p>
            <p className="text-xl font-extrabold leading-tight">Escanear QR Code</p>
            <p className="text-xs opacity-90 mt-0.5">Câmera traseira · liberação automática</p>
          </div>
        </button>

        {/* Explicação: a retirada não consome o ingresso */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <Info className="w-5 h-5 text-amber-600" />
          </div>
          <div className="text-sm text-slate-600 leading-relaxed">
            <p className="font-semibold text-slate-900 mb-0.5">Como funciona</p>
            Escaneie o QR do ingresso para liberar a camiseta da pessoa. A retirada é
            registrada <strong>uma única vez</strong> e <strong>não consome o ingresso</strong> —
            ele continua válido para a portaria no dia do evento.
          </div>
        </div>
      </div>

      <ColaboradorQRScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        mode="abada"
        eventId={eventId}
        collaboratorId={collaboratorId}
        sessionToken={sessionToken}
        onSessionExpired={onSessionExpired}
      />
    </>
  );
}
