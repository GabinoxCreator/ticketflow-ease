import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { unformatCPF, validateCPF } from '@/utils/cpfValidator';

export interface CustomerLookupResult {
  name: string | null;
  email: string | null;
  whatsapp: string | null;
  source: 'profile' | 'order';
}

/**
 * Debounced lookup of a customer by CPF, scoped to the producer's event.
 * Returns null while typing or when CPF is invalid.
 */
export function useCustomerLookupByCPF(eventId: string | undefined, cpfInput: string) {
  const [result, setResult] = useState<CustomerLookupResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!eventId) { setResult(null); return; }
    const digits = unformatCPF(cpfInput);
    if (digits.length !== 11 || !validateCPF(digits)) {
      setResult(null);
      return;
    }

    let cancelled = false;
    const t = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.rpc('lookup_customer_by_cpf', {
          _event_id: eventId,
          _cpf: digits,
        });
        if (cancelled) return;
        if (error) {
          setResult(null);
        } else {
          const row = Array.isArray(data) ? data[0] : null;
          setResult(row ? (row as CustomerLookupResult) : null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 500);

    return () => { cancelled = true; window.clearTimeout(t); };
  }, [eventId, cpfInput]);

  return { result, isLoading };
}
