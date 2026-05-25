import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Event } from '@/hooks/useEvents';
import { useAuth } from '@/contexts/AuthContext';
import { ManualSaleModal } from './ManualSaleModal';

interface Props {
  event: Pick<Event, 'id' | 'producer_id' | 'title' | 'date' | 'time' | 'venue' | 'city' | 'state'>;
  variant?: 'gradient' | 'outline';
  size?: 'sm' | 'default';
  label?: string;
}

export function ManualSaleButton({ event, variant = 'gradient', size = 'sm', label = '+ Vender' }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user || user.id !== event.producer_id) return null;

  return (
    <>
      <Button
        size={size}
        onClick={() => setOpen(true)}
        className={
          variant === 'gradient'
            ? 'rounded-xl bg-gradient-to-r from-primary to-pink-500 hover:opacity-90 text-white shadow-lg shadow-primary/20'
            : 'rounded-xl bg-card/40 backdrop-blur-xl border border-primary/10 hover:bg-card/60'
        }
      >
        <ShoppingBag className="h-4 w-4 mr-2" />
        {label}
      </Button>

      <ManualSaleModal event={event} open={open} onOpenChange={setOpen} />
    </>
  );
}
