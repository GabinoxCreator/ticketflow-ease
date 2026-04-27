import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Sparkles,
  UserPlus,
  Settings2,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ProducerSolutionsBento from '@/components/home/ProducerSolutionsBento';

const steps = [
  {
    icon: UserPlus,
    title: 'Crie sua conta',
    description: 'Cadastro rápido e gratuito em poucos minutos.',
  },
  {
    icon: Settings2,
    title: 'Configure seu evento',
    description: 'Defina lotes, setores, preços e personalize tudo.',
  },
  {
    icon: TrendingUp,
    title: 'Comece a vender',
    description: 'Acompanhe vendas em tempo real e opere com tranquilidade.',
  },
];

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
          <section className="relative overflow-hidden py-16 md:py-24">
            {/* Glow radial decorativo */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-accent/10" />
            <div className="pointer-events-none absolute -top-10 -left-20 w-96 h-96 rounded-full bg-primary/15 blur-3xl" />
            <div className="pointer-events-none absolute top-10 -right-20 w-96 h-96 rounded-full bg-accent/10 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-64 rounded-full bg-primary/10 blur-3xl" />

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

                <p className="text-base md:text-lg text-muted-foreground mt-8 mb-10 max-w-2xl mx-auto">
                  Cadastre eventos, controle vendas em tempo real, valide ingressos no QR Code e
                  opere a portaria — tudo em um só lugar, com a fluidez que o seu evento merece.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
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

          {/* COMO FUNCIONA */}
          <section className="py-20">
            <div className="container mx-auto px-4">
              <div className="text-center mb-14">
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-xs font-semibold mb-4 border border-primary/20">
                  <Sparkles className="w-3.5 h-3.5" />
                  Comece em 3 passos
                </div>
                <h2 className="font-display font-bold text-3xl md:text-4xl mb-3 text-foreground">
                  Simples, rápido e premium
                </h2>
                <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                  Em poucos minutos seu evento está vendendo.
                </p>
              </div>

              <div className="relative max-w-5xl mx-auto">
                {/* Linha conectora desktop */}
                <div className="hidden md:block absolute top-10 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 relative">
                  {steps.map((step, i) => (
                    <motion.div
                      key={step.title}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                      className="text-center relative"
                    >
                      <div className="relative inline-flex">
                        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-accent blur-md opacity-60" />
                        <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-xl shadow-primary/30 mb-5">
                          <step.icon className="w-9 h-9 text-primary-foreground" />
                        </div>
                      </div>
                      <div className="text-xs font-semibold text-primary mb-2 uppercase tracking-wider">
                        Passo {i + 1}
                      </div>
                      <h3 className="font-display font-bold text-xl mb-2 text-foreground">
                        {step.title}
                      </h3>
                      <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                        {step.description}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </section>

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
                    <Button asChild variant="outline" size="xl" className="border-primary/30 hover:border-primary/60 hover:bg-primary/5">
                      <a href="mailto:contato@ingressosrp.com.br">Falar com vendas</a>
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
