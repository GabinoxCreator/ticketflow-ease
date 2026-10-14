// Do evento do banco para o cartão da vitrine (EventCard).
// Saiu da home em 13/10/2026 (OS-219) para a página do produtor mostrar o
// cartão igual, com o mesmo "a partir de".
import type { Event } from '@/hooks/useEvents';
import type { EventCategory, EventData } from '@/data/mockEvents';
import { isLotEnded, isLotOpenForSale, type LotForAvailability } from '@/lib/lot-availability';

export function eventoParaCard(event: Event): EventData {
  const lots = event.event_lots || [];
  // "A partir de" sai dos lotes à venda agora, com a mesma regra da página do
  // evento: lote com data de fim vencida não anuncia preço. Se nenhum abriu
  // ainda (o 1º lote abre amanhã), mostra o preço do que vai abrir, nunca o de
  // lote já encerrado.
  const abertos = lots.filter((lot: any) => isLotOpenForSale(lot, lots as LotForAvailability[]));
  const activeLots = abertos.length > 0
    ? abertos
    : lots.filter((lot: any) => lot.is_active && !isLotEnded(lot));
  const prices = activeLots.map((lot: any) => lot.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const totalTickets = lots.reduce((acc: number, lot: any) => acc + lot.total_quantity, 0);
  const soldTickets = lots.reduce((acc: number, lot: any) => acc + lot.sold_quantity, 0);

  return {
    id: event.id,
    slug: event.slug ?? null,
    title: event.title,
    description: event.description || '',
    shortDescription: event.short_description || '',
    date: event.date,
    time: event.time,
    venue: event.venue,
    city: event.city,
    state: event.state,
    address: event.address || '',
    category: event.category as EventCategory,
    imageUrl: event.image_url || 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800',
    minPrice,
    maxPrice,
    totalTickets,
    soldTickets,
    isHot: event.is_hot || false,
    organizer: 'Produtor',
    lots: lots.map((lot: any) => ({
      id: lot.id,
      name: lot.name,
      price: lot.price,
      originalPrice: lot.original_price,
      available: lot.total_quantity - lot.sold_quantity - (lot.reserved_quantity || 0),
      total: lot.total_quantity,
      startDate: '',
      endDate: '',
    })),
  };
}
