import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Instagram, ArrowRight, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';

const HomeHeroBanner = () => {
  return (
    <section className="relative overflow-hidden">
      {/* Glow decorativo de fundo */}
      {/* Manchas de cor do fundo. No tema escuro 10-15% já dava profundidade;
        * sobre o fundo claro o mesmo valor some por completo, então aqui elas
        * são mais encorpadas. (virada de 24/09/2026) */}
      <div className="pointer-events-none absolute -top-10 -left-20 h-96 w-96 rounded-full bg-primary/25 blur-3xl" />
      <div className="pointer-events-none absolute top-10 -right-20 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />

      <div className="container relative mx-auto px-4 pb-10 pt-8 md:pb-14 md:pt-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="max-w-4xl mx-auto text-center relative"
        >
          {/* Corpo reduzido em 24/09: desde que o carrossel virou o primeiro
            * bloco, esta frase deixou de ser a abertura da página. Grande como
            * era, competia com a arte dos eventos logo acima. */}
          <h1 className="font-display text-2xl font-extrabold uppercase leading-[1.05] tracking-tight text-foreground sm:text-3xl md:text-4xl lg:text-5xl">
            Somos a rede de
            <br />
            <span className="gradient-text">pagamentos</span> e serviços
            <br />
            para grandes eventos
          </h1>

          {/* CTAs centralizados */}
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {/* Os dois eram `bg-card/40` — branco a 40% sobre fundo branco, ou
              * seja, invisíveis no tema claro. Agora um é sólido com borda de
              * verdade e o outro carrega o gradiente da marca: também resolve o
              * que era um problema antigo, dois botões com o mesmo peso sem
              * dizer qual é o principal. */}
            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full gap-2 rounded-full border-border bg-card shadow-sm hover:bg-secondary sm:w-auto"
            >
              <a href="#eventos">
                Explorar festivais
                <Instagram className="h-4 w-4" />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              className="group w-full gap-2 rounded-full bg-gradient-primary text-primary-foreground shadow-lg shadow-primary/25 hover:opacity-95 sm:w-auto"
            >
              <Link to="/area-do-produtor/cadastro">
                Vender na FestPag
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>

          {/* Globo decorativo sutil */}
          <Globe
            className="pointer-events-none absolute -bottom-20 right-0 h-20 w-20 text-primary opacity-40 md:right-4 md:h-28 md:w-28"
            strokeWidth={1.2}
          />
        </motion.div>
      </div>
    </section>
  );
};

export default HomeHeroBanner;
