import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Check, Loader2, Ticket, Home, AlertTriangle, Clock, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

type ViewState = 'loading' | 'paid' | 'pending' | 'in_process' | 'failed' | 'rejected' | 'expired';

interface OrderRow {
  id: string;
  total_amount: number;
  customer_email: string;
  status: string;
}

const TITLES: Record<ViewState, string> = {
  loading: 'Confirmando pagamento',
  paid: 'Pagamento Confirmado',
  pending: 'Pagamento em processamento',
  in_process: 'Pagamento em análise',
  failed: 'Pagamento não concluído',
  rejected: 'Pagamento recusado',
  expired: 'Pedido expirado',
};

function deriveView(orderStatus: string | null | undefined): ViewState {
  switch (orderStatus) {
    case 'paid': return 'paid';
    case 'pending': return 'pending';
    case 'in_process': return 'in_process';
    case 'rejected': return 'rejected';
    case 'failed': return 'failed';
    case 'expired':
    case 'cancelled': return 'expired';
    default: return 'pending';
  }
}

const CheckoutSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>('loading');
  const [order, setOrder] = useState<OrderRow | null>(null);
  const pollRef = useRef<number | null>(null);

  const orderId = searchParams.get('order_id') || searchParams.get('external_reference');
  const paymentId = searchParams.get('payment_id');

  useEffect(() => {
    let cancelled = false;

    const fetchOrder = async (): Promise<OrderRow | null> => {
      if (!orderId) return null;
      const { data } = await supabase
        .from('orders')
        .select('id, total_amount, customer_email, status')
        .eq('id', orderId)
        .maybeSingle();
      return (data as OrderRow) ?? null;
    };

    const run = async () => {
      if (!orderId) {
        setView('failed');
        return;
      }

      // Authoritative path: only when paymentId present (server-side validates ownership).
      if (paymentId) {
        try {
          await supabase.functions.invoke('check-mercadopago-payment', {
            body: { paymentId, orderId },
          });
        } catch (e) {
          console.error('check-mercadopago-payment error', e);
        }
      }

      const o = await fetchOrder();
      if (cancelled) return;
      if (!o) { setView('failed'); return; }
      setOrder(o);
      setView(deriveView(o.status));

      // Poll while in non-terminal states (read-only refresh of order row)
      const nonTerminal = new Set(['pending', 'in_process']);
      if (nonTerminal.has(o.status)) {
        pollRef.current = window.setInterval(async () => {
          const fresh = await fetchOrder();
          if (!fresh || cancelled) return;
          setOrder(fresh);
          const v = deriveView(fresh.status);
          setView(v);
          if (!nonTerminal.has(fresh.status) && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 4000);
      }
    };

    run();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [orderId, paymentId]);

  const formatPrice = (p: number) =>
    p.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Verificando pagamento...</p>
        </div>
      </div>
    );
  }

  const config: Record<Exclude<ViewState, 'loading'>, {
    icon: JSX.Element; title: string; subtitle: string; tone: 'ok' | 'warn' | 'err';
  }> = {
    paid: {
      icon: <Check className="w-10 h-10 text-primary" />,
      title: 'Pagamento Confirmado!',
      subtitle: 'Seus ingressos estão prontos.',
      tone: 'ok',
    },
    pending: {
      icon: <Clock className="w-10 h-10 text-amber-500" />,
      title: 'Aguardando confirmação',
      subtitle: 'Estamos aguardando a confirmação do pagamento. Esta página atualiza automaticamente.',
      tone: 'warn',
    },
    in_process: {
      icon: <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />,
      title: 'Pagamento em análise',
      subtitle: 'Seu pagamento está sendo analisado pelo banco. Você será notificado por email.',
      tone: 'warn',
    },
    failed: {
      icon: <XCircle className="w-10 h-10 text-destructive" />,
      title: 'Pagamento não concluído',
      subtitle: 'Não foi possível concluir seu pagamento. Tente novamente.',
      tone: 'err',
    },
    rejected: {
      icon: <XCircle className="w-10 h-10 text-destructive" />,
      title: 'Pagamento recusado',
      subtitle: 'O pagamento foi recusado pelo banco. Tente outro método.',
      tone: 'err',
    },
    expired: {
      icon: <AlertTriangle className="w-10 h-10 text-destructive" />,
      title: 'Pedido expirado',
      subtitle: 'O tempo para conclusão deste pagamento expirou.',
      tone: 'err',
    },
  };

  const c = config[view];

  return (
    <>
      <Helmet>
        <title>{TITLES[view]}</title>
      </Helmet>

      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center"
        >
          <div className={
            'w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ' +
            (c.tone === 'ok' ? 'bg-primary/20' : c.tone === 'warn' ? 'bg-amber-500/15' : 'bg-destructive/15')
          }>
            {c.icon}
          </div>

          <h1 className="font-display font-bold text-2xl mb-2">{c.title}</h1>
          <p className="text-muted-foreground mb-6">
            {c.subtitle}
            {order?.customer_email ? <> Confirmações vão para <span className="text-foreground font-medium">{order.customer_email}</span>.</> : null}
          </p>

          {order && (
            <div className="bg-secondary/50 rounded-xl p-4 mb-6">
              <p className="text-sm text-muted-foreground mb-1">Total do pedido</p>
              <p className="font-display font-bold text-2xl gradient-text">
                {formatPrice(order.total_amount)}
              </p>
            </div>
          )}

          <div className="space-y-3">
            {view === 'paid' && (
              <Button variant="hero" className="w-full" onClick={() => navigate('/meus-ingressos')}>
                <Ticket className="w-5 h-5 mr-2" />
                Ver Meus Ingressos
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
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
