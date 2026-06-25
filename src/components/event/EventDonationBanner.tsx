import { HeartHandshake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DonationProgress } from '@/hooks/useDonationProgress';

interface EventDonationBannerProps {
  onDonate: () => void;
  /** Só no evento beneficente: progresso curado da arrecadação. Ausente = sem barra. */
  progress?: DonationProgress | null;
  /** true enquanto a barra carrega (mostra skeleton discreto). */
  progressLoading?: boolean;
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function EventDonationBanner({
  onDonate,
  progress,
  progressLoading,
}: EventDonationBannerProps) {
  const pct =
    progress && progress.goalAmountCents > 0
      ? Math.min(
          100,
          Math.round((progress.raisedAmountCents / progress.goalAmountCents) * 100),
        )
      : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 rounded-2xl border border-pink-200 bg-pink-50 p-4 sm:p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pink-100 text-pink-600">
          <HeartHandshake className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-pink-900">Apoie a nossa Glória</p>
          <p className="text-sm text-pink-700">Faça uma doação via PIX</p>
        </div>
        <Button
          onClick={onDonate}
          className="shrink-0 bg-pink-600 text-white hover:bg-pink-700"
        >
          Doar
        </Button>
      </div>

      {/* Loading discreto enquanto busca; em erro/sem dado a barra simplesmente não aparece. */}
      {progressLoading && !progress && (
        <div className="rounded-2xl border border-pink-200 bg-pink-50 p-4 sm:p-5">
          <div className="h-2.5 w-full animate-pulse rounded-full bg-pink-100" />
        </div>
      )}

      {progress && (
        <div className="rounded-2xl border border-pink-200 bg-pink-50 p-4 sm:p-5">
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-pink-100"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-pink-600 transition-[width] duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <span className="text-pink-700">
              <span className="font-semibold text-pink-900">
                {brl(progress.raisedAmountCents)}
              </span>{' '}
              arrecadados de {brl(progress.goalAmountCents)}
            </span>
            <span className="shrink-0 font-semibold text-pink-900">{pct}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default EventDonationBanner;
