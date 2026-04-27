import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CalendarPlus,
  Layers,
  Smartphone,
  UserCheck,
  Gift,
  Lock,
  IdCard,
  Tag,
  ShieldCheck,
  LayoutDashboard,
  TrendingUp,
  Ticket,
  Briefcase,
  Users,
  UserCog,
  QrCode,
  ClipboardList,
  ArrowRight,
  Globe,
  Sparkles,
  CreditCard,
  Zap,
  HeartHandshake,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Solution {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  /** Tailwind classes for the icon tile: gradient background + colored shadow */
  iconClass: string;
}

// Each solution gets its own "app icon" color (full static class strings so Tailwind keeps them).
const solutions: Solution[] = [
  { icon: CalendarPlus, title: 'Cadastro de Eventos', description: 'Crie seu evento em minutos com um wizard simples e completo.', iconClass: 'bg-gradient-to-br from-violet-500 to-purple-600 shadow-purple-500/40' },
  { icon: Layers, title: 'Gestão de Lotes', description: 'Configure múltiplos lotes, preços e estoque com total flexibilidade.', iconClass: 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/40' },
  { icon: Smartphone, title: 'Site Exclusivo', description: 'Página de venda própria, otimizada para mobile e alta conversão.', iconClass: 'bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-indigo-500/40' },
  { icon: UserCheck, title: 'Eventos para Convidados', description: 'Eventos privados com acesso controlado por lista.', iconClass: 'bg-gradient-to-br from-cyan-400 to-sky-500 shadow-cyan-500/40' },
  { icon: Gift, title: 'Eventos Gratuitos', description: 'Distribua ingressos sem custo com a mesma estrutura premium.', iconClass: 'bg-gradient-to-br from-pink-500 to-rose-500 shadow-pink-500/40' },
  { icon: Lock, title: 'Pré-venda Restrita', description: 'Libere lotes exclusivos com senha ou link privado.', iconClass: 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/40' },
  { icon: IdCard, title: 'Ingresso Nominal', description: 'Ingressos vinculados ao CPF, com mais segurança e controle.', iconClass: 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/40' },
  { icon: Tag, title: 'Cupom de Desconto', description: 'Crie cupons promocionais com regras personalizadas.', iconClass: 'bg-gradient-to-br from-orange-500 to-red-500 shadow-orange-500/40' },
  { icon: ShieldCheck, title: 'Validação de Ingressos', description: 'Antifraude integrado com verificação em tempo real.', iconClass: 'bg-gradient-to-br from-lime-400 to-green-500 shadow-lime-500/40' },
  { icon: LayoutDashboard, title: 'Dashboard', description: 'Métricas de vendas, receita e conversão em um só painel.', iconClass: 'bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-fuchsia-500/40' },
  { icon: TrendingUp, title: 'Controle de Vendas', description: 'Acompanhe o desempenho de cada lote e canal de venda.', iconClass: 'bg-gradient-to-br from-sky-400 to-blue-500 shadow-sky-500/40' },
  { icon: Ticket, title: 'Ingresso Digital', description: 'Entrega instantânea por e-mail e PDF com QR Code.', iconClass: 'bg-gradient-to-br from-teal-400 to-cyan-500 shadow-teal-500/40' },
  { icon: Briefcase, title: 'Área do Produtor', description: 'Painel completo para gerenciar todos os seus eventos.', iconClass: 'bg-gradient-to-br from-fuchsia-500 to-pink-600 shadow-fuchsia-500/40' },
  { icon: Users, title: 'Gestão de Produtores', description: 'Vincule múltiplos produtores e organize sua operação.', iconClass: 'bg-gradient-to-br from-rose-500 to-pink-600 shadow-rose-500/40' },
  { icon: UserCog, title: 'Área do Colaborador', description: 'Interface mobile dedicada para sua equipe na portaria.', iconClass: 'bg-gradient-to-br from-orange-500 to-red-600 shadow-orange-500/40' },
  { icon: QrCode, title: 'Check-in com QR Code', description: 'Validação rápida e segura na entrada do evento.', iconClass: 'bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/40' },
  { icon: ClipboardList, title: 'Listas de Convidados', description: 'Crie listas VIP com link público para inscrição.', iconClass: 'bg-gradient-to-br from-yellow-400 to-amber-500 shadow-yellow-500/40' },
];

const ProducerSolutionsBento = () => {
  return (
    <section className="py-20 md:py-28 relative overflow-hidden">
      {/* Glow de fundo */}
      <div className="pointer-events-none absolute top-1/4 left-0 w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-accent/10 blur-[120px]" />

      <div className="container mx-auto px-4 relative">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12 md:mb-16"
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-xs font-semibold border border-primary/20">
            <Sparkles className="w-3.5 h-3.5" />
            Nossas Soluções
          </div>
          <h2 className="font-display font-extrabold uppercase text-3xl md:text-4xl lg:text-5xl mt-4 mb-4 text-foreground leading-tight">
            Tudo que você precisa para
            <br />
            <span className="gradient-text">vender, operar e crescer</span>
          </h2>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
            Uma plataforma completa, da venda online ao check-in na portaria — com a fluidez e o cuidado que o seu evento merece.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 auto-rows-[160px] md:auto-rows-[180px] gap-3 md:gap-4 max-w-7xl mx-auto">
          {/* CARD HERO — 2x2 (mobile: full width) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className={cn(
              'col-span-2 row-span-2 md:col-span-2 md:row-span-2 lg:col-span-2 lg:row-span-2',
              'relative overflow-hidden rounded-3xl p-6 md:p-8',
              'bg-gradient-to-br from-background via-card to-primary/15',
              'border border-border/60 shadow-2xl shadow-primary/10',
              'flex flex-col justify-between',
            )}
          >
            <div className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 -left-20 w-72 h-72 rounded-full bg-accent/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-6 -left-6 opacity-20">
              <Globe className="w-44 h-44 md:w-56 md:h-56 text-primary" strokeWidth={0.7} />
            </div>

            <div className="relative">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/40 mb-5">
                <CreditCard className="w-7 h-7 text-primary-foreground" />
              </div>

              <h3 className="font-display font-extrabold text-2xl md:text-3xl uppercase leading-tight tracking-tight text-foreground">
                A plataforma
                <br />
                <span className="gradient-text">completa</span> para
                <br />
                produzir e vender
              </h3>

              <div className="mt-4 mb-5 h-1 w-16 rounded-full bg-gradient-to-r from-primary to-accent" />

              {/* Mini stats */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <Zap className="w-4 h-4 text-primary shrink-0" />
                  <span>Pix instantâneo e cartão</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                  <span>Taxas claras e transparentes</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <HeartHandshake className="w-4 h-4 text-primary shrink-0" />
                  <span>Suporte dedicado ao produtor</span>
                </div>
              </div>
            </div>

            <div className="relative mt-6">
              <Button asChild variant="hero" size="lg" className="gap-2 shadow-xl shadow-primary/30 w-full sm:w-auto">
                <Link to="/area-do-produtor/cadastro">
                  Começar agora
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </motion.div>

          {/* Cards das soluções */}
          {solutions.map((solution, idx) => (
            <motion.div
              key={solution.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: 0.05 + (idx % 8) * 0.04 }}
              className={cn(
                'group relative overflow-hidden rounded-2xl p-4 md:p-5',
                'bg-card/40 backdrop-blur-sm',
                'border border-border/50',
                'hover:border-primary/40 hover:bg-card/70 hover:-translate-y-0.5',
                'transition-all duration-300',
                'flex flex-col justify-between',
              )}
            >
              <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-primary/5 to-accent/5" />

              <div className="relative">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 group-hover:scale-110 transition-transform">
                  <solution.icon className="w-5 h-5 text-primary" />
                </div>
              </div>

              <div className="relative mt-3">
                <h4 className="font-display font-bold text-sm md:text-[15px] uppercase tracking-wide text-foreground leading-tight mb-1.5">
                  {solution.title}
                </h4>
                <p className="text-[11px] md:text-xs text-muted-foreground leading-snug line-clamp-2">
                  {solution.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProducerSolutionsBento;
