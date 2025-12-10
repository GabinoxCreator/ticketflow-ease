import { useEffect, useState, useCallback } from 'react';
import {
  ConnectComponentsProvider,
  ConnectAccountOnboarding,
  ConnectAccountManagement,
  ConnectPayouts,
} from '@stripe/react-connect-js';
import { loadConnectAndInitialize } from '@stripe/connect-js';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, Settings, Banknote, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface StripeEmbeddedOnboardingProps {
  onComplete?: () => void;
  showManagement?: boolean;
}

export function StripeEmbeddedOnboarding({ onComplete, showManagement = false }: StripeEmbeddedOnboardingProps) {
  const [stripeConnectInstance, setStripeConnectInstance] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAccount, setHasAccount] = useState(false);

  const initializeStripeConnect = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First check if user has a Stripe account, if not create one
      const { data: createData, error: createError } = await supabase.functions.invoke('create-stripe-connect-account');
      
      if (createError) throw createError;
      if (createData?.error) throw new Error(createData.error);

      setHasAccount(true);

      // Now get the account session for embedded components
      const { data: sessionData, error: sessionError } = await supabase.functions.invoke('create-account-session');
      
      if (sessionError) throw sessionError;
      if (sessionData?.error) throw new Error(sessionData.error);

      if (!sessionData?.client_secret) {
        throw new Error('Failed to get client secret for embedded components');
      }

      // Initialize the Stripe Connect instance
      const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
      
      if (!publishableKey) {
        throw new Error('Stripe publishable key not configured');
      }

      const instance = await loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret: async () => sessionData.client_secret,
        appearance: {
          overlays: 'dialog',
          variables: {
            colorPrimary: '#6366f1',
            colorBackground: '#ffffff',
            colorText: '#1f2937',
            colorDanger: '#ef4444',
            borderRadius: '8px',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSizeBase: '14px',
          },
        },
      });

      setStripeConnectInstance(instance);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao inicializar';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initializeStripeConnect();
  }, [initializeStripeConnect]);

  const handleOnboardingExit = () => {
    toast.info('Você pode continuar o cadastro a qualquer momento');
    onComplete?.();
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando configuração de pagamentos...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <AlertCircle className="w-12 h-12 text-destructive" />
          <div className="text-center space-y-2">
            <p className="font-medium text-destructive">Erro ao carregar</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button onClick={initializeStripeConnect} variant="outline">
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!stripeConnectInstance) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <CreditCard className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">Configuração não disponível</p>
          <Button onClick={initializeStripeConnect}>
            Iniciar configuração
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
      {showManagement ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Gerenciar Conta de Pagamentos
            </CardTitle>
            <CardDescription>
              Gerencie seus dados bancários e configurações de pagamento
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="account" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="account" className="gap-2">
                  <Settings className="w-4 h-4" />
                  Conta
                </TabsTrigger>
                <TabsTrigger value="payouts" className="gap-2">
                  <Banknote className="w-4 h-4" />
                  Saques
                </TabsTrigger>
              </TabsList>
              <TabsContent value="account" className="mt-4">
                <ConnectAccountManagement />
              </TabsContent>
              <TabsContent value="payouts" className="mt-4">
                <ConnectPayouts />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Configurar Conta de Recebimento
            </CardTitle>
            <CardDescription>
              Complete as informações abaixo para começar a receber pagamentos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectAccountOnboarding
              onExit={handleOnboardingExit}
            />
          </CardContent>
        </Card>
      )}
    </ConnectComponentsProvider>
  );
}
