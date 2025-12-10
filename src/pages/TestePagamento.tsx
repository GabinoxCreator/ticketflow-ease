import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  CreditCard,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePublicEvents } from '@/hooks/useEvents';
import { useEventLots } from '@/hooks/useEventLots';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const TestePagamento = () => {
  const { data: events, isLoading: eventsLoading } = usePublicEvents();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const { lots, isLoading: lotsLoading } = useEventLots(selectedEventId || undefined);
  
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState('Usuário Teste');
  const [customerEmail, setCustomerEmail] = useState('teste@example.com');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedEvent = events?.find(e => e.id === selectedEventId);
  const selectedLot = lots?.find(l => l.id === selectedLotId);

  const formatPrice = (price: number) => {
    return price.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  const handleTestPayment = async () => {
    if (!selectedEventId || !selectedLotId || !customerName || !customerEmail) {
      toast.error('Preencha todos os campos');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          eventId: selectedEventId,
          cartItems: [{ lotId: selectedLotId, quantity }],
          customerEmail: customerEmail.trim(),
          customerName: customerName.trim(),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.url) {
        window.open(data.url, '_blank');
        toast.success('Sessão de checkout criada! Abrindo em nova aba...');
      }
    } catch (error: any) {
      console.error('Test payment error:', error);
      toast.error(error.message || 'Erro ao criar sessão de teste');
    } finally {
      setIsSubmitting(false);
    }
  };

  const testCards = [
    { number: '4242 4242 4242 4242', description: 'Pagamento aprovado', type: 'success' },
    { number: '4000 0000 0000 0002', description: 'Cartão recusado', type: 'error' },
    { number: '4000 0025 0000 3155', description: 'Requer autenticação 3DS', type: 'warning' },
  ];

  if (eventsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Teste de Pagamento - Stripe</title>
      </Helmet>

      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
              </div>
              <h1 className="font-display font-bold text-2xl md:text-3xl">
                Teste de Pagamento Stripe
              </h1>
            </div>
            <p className="text-muted-foreground">
              Use esta página para testar o fluxo completo de compra de ingressos no modo teste do Stripe.
            </p>
          </motion.div>

          {/* Test Cards Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Cartões de Teste
                </CardTitle>
                <CardDescription>
                  Use estes cartões no checkout do Stripe. Qualquer data futura e CVC funcionam.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {testCards.map((card) => (
                    <div
                      key={card.number}
                      className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          card.type === 'success' ? 'bg-green-500' :
                          card.type === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                        }`} />
                        <div>
                          <p className="font-mono text-sm">{card.number}</p>
                          <p className="text-xs text-muted-foreground">{card.description}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(card.number.replace(/\s/g, ''))}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Event Selection */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">1. Selecione o Evento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {events?.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Nenhum evento disponível</p>
                  ) : (
                    events?.map((event) => (
                      <button
                        key={event.id}
                        onClick={() => {
                          setSelectedEventId(event.id);
                          setSelectedLotId(null);
                        }}
                        className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                          selectedEventId === event.id
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-muted-foreground'
                        }`}
                      >
                        <p className="font-medium truncate">{event.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(event.date).toLocaleDateString('pt-BR')}
                        </p>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Lot Selection */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">2. Selecione o Ingresso</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!selectedEventId ? (
                    <p className="text-muted-foreground text-sm">Selecione um evento primeiro</p>
                  ) : lotsLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : lots?.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Nenhum lote disponível</p>
                  ) : (
                    lots?.filter(l => l.is_active).map((lot) => (
                      <button
                        key={lot.id}
                        onClick={() => setSelectedLotId(lot.id)}
                        className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                          selectedLotId === lot.id
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-muted-foreground'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <p className="font-medium">{lot.name}</p>
                          <p className="font-bold text-primary">{formatPrice(lot.price)}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Disponível: {lot.total_quantity - lot.sold_quantity}
                        </p>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Customer Info & Submit */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">3. Dados do Comprador</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="name">Nome</Label>
                    <Input
                      id="name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Nome do comprador"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="email@exemplo.com"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="quantity">Quantidade</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min={1}
                      max={10}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Summary */}
                {selectedLot && (
                  <div className="bg-secondary/50 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total</p>
                      <p className="font-display font-bold text-xl">
                        {formatPrice(selectedLot.price * quantity)}
                      </p>
                    </div>
                    <Button
                      variant="hero"
                      size="lg"
                      onClick={handleTestPayment}
                      disabled={isSubmitting || !selectedEventId || !selectedLotId}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Criando...
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Testar Pagamento
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Success Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="border-green-500/30 bg-green-500/5">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  Após o Pagamento
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>• Você será redirecionado para a página de sucesso</p>
                <p>• O pedido será criado no banco de dados</p>
                <p>• Os ingressos serão gerados automaticamente</p>
                <p>• O produtor receberá o valor (menos a taxa da plataforma)</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default TestePagamento;
