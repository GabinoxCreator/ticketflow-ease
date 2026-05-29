import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TableStatus = 'available' | 'held' | 'sold' | 'blocked' | 'manual';

export interface EventTableRow {
  id: string;
  event_id: string;
  code: string | null;
  label: string | null;
  status: TableStatus;
  color: string | null;
  shape: string | null;
  seat_type_name: string | null;
  base_capacity: number | null;
  max_capacity: number | null;
  base_price: number | null;
  extra_price: number | null;
  sold_order_id: string | null;
  order_id: string | null;
  hold_expires_at: string | null;
  manually_closed_at: string | null;
  manual_close_reason: string | null;
  manual_holder_name: string | null;
  manual_holder_phone: string | null;
  manual_holder_notes: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  order_total: number | null;
  order_paid_at: string | null;
}

/** "Disponível na prática": available, ou held com hold já expirado (gate do hold_seats). */
export function isEffectivelyAvailable(row: Pick<EventTableRow, 'status' | 'hold_expires_at'>): boolean {
  if (row.status === 'available') return true;
  if (row.status === 'held' && row.hold_expires_at && new Date(row.hold_expires_at).getTime() < Date.now()) {
    return true;
  }
  return false;
}

interface OrderRow {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  total_amount: number | null;
  updated_at: string | null;
  status: string | null;
}

const SEAT_COLS =
  'id,event_id,code,label,status,color,shape,seat_type_name,' +
  'base_capacity,max_capacity,base_price,extra_price,' +
  'sold_order_id,order_id,hold_expires_at,' +
  'manually_closed_at,manual_close_reason,' +
  'manual_holder_name,manual_holder_phone,manual_holder_notes';

export function useEventTables(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-tables', eventId],
    enabled: !!eventId,
    queryFn: async (): Promise<EventTableRow[]> => {
      const { data: seats, error } = await supabase
        .from('event_seats')
        .select(SEAT_COLS)
        .eq('event_id', eventId!);
      if (error) throw error;

      const seatRows = (seats ?? []) as unknown as Array<Omit<EventTableRow,
        'customer_name' | 'customer_email' | 'customer_phone' | 'order_total' | 'order_paid_at'>>;

      const orderIds = Array.from(
        new Set(
          seatRows
            .map((s) => s.sold_order_id ?? s.order_id)
            .filter((v): v is string => !!v),
        ),
      );

      let ordersById = new Map<string, OrderRow>();
      if (orderIds.length > 0) {
        const { data: orders, error: ordErr } = await supabase
          .from('orders')
          .select('id,customer_name,customer_email,customer_phone,total_amount,updated_at,status')
          .in('id', orderIds);
        if (ordErr) throw ordErr;
        ordersById = new Map((orders ?? []).map((o) => [o.id as string, o as OrderRow]));
      }

      return seatRows.map((s) => {
        const oid = s.sold_order_id ?? s.order_id;
        const o = oid ? ordersById.get(oid) : undefined;
        return {
          ...s,
          customer_name: o?.customer_name ?? null,
          customer_email: o?.customer_email ?? null,
          customer_phone: o?.customer_phone ?? null,
          order_total: o?.total_amount ?? null,
          order_paid_at: o?.status === 'paid' ? o?.updated_at ?? null : null,
        };
      });
    },
  });
}
