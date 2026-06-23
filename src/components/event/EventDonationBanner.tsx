import { HeartHandshake } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EventDonationBannerProps {
  onDonate: () => void;
}

export function EventDonationBanner({ onDonate }: EventDonationBannerProps) {
  return (
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
  );
}

export default EventDonationBanner;
