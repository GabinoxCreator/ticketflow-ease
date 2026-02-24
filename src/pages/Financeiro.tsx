import { Helmet } from 'react-helmet-async';
import { Wallet } from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { PinSetupCard } from '@/components/producer/PinSetupCard';

export default function Financeiro() {
  return (
    <ProducerLayout>
      <Helmet>
        <title>Financeiro | IngressoFácil</title>
        <meta name="description" content="Gerencie suas configurações financeiras" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Wallet className="w-7 h-7" />
            Financeiro
          </h1>
          <p className="text-muted-foreground mt-1">
            Pagamentos processados via Mercado Pago
          </p>
        </div>

        <div className="grid gap-6">
          <div className="bg-card border border-border rounded-2xl p-6">
            <h2 className="font-semibold text-lg mb-2">Mercado Pago</h2>
            <p className="text-muted-foreground text-sm">
              Os pagamentos são processados diretamente pela sua conta do Mercado Pago. 
              Acesse o painel do Mercado Pago para ver seus recebimentos e extratos.
            </p>
          </div>
          <PinSetupCard />
        </div>
      </div>
    </ProducerLayout>
  );
}
