import { motion } from 'framer-motion';
import { EventData } from '@/data/mockEvents';
import EventCard from './EventCard';

interface EventGridProps {
  events: EventData[];
  title?: string;
  subtitle?: string;
}

const EventGrid = ({ events, title, subtitle }: EventGridProps) => {
  return (
    <section className="py-12">
      <div className="container px-4">
        {(title || subtitle) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            {title && (
              <h2 className="font-display font-bold text-3xl md:text-4xl mb-3">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                {subtitle}
              </p>
            )}
          </motion.div>
        )}

        {events.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event, index) => (
              <EventCard key={event.id} event={event} index={index} />
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <p className="text-muted-foreground text-lg">
              Nenhum evento encontrado nesta categoria.
            </p>
          </motion.div>
        )}
      </div>
    </section>
  );
};

export default EventGrid;
