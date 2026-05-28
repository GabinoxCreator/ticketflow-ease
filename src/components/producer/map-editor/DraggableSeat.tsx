import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Users } from 'lucide-react';

export interface EditorSeat {
  id: string;                       // 'temp-xxx' para novos
  seat_type_id: string;
  code: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  // overrides opcionais — null/undefined = usa o valor do seat_type
  custom_base_capacity: number | null;
  custom_max_capacity: number | null;
  custom_base_price: number | null;
  custom_extra_price: number | null;
}

export interface SeatTypeLite {
  id: string;
  name: string;
  base_capacity: number;
  max_capacity: number;
  base_price: number;
  extra_price: number;
  shape: 'rect' | 'circle';
  default_color: string | null;
  default_width: number;
  default_height: number;
}

interface DraggableSeatProps {
  seat: EditorSeat;
  seatType: SeatTypeLite | undefined;
  isSelected: boolean;
  onSelect: (additive: boolean) => void;
  disabled?: boolean;               // read-only mode
}

export default function DraggableSeat({
  seat,
  seatType,
  isSelected,
  onSelect,
  disabled = false,
}: DraggableSeatProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: seat.id,
    disabled,
  });

  const shape = seatType?.shape ?? 'rect';
  const color = seatType?.default_color ?? '#6366f1';
  const baseCap = seat.custom_base_capacity ?? seatType?.base_capacity ?? 1;
  const maxCap = seat.custom_max_capacity ?? seatType?.max_capacity ?? 1;
  const isCircle = shape === 'circle';

  const style: React.CSSProperties = {
    position: 'absolute',
    left: seat.x,
    top: seat.y,
    width: seat.width,
    height: seat.height,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 1000 : isSelected ? 100 : 1,
    cursor: disabled ? 'default' : isDragging ? 'grabbing' : 'grab',
    borderColor: color,
    color: color,
    backgroundColor: `${color}1a`, // ~10% alpha
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(disabled ? {} : listeners)}
      {...(disabled ? {} : attributes)}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onSelect(e.shiftKey || e.metaKey || e.ctrlKey);
      }}
      className={cn(
        'flex flex-col items-center justify-center border-2 transition-all select-none',
        isCircle ? 'rounded-full' : 'rounded-lg',
        isSelected && 'ring-2 ring-offset-2 ring-primary shadow-lg',
        isDragging && 'opacity-75 shadow-xl'
      )}
    >
      <div className="flex items-center gap-1">
        <Users className="w-3 h-3" />
        <span className="font-bold text-xs">{seat.code}</span>
      </div>
      <span className="text-[10px] opacity-75 truncate max-w-full px-1">
        {baseCap}-{maxCap}p
      </span>
    </div>
  );
}
