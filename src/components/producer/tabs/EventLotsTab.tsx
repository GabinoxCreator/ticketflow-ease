import { LotManager } from '@/components/producer/LotManager';
import { useEventLots } from '@/hooks/useEventLots';
import { Skeleton } from '@/components/ui/skeleton';

interface EventLotsTabProps {
  eventId: string;
}

export function EventLotsTab({ eventId }: EventLotsTabProps) {
  const { lots, createLot, updateLot, deleteLot, isLoading } = useEventLots(eventId);

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <LotManager
      lots={lots || []}
      onAdd={(data) => createLot.mutate(data)}
      onUpdate={(id, data) => updateLot.mutate({ id, data })}
      onDelete={(id) => deleteLot.mutate(id)}
    />
  );
}
