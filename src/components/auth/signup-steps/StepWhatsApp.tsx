import React from 'react';
import { motion } from 'framer-motion';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import WhatsAppInput from '@/components/WhatsAppInput';
import { toast } from 'sonner';

interface StepWhatsAppProps {
  whatsapp: string;
  onWhatsappChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}

const StepWhatsApp: React.FC<StepWhatsAppProps> = ({
  whatsapp,
  onWhatsappChange,
  onBack,
  onNext,
}) => {
  const handleNext = () => {
    if (whatsapp.replace(/\D/g, '').length < 10) {
      toast.error('Informe um WhatsApp válido');
      return;
    }
    onNext();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-5"
    >
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold">Seu WhatsApp</h3>
        <p className="text-sm text-muted-foreground">
          Vamos usar para enviar atualizações dos seus eventos
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="whatsapp">WhatsApp</Label>
        <WhatsAppInput value={whatsapp} onChange={onWhatsappChange} />
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack} size="lg" className="flex-shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button type="button" onClick={handleNext} variant="hero" size="lg" className="flex-1">
          Continuar
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
};

export default StepWhatsApp;
