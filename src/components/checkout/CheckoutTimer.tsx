import { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CheckoutTimerProps {
  expiresAt: Date;
  onExpire: () => void;
}

export function CheckoutTimer({ expiresAt, onExpire }: CheckoutTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const expiry = expiresAt.getTime();
      return Math.max(0, Math.floor((expiry - now) / 1000));
    };

    setTimeLeft(calculateTimeLeft());

    const interval = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      
      if (remaining <= 0) {
        clearInterval(interval);
        onExpire();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isLowTime = timeLeft <= 120; // Less than 2 minutes
  const isCritical = timeLeft <= 60; // Less than 1 minute

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-mono text-lg font-semibold transition-colors',
        isCritical
          ? 'bg-destructive/20 text-destructive animate-pulse'
          : isLowTime
          ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'
          : 'bg-primary/10 text-primary'
      )}
    >
      {isCritical ? (
        <AlertTriangle className="w-5 h-5" />
      ) : (
        <Clock className="w-5 h-5" />
      )}
      <span>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  );
}
