export type EventCategory = 'festa' | 'show' | 'teatro' | 'festival' | 'balada';

export interface EventData {
  id: string;
  slug?: string | null;
  title: string;
  description: string;
  shortDescription: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  state: string;
  address: string;
  category: EventCategory;
  imageUrl: string;
  minPrice: number;
  maxPrice: number;
  totalTickets: number;
  soldTickets: number;
  isHot: boolean;
  organizer: string;
  lots: EventLot[];
}

export interface EventLot {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  available: number;
  total: number;
  startDate: string;
  endDate: string;
  description?: string;
}

export const mockEvents: EventData[] = [
  {
    id: '1',
    title: 'Neon Nights Festival 2024',
    description: 'O maior festival de música eletrônica do interior paulista. Uma noite inesquecível com os melhores DJs nacionais e internacionais, cenografia de tirar o fôlego e uma experiência sensorial única.',
    shortDescription: 'O maior festival de música eletrônica do interior',
    date: '2024-12-28',
    time: '22:00',
    venue: 'Arena Multiuso',
    city: 'Rio Preto',
    state: 'SP',
    address: 'Av. Brasil, 1500 - Centro',
    category: 'festival',
    imageUrl: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800',
    minPrice: 80,
    maxPrice: 350,
    totalTickets: 5000,
    soldTickets: 3200,
    isHot: true,
    organizer: 'Neon Events',
    lots: [
      { id: '1-1', name: '1º Lote', price: 80, available: 0, total: 1000, startDate: '2024-10-01', endDate: '2024-11-01' },
      { id: '1-2', name: '2º Lote', price: 120, available: 0, total: 1500, startDate: '2024-11-01', endDate: '2024-12-01' },
      { id: '1-3', name: '3º Lote', price: 180, available: 800, total: 1500, startDate: '2024-12-01', endDate: '2024-12-28' },
      { id: '1-4', name: 'VIP', price: 350, available: 200, total: 500, startDate: '2024-10-01', endDate: '2024-12-28', description: 'Acesso área VIP + open bar' },
    ],
  },
  {
    id: '2',
    title: 'Sertanejo na Arena',
    description: 'Uma noite épica com os maiores nomes do sertanejo brasileiro. Shows ao vivo, praça de alimentação completa e estacionamento gratuito.',
    shortDescription: 'Os maiores nomes do sertanejo em uma noite',
    date: '2024-12-21',
    time: '20:00',
    venue: 'Estádio Municipal',
    city: 'Rio Preto',
    state: 'SP',
    address: 'Rua das Palmeiras, 800',
    category: 'show',
    imageUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800',
    minPrice: 60,
    maxPrice: 250,
    totalTickets: 8000,
    soldTickets: 5500,
    isHot: true,
    organizer: 'Shows Brasil',
    lots: [
      { id: '2-1', name: 'Pista', price: 60, available: 1500, total: 5000, startDate: '2024-11-01', endDate: '2024-12-21' },
      { id: '2-2', name: 'Camarote', price: 180, available: 300, total: 2000, startDate: '2024-11-01', endDate: '2024-12-21' },
      { id: '2-3', name: 'VIP Premium', price: 250, available: 200, total: 1000, startDate: '2024-11-01', endDate: '2024-12-21', description: 'Mesa + garçom exclusivo' },
    ],
  },
  {
    id: '3',
    title: 'Hamlet - O Espetáculo',
    description: 'A obra-prima de Shakespeare ganha nova vida nesta montagem contemporânea. Com direção premiada e elenco de primeira linha.',
    shortDescription: 'Shakespeare em montagem contemporânea',
    date: '2024-12-15',
    time: '19:00',
    venue: 'Teatro Municipal',
    city: 'Rio Preto',
    state: 'SP',
    address: 'Rua Álvares Cabral, 370',
    category: 'teatro',
    imageUrl: 'https://images.unsplash.com/photo-1503095396549-807759245b35?w=800',
    minPrice: 40,
    maxPrice: 120,
    totalTickets: 500,
    soldTickets: 380,
    isHot: false,
    organizer: 'Cia. Teatro Vivo',
    lots: [
      { id: '3-1', name: 'Plateia', price: 80, available: 50, total: 200, startDate: '2024-11-01', endDate: '2024-12-15' },
      { id: '3-2', name: 'Balcão', price: 40, available: 70, total: 200, startDate: '2024-11-01', endDate: '2024-12-15' },
      { id: '3-3', name: 'Camarote', price: 120, available: 0, total: 100, startDate: '2024-11-01', endDate: '2024-12-15' },
    ],
  },
  {
    id: '4',
    title: 'Noite Tropical',
    description: 'A festa que vai transformar sua noite! DJs residentes, drinks especiais e muita energia positiva. Dress code: tropical vibes.',
    shortDescription: 'A festa tropical mais quente da cidade',
    date: '2024-12-14',
    time: '23:00',
    venue: 'Club Havana',
    city: 'Rio Preto',
    state: 'SP',
    address: 'Av. Independência, 2500',
    category: 'festa',
    imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
    minPrice: 50,
    maxPrice: 150,
    totalTickets: 1200,
    soldTickets: 600,
    isHot: false,
    organizer: 'Club Havana',
    lots: [
      { id: '4-1', name: 'Pista Feminina', price: 50, available: 200, total: 400, startDate: '2024-12-01', endDate: '2024-12-14' },
      { id: '4-2', name: 'Pista Masculina', price: 70, available: 200, total: 400, startDate: '2024-12-01', endDate: '2024-12-14' },
      { id: '4-3', name: 'Área VIP', price: 150, available: 100, total: 400, startDate: '2024-12-01', endDate: '2024-12-14', description: 'Open bar até 2h' },
    ],
  },
  {
    id: '5',
    title: 'Underground Sessions',
    description: 'Para os verdadeiros amantes da música eletrônica underground. Line-up secreto revelado apenas no dia do evento.',
    shortDescription: 'Música eletrônica underground de verdade',
    date: '2024-12-20',
    time: '23:30',
    venue: 'Warehouse 77',
    city: 'Rio Preto',
    state: 'SP',
    address: 'Rua Industrial, 77',
    category: 'balada',
    imageUrl: 'https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=800',
    minPrice: 40,
    maxPrice: 80,
    totalTickets: 600,
    soldTickets: 450,
    isHot: true,
    organizer: 'Underground Collective',
    lots: [
      { id: '5-1', name: 'Early Bird', price: 40, available: 0, total: 200, startDate: '2024-11-15', endDate: '2024-12-01' },
      { id: '5-2', name: 'Regular', price: 60, available: 100, total: 300, startDate: '2024-12-01', endDate: '2024-12-20' },
      { id: '5-3', name: 'Na Porta', price: 80, available: 100, total: 100, startDate: '2024-12-20', endDate: '2024-12-20' },
    ],
  },
  {
    id: '6',
    title: 'Réveillon Cosmic 2025',
    description: 'A virada de ano mais esperada! 12 horas de festa, open bar premium, buffet completo e queima de fogos exclusiva.',
    shortDescription: 'A virada de ano mais esperada da região',
    date: '2024-12-31',
    time: '21:00',
    venue: 'Espaço Cosmos',
    city: 'Rio Preto',
    state: 'SP',
    address: 'Rod. Washington Luís, km 438',
    category: 'festa',
    imageUrl: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=800',
    minPrice: 280,
    maxPrice: 800,
    totalTickets: 2000,
    soldTickets: 1200,
    isHot: true,
    organizer: 'Cosmos Entertainment',
    lots: [
      { id: '6-1', name: 'Individual', price: 280, available: 400, total: 1000, startDate: '2024-10-01', endDate: '2024-12-31' },
      { id: '6-2', name: 'Casal', price: 500, originalPrice: 560, available: 150, total: 400, startDate: '2024-10-01', endDate: '2024-12-31' },
      { id: '6-3', name: 'Mesa VIP (6 pessoas)', price: 800, available: 100, total: 600, startDate: '2024-10-01', endDate: '2024-12-31', description: 'Mesa reservada + 3 garrafas' },
    ],
  },
];

export const categoryLabels: Record<EventCategory, string> = {
  festa: 'Festa',
  show: 'Show',
  teatro: 'Teatro',
  festival: 'Festival',
  balada: 'Balada',
};

export const categoryColors: Record<EventCategory, string> = {
  festa: 'bg-category-festa',
  show: 'bg-category-show',
  teatro: 'bg-category-teatro',
  festival: 'bg-category-festival',
  balada: 'bg-category-balada',
};
