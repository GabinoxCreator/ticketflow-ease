import { useRef, useState } from 'react';
import { getMapIcon } from '@/lib/mapIcons';
import { snap } from '@/lib/snap';

export interface MapObject {
  id: string;
  table_map_id?: string;
  object_type: 'text' | 'rect' | 'circle' | 'line' | 'image' | 'icon';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  text_content?: string;
  font_size?: number;
  fill_color: string;
  stroke_color: string;
  stroke_width: number;
  is_active?: boolean;
  image_url?: string;
}

interface ResizeHandleProps {
  position: 'nw' | 'ne' | 'sw' | 'se';
  onResizeStart: (e: React.MouseEvent, position: 'nw' | 'ne' | 'sw' | 'se') => void;
}

function ResizeHandle({ position, onResizeStart }: ResizeHandleProps) {
  const positionStyles: Record<string, string> = {
    nw: '-top-1.5 -left-1.5 cursor-nwse-resize',
    ne: '-top-1.5 -right-1.5 cursor-nesw-resize',
    sw: '-bottom-1.5 -left-1.5 cursor-nesw-resize',
    se: '-bottom-1.5 -right-1.5 cursor-nwse-resize',
  };

  return (
    <div
      className={`absolute w-3 h-3 bg-primary border-2 border-white rounded-sm shadow-md z-10 ${positionStyles[position]}`}
      onMouseDown={(e) => onResizeStart(e, position)}
    />
  );
}

interface DraggableObjectProps {
  object: MapObject;
  isSelected: boolean;
  onSelect: (additive: boolean) => void;
  onBeginGroupDrag: () => void;
  onApplyGroupDelta: (dx: number, dy: number) => void;
  onSizeChange?: (width: number, height: number) => void;
  onPositionChange?: (x: number, y: number) => void;
  zoom: number;
  snapSize: number;
  disabled?: boolean;
}

