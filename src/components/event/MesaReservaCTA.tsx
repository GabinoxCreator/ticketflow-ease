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
          {sectors && sectors.length > 0 && (
            <ul className="space-y-2 mb-4 border-t border-border/40 pt-3">
              {sectors.map((s) => {
                const extras = Math.max(0, s.maxCapacity - s.baseCapacity);
                return (
                  <li
                    key={s.seatTypeName}
                    className="flex items-start gap-2 text-sm break-words"
                  >
                    <span className="text-primary mt-1 shrink-0">•</span>
                    <span className="min-w-0">
                      <span className="font-semibold uppercase tracking-wide">
                        {s.seatTypeName}
                      </span>
                      {s.baseCapacity > 0 && (
                        <span className="text-muted-foreground">
                          {' · '}
                          {s.baseCapacity} {s.baseCapacity === 1 ? 'pessoa' : 'pessoas'}
                          {extras > 0 && ` + até ${extras} extra${extras > 1 ? 's' : ''}`}
                        </span>
                      )}
                      {/* SEM PREÇO AQUI (decisão do Gabriel, 19/08). Camarote é
                          venda negociada: o valor sai na conversa, junto com o
                          que está incluso. Preço na vitrine faz a pessoa
                          comparar número seco e desistir antes de falar com
                          alguém — e ele varia por piso e por acordo. Quem abre
                          o mapa vê o valor de cada unidade. */}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

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
