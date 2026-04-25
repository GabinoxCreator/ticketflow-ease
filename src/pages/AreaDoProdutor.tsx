import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  BarChart3,
  QrCode,
  Users,
  CalendarDays,
  Shield,
  ArrowRight,
  Ticket,
  Sparkles,
  UserPlus,
  Settings2,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import logoFestpag from '@/assets/logo-festpag.png';
import ProducerSolutionsSection from '@/components/home/ProducerSolutionsSection';
import { cn } from '@/lib/utils';

const features = [
  {
    icon: CalendarDays,
    title: 'Crie seus eventos',
    description: 'Configure lotes, setores, preços e comece a vender em minutos.',
  },
  {
    icon: BarChart3,
    title: 'Vendas em tempo real',
    description: 'Dashboard completo com métricas de vendas, receita e conversão.',
    featured: true,
  },
  {
    icon: QrCode,
    title: 'Check-in com QR Code',
    description: 'Valide ingressos na portaria com leitura rápida de QR Code.',
  },
  {
    icon: Users,
    title: 'Equipe e colaboradores',
    description: 'Adicione comissários, porteiros e gerentes com permissões granulares.',
  },
  {
    icon: Shield,
    title: 'Segurança e confiança',
    description: 'Pagamento seguro via Pix e cartão. Controle total dos seus dados.',
  },
  {
    icon: Ticket,
    title: 'Listas de convidados',
    description: 'Crie listas VIP com links públicos para inscrição de convidados.',
  },
];

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
          {/* HERO */}
          <section className="relative overflow-hidden py-20 md:py-28">
            {/* Glow radial decorativo */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-accent/10" />
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/15 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-accent/15 blur-[120px] pointer-events-none" />

            <div className="container mx-auto px-4 relative z-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-3xl mx-auto text-center"
              >
                <div className="flex justify-center mb-6">
                  <img src={logoFestpag} alt="FestPag" className="h-16 md:h-20 w-auto" />
                </div>

                <div className="inline-flex items-center gap-2 bg-card/60 backdrop-blur border border-primary/30 text-primary rounded-full px-4 py-1.5 text-xs font-semibold mb-6 shadow-lg shadow-primary/10">
                  <Sparkles className="w-3.5 h-3.5" />
                  Para Produtores de Eventos
                </div>

                <h1 className="font-display font-extrabold text-4xl md:text-5xl lg:text-6xl mb-6 text-foreground leading-tight">
                  Venda ingressos e opere seus eventos com a{' '}
                  <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    FestPag
                  </span>
                </h1>

                <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
                  Crie seu evento, configure lotes, acompanhe vendas e faça check-in com QR Code.
                  Uma plataforma completa para produtores, casas de show, festas e eventos
                  corporativos.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button
                    variant="hero"
                    size="xl"
                    onClick={() => navigate('/area-do-produtor/cadastro')}
                    className="gap-2"
                  >
                    Começar agora
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="xl"
                    onClick={() => navigate('/area-do-produtor/login')}
                    className="border-primary/30 hover:border-primary/60 hover:bg-primary/5"
                  >
                    Já tenho conta
                  </Button>
                </div>
              </motion.div>
            </div>
          </section>

          {/* Bento de soluções */}
          <ProducerSolutionsSection variant="page" />

          {/* FEATURES — bento sofisticado */}
          <section className="py-20 bg-card/30">
            <div className="container mx-auto px-4">
              <div className="text-center mb-14">
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-xs font-semibold mb-4 border border-primary/20">
                  <Sparkles className="w-3.5 h-3.5" />
                  Recursos
                </div>
                <h2 className="font-display font-bold text-3xl md:text-4xl mb-3 text-foreground">
                  Tudo que você precisa para operar seus eventos
                </h2>
                <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                  Do planejamento à portaria, a FestPag cuida de toda a operação para você.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
                {features.map((feature, i) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className={cn(
                      'group relative overflow-hidden rounded-2xl p-6',
                      'bg-card/60 backdrop-blur-sm border border-border/50',
                      'hover:border-primary/40 transition-all duration-300',
                      feature.featured &&
                        'md:col-span-2 lg:col-span-1 lg:row-span-1 bg-gradient-to-br from-primary/10 via-card/60 to-accent/10 border-primary/30',
                    )}
                  >
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-primary/5 to-accent/5 pointer-events-none" />

                    <div className="relative">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 mb-4">
                        <feature.icon className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="font-display font-semibold text-lg mb-2 text-foreground">
                        {feature.title}
                      </h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

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
