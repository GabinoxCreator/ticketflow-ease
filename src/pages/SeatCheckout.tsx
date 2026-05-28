// Checkout de MESA. Lê hold + addons do sessionStorage; rota /checkout/mesa/:eventId.
// Caminho único de promoção: SEMPRE espera webhook (paid:true vindo do
// check-mercadopago-payment). Esta página nunca promove.
//
// Limpeza:
// - hold_expired / seat_not_held / seat_not_found → toast + clearLocalHold + redirect.
//   Sem release manual (servidor já não reconhece esse hold).
// - rejected (cartão) → clearLocalHold + volta pro mapa. Sem release (edge já chamou
//   release_seats_for_order).
// - success → clearLocalHold ANTES de mudar de step. Cleanup do unmount não solta nada.
// - payment_failed (manipulation/desconhecido) → mensagem genérica, mantém o step.
// - payment_provider_unreachable → toast "em verificação" + awaiting.

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, CheckCircle2, CreditCard, QrCode } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSeatHold, type HoldState } from '@/hooks/useSeatHold';
import { HoldCountdown } from '@/components/seated/HoldCountdown';
import { CheckoutStepProgressiveForm } from '@/components/checkout/CheckoutStepProgressiveForm';
import { CheckoutStepCPF } from '@/components/checkout/CheckoutStepCPF';
import { CheckoutStepPix } from '@/components/checkout/CheckoutStepPix';
import { SeatCheckoutCard, CARD_ERROR_MESSAGES } from '@/components/checkout/SeatCheckoutCard';
import { validateCPF } from '@/utils/cpfValidator';

type Step = 'form' | 'cpf' | 'method' | 'pix' | 'card' | 'awaiting' | 'success';


interface CustomerData {
  name: string;
  email: string;
  cpf: string;
  phone: string;
}

interface EventSummary {
  id: string;
  title: string;
  slug: string | null;
  date: string;
  venue: string;
  city: string;
  state: string;
}

interface SeatSummary {
  id: string;
  label: string | null;
  code: string | null;
  seat_type_name: string | null;
  base_price: number | null;
  extra_price: number | null;
  base_capacity: number | null;
  max_capacity: number | null;
}

