import { motion } from 'framer-motion';
import { Music, Theater, Sparkles, PartyPopper, Disc } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EventCategory } from '@/data/mockEvents';

interface CategoryFilterProps {
  selectedCategory: EventCategory | null;
  onCategoryChange: (category: EventCategory | null) => void;
}

const categories: { id: EventCategory | null; label: string; icon: React.ReactNode; color: string }[] = [
  { id: null, label: 'Todos', icon: <Sparkles className="w-5 h-5" />, color: 'from-primary to-primary/70' },
  { id: 'festa', label: 'Festas', icon: <PartyPopper className="w-5 h-5" />, color: 'from-primary to-primary/70' },
  { id: 'show', label: 'Shows', icon: <Music className="w-5 h-5" />, color: 'from-brasil-azul to-brasil-azul/70' },
  { id: 'teatro', label: 'Teatro', icon: <Theater className="w-5 h-5" />, color: 'from-accent to-accent/70' },
  { id: 'festival', label: 'Festivais', icon: <Sparkles className="w-5 h-5" />, color: 'from-primary/80 to-primary/60' },
  { id: 'balada', label: 'Baladas', icon: <Disc className="w-5 h-5" />, color: 'from-[hsl(280,60%,50%)] to-[hsl(280,60%,40%)]' },
];

const CategoryFilter = ({ selectedCategory, onCategoryChange }: CategoryFilterProps) => {
  return (
    <section className="py-8" id="categorias">
      <div className="container px-4">
        <div className="flex flex-wrap justify-center gap-3">
          {categories.map((category, index) => (
            <motion.button
              key={category.id ?? 'all'}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onCategoryChange(category.id)}
              className={cn(
                'flex items-center gap-2 px-5 py-3 rounded-full font-medium transition-all duration-300',
                selectedCategory === category.id
                  ? `bg-gradient-to-r ${category.color} text-white shadow-lg`
                  : 'bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent hover:border-border'
              )}
            >
              {category.icon}
              <span>{category.label}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CategoryFilter;
