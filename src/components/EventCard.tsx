import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, MapPin, Clock, Flame } from 'lucide-react';
import { EventData, categoryLabels } from '@/data/mockEvents';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface EventCardProps {
  event: EventData;
  index?: number;
}

const categoryColorMap: Record<string, string> = {
  festa: 'bg-[hsl(330,100%,60%)]',
  show: 'bg-[hsl(270,100%,65%)]',
  teatro: 'bg-[hsl(45,100%,55%)]',
  festival: 'bg-[hsl(180,100%,50%)]',
  balada: 'bg-[hsl(200,100%,60%)]',
};

const EventCard = ({ event, index = 0 }: EventCardProps) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    });
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const soldPercentage = Math.round((event.soldTickets / event.totalTickets) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <Link to={`/evento/${event.id}`} className="block group">
        <article className="relative bg-card rounded-2xl overflow-hidden border border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10">
          {/* Image */}
          <div className="relative aspect-[16/10] overflow-hidden">
            <img
              src={event.imageUrl}
              alt={event.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
            
            {/* Category Badge */}
            <Badge
              className={cn(
                'absolute top-3 left-3 text-xs font-medium border-0',
                categoryColorMap[event.category]
              )}
            >
              {categoryLabels[event.category]}
            </Badge>

            {/* Hot Badge */}
            {event.isHot && (
              <Badge
                className="absolute top-3 right-3 bg-destructive text-destructive-foreground border-0 gap-1"
              >
                <Flame className="w-3 h-3" />
                Hot
              </Badge>
            )}

            {/* Date Overlay */}
            <div className="absolute bottom-3 left-3 bg-background/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {new Date(event.date).toLocaleDateString('pt-BR', { weekday: 'short' })}
              </p>
              <p className="font-display font-bold text-lg leading-tight">
                {formatDate(event.date)}
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="p-4">
            <h3 className="font-display font-semibold text-lg mb-2 group-hover:text-primary transition-colors line-clamp-1">
              {event.title}
            </h3>
            
            <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
              {event.shortDescription}
            </p>

            <div className="flex flex-col gap-2 text-sm text-muted-foreground mb-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{event.venue} • {event.city}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span>{event.time}</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">{soldPercentage}% vendido</span>
                <span className="text-muted-foreground">{event.totalTickets - event.soldTickets} restantes</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-primary rounded-full transition-all duration-500"
                  style={{ width: `${soldPercentage}%` }}
                />
              </div>
            </div>

            {/* Price */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">A partir de</p>
                <p className="font-display font-bold text-xl gradient-text">
                  {formatPrice(event.minPrice)}
                </p>
              </div>
              <div className="px-4 py-2 bg-secondary rounded-lg text-sm font-medium group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                Ver Ingressos
              </div>
            </div>
          </div>
        </article>
      </Link>
    </motion.div>
  );
};

export default EventCard;
