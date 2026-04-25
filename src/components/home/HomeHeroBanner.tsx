import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Instagram, ArrowRight, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PolaroidProps {
  src: string;
  alt: string;
  rotate: string;
  z: string;
  translate?: string;
  caption?: string;
  badge?: boolean;
  className?: string;
  delay?: number;
}

const Polaroid = ({
  src,
  alt,
  rotate,
  z,
  translate = '',
  caption,
  badge,
  className,
  delay = 0,
}: PolaroidProps) => (
  <motion.div
    initial={{ opacity: 0, y: 30, rotate: 0 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    className={cn(
      'absolute rounded-2xl bg-card p-3 shadow-2xl shadow-primary/20 border border-border/60',
      rotate,
      z,
      translate,
      className,
    )}
  >
    <div className="relative overflow-hidden rounded-xl">
      <img src={src} alt={alt} className="w-full h-full object-cover" />
      {badge && (
        <div className="absolute top-3 left-3 w-12 h-12 md:w-14 md:h-14 rounded-full bg-background/95 backdrop-blur-sm flex items-center justify-center shadow-lg border border-border/40">
          <span className="font-display font-extrabold text-[10px] md:text-xs gradient-text">
            FestPag!
          </span>
        </div>
      )}
      {caption && (
        <div className="absolute bottom-2 left-3">
          <span
            className="text-2xl md:text-3xl text-primary-foreground"
            style={{ fontFamily: 'Caveat, cursive' }}
          >
            {caption}
          </span>
        </div>
      )}
    </div>
  </motion.div>
);

const HomeHeroBanner = () => {
  return (
    <section className="relative overflow-hidden">
      {/* Glow decorativo de fundo — começa colado ao header */}
      <div className="pointer-events-none absolute -top-10 -left-20 w-96 h-96 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute top-10 -right-20 w-96 h-96 rounded-full bg-accent/10 blur-3xl" />

      <div className="container mx-auto px-4 pt-6 md:pt-10 pb-10 md:pb-16 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center relative">
        {/* Coluna esquerda: colagem de polaroids — apenas desktop */}
        <div className="relative hidden lg:block lg:h-[520px] order-2 lg:order-1">
          {/* Polaroid esquerda (festival/fogos) — só desktop */}
          <Polaroid
            src="https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&q=80"
            alt="Festival com fogos"
            rotate="-rotate-[10deg]"
            z="z-10"
            className="hidden lg:block left-2 sm:left-6 top-10 w-[42%] h-[70%]"
            delay={0.1}
          />

          {/* Polaroid direita (público em show) — só desktop */}
          <Polaroid
            src="https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&q=80"
            alt="Público em show"
            rotate="rotate-[8deg]"
            z="z-10"
            className="hidden lg:block right-2 sm:right-6 top-6 w-[42%] h-[70%]"
            delay={0.2}
          />

          {/* Polaroid central em destaque — visível em todos os tamanhos */}
          <Polaroid
            src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=700&q=85"
            alt="Pagamento em evento"
            rotate="rotate-0"
            z="z-20"
            badge
            caption="Pagou!"
            className="left-1/2 -translate-x-1/2 top-0 w-[70%] sm:w-[60%] lg:w-[55%] h-[95%]"
            delay={0.35}
          />
        </div>

        {/* Coluna direita: bloco textual */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="order-1 lg:order-2 relative"
        >
          <h1 className="font-display font-extrabold uppercase leading-[0.95] tracking-tight text-3xl sm:text-4xl md:text-5xl lg:text-5xl xl:text-6xl text-foreground">
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

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-full border-border/70 bg-card/40 backdrop-blur-sm hover:bg-card/70 gap-2"
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
              className="rounded-full border-border/70 bg-card/40 backdrop-blur-sm hover:bg-card/70 gap-2 group"
            >
              <Link to="/area-do-produtor/cadastro">
                Vender na FestPag
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>

          {/* Globo decorativo */}
          <div className="pointer-events-none absolute -bottom-16 -right-4 md:-right-10 opacity-60">
            <Globe className="w-24 h-24 md:w-32 md:h-32 text-primary" strokeWidth={1.2} />
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HomeHeroBanner;