const HONEST_HOLD_ERRORS = new Set(['hold_expired', 'seat_not_held', 'seat_not_found']);
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const {
    hold,
    addons,
    updateHoldExpiresAt,
    clearLocalHold,
    markProceeding,
  } = useSeatHold(eventId, user?.id);

  const [step, setStep] = useState<Step | null>(null);

  } = useSeatHold(eventId, user?.id);

  const [step, setStep] = useState<Step>('form');
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [seats, setSeats] = useState<SeatSummary[]>([]);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [customer, setCustomer] = useState<CustomerData | null>(null);

  // Pagamento ativo
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [pixCode, setPixCode] = useState('');
  const [pixExpiresAt, setPixExpiresAt] = useState<Date | null>(null);

  // Guard contra loop de redirect quando hold ausente
  const [hasCheckedHold, setHasCheckedHold] = useState(false);

  // Carrega evento + assentos só uma vez
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      setLoadingEvent(true);
      const { data: ev } = await supabase
        .from('events')
        .select('id, title, slug, date, venue, city, state')
        .eq('id', eventId)
        .maybeSingle();
      if (ev) setEvent(ev as EventSummary);
      setLoadingEvent(false);
    })();
  }, [eventId]);

  useEffect(() => {
    if (!eventId || !hold?.seatIds.length) return;
    (async () => {
      const { data } = await supabase
        .from('event_seats')
        .select('id,label,code,seat_type_name,base_price,extra_price,base_capacity,max_capacity')
        .in('id', hold.seatIds);
      if (data) setSeats(data as SeatSummary[]);
    })();
  }, [eventId, hold?.seatIds]);

  // Guard: sem hold válido → redirect (sem release: servidor já não reconhece esse hold).
  useEffect(() => {
    if (!eventId) return;
    if (hasCheckedHold) return;
    // Espera um tick pra hidratação do sessionStorage
    const t = setTimeout(() => {
      setHasCheckedHold(true);
      if (!hold) {
        toast.error('Sua reserva expirou ou não foi encontrada. Selecione novamente.');
        navigate(`/evento/${eventId}`, { replace: true });
      }
    }, 200);
    return () => clearTimeout(t);
  }, [eventId, hold, navigate, hasCheckedHold]);

  // Pré-fill com user_metadata
  useEffect(() => {
    if (!user || customer) return;
    const meta = (user.user_metadata || {}) as Record<string, any>;
    setCustomer({
      name: meta.name || meta.full_name || user.email?.split('@')[0] || '',
      email: user.email || '',
      cpf: meta.cpf || '',
      phone: meta.phone || meta.whatsapp || '',
    });
  }, [user, customer]);

  const totalAmount = useMemo(() => {
    if (!hold) return 0;
    return seats.reduce((acc, s) => {
      const base = Number(s.base_price ?? 0);
      const extra = Number(s.extra_price ?? 0);
      const qty = addons[s.id] ?? 0;
      return acc + base + extra * qty;
    }, 0);
  }, [hold, seats, addons]);

  const seatPayload = useMemo(
    () => (hold?.seatIds ?? []).map((id) => ({ seatId: id, addons: addons[id] ?? 0 })),
    [hold, addons]
  );

  const handleHoldErrorRedirect = useCallback((code: string) => {
    if (code === 'hold_expired') {
      toast.error('Sua reserva expirou. Selecione novamente.');
    } else {
      toast.error('Sua reserva não está mais disponível. Selecione novamente.');
    }
    clearLocalHold();
    navigate(`/evento/${eventId}`, { replace: true });
  }, [clearLocalHold, navigate, eventId]);

  const handlePaymentFailedGeneric = useCallback(() => {
    toast.error('Não foi possível processar. Tente novamente.');
  }, []);

  const handleProviderUnreachable = useCallback((oid: string | null) => {
    toast.info('Pagamento em verificação. Aguarde a confirmação.');
    if (oid) setOrderId(oid);
    setStep('awaiting');
  }, []);

  // ----- PIX -----
  const handleStartPix = useCallback(async () => {
    if (!hold || !eventId || !customer) return;
    try {
      const { data, error } = await supabase.functions.invoke('create-seat-pix', {
        body: {
          eventId,
          holdToken: hold.token,
          seats: seatPayload,
          customerName: customer.name,
          customerEmail: customer.email,
          customerCPF: customer.cpf,
          customerPhone: customer.phone,
          deviceId: (window as any).MP_DEVICE_SESSION_ID || null,
        },
      });
      if (error) throw error;
      if (data?.error) {
        if (HONEST_HOLD_ERRORS.has(data.error)) {
          handleHoldErrorRedirect(data.error);
          return;
        }
        if (data.error === 'payment_provider_unreachable') {
          handleProviderUnreachable(data.orderId ?? null);
          return;
        }
        handlePaymentFailedGeneric();
        return;
      }
      if (!data?.pixCode || !data?.orderId) {
        handlePaymentFailedGeneric();
        return;
      }
      updateHoldExpiresAt(data.holdExpiresAt ?? null);
      setOrderId(data.orderId);
      setPaymentId(data.paymentId ? String(data.paymentId) : null);
      setPixCode(data.pixCode);
      setPixExpiresAt(data.expiresAt ? new Date(data.expiresAt) : new Date(Date.now() + 15 * 60_000));
      setStep('pix');
    } catch (err: any) {
      console.error('create-seat-pix error', err);
      handlePaymentFailedGeneric();
    }
  }, [hold, eventId, customer, seatPayload, updateHoldExpiresAt, handleHoldErrorRedirect, handleProviderUnreachable, handlePaymentFailedGeneric]);

  // ----- Polling (PIX + cartão approved_pending) -----
  const checkPaymentStatus = useCallback(async (): Promise<boolean> => {
    if (!orderId) return false;
    try {
      const { data, error } = await supabase.functions.invoke('check-mercadopago-payment', {
        body: { paymentId: paymentId || null, orderId },
      });
      if (error) return false;
      return data?.paid === true;
    } catch {
      return false;
    }
  }, [orderId, paymentId]);

  const handlePaymentConfirmed = useCallback(() => {
    clearLocalHold();
    setStep('success');
  }, [clearLocalHold]);

  // Polling no awaiting (cartão approved_pending_confirmation)
  useEffect(() => {
    if (step !== 'awaiting' || !orderId) return;
    let cancelled = false;
    let inFlight = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (cancelled) return;
      if (inFlight) { timeoutId = setTimeout(tick, 4000); return; }
      inFlight = true;
      try {
        const paid = await checkPaymentStatus();
        if (cancelled) return;
        if (paid) { handlePaymentConfirmed(); return; }
      } finally { inFlight = false; }
      if (!cancelled) timeoutId = setTimeout(tick, 4000);
    };
    timeoutId = setTimeout(tick, 2000);
    return () => { cancelled = true; if (timeoutId) clearTimeout(timeoutId); };
  }, [step, orderId, checkPaymentStatus, handlePaymentConfirmed]);

  // ----- Render -----
  if (!eventId || loadingEvent) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-32 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></main>
      </div>
    );
  }

  if (!hold || !event || !customer) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-32 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></main>
      </div>
    );
  }

  return (
    <>
      <Helmet><title>Checkout — {event.title}</title></Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-16 max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => navigate(`/evento/${eventId}`)}
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar ao mapa
            </button>
            {step !== 'success' && <HoldCountdown expiresAt={hold.expiresAt} />}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 mb-5">
            <h1 className="font-display font-bold text-xl mb-1">{event.title}</h1>
            <p className="text-sm text-muted-foreground mb-3">{event.venue} — {event.city}/{event.state}</p>
            <SummaryList seats={seats} addons={addons} totalAmount={totalAmount} />
          </div>

          <AnimatePresence mode="wait">
            {step === 'form' && (
              <motion.div key="form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <CheckoutStepProgressiveForm
                  initialData={customer}
                  onComplete={(data) => {
                    setCustomer({ name: data.name, email: data.email, cpf: data.cpf, phone: data.phone });
                    setStep('method');
                  }}
                />
              </motion.div>
            )}

            {step === 'method' && (
              <motion.div key="method" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-3">
                <Button variant="hero" size="lg" className="w-full justify-start gap-3 h-14" onClick={handleStartPix}>
                  <QrCode className="w-5 h-5" /> Pagar com PIX
                </Button>
                <Button variant="outline" size="lg" className="w-full justify-start gap-3 h-14" onClick={() => setStep('card')}>
                  <CreditCard className="w-5 h-5" /> Pagar com cartão
                </Button>
              </motion.div>
            )}

            {step === 'pix' && pixExpiresAt && (
              <motion.div key="pix" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <CheckoutStepPix
                  pixCode={pixCode}
                  totalAmount={totalAmount}
                  expiresAt={pixExpiresAt}
                  onExpire={() => handleHoldErrorRedirect('hold_expired')}
                  onPaymentConfirmed={handlePaymentConfirmed}
                  checkPaymentStatus={checkPaymentStatus}
                />
              </motion.div>
            )}

            {step === 'card' && (
              <motion.div key="card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <SeatCheckoutCard
                  eventId={eventId}
                  eventTitle={event.title}
                  holdToken={hold.token}
                  seats={seatPayload}
                  totalAmount={totalAmount}
                  customerName={customer.name}
                  customerEmail={customer.email}
                  customerPhone={customer.phone}
                  customerCPF={customer.cpf}
                  onApprovedPending={(oid, pid, holdIso) => {
                    updateHoldExpiresAt(holdIso);
                    setOrderId(oid);
                    setPaymentId(pid ?? null);
                    setStep('awaiting');
                  }}
                  onInProcess={(oid, pid, holdIso) => {
                    updateHoldExpiresAt(holdIso);
                    setOrderId(oid);
                    setPaymentId(pid ?? null);
                    setStep('awaiting');
                  }}
                  onRejected={(errorCode) => {
                    const msg = CARD_ERROR_MESSAGES[errorCode] || 'Pagamento recusado. Tente outro cartão.';
                    toast.error(msg);
                    clearLocalHold();
                    navigate(`/evento/${eventId}`, { replace: true });
                  }}
                  onError={(message) => {
                    if (HONEST_HOLD_ERRORS.has(message)) {
                      handleHoldErrorRedirect(message);
                      return;
                    }
                    if (message === 'payment_provider_unreachable') {
                      handleProviderUnreachable(orderId);
                      return;
                    }
                    handlePaymentFailedGeneric();
                  }}
                />
              </motion.div>
            )}

            {step === 'awaiting' && (
              <motion.div key="awaiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12 space-y-4">
                <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
                <h2 className="font-display font-semibold text-lg">Finalizando pagamento…</h2>
                <p className="text-sm text-muted-foreground">Estamos confirmando sua transação. Não feche esta janela.</p>
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-10 space-y-5">
                <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </div>
                <h2 className="font-display font-bold text-2xl">Pagamento confirmado!</h2>
                <p className="text-sm text-muted-foreground">Seus assentos estão garantidos.</p>
                <Button variant="hero" size="lg" onClick={() => navigate('/meus-ingressos')}>
                  Ver meus ingressos
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
        <Footer />
      </div>
    </>
  );
}

function SummaryList({ seats, addons, totalAmount }: { seats: SeatSummary[]; addons: Record<string, number>; totalAmount: number }) {
  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return (
    <>
      <ul className="space-y-1.5 mb-3">
        {seats.map((s) => {
          const base = Number(s.base_price ?? 0);
          const extra = Number(s.extra_price ?? 0);
          const qty = addons[s.id] ?? 0;
          return (
            <li key={s.id} className="flex justify-between text-sm">
              <span className="truncate">
                {s.label || s.code || 'Assento'}
                {qty > 0 && <span className="text-muted-foreground"> · +{qty}</span>}
              </span>
              <span className="tabular-nums">{fmt(base + extra * qty)}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-between font-semibold pt-2 border-t border-border">
        <span>Total</span>
        <span className="gradient-text">{fmt(totalAmount)}</span>
      </div>
    </>
  );
}
