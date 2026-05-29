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
// Tamanho mínimo do "papel" (em unidades do editor) pra evitar que 1 mesa
// pequena fique gigante via preserveAspectRatio meet. Calibrado a olho:
// mesa típica ~200u; com 500u o papel respira sem perder a mesa no vazio.
const MIN_VIEW = 500;

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

  // BBox real do conteúdo (assentos + objetos), expandido pra MIN_VIEW se esparso.
  const bbox = useMemo(() => {
    const items: { x: number; y: number; width?: number; height?: number }[] = [];
    for (const o of sortedObjects) {
      items.push({ x: o.x, y: o.y, width: o.width ?? 50, height: o.height ?? 50 });
    }
    for (const s of seats) {
      const w = s.width ?? (s.radius ?? 16) * 2;
      const h = s.height ?? (s.radius ?? 16) * 2;
      items.push({ x: s.x ?? 0, y: s.y ?? 0, width: w, height: h });
    }
    let b;
    if (items.length === 0) {
      const fw = snapshot.table_map?.width ?? 1200;
      const fh = snapshot.table_map?.height ?? 800;
      b = { minX: 0, minY: 0, maxX: fw, maxY: fh };
    } else {
      b = calculateBounds(items);
    }
    // Expande pra MIN_VIEW em torno do centro quando o conteúdo é esparso.
    const rawW = b.maxX - b.minX;
    const rawH = b.maxY - b.minY;
    if (rawW < MIN_VIEW) {
      const pad = (MIN_VIEW - rawW) / 2;
      b = { ...b, minX: b.minX - pad, maxX: b.maxX + pad };
    }
    if (rawH < MIN_VIEW) {
      const pad = (MIN_VIEW - rawH) / 2;
      b = { ...b, minY: b.minY - pad, maxY: b.maxY + pad };
    }
    return b;
  }, [sortedObjects, seats, snapshot.table_map?.width, snapshot.table_map?.height]);

  // Base do fit (zoom = 1). Inclui padding.
  const baseW = bbox.maxX - bbox.minX + PADDING * 2;
  const baseH = bbox.maxY - bbox.minY + PADDING * 2;
  const cxBbox = (bbox.minX + bbox.maxX) / 2;
  const cyBbox = (bbox.minY + bbox.maxY) / 2;

  // viewBox derivado do zoom em torno do centro do bbox.
  const vbW = Math.max(1, baseW / zoom);
  const vbH = Math.max(1, baseH / zoom);

  // Pan (em unidades do viewBox). Resetado quando volta pro fit ou abaixo.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (zoom <= 1.0001) setPan({ x: 0, y: 0 });
  }, [zoom]);

  // Mede o container pra calcular o slack de preserveAspectRatio="meet".
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
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

  // Com preserveAspectRatio="xMidYMid meet": scale = min(cW/vbW, cH/vbH).
  // Visível em unidades do viewBox: visW = cW/scale, visH = cH/scale.
  // O eixo com slack mostra mais que vbW/vbH — daí o clamp considera visW/visH,
  // não vbW/vbH (senão pan trava num eixo).
  const { visW, visH } = useMemo(() => {
    if (size.w === 0 || size.h === 0) return { visW: vbW, visH: vbH };
    const scale = Math.min(size.w / vbW, size.h / vbH);
    return { visW: size.w / scale, visH: size.h / scale };
  }, [size, vbW, vbH]);

  // Clamp: pan máximo é metade da folga entre base (papel total) e visível.
  const maxPanX = Math.max(0, (baseW - visW) / 2);
  const maxPanY = Math.max(0, (baseH - visH) / 2);
  const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, pan.x));
  const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, pan.y));

  // viewBox final: centro do bbox + pan, recuado meia janela visível.
  const vbX = cxBbox + clampedPanX - vbW / 2;
  const vbY = cyBbox + clampedPanY - vbH / 2;
  const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`;

  // Pan via pointer drag. Só ativo quando há folga (zoom > 1 e excede visível).
  const canPan = maxPanX > 0.5 || maxPanY > 0.5;
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!canPan) return;
    // Só inicia pan se o alvo for o próprio svg (background), não um seat.
    if (e.target !== e.currentTarget) return;
    dragRef.current = { x: e.clientX, y: e.clientY, panX: clampedPanX, panY: clampedPanY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || size.w === 0 || size.h === 0) return;
    const scale = Math.min(size.w / vbW, size.h / vbH);
    const dxUnits = (e.clientX - d.x) / scale;
    const dyUnits = (e.clientY - d.y) / scale;
    if (Math.abs(e.clientX - d.x) > 3 || Math.abs(e.clientY - d.y) > 3) d.moved = true;
    setPan({ x: d.panX - dxUnits, y: d.panY - dyUnits });
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
      dragRef.current = null;
    }
  };

  const cursor = canPan ? (dragRef.current ? 'grabbing' : 'grab') : 'default';

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${fillHeight ? 'h-full' : 'h-[70vh]'} rounded-xl border border-border bg-card/40 overflow-hidden`}
    >
      {size.w > 0 && size.h > 0 && (
        <svg
          ref={svgRef}
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          width="100%"
          height="100%"
          style={{ background: bg, display: 'block', cursor, touchAction: canPan ? 'none' : 'auto' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
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
      )}
    </div>
  );
}
