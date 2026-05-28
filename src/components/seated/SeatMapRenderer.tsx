import { useEffect, useMemo, useRef, useState } from 'react';
import type { EventSeatRow } from '@/hooks/useEventSeats';
import { SeatNode, type VStatus } from './SeatNode';
import { calculateBounds } from '@/lib/calculateFitView';

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

const PADDING = 24;

export function SeatMapRenderer({
  snapshot,
  seats,
  resolveVisualStatus,
  onToggleSeat,
  zoom = 1,
  fillHeight = false,
}: Props) {
  const bg = snapshot.table_map?.background_color || 'hsl(var(--card))';

  const sortedObjects = useMemo(
    () => [...(snapshot.map_objects ?? [])].sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0)),
    [snapshot.map_objects]
  );

  // BBox real do conteúdo (assentos + objetos), não do table_map declarado.
  const bbox = useMemo(() => {
    const items: { x: number; y: number; width?: number; height?: number }[] = [];
    for (const o of sortedObjects) {
      items.push({
        x: o.x,
        y: o.y,
        width: o.width ?? 50,
        height: o.height ?? 50,
      });
    }
    for (const s of seats) {
      const w = s.width ?? (s.radius ?? 16) * 2;
      const h = s.height ?? (s.radius ?? 16) * 2;
      items.push({ x: s.x ?? 0, y: s.y ?? 0, width: w, height: h });
    }
    if (items.length === 0) {
      const fw = snapshot.table_map?.width ?? 1200;
      const fh = snapshot.table_map?.height ?? 800;
      return { minX: 0, minY: 0, maxX: fw, maxY: fh };
    }
    return calculateBounds(items);
  }, [sortedObjects, seats, snapshot.table_map?.width, snapshot.table_map?.height]);

  const vbX = bbox.minX - PADDING;
  const vbY = bbox.minY - PADDING;
  const vbW = Math.max(1, bbox.maxX - bbox.minX + PADDING * 2);
  const vbH = Math.max(1, bbox.maxY - bbox.minY + PADDING * 2);
  const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`;

  // Mede o container pra calcular o fit em pixels e suportar pan via overflow quando zoom>1.
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setSize({ w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Fit em px (preserveAspectRatio meet faz o equivalente; calculamos pra aplicar zoom>1).
  const fit = useMemo(() => {
    if (size.w === 0 || size.h === 0) return { w: 0, h: 0 };
    const sx = size.w / vbW;
    const sy = size.h / vbH;
    const s = Math.min(sx, sy);
    return { w: vbW * s, h: vbH * s };
  }, [size, vbW, vbH]);

  const svgW = fit.w > 0 ? fit.w * zoom : 0;
  const svgH = fit.h > 0 ? fit.h * zoom : 0;
  const needsOverflow = zoom > 1.0001;

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${fillHeight ? 'h-full' : 'h-[70vh]'} rounded-xl border border-border bg-card/40 ${
        needsOverflow ? 'overflow-auto' : 'overflow-hidden'
      }`}
    >
      {size.w > 0 && size.h > 0 && (
        <div
          className="flex items-center justify-center"
          style={{
            width: needsOverflow ? svgW : '100%',
            height: needsOverflow ? svgH : '100%',
            minWidth: '100%',
            minHeight: '100%',
          }}
        >
          <svg
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
            width={needsOverflow ? svgW : '100%'}
            height={needsOverflow ? svgH : '100%'}
            style={{ background: bg, display: 'block' }}
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
      )}
    </div>
  );
}
