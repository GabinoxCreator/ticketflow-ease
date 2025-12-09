import { motion } from 'framer-motion';
import { Search, MapPin, Calendar, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const Hero = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('');

  return (
    <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden pt-20">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-card" />
      
      {/* Animated Gradient Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }} />
      
      {/* Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--primary)) 1px, transparent 1px),
                           linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="container relative z-10 px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-4xl mx-auto"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-full mb-6"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Seus ingressos na palma da mão</span>
          </motion.div>

          {/* Title */}
          <h1 className="font-display font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl mb-6 leading-tight">
            Encontre os melhores{' '}
            <span className="gradient-text">eventos</span>{' '}
            de Ribeirão Preto
          </h1>

          {/* Subtitle */}
          <p className="text-muted-foreground text-lg md:text-xl mb-10 max-w-2xl mx-auto">
            Festas, shows, festivais e muito mais. Compre seus ingressos de forma rápida e segura, 
            e receba direto no seu WhatsApp.
          </p>

          {/* Search Box */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-card/80 backdrop-blur-xl rounded-2xl p-2 border border-border/50 max-w-3xl mx-auto"
          >
            <div className="flex flex-col md:flex-row gap-2">
              {/* Search Input */}
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar eventos, artistas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-14 pl-12 pr-4 bg-secondary/50 rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* City Select */}
              <div className="relative md:w-48">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full h-14 pl-12 pr-4 bg-secondary/50 rounded-xl text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
                >
                  <option value="">Todas cidades</option>
                  <option value="ribeirao-preto">Ribeirão Preto</option>
                  <option value="sertaozinho">Sertãozinho</option>
                  <option value="franca">Franca</option>
                </select>
              </div>

              {/* Search Button */}
              <Button variant="hero" size="xl" className="md:w-auto">
                <Search className="w-5 h-5 mr-2" />
                Buscar
              </Button>
            </div>
          </motion.div>

          {/* Quick Stats */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex flex-wrap justify-center gap-8 mt-12"
          >
            {[
              { label: 'Eventos Ativos', value: '50+' },
              { label: 'Ingressos Vendidos', value: '25k+' },
              { label: 'Clientes Satisfeitos', value: '15k+' },
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <p className="font-display font-bold text-2xl md:text-3xl gradient-text">
                  {stat.value}
                </p>
                <p className="text-muted-foreground text-sm">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* Bottom Gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
};

export default Hero;
