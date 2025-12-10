import { useState } from 'react';
import { CheckCircle, AlertCircle, Clock, CreditCard, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useStripeConnect } from '@/hooks/useStripeConnect';
import { StripeEmbeddedOnboarding } from './StripeEmbeddedOnboarding';

export function StripeConnectCard() {
  const { status, isLoading, checkStatus } = useStripeConnect();
  const [showOnboarding, setShowOnboarding] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Show embedded onboarding if user clicked to start or if account is pending
  if (showOnboarding || (status?.connected && status.status !== 'active')) {
    return (
      <StripeEmbeddedOnboarding 
        onComplete={() => {
          setShowOnboarding(false);
          checkStatus();
        }}
        showManagement={status?.status === 'active'}
      />
    );
  }

  // Show management view for active accounts
  if (status?.connected && status.status === 'active') {
    return (
      <StripeEmbeddedOnboarding 
        showManagement={true}
        onComplete={() => checkStatus()}
      />
    );
  }

  const getStatusBadge = () => {
    if (!status?.connected) {
      return <Badge variant="outline" className="bg-muted">Não conectado</Badge>;
    }
    
    switch (status.status) {
      case 'active':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Ativo</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Pendente</Badge>;
      case 'restricted':
        return <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">Restrito</Badge>;
      default:
        return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  const getStatusIcon = () => {
    if (!status?.connected || status.status === 'not_connected') {
      return <CreditCard className="w-10 h-10 text-muted-foreground" />;
    }
    
    switch (status.status) {
      case 'active':
        return <CheckCircle className="w-10 h-10 text-green-500" />;
      case 'pending':
        return <Clock className="w-10 h-10 text-yellow-500" />;
      case 'restricted':
        return <AlertCircle className="w-10 h-10 text-orange-500" />;
      default:
        return <CreditCard className="w-10 h-10 text-muted-foreground" />;
    }
  };

  const getStatusDescription = () => {
    if (!status?.connected) {
      return 'Conecte sua conta para receber pagamentos diretamente no seu banco.';
    }
    
    switch (status.status) {
      case 'active':
        return 'Sua conta está ativa e pronta para receber pagamentos.';
      case 'pending':
        return 'Complete o cadastro para ativar os pagamentos.';
      case 'restricted':
        return 'Alguns documentos estão pendentes. Complete o cadastro para ativar.';
      default:
        return 'Verifique o status da sua conta.';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Conta de Pagamentos
              {getStatusBadge()}
            </CardTitle>
            <CardDescription className="mt-1">
              Receba os pagamentos dos ingressos diretamente na sua conta
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-muted/50">
            {getStatusIcon()}
          </div>
          <div className="flex-1 space-y-4">
            <p className="text-muted-foreground">
              {getStatusDescription()}
            </p>
            
            <div className="flex flex-wrap gap-3">
              <Button 
                onClick={() => setShowOnboarding(true)}
                className="gap-2"
              >
                Configurar conta de recebimento
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
