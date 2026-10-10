import { motion } from 'framer-motion';
import { CheckCircle2, Ticket, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { RetiradasDoComprador } from '@/components/tickets/RetiradasDoComprador';

interface CheckoutStepSuccessProps {
  eventTitle: string;
  ticketCount: number;
  customerEmail: string;
  orderId: string;
}

export function CheckoutStepSuccess({
  eventTitle,
  ticketCount,
  customerEmail,
  orderId,
}: CheckoutStepSuccessProps) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center space-y-6"
    >
      {/* Success Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', delay: 0.2 }}
        className="w-24 h-24 mx-auto rounded-full bg-green-500/20 flex items-center justify-center"
      >
        <CheckCircle2 className="w-12 h-12 text-green-500" />
      </motion.div>

      <div>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="font-display font-bold text-2xl mb-2"
        >
          Compra Confirmada!
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-muted-foreground"
        >
          {ticketCount > 0 ? 'Seus ingressos foram gerados com sucesso' : 'Sua compra foi confirmada'}
        </motion.p>
      </div>

      {/* Order Details */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-secondary/50 rounded-xl p-4 space-y-3"
      >
        {/* Pedido só de produto (loja do evento) não tem ingresso para contar. */}
        {ticketCount > 0 && (
          <div className="flex items-center justify-center gap-2 text-primary">
            <Ticket className="w-5 h-5" />
            <span className="font-semibold">{ticketCount} ingresso{ticketCount > 1 ? 's' : ''}</span>
          </div>
        )}
        <p className="font-display font-bold text-lg">{eventTitle}</p>
        <p className="text-sm text-muted-foreground">
          Pedido #{orderId.slice(0, 8).toUpperCase()}
        </p>
      </motion.div>

      {/* Loja do evento: código de retirada dos produtos deste pedido. */}
      <RetiradasDoComprador orderId={orderId} />

      {/* Onde fica o ingresso (10/10/2026): quem só tem WhatsApp na conta não
          recebe e-mail, e o ingresso não sai mais pelo WhatsApp. */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="flex items-center gap-3 p-4 bg-primary/10 rounded-xl text-left"
      >
        <Ticket className="w-5 h-5 text-primary flex-shrink-0" />
        <div>
          <p className="text-sm font-medium">
            {ticketCount > 0 ? 'Seu ingresso está em Meus ingressos' : 'Seu pedido está em Meus ingressos'}
          </p>
          <p className="text-xs text-muted-foreground">
            {ticketCount > 0
              ? 'Na entrada, é só abrir e mostrar o QR.'
              : 'É só entrar na sua conta para ver quando precisar.'}
          </p>
        </div>
      </motion.div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="space-y-3"
      >
        <Button
          variant="hero"
          size="lg"
          className="w-full"
          onClick={() => navigate('/meus-ingressos')}
        >
          <Ticket className="w-5 h-5 mr-2" />
          Ver Meus Ingressos
        </Button>
        
        <Button
          variant="outline"
          className="w-full"
          onClick={() => navigate('/')}
        >
          Continuar Navegando
        </Button>
      </motion.div>
    </motion.div>
  );
}
