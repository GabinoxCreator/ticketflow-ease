import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Instagram, ArrowRight, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';

const HomeHeroBanner = () => {
  return (
    <section className="relative overflow-hidden">
      {/* Glow decorativo de fundo */}
      <div className="pointer-events-none absolute -top-10 -left-20 w-96 h-96 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute top-10 -right-20 w-96 h-96 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-64 rounded-full bg-primary/10 blur-3xl" />

      <div className="container mx-auto px-4 pt-10 md:pt-16 pb-14 md:pb-20 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="max-w-4xl mx-auto text-center relative"
        >
          <h1 className="font-display font-extrabold uppercase leading-[0.95] tracking-tight text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl text-foreground">
            Somos a rede de
            <br />
            <span className="gradient-text">pagamentos</span> e serviços
            <br />
            focados em{' '}
            <span
              className="text-[hsl(85,80%,60%)] italic font-bold"
              style={{ fontFamily: 'Caveat, cursive' }}
            >
              grandes eventos
            </span>
          </h1>

          {/* CTAs centralizados */}
          <div className="flex flex-col sm:flex-row gap-3 mt-10 justify-center items-center">
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-full border-border/70 bg-card/40 backdrop-blur-sm hover:bg-card/70 gap-2 w-full sm:w-auto"
            >
              <a href="#eventos">
                Explorar festivais
                <Instagram className="w-4 h-4" />
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-full border-border/70 bg-card/40 backdrop-blur-sm hover:bg-card/70 gap-2 group w-full sm:w-auto"
            >
              <Link to="/area-do-produtor/cadastro">
                Vender na FestPag
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>

          {/* Globo decorativo sutil */}
          <Globe
            className="pointer-events-none absolute -bottom-20 right-0 md:right-4 w-20 h-20 md:w-28 md:h-28 text-primary opacity-30"
            strokeWidth={1.2}
          />
        </motion.div>
      </div>
    </section>
  );
};

export default HomeHeroBanner;
