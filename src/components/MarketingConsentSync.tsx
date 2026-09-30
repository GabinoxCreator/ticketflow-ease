// Componente sem tela. Só existe para levar a decisão do banner de cookies para
// o perfil do titular no banco, nos três momentos em que ela pode mudar de dono:
// quando a pessoa decide no banner, quando ela entra na conta (a decisão já
// estava no navegador) e quando o pixel acabou de escrever os cookies _fbp/_fbc.
// Ver src/lib/marketingConsent.ts para o porquê.
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CONSENT_CHANGED_EVENT } from '@/lib/cookieConsent';
import { syncMarketingConsent, resetMarketingConsentCache } from '@/lib/marketingConsent';

const MarketingConsentSync = () => {
  useEffect(() => {
    // O _fbp só aparece um instante depois do pixel carregar; por isso a segunda
    // passada com folga.
    const sincronizar = () => {
      void syncMarketingConsent();
      window.setTimeout(() => void syncMarketingConsent(), 3000);
    };

    sincronizar();
    window.addEventListener(CONSENT_CHANGED_EVENT, sincronizar);

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        resetMarketingConsentCache();
        return;
      }
      sincronizar();
    });

    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, sincronizar);
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
};

export default MarketingConsentSync;
