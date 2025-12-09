import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Users, Gift } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useColaboradorAuth } from '@/contexts/ColaboradorAuthContext';

export default function ColaboradorEventoMenu() {
  const navigate = useNavigate();
  const { id: eventId } = useParams<{ id: string }>();
  const { events } = useColaboradorAuth();

  const event = events.find(e => e.id === eventId);

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="font-medium mb-2">Evento não encontrado</h3>
            <Button onClick={() => navigate('/colaborador/dashboard')}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const menuItems = [
    {
      icon: Camera,
      title: 'Ler QR Code',
      description: 'Escanear ingresso com a câmera',
      path: `/colaborador/evento/${eventId}/scanner`,
      color: 'bg-primary',
    },
    {
      icon: Users,
      title: 'Lista de Participantes',
      description: 'Ver todos os ingressos vendidos',
      path: `/colaborador/evento/${eventId}/participantes`,
      color: 'bg-blue-500',
    },
    {
      icon: Gift,
      title: 'Lista de Convidados',
      description: 'Ver cortesias e convidados',
      path: `/colaborador/evento/${eventId}/convidados`,
      color: 'bg-purple-500',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 -ml-2 mb-2"
            onClick={() => navigate('/colaborador/dashboard')}
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <h1 className="font-bold text-lg line-clamp-1">{event.title}</h1>
        </div>
      </header>

      {/* Event Image */}
      {event.image_url && (
        <div className="max-w-lg mx-auto">
          <div className="aspect-video">
            <img
              src={event.image_url}
              alt={event.title}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* Menu */}
      <main className="max-w-lg mx-auto p-4 space-y-3">
        {menuItems.map((item, index) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(item.path)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl ${item.color} flex items-center justify-center`}>
                    <item.icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-medium">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </main>
    </div>
  );
}
