import { Helmet } from 'react-helmet-async';
import { Wallet } from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { PinSetupCard } from '@/components/producer/PinSetupCard';
import { BankAccountCard } from '@/components/producer/BankAccountCard';

export default function Financeiro() {
  return (
    <ProducerLayout>
      <Helmet>
        <title>Financeiro | IngressoFácil</title>
        <meta name="description" content="Gerencie seus dados bancários para recebimento" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Wallet className="w-7 h-7" />
            Financeiro
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie seus dados bancários para recebimento
          </p>
        </div>

        <div className="grid gap-6">
          <BankAccountCard />
          <PinSetupCard />
        </div>
      </div>
    </ProducerLayout>
  );
}
