import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';
import { DndContext, DragEndEvent, MouseSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { MousePointer2, Hand, ZoomIn, ZoomOut, Maximize2, Magnet } from 'lucide-react';
import DraggableSeat, { type EditorSeat, type SeatTypeLite } from './DraggableSeat';
import DraggableObject, { MapObject } from './DraggableObject';
import { cn } from '@/lib/utils';
import { calculateBounds, calculateFitView } from '@/lib/calculateFitView';
import { snap } from '@/lib/snap';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export type SelectionKey = string; // "s:<id>" or "o:<id>"
export const sKey = (id: string) => `s:${id}`;
export const oKey = (id: string) => `o:${id}`;

interface EditorCanvasProps {
  seats: EditorSeat[];
  objects: MapObject[];
  seatTypesById: Record<string, SeatTypeLite>;
  selectedIds: Set<SelectionKey>;
  onSelectionChange: (ids: Set<SelectionKey>) => void;
  onBeginGroupDrag: () => void;
  onApplyGroupDelta: (dx: number, dy: number) => void;
  onUpdateObjectSize?: (id: string, width: number, height: number) => void;
  onUpdateObjectPosition?: (id: string, x: number, y: number) => void;
  onDeleteSelected: () => void;
  onDuplicateSelected?: () => void;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  readOnly?: boolean;
}

type Tool = 'select' | 'pan';

export default function EditorCanvas({
  seats,
  objects,
  seatTypesById,
  selectedIds,
  onSelectionChange,
  onBeginGroupDrag,
  onApplyGroupDelta,
  onUpdateObjectSize,
  onUpdateObjectPosition,
  onDeleteSelected,
  onDuplicateSelected,
  canvasWidth,
  canvasHeight,
  backgroundColor,
  readOnly = false,
}: EditorCanvasProps) {
  const [tool, setTool] = useState<Tool>('select');
  const [zoom, setZoom] = useState(0.6);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [initialized, setInitialized] = useState(false);
  const [snapSize, setSnapSize] = useState<number>(10);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const [marquee, setMarquee] = useState<null | {
    startX: number; startY: number; curX: number; curY: number; additive: boolean;
  }>(null);

  const effectiveSnap = snapEnabled ? snapSize : 0;

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 5 } });
  const sensors = useSensors(mouseSensor);

  useLayoutEffect(() => {
    if (!initialized && containerRef.current) {
      const hasContent = seats.length > 0 || objects.length > 0;
      if (hasContent) {
        const allItems = [
          ...seats.map(s => ({ x: s.x, y: s.y, width: s.width, height: s.height })),
          ...objects.map(o => ({ x: o.x, y: o.y, width: o.width, height: o.height })),
        ];
        const bounds = calculateBounds(allItems);
        const { zoom: fitZoom, panX, panY } = calculateFitView(
          bounds, containerRef.current.clientWidth, containerRef.current.clientHeight,
          80, 0.2, 1
        );
        setZoom(fitZoom);
        setPanOffset({ x: panX, y: panY });
      }
      setInitialized(true);
    }
  }, [seats, objects, initialized]);

  const handleFitToView = useCallback(() => {
    if (!containerRef.current) return;
    if (seats.length === 0 && objects.length === 0) return;
    const allItems = [
      ...seats.map(s => ({ x: s.x, y: s.y, width: s.width, height: s.height })),
      ...objects.map(o => ({ x: o.x, y: o.y, width: o.width, height: o.height })),
    ];
    const bounds = calculateBounds(allItems);
    const { zoom: fitZoom, panX, panY } = calculateFitView(
      bounds, containerRef.current.clientWidth, containerRef.current.clientHeight,
      80, 0.2, 1
    );
    setZoom(fitZoom);
    setPanOffset({ x: panX, y: panY });
  }, [seats, objects]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (readOnly) return;
    const { active, delta } = event;
    if (!active) return;
    const seatId = String(active.id);
    if (!selectedIds.has(sKey(seatId))) {
      onSelectionChange(new Set([sKey(seatId)]));
      setTimeout(() => {
        onBeginGroupDrag();
        const shift = (window as any).__lastShiftHeld === true;
        const grid = shift ? 0 : effectiveSnap;
        const dx = snap(delta.x / zoom, grid);
        const dy = snap(delta.y / zoom, grid);
        onApplyGroupDelta(dx, dy);
      }, 0);
      return;
    }
    onBeginGroupDrag();
    const shift = (window as any).__lastShiftHeld === true;
    const grid = shift ? 0 : effectiveSnap;
    const dx = snap(delta.x / zoom, grid);
    const dy = snap(delta.y / zoom, grid);
    onApplyGroupDelta(dx, dy);
  }, [zoom, effectiveSnap, selectedIds, onSelectionChange, onBeginGroupDrag, onApplyGroupDelta, readOnly]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      (window as any).__lastShiftHeld = e.shiftKey;
      if (readOnly) return;
      const target = e.target as HTMLElement | null;
      const inField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === 'Escape') {
        onSelectionChange(new Set());
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        if (inField) return;
        e.preventDefault();
        onDeleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D') && selectedIds.size > 0) {
        if (inField) return;
        e.preventDefault();
        onDuplicateSelected?.();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { (window as any).__lastShiftHeld = e.shiftKey; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [selectedIds, onSelectionChange, onDeleteSelected, onDuplicateSelected, readOnly]);

  const clientToCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
  }, [zoom]);

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    if (tool === 'pan') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      return;
    }
    if (readOnly) return;
    const target = e.target as HTMLElement;
    if (!target.dataset || target.dataset.canvasBg !== 'true') return;
    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    setMarquee({ startX: x, startY: y, curX: x, curY: y, additive: e.shiftKey || e.metaKey || e.ctrlKey });
    if (!(e.shiftKey || e.metaKey || e.ctrlKey)) onSelectionChange(new Set());
  };

  const handleContainerMouseMove = (e: React.MouseEvent) => {
    if (isPanning && tool === 'pan') {
      setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }
    if (marquee) {
      const { x, y } = clientToCanvas(e.clientX, e.clientY);
      setMarquee({ ...marquee, curX: x, curY: y });
    }
  };

  const handleContainerMouseUp = () => {
    setIsPanning(false);
    if (marquee) {
      const x1 = Math.min(marquee.startX, marquee.curX);
      const x2 = Math.max(marquee.startX, marquee.curX);
      const y1 = Math.min(marquee.startY, marquee.curY);
      const y2 = Math.max(marquee.startY, marquee.curY);
      const intersects = (ix: number, iy: number, iw: number, ih: number) =>
        ix < x2 && ix + iw > x1 && iy < y2 && iy + ih > y1;

      const next = new Set<SelectionKey>(marquee.additive ? selectedIds : []);
      seats.forEach(s => { if (intersects(s.x, s.y, s.width, s.height)) next.add(sKey(s.id)); });
      objects.forEach(o => {
        const h = o.object_type === 'line' ? Math.max(12, o.stroke_width || 2) : o.height;
        if (intersects(o.x, o.y, o.width, h)) next.add(oKey(o.id));
      });
      if (Math.abs(marquee.curX - marquee.startX) > 3 || Math.abs(marquee.curY - marquee.startY) > 3) {
        onSelectionChange(next);
      }
      setMarquee(null);
    }
  };

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.max(0.2, Math.min(2, prev + delta)));
  };

  const handleItemClick = (key: SelectionKey, additive: boolean) => {
    if (readOnly) {
      onSelectionChange(new Set([key]));
      return;
    }
    if (additive) {
      const next = new Set(selectedIds);
      if (next.has(key)) next.delete(key); else next.add(key);
      onSelectionChange(next);
    } else {
      if (selectedIds.size === 1 && selectedIds.has(key)) return;
      onSelectionChange(new Set([key]));
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-muted/50 overflow-hidden">
      <div className="flex items-center gap-2 p-2 bg-card border-b flex-wrap">
        <Button variant={tool === 'select' ? 'default' : 'ghost'} size="sm" onClick={() => setTool('select')}>
          <MousePointer2 className="w-4 h-4" />
        </Button>
        <Button variant={tool === 'pan' ? 'default' : 'ghost'} size="sm" onClick={() => setTool('pan')}>
          <Hand className="w-4 h-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-2" />

        <Button variant="ghost" size="sm" onClick={() => handleZoom(-0.1)}>
          <ZoomOut className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium min-w-[50px] text-center">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="sm" onClick={() => handleZoom(0.1)}>
          <ZoomIn className="w-4 h-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-2" />

        <Button variant="ghost" size="sm" onClick={handleFitToView} title="Ajustar à visualização">
          <Maximize2 className="w-4 h-4" />
        </Button>

        {!readOnly && (
          <>
            <div className="w-px h-6 bg-border mx-2" />
            <Button
              variant={snapEnabled ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSnapEnabled(v => !v)}
              title="Snap to grid (segure Shift para desativar temporariamente)"
            >
              <Magnet className="w-4 h-4" />
            </Button>
            <Select value={String(snapSize)} onValueChange={(v) => setSnapSize(Number(v))}>
              <SelectTrigger className="h-8 w-[90px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5px</SelectItem>
                <SelectItem value="10">10px</SelectItem>
                <SelectItem value="25">25px</SelectItem>
                <SelectItem value="50">50px</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}

        {selectedIds.size > 1 && !readOnly && (
          <>
            <div className="w-px h-6 bg-border mx-2" />
            <span className="text-xs text-muted-foreground">
              {selectedIds.size} itens selecionados · Shift+clique para alternar · Del para excluir
            </span>
          </>
        )}
      </div>

      <div
        ref={containerRef}
        className={cn(
          "flex-1 overflow-hidden relative",
          tool === 'pan' && "cursor-grab",
          isPanning && "cursor-grabbing",
          tool === 'select' && !marquee && "cursor-default"
        )}
        onMouseDown={handleContainerMouseDown}
        onMouseMove={handleContainerMouseMove}
        onMouseUp={handleContainerMouseUp}
        onMouseLeave={handleContainerMouseUp}
      >
        <div
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transformOrigin: 'top left',
          }}
          className="absolute"
        >
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div
              ref={canvasRef}
              data-canvas-bg="true"
              className="relative border-2 border-dashed border-border shadow-lg"
              style={{ width: canvasWidth, height: canvasHeight, backgroundColor }}
            >
              <div
                data-canvas-bg="true"
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                  backgroundImage: `
                    linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px),
                    linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)
                  `,
                  backgroundSize: '50px 50px',
                }}
              />

              {objects.map((obj) => (
                <DraggableObject
                  key={obj.id}
                  object={obj}
                  isSelected={selectedIds.has(oKey(obj.id))}
                  onSelect={(additive) => handleItemClick(oKey(obj.id), additive)}
                  onBeginGroupDrag={onBeginGroupDrag}
                  onApplyGroupDelta={onApplyGroupDelta}
                  onSizeChange={onUpdateObjectSize ? (w, h) => onUpdateObjectSize(obj.id, w, h) : undefined}
                  onPositionChange={onUpdateObjectPosition ? (x, y) => onUpdateObjectPosition(obj.id, x, y) : undefined}
                  zoom={zoom}
                  snapSize={effectiveSnap}
                  disabled={readOnly}
                />
              ))}

              {seats.map((seat) => (
                <DraggableSeat
                  key={seat.id}
                  seat={seat}
                  seatType={seatTypesById[seat.seat_type_id]}
                  isSelected={selectedIds.has(sKey(seat.id))}
                  onSelect={(additive) => handleItemClick(sKey(seat.id), additive)}
                  disabled={readOnly}
                />
              ))}

              {marquee && (
                <div
                  className="absolute pointer-events-none border-2 border-dashed border-primary bg-primary/10"
                  style={{
                    left: Math.min(marquee.startX, marquee.curX),
                    top: Math.min(marquee.startY, marquee.curY),
                    width: Math.abs(marquee.curX - marquee.startX),
                    height: Math.abs(marquee.curY - marquee.startY),
                  }}
                />
              )}
            </div>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
