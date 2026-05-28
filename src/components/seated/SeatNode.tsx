import React from 'react';
import type { EventSeatRow } from '@/hooks/useEventSeats';

export type VStatus = 'available' | 'selected-mine' | 'held-other' | 'sold' | 'blocked';

const CLICKABLE: VStatus[] = ['available', 'selected-mine'];

interface Props {
  seat: EventSeatRow;
  vstatus: VStatus;
  onToggle: (seatId: string) => void;
}

function statusFill(vstatus: VStatus, seatColor: string | null): string {
  switch (vstatus) {
    case 'available':
      return seatColor || 'hsl(var(--seat-available))';
    case 'selected-mine':
      return 'hsl(var(--seat-selected))';
    case 'held-other':
      return 'hsl(var(--seat-held))';
    case 'sold':
      return 'hsl(var(--seat-sold))';
    case 'blocked':
      return 'hsl(var(--muted))';
  }
}

function SeatNodeImpl({ seat, vstatus, onToggle }: Props) {
  const clickable = CLICKABLE.includes(vstatus);
  const fill = statusFill(vstatus, seat.color);
  const cursor = clickable ? 'pointer' : 'not-allowed';
  const opacity = vstatus === 'blocked' || vstatus === 'sold' ? 0.55 : 1;

  const handleClick = clickable ? () => onToggle(seat.id) : undefined;

  const cx = (seat.x ?? 0) + (seat.width ?? seat.radius ? (seat.width ?? (seat.radius ?? 16) * 2) / 2 : 0);
  const cy = (seat.y ?? 0) + (seat.height ?? seat.radius ? (seat.height ?? (seat.radius ?? 16) * 2) / 2 : 0);

  const isCircle = seat.shape === 'circle';
  const w = seat.width ?? (seat.radius ?? 16) * 2;
  const h = seat.height ?? (seat.radius ?? 16) * 2;
  const transform = `rotate(${seat.rotation || 0} ${cx} ${cy})`;

  return (
    <g
      onClick={handleClick}
      style={{ cursor, opacity }}
      data-status={vstatus}
      data-seat-id={seat.id}
      transform={transform}
    >
      {isCircle ? (
        <circle
          cx={cx}
          cy={cy}
          r={seat.radius ?? Math.min(w, h) / 2}
          fill={fill}
          stroke="hsl(var(--border))"
          strokeWidth={1}
        />
      ) : (
        <rect
          x={seat.x ?? 0}
          y={seat.y ?? 0}
          width={w}
          height={h}
          rx={6}
          ry={6}
          fill={fill}
          stroke="hsl(var(--border))"
          strokeWidth={1}
        />
      )}
      {seat.label && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={11}
          fontWeight={600}
          fill="hsl(var(--foreground))"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {seat.label}
        </text>
      )}
    </g>
  );
}

export const SeatNode = React.memo(
  SeatNodeImpl,
  (a, b) =>
    a.vstatus === b.vstatus &&
    a.seat.status === b.seat.status &&
    a.seat.held_by_user_id === b.seat.held_by_user_id &&
    a.seat.color === b.seat.color &&
    a.seat.label === b.seat.label &&
    a.onToggle === b.onToggle
);
