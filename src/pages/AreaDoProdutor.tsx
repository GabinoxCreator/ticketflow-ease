import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ProducerSolutionsBento from '@/components/home/ProducerSolutionsBento';

export default function AreaDoProdutor() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Área do Produtor | FestPag</title>
        <meta
          name="description"
          content="Venda ingressos, gerencie eventos e opere sua portaria com a FestPag. Plataforma completa para produtores de eventos."
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />

        <main className="pt-20">
          {/* HERO — estilo home, voltado ao produtor */}
          <section className="relative overflow-hidden pt-16 md:pt-24 pb-32 md:pb-44">
            {/* Glow radial decorativo */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-accent/10" />
            <div className="pointer-events-none absolute -top-10 -left-20 w-96 h-96 rounded-full bg-primary/15 blur-3xl" />
            <div className="pointer-events-none absolute top-10 -right-20 w-96 h-96 rounded-full bg-accent/10 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-64 rounded-full bg-primary/10 blur-3xl" />

            {/* Fade-out suave para o background na transição com a próxima seção */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background z-[5]" />

            {/* Linha luminosa decorativa na borda */}
            <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent z-[6]" />
            <div className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 w-[40%] h-8 rounded-full bg-primary/30 blur-2xl z-[6]" />

            <div className="container mx-auto px-4 relative z-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="max-w-4xl mx-auto text-center"
              >
                <h1 className="font-display font-extrabold uppercase leading-[0.95] tracking-tight text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl text-foreground">
                  Venda, gerencie e
                  <br />
                  faça a sua{' '}
                  <span
                    className="text-[hsl(85,80%,60%)] italic font-bold"
                    style={{ fontFamily: 'Caveat, cursive' }}
                  >
                    festa
                  </span>
                  <br />
                  acontecer com a <span className="gradient-text">FestPag</span>
                </h1>

                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-12 md:mt-14">
                  <Button
                    variant="hero"
                    size="xl"
                    onClick={() => navigate('/area-do-produtor/cadastro')}
                    className="gap-2 w-full sm:w-auto"
                  >
                    Começar agora
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="xl"
                    onClick={() => navigate('/area-do-produtor/login')}
                    className="border-primary/30 hover:border-primary/60 hover:bg-primary/5 w-full sm:w-auto"
                  >
                    Já tenho conta
                  </Button>
                </div>
              </motion.div>
            </div>
          </section>

          {/* Bento Grid Premium com as 17 soluções */}
          <ProducerSolutionsBento />

          {/* CTA final */}
          <section className="py-20">
            <div className="container mx-auto px-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-accent/10 p-10 md:p-16 max-w-5xl mx-auto shadow-2xl shadow-primary/20"
              >
                <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-accent/20 blur-3xl pointer-events-none" />

                <div className="relative text-center max-w-2xl mx-auto">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/40 mb-6">
                    <Sparkles className="w-7 h-7 text-primary-foreground" />
                  </div>
                  <h2 className="font-display font-bold text-3xl md:text-4xl mb-4 text-foreground">
                    Pronto para começar?
                  </h2>
                  <p className="text-muted-foreground text-lg mb-8">
                    Crie sua conta de produtor gratuitamente e comece a vender ingressos hoje
                    mesmo.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button
                      variant="hero"
                      size="xl"
                      onClick={() => navigate('/area-do-produtor/cadastro')}
                      className="gap-2 shadow-xl shadow-primary/30"
                    >
                      Criar conta de produtor
                      <ArrowRight className="w-5 h-5" />
                    </Button>
                    <Button variant="outline" size="xl" onClick={() => navigate('/lp')} className="border-primary/30 hover:border-primary/60 hover:bg-primary/5">
                      Falar com vendas
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
