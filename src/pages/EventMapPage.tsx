import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Loader2, ArrowLeft, Minus, Plus, Maximize2, Minimize2 } from 'lucide-react';
import { useEvent } from '@/hooks/useEvents';
import EventDetailsSeated from './EventDetailsSeated';
import { Button } from '@/components/ui/button';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

const formatShortDate = (dateString: string, time?: string | null) => {
  const date = new Date(dateString + 'T12:00:00');
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const t = time ? ` · ${time.slice(0, 5)}` : '';
  return `${dd}/${mm}${t}`;
};

const EventMapPage = () => {
  const { id: slugOrId } = useParams<{ id: string }>();
  const { data: event, isLoading } = useEvent(slugOrId);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!event) return <Navigate to="/" replace />;

  const hasMap =
    event.status === 'published' &&
    (event.event_type === 'mesa' || event.event_type === 'hibrido') &&
    !!event.table_map_id;

  if (!hasMap) return <Navigate to={`/evento/${slugOrId}`} replace />;

  const backHref = `/evento/${event.slug ?? event.id}`;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-background flex flex-col"
    >
      {/* Header dedicado, sem header global */}
      <header className="h-14 border-b border-border bg-card/95 backdrop-blur flex items-center gap-2 px-2 sm:px-4 shrink-0">
        <Link
          to={backHref}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-muted text-sm shrink-0"
          aria-label="Voltar para o evento"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Voltar</span>
        </Link>

        <div className="flex-1 min-w-0 text-center px-2">
          <p className="font-semibold text-sm sm:text-base truncate">
            {event.title}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {formatShortDate(event.date, event.time)}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            disabled={zoom <= ZOOM_MIN + 0.001}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
            aria-label="Diminuir zoom"
          >
            <Minus className="w-4 h-4" />
          </Button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="text-xs font-medium tabular-nums w-12 text-center hover:underline"
            aria-label="Resetar zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            disabled={zoom >= ZOOM_MAX - 0.001}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
            aria-label="Aumentar zoom"
          >
            <Plus className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 hidden sm:inline-flex"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Sair de tela cheia' : 'Tela cheia'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      </header>

      {/* Conteúdo: mapa + painel */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <EventDetailsSeated event={event} zoom={zoom} />
      </div>
    </div>
  );
};

export default EventMapPage;
