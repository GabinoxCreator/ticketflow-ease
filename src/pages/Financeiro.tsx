import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { StripeConnectCard } from '@/components/producer/StripeConnectCard';
import { PinSetupCard } from '@/components/producer/PinSetupCard';
import { useStripeConnect } from '@/hooks/useStripeConnect';

export default function Financeiro() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { checkStatus } = useStripeConnect();

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
