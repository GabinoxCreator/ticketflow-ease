import { useMemo } from 'react';
import type { EventSeatRow } from '@/hooks/useEventSeats';
import { SeatNode, type VStatus } from './SeatNode';

interface MapObject {
  id: string;
  object_type: 'text' | 'rect' | 'circle' | 'line' | 'image' | 'icon';
  x: number;
  y: number;
  width?: number | null;
  height?: number | null;
  rotation?: number;
  text_content?: string | null;
  font_size?: number | null;
  fill_color?: string | null;
  stroke_color?: string | null;
  stroke_width?: number | null;
  image_url?: string | null;
  z_index?: number;
}

interface TableMapMeta {
  width?: number;
  height?: number;
  background_color?: string | null;
}

interface MapSnapshot {
  table_map?: TableMapMeta;
  map_objects?: MapObject[];
}

interface Props {
  snapshot: MapSnapshot;
  seats: EventSeatRow[];
  resolveVisualStatus: (seat: EventSeatRow) => VStatus;
  onToggleSeat: (seatId: string) => void;
  zoom?: number;
  fillHeight?: boolean;
}

export function SeatMapRenderer({
  snapshot,
  seats,
  resolveVisualStatus,
  onToggleSeat,
  zoom = 1,
  fillHeight = false,
}: Props) {
  const width = snapshot.table_map?.width ?? 1200;
  const height = snapshot.table_map?.height ?? 800;
  const bg = snapshot.table_map?.background_color || 'hsl(var(--card))';

  const sortedObjects = useMemo(
    () => [...(snapshot.map_objects ?? [])].sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0)),
    [snapshot.map_objects]
  );

  return (
    <div
      className={`w-full overflow-auto rounded-xl border border-border bg-card/40 ${fillHeight ? 'h-full' : ''}`}
    >
      <div
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          width: `${100 * zoom}%`,
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block w-full h-auto"
          style={{ background: bg, maxHeight: fillHeight ? undefined : '70vh' }}
        >
          {sortedObjects.map((obj) => {
            const w = obj.width ?? 50;
            const h = obj.height ?? 50;
            const cx = obj.x + w / 2;
            const cy = obj.y + h / 2;
            const transform = obj.rotation ? `rotate(${obj.rotation} ${cx} ${cy})` : undefined;
            if (obj.object_type === 'rect') {
              return (
                <rect
                  key={obj.id}
                  x={obj.x}
                  y={obj.y}
                  width={w}
                  height={h}
                  fill={obj.fill_color || '#cccccc'}
                  stroke={obj.stroke_color || 'transparent'}
                  strokeWidth={obj.stroke_width ?? 1}
                  transform={transform}
                />
              );
            }
            if (obj.object_type === 'circle') {
              return (
                <circle
                  key={obj.id}
                  cx={cx}
                  cy={cy}
                  r={w / 2}
                  fill={obj.fill_color || '#cccccc'}
                  stroke={obj.stroke_color || 'transparent'}
                  strokeWidth={obj.stroke_width ?? 1}
                  transform={transform}
                />
              );
            }
            if (obj.object_type === 'text') {
              return (
                <text
                  key={obj.id}
                  x={obj.x}
                  y={obj.y}
                  fontSize={obj.font_size ?? 14}
                  fill={obj.fill_color || 'hsl(var(--foreground))'}
                  transform={transform}
                  style={{ userSelect: 'none' }}
                >
                  {obj.text_content || ''}
                </text>
              );
            }
            if (obj.object_type === 'image' && obj.image_url) {
              return (
                <image
                  key={obj.id}
                  href={obj.image_url}
                  x={obj.x}
                  y={obj.y}
                  width={w}
                  height={h}
                  transform={transform}
                />
              );
            }
            if (obj.object_type === 'line') {
              return (
                <line
                  key={obj.id}
                  x1={obj.x}
                  y1={obj.y}
                  x2={obj.x + w}
                  y2={obj.y + h}
                  stroke={obj.stroke_color || '#000'}
                  strokeWidth={obj.stroke_width ?? 2}
                />
              );
            }
            return null;
          })}

          {seats.map((seat) => (
            <SeatNode
              key={seat.id}
              seat={seat}
              vstatus={resolveVisualStatus(seat)}
              onToggle={onToggleSeat}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
