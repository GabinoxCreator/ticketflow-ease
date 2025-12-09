import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { StripeConnectCard } from '@/components/producer/StripeConnectCard';
import { PinSetupCard } from '@/components/producer/PinSetupCard';
import { PinVerificationDialog } from '@/components/producer/PinVerificationDialog';
import { useStripeConnect } from '@/hooks/useStripeConnect';

export default function Financeiro() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { status, checkStatus, isLoading } = useStripeConnect();
  const [isVerified, setIsVerified] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);

  useEffect(() => {
    const success = searchParams.get('success');
    const refresh = searchParams.get('refresh');

    if (success === 'true') {
      toast.success('Cadastro atualizado com sucesso!');
      checkStatus();
      setSearchParams({});
    } else if (refresh === 'true') {
      checkStatus();
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, checkStatus]);

  // Show PIN dialog when status is loaded
  useEffect(() => {
    if (!isLoading && !isVerified) {
      setShowPinDialog(true);
    }
  }, [isLoading, isVerified]);

  const handlePinVerified = () => {
    setIsVerified(true);
    setShowPinDialog(false);
  };

  const handlePinCreated = () => {
    checkStatus();
  };

  // Show loading or PIN dialog if not verified
  if (!isVerified) {
    return (
      <ProducerLayout>
        <Helmet>
          <title>Financeiro | IngressoFácil</title>
          <meta name="description" content="Gerencie sua conta de pagamentos e configurações financeiras" />
        </Helmet>
        
        <PinVerificationDialog
          open={showPinDialog}
          onVerified={handlePinVerified}
          hasPin={status?.has_pin ?? false}
          onPinCreated={handlePinCreated}
        />

        <div className="flex items-center justify-center h-64">
          <div className="text-center text-muted-foreground">
            <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Aguardando verificação de segurança...</p>
          </div>
        </div>
      </ProducerLayout>
    );
  }

  return (
    <ProducerLayout>
      <Helmet>
        <title>Financeiro | IngressoFácil</title>
        <meta name="description" content="Gerencie sua conta de pagamentos e configurações financeiras" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Wallet className="w-7 h-7" />
            Financeiro
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie sua conta de pagamentos e configurações de segurança
          </p>
        </div>

        <div className="grid gap-6">
          <StripeConnectCard />
          <PinSetupCard />
        </div>
      </div>
    </ProducerLayout>
  );
}