export default function DraggableObject({
  object,
  isSelected,
  onSelect,
  onBeginGroupDrag,
  onApplyGroupDelta,
  onSizeChange,
  onPositionChange,
  zoom,
  snapSize,
  disabled = false,
}: DraggableObjectProps) {
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const resizePosition = useRef<'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const elementStart = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;
    e.stopPropagation();
    e.preventDefault();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (!isSelected) onSelect(additive);

    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    elementStart.current = { x: object.x, y: object.y, width: object.width, height: object.height };
    queueMicrotask(() => onBeginGroupDrag());

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return;
      const grid = moveEvent.shiftKey ? 0 : snapSize;
      const rawDx = (moveEvent.clientX - dragStart.current.x) / zoom;
      const rawDy = (moveEvent.clientY - dragStart.current.y) / zoom;
      const dx = snap(rawDx, grid);
      const dy = snap(rawDy, grid);
      onApplyGroupDelta(dx, dy);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (disabled) return;
    e.stopPropagation();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (additive) onSelect(true);
  };

  const handleResizeStart = (e: React.MouseEvent, position: 'nw' | 'ne' | 'sw' | 'se') => {
    if (disabled) return;
    e.stopPropagation();
    e.preventDefault();
    isResizing.current = true;
    resizePosition.current = position;
    dragStart.current = { x: e.clientX, y: e.clientY };
    elementStart.current = { x: object.x, y: object.y, width: object.width, height: object.height };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current || !onSizeChange) return;
      const grid = moveEvent.shiftKey ? 0 : snapSize;

      const rawDx = (moveEvent.clientX - dragStart.current.x) / zoom;
      const rawDy = (moveEvent.clientY - dragStart.current.y) / zoom;
      const deltaX = snap(rawDx, grid);
      const deltaY = snap(rawDy, grid);

      let newWidth = elementStart.current.width;
      let newHeight = elementStart.current.height;
      let newX = elementStart.current.x;
      let newY = elementStart.current.y;

      switch (resizePosition.current) {
        case 'se':
          newWidth = Math.max(20, elementStart.current.width + deltaX);
          newHeight = Math.max(10, elementStart.current.height + deltaY);
          break;
        case 'sw':
          newWidth = Math.max(20, elementStart.current.width - deltaX);
          newHeight = Math.max(10, elementStart.current.height + deltaY);
          newX = elementStart.current.x + (elementStart.current.width - newWidth);
          break;
        case 'ne':
          newWidth = Math.max(20, elementStart.current.width + deltaX);
          newHeight = Math.max(10, elementStart.current.height - deltaY);
          newY = elementStart.current.y + (elementStart.current.height - newHeight);
          break;
        case 'nw':
          newWidth = Math.max(20, elementStart.current.width - deltaX);
          newHeight = Math.max(10, elementStart.current.height - deltaY);
          newX = elementStart.current.x + (elementStart.current.width - newWidth);
          newY = elementStart.current.y + (elementStart.current.height - newHeight);
          break;
      }

      if (object.object_type === 'circle') {
        const size = Math.max(newWidth, newHeight);
        newWidth = size;
        newHeight = size;
      }
      if (object.object_type === 'line') {
        newHeight = object.stroke_width || 2;
      }

      if (onPositionChange && (newX !== object.x || newY !== object.y)) {
        onPositionChange(newX, newY);
      }
      onSizeChange(newWidth, newHeight);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      resizePosition.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const renderObject = () => {
    switch (object.object_type) {
      case 'text':
        return (
          <div style={{
            fontSize: object.font_size || 16,
            color: object.fill_color === 'transparent' ? '#374151' : object.fill_color,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
            lineHeight: 1.2,
          }}>
            {object.text_content || 'Texto'}
          </div>
        );
      case 'rect':
        return (
          <div style={{
            width: object.width,
            height: object.height,
            backgroundColor: object.fill_color,
            border: `${object.stroke_width}px solid ${object.stroke_color}`,
            borderRadius: 4,
          }} />
        );
      case 'circle':
        return (
          <div style={{
            width: object.width,
            height: object.width,
            backgroundColor: object.fill_color,
            border: `${object.stroke_width}px solid ${object.stroke_color}`,
            borderRadius: '50%',
          }} />
        );
      case 'line':
        return (
          <div style={{
            width: object.width,
            height: object.stroke_width || 2,
            backgroundColor: object.stroke_color,
          }} />
        );
      case 'image':
        return (
          <div style={{
            width: object.width,
            height: object.height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
            overflow: 'hidden',
          }}>
            {object.image_url ? (
              <img src={object.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                backgroundColor: '#e5e7eb',
                border: '2px dashed #9ca3af',
                borderRadius: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: '#6b7280',
              }}>Carregando...</div>
            )}
          </div>
        );
      case 'icon': {
        const IconComponent = getMapIcon(object.text_content || '');
        return IconComponent ? (
          <div style={{
            width: object.width,
            height: object.height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: object.fill_color === 'transparent' ? '#6b7280' : object.fill_color,
          }}>
            <IconComponent style={{ width: '100%', height: '100%' }} />
          </div>
        ) : null;
      }
      default:
        return null;
    }
  };

  const boxW = object.width;
  const boxH = object.object_type === 'line' ? Math.max(4, object.stroke_width || 2) : object.object_type === 'circle' ? object.width : object.height;

  return (
    <div
      style={{
        position: 'absolute',
        left: object.x,
        top: object.y,
        transform: `rotate(${object.rotation}deg)`,
        cursor: disabled ? 'default' : 'move',
      }}
      className="group"
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {(isHovered || isSelected) && !disabled && (
        <div
          className="absolute rounded transition-colors pointer-events-none"
          style={{
            left: -4,
            top: -4,
            width: boxW + 8,
            height: boxH + 8,
            backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
            border: isSelected ? '2px solid hsl(var(--primary))' : '1px dashed rgba(59, 130, 246, 0.3)',
          }}
        />
      )}

      <div style={{ position: 'relative' }}>{renderObject()}</div>

      {isSelected && onSizeChange && !disabled && (
        <>
          <ResizeHandle position="nw" onResizeStart={handleResizeStart} />
          <ResizeHandle position="ne" onResizeStart={handleResizeStart} />
          <ResizeHandle position="sw" onResizeStart={handleResizeStart} />
          <ResizeHandle position="se" onResizeStart={handleResizeStart} />
        </>
      )}
    </div>
  );
}
