import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart3,
  QrCode,
  Shield,
  Users,
  CreditCard,
  ArrowRight,
  Globe,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ProducerSolutionsSectionProps {
  variant?: 'home' | 'page';
}

interface SolutionCard {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  ctaLabel: string;
}

const solutions: SolutionCard[] = [
  {
    icon: BarChart3,
    title: 'Gestão de Eventos',
    description:
      'Controle total da bilheteria, vendas online, gestão de comissários e relatórios em tempo real.',
    ctaLabel: 'Saiba mais sobre vendas',
  },
  {
    icon: QrCode,
    title: 'Check-in e Portaria',
    description:
      'Validação por QR Code, listas VIP e operação mobile-first para a sua equipe na portaria.',
    ctaLabel: 'Ver como funciona',
  },
  {
    icon: Shield,
    title: 'Pagamentos Seguros',
    description:
      'Pix instantâneo e cartão via Mercado Pago. Repasses claros e sem surpresas para o produtor.',
    ctaLabel: 'Conhecer taxas',
  },
  {
    icon: Users,
    title: 'Equipe e Colaboradores',
    description:
      'Adicione comissários, porteiros e gerentes com permissões granulares e operação dedicada.',
    ctaLabel: 'Organizar equipe',
  },
];

const ProducerSolutionsSection = ({ variant = 'home' }: ProducerSolutionsSectionProps) => {
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10 md:mb-14"
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-xs font-semibold mb-4 border border-primary/20">
            <Sparkles className="w-3.5 h-3.5" />
            {variant === 'home' ? 'Para produtores e organizadores' : 'A plataforma completa'}
          </div>
          <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl mb-3 text-foreground">
            Soluções Integradas para Eventos
          </h2>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
            Da venda online ao check-in na portaria — tudo o que você precisa em um só lugar.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2 gap-4 md:gap-6 max-w-7xl mx-auto">
          {/* Card principal escuro */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className={cn(
              'relative overflow-hidden rounded-3xl p-6 md:p-8 lg:p-10',
              'md:col-span-2 lg:col-span-2 lg:row-span-2',
              'bg-gradient-to-br from-background via-card to-primary/15',
              'border border-border/60',
              'shadow-2xl shadow-primary/10',
              'flex flex-col justify-between min-h-[420px] lg:min-h-[520px]',
            )}
          >
            {/* Glow decorativo */}
            <div className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 -left-20 w-72 h-72 rounded-full bg-accent/15 blur-3xl" />

            {/* Globo decorativo */}
            <div className="pointer-events-none absolute -bottom-6 -left-6 opacity-20">
              <Globe className="w-44 h-44 md:w-56 md:h-56 text-primary" strokeWidth={0.7} />
            </div>

            <div className="relative">
              {/* Ícone topo: maquininha estilizada */}
              <div className="inline-flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/40 mb-6">
                <CreditCard className="w-7 h-7 md:w-8 md:h-8 text-primary-foreground" />
              </div>

              <h3 className="font-display font-extrabold text-2xl md:text-3xl lg:text-4xl uppercase leading-tight tracking-tight text-foreground">
                A Conta Digital
                <br />
                que Conecta
                <br />
                Eventos e Público
              </h3>

              {/* Underline gradient */}
              <div className="mt-4 mb-6 h-1 w-20 rounded-full bg-gradient-to-r from-primary to-accent" />

              <p className="text-muted-foreground text-sm md:text-base leading-relaxed max-w-md">
                Abra sua conta FestPag e simplifique suas transações de ingressos, cashless e
                gestão. Feito para quem faz a festa e para quem curte.
              </p>
            </div>

            <div className="relative flex flex-col sm:flex-row gap-3 mt-8">
              <Button
                asChild
                variant="hero"
                size="lg"
                className="gap-2 shadow-xl shadow-primary/30"
              >
                <Link to="/area-do-produtor/cadastro">
                  Abra sua conta!
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg" className="text-muted-foreground hover:text-foreground gap-2 group">
                <a href="mailto:contato@ingressosrp.com.br">
                  Falar com nosso time de vendas
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </a>
              </Button>
            </div>
          </motion.div>

          {/* Cards secundários */}
          {solutions.map((solution, idx) => (
            <motion.div
              key={solution.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.1 + idx * 0.08 }}
              className={cn(
                'group relative overflow-hidden rounded-3xl p-6',
                'bg-card/40 backdrop-blur-sm',
                'border border-border/50',
                'hover:border-primary/40 hover:bg-card/70',
                'transition-all duration-300',
                'flex flex-col gap-3 min-h-[200px]',
              )}
            >
              {/* Glow no hover */}
              <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-primary/5 to-accent/5" />

              <div className="relative flex items-start justify-between">
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
                  <solution.icon className="w-5 h-5 text-primary" />
                </div>
              </div>

              <div className="relative flex-1">
                <h4 className="font-display font-bold text-base md:text-lg uppercase tracking-wide bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
                  {solution.title}
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {solution.description}
                </p>
              </div>

              <Link
                to="/area-do-produtor"
                className="relative inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5 transition-all"
              >
                {solution.ctaLabel}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProducerSolutionsSection;
