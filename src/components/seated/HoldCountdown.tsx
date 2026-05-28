import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface Props {
  expiresAt: string;
}

// Tick local isolado para não re-renderizar SeatNodes a cada segundo.
export function HoldCountdown({ expiresAt }: Props) {
  const [ms, setMs] = useState(() => new Date(expiresAt).getTime() - Date.now());

  useEffect(() => {
    setMs(new Date(expiresAt).getTime() - Date.now());
    const id = setInterval(() => {
      setMs(new Date(expiresAt).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const safeMs = Math.max(0, ms);
  const m = Math.floor(safeMs / 60000);
  const s = Math.floor((safeMs % 60000) / 1000);
  const urgent = safeMs <= 60_000;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${
        urgent ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary'
      }`}
    >
      <Clock className="w-3 h-3" />
      {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </div>
  );
}
