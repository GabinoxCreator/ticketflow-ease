import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEventSeatAvailability } from '@/hooks/useEventSeatAvailability';
import { vocabularioAssento } from '@/lib/vocabularioAssento';

interface Props {
  eventId: string;
  eventSlugOrId: string;
  description?: string | null;
  /** Como o produtor chama o produto: "mesa" (padrão) ou "camarote". */
  seatNoun?: string | null;
}

export const MesaReservaCTA = ({ eventId, eventSlugOrId, description, seatNoun }: Props) => {
  const { data: sectors, isLoading } = useEventSeatAvailability(eventId);
  const v = vocabularioAssento(seatNoun);

  const totalAvailable = (sectors ?? []).reduce((a, s) => a + s.available, 0);
  const allSoldOut = !isLoading && (sectors?.length ?? 0) > 0 && totalAvailable === 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card/60 to-accent/10 backdrop-blur-xl p-4 sm:p-6 shadow-lg shadow-primary/10"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          <MapPin className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display font-bold text-lg sm:text-xl">Reserve seu {v.Singular}</h3>
          <p className="text-sm text-muted-foreground break-words">
            {description?.trim() || `Escolha ${v.artigo} ${v.singular} diretamente no mapa do local.`}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* SEM a lista de pisos (decisão do Gabriel, 20/08) — nem preço, nem
              capacidade. Camarote é venda negociada: quantas pessoas cabem e
              quanto custa saem na conversa, junto com o que está incluso.
              A lista ainda expunha detalhe operacional que muda por acordo:
              quando o produtor fechou 4 unidades com capacidade combinada, a
              vitrine passou a anunciar "PISO A · 40 pessoas" para o público
              inteiro. Quem abre o mapa vê o valor de cada unidade.
              `useEventSeatAvailability` segue aqui porque é o que sabe dizer
              se tudo esgotou. */}

          <div className="flex items-center justify-end gap-4 flex-wrap">
            {allSoldOut ? (
              <Badge variant="destructive" className="text-sm px-3 py-1.5">Esgotado</Badge>
            ) : (
              <Button asChild variant="hero" size="lg" className="w-full sm:w-auto">
                <Link to={`/evento/${eventSlugOrId}/mapa`}>
                  Ver mapa de {v.plural}
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
