import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEventSeatAvailability } from '@/hooks/useEventSeatAvailability';

interface Props {
  eventId: string;
  eventSlugOrId: string;
}

const formatPrice = (price: number) =>
  price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const MesaReservaCTA = ({ eventId, eventSlugOrId }: Props) => {
  const { data: sectors, isLoading } = useEventSeatAvailability(eventId);

  const totalAvailable = (sectors ?? []).reduce((a, s) => a + s.available, 0);
  const fromPrice = (sectors ?? [])
    .filter((s) => s.basePrice > 0)
    .reduce<number | null>((min, s) => (min === null ? s.basePrice : Math.min(min, s.basePrice)), null);

  const allSoldOut = !isLoading && (sectors?.length ?? 0) > 0 && totalAvailable === 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card/60 to-accent/10 backdrop-blur-xl p-6 shadow-lg shadow-primary/10"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          <MapPin className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display font-bold text-xl">Reserve sua Mesa</h3>
          <p className="text-sm text-muted-foreground">Escolha sua mesa diretamente no mapa do local</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {sectors && sectors.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {sectors.map((s) => (
                <Badge
                  key={s.seatTypeName}
                  variant={s.available === 0 ? 'secondary' : 'outline'}
                  className="text-xs px-3 py-1.5"
                >
                  {s.seatTypeName} · {s.available}/{s.total} disponíveis
                </Badge>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-4 flex-wrap">
            {fromPrice !== null ? (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">A partir de</p>
                <p className="font-bold text-2xl">{formatPrice(fromPrice)}</p>
              </div>
            ) : (
              <div />
            )}

            {allSoldOut ? (
              <Badge variant="destructive" className="text-sm px-3 py-1.5">Esgotado</Badge>
            ) : (
              <Button asChild variant="hero" size="lg">
                <Link to={`/evento/${eventSlugOrId}/mapa`}>
                  Ver Mapa de Mesas
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            )}
          </div>
        </>
      )}
    </motion.section>
  );
};

export default MesaReservaCTA;
