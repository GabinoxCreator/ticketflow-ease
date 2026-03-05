import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Wallet, Loader2 } from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { PinSetupCard } from '@/components/producer/PinSetupCard';
import { BankAccountCard } from '@/components/producer/BankAccountCard';
import { PinVerificationDialog } from '@/components/producer/PinVerificationDialog';
import { supabase } from '@/integrations/supabase/client';

export default function Financeiro() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);

  const checkPinStatus = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('producer_stripe_accounts')
        .select('pin_hash')
        .single();
      setHasPin(!!data?.pin_hash);
    } catch {
      setHasPin(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkPinStatus();
  }, [checkPinStatus]);

  const showContent = !hasPin || isUnlocked;

  return (
    <ProducerLayout>
      <Helmet>
        <title>Financeiro | IngressoFácil</title>
        <meta name="description" content="Gerencie seus dados bancários para recebimento" />
      </Helmet>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <PinVerificationDialog
            open={hasPin && !isUnlocked}
            onVerified={() => setIsUnlocked(true)}
            hasPin={hasPin}
            onPinCreated={() => {
              setHasPin(true);
              setIsUnlocked(true);
            }}
          />

          {showContent && (
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
          )}
        </>
      )}
    </ProducerLayout>
  );
}
