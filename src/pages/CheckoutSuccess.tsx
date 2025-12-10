import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Check, Loader2, Ticket, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CheckoutSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(true);
  const [orderDetails, setOrderDetails] = useState<{
    id: string;
    total_amount: number;
    customer_email: string;
  } | null>(null);

  const sessionId = searchParams.get('session_id');
  const orderId = searchParams.get('order_id');

  useEffect(() => {
    const confirmPayment = async () => {
      if (!orderId) {
        toast.error('Pedido não encontrado');
        navigate('/');
        return;
      }

      try {
        // Get order details
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        if (orderError || !order) {
          throw new Error('Order not found');
        }

        // Update order status to paid
        const { error: updateError } = await supabase
          .from('orders')
          .update({ status: 'paid' })
          .eq('id', orderId);

        if (updateError) {
          console.error('Error updating order status:', updateError);
        }

        setOrderDetails(order);
        toast.success('Pagamento confirmado!');
      } catch (error: any) {
        console.error('Error confirming payment:', error);
        toast.error('Erro ao confirmar pagamento');
      } finally {
        setIsProcessing(false);
      }
    };

    confirmPayment();
  }, [orderId, navigate]);

  const formatPrice = (price: number) => {
    return price.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  if (isProcessing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Confirmando pagamento...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Pagamento Confirmado</title>
      </Helmet>

      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <Check className="w-10 h-10 text-primary" />
          </motion.div>

          <h1 className="font-display font-bold text-2xl mb-2">
            Pagamento Confirmado!
          </h1>
          
          <p className="text-muted-foreground mb-6">
            Seus ingressos foram gerados e enviados para{' '}
            <span className="text-foreground font-medium">
              {orderDetails?.customer_email}
            </span>
          </p>

          {orderDetails && (
            <div className="bg-secondary/50 rounded-xl p-4 mb-6">
              <p className="text-sm text-muted-foreground mb-1">Total pago</p>
              <p className="font-display font-bold text-2xl gradient-text">
                {formatPrice(orderDetails.total_amount)}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <Button
              variant="hero"
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
              <Home className="w-5 h-5 mr-2" />
              Voltar para Eventos
            </Button>
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default CheckoutSuccess;
