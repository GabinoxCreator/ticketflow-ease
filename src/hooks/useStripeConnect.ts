import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface StripeConnectStatus {
  connected: boolean;
  status: 'not_connected' | 'pending' | 'restricted' | 'active';
  onboarding_completed: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  has_pin: boolean;
}

export function useStripeConnect() {
  const { user } = useAuth();
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!user) {
      setStatus(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('check-stripe-connect-status');
      
      if (error) throw error;
      
      setStatus(data);
    } catch (error) {
      console.error('Error checking Stripe status:', error);
      setStatus({
        connected: false,
        status: 'not_connected',
        onboarding_completed: false,
        has_pin: false,
      });
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const startOnboarding = async () => {
    if (!user) {
      toast.error('Você precisa estar logado');
      return;
    }

    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-connect-account');
      
      if (error) throw error;
      
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error starting onboarding:', error);
      toast.error('Erro ao iniciar conexão com Stripe');
    } finally {
      setIsConnecting(false);
    }
  };

  const openDashboard = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-stripe-dashboard-link');
      
      if (error) throw error;
      
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Error getting dashboard link:', error);
      toast.error('Erro ao abrir dashboard');
    }
  };

  const setPin = async (pin: string, currentPin?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('set-producer-pin', {
        body: { pin, current_pin: currentPin },
      });
      
      if (error) throw error;
      
      if (data?.success) {
        toast.success('PIN configurado com sucesso');
        await checkStatus();
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('Error setting PIN:', error);
      const message = error?.message || 'Erro ao configurar PIN';
      toast.error(message);
      return false;
    }
  };

  return {
    status,
    isLoading,
    isConnecting,
    checkStatus,
    startOnboarding,
    openDashboard,
    setPin,
  };
}
