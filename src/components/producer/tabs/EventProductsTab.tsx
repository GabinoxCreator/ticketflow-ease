import { Skeleton } from '@/components/ui/skeleton';
import { useEventLots } from '@/hooks/useEventLots';
import { useProdutosDoEvento } from '@/hooks/useLojaDoEvento';
import { ProdutosDoEvento } from '@/components/producer/loja/ProdutosDoEvento';
import { CombosDoEvento } from '@/components/producer/loja/CombosDoEvento';
import { RetiradasDoEvento } from '@/components/producer/loja/RetiradasDoEvento';

interface EventProductsTabProps {
  eventId: string;
}

export function EventProductsTab({ eventId }: EventProductsTabProps) {
  const { data: produtos, isLoading, error } = useProdutosDoEvento(eventId);
  const { lots, isLoading: lotsLoading } = useEventLots(eventId);

  if (isLoading || lotsLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <p className="font-semibold">Não foi possível carregar a loja do evento</p>
        <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <ProdutosDoEvento eventId={eventId} produtos={produtos ?? []} />
      <CombosDoEvento eventId={eventId} produtos={produtos ?? []} lots={lots ?? []} />
      <RetiradasDoEvento eventId={eventId} produtos={produtos ?? []} />
    </div>
  );
}
