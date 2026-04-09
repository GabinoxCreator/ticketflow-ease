import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Ticket, BarChart3, QrCode, Users, CalendarDays, Shield, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const features = [
  {
    icon: CalendarDays,
    title: 'Crie seus eventos',
    description: 'Configure lotes, setores, preços e comece a vender em minutos.',
  },
  {
    icon: BarChart3,
    title: 'Acompanhe vendas em tempo real',
    description: 'Dashboard completo com métricas de vendas, receita e conversão.',
  },
  {
    icon: QrCode,
    title: 'Check-in com QR Code',
    description: 'Valide ingressos na portaria com leitura rápida de QR Code.',
  },
  {
    icon: Users,
    title: 'Gerencie sua equipe',
    description: 'Adicione colaboradores com permissões para operar seus eventos.',
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

export default function AreaDoProdutor() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Área do Produtor | FestPag</title>
        <meta name="description" content="Venda ingressos, gerencie eventos e opere sua portaria com a FestPag. Plataforma completa para produtores de eventos." />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />

        <main className="pt-20">
          {/* Hero */}
          <section className="relative overflow-hidden py-20 md:py-32">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-primary/5" />
            <div className="container mx-auto px-4 relative z-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-3xl mx-auto text-center"
              >
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-2 text-sm font-medium mb-6">
                  <Ticket className="w-4 h-4" />
                  Para Produtores de Eventos
                </div>
                <h1 className="font-display font-bold text-4xl md:text-5xl lg:text-6xl mb-6 text-foreground">
                  Venda ingressos e opere seus eventos com a{' '}
                  <span className="text-primary">FestPag</span>
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
                  Crie seu evento, configure lotes, acompanhe vendas e faça check-in com QR Code. 
                  Uma plataforma completa para produtores, casas de show, festas e eventos corporativos.
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
                  >
                    Já tenho conta
                  </Button>
                </div>
              </motion.div>
            </div>
          </section>

          {/* Features */}
          <section className="py-20 bg-muted/30">
            <div className="container mx-auto px-4">
              <div className="text-center mb-16">
                <h2 className="font-display font-bold text-3xl md:text-4xl mb-4 text-foreground">
                  Tudo que você precisa para operar seus eventos
                </h2>
                <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                  Do planejamento à portaria, a FestPag cuida de toda a operação para você.
                </p>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
                {features.map((feature, i) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-card rounded-2xl p-6 border border-border hover:border-primary/30 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-display font-semibold text-lg mb-2 text-foreground">{feature.title}</h3>
                    <p className="text-muted-foreground text-sm">{feature.description}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="py-20">
            <div className="container mx-auto px-4">
              <div className="max-w-2xl mx-auto text-center">
                <h2 className="font-display font-bold text-3xl mb-4 text-foreground">
                  Pronto para começar?
                </h2>
                <p className="text-muted-foreground mb-8">
                  Crie sua conta de produtor gratuitamente e comece a vender ingressos hoje mesmo.
                </p>
                <Button
                  variant="hero"
                  size="xl"
                  onClick={() => navigate('/area-do-produtor/cadastro')}
                  className="gap-2"
                >
                  Criar conta de produtor
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
