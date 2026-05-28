import { Link, Navigate, useParams } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useEvent } from '@/hooks/useEvents';
import EventDetailsSeated from './EventDetailsSeated';

const EventMapPage = () => {
  const { id: slugOrId } = useParams<{ id: string }>();
  const { data: event, isLoading } = useEvent(slugOrId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!event) {
    return <Navigate to="/" replace />;
  }

  const hasMap =
    event.status === 'published' &&
    (event.event_type === 'mesa' || event.event_type === 'hibrido') &&
    !!event.table_map_id;

  if (!hasMap) {
    return <Navigate to={`/evento/${slugOrId}`} replace />;
  }

  return (
    <div className="relative">
      <div className="fixed top-20 left-4 z-30">
        <Link
          to={`/evento/${event.slug ?? event.id}`}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-card/80 backdrop-blur-md border border-border/60 text-sm hover:bg-card transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para o evento
        </Link>
      </div>
      <EventDetailsSeated event={event} />
    </div>
  );
};

export default EventMapPage;
