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

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, CheckCircle2, CreditCard, QrCode, ArrowRight, Zap, ShieldCheck, Clock } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSeatHold, type HoldState, readStoredOrderId, writeStoredOrderId, clearStoredOrderId } from '@/hooks/useSeatHold';
import { HoldCountdown } from '@/components/seated/HoldCountdown';
import { CheckoutStepProgressiveForm } from '@/components/checkout/CheckoutStepProgressiveForm';
import { CheckoutStepCPF } from '@/components/checkout/CheckoutStepCPF';
import { CheckoutStepPix } from '@/components/checkout/CheckoutStepPix';
import { SeatCheckoutCard, CARD_ERROR_MESSAGES } from '@/components/checkout/SeatCheckoutCard';
import { SeatOrderSummary } from '@/components/checkout/SeatOrderSummary';
import { validateCPF } from '@/utils/cpfValidator';


type Step = 'form' | 'cpf' | 'method' | 'pix' | 'card' | 'awaiting' | 'verifying' | 'success';


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

function ReservedPill({ expiresAt }: { expiresAt: string }) {
  const [ms, setMs] = useState(() => new Date(expiresAt).getTime() - Date.now());
  useEffect(() => {
    setMs(new Date(expiresAt).getTime() - Date.now());
    const id = setInterval(() => setMs(new Date(expiresAt).getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const safe = Math.max(0, ms);
  const m = Math.floor(safe / 60000);
  const s = Math.floor((safe % 60000) / 1000);
  const urgent = safe <= 60_000;
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium tabular-nums border ${
        urgent
          ? 'bg-destructive/10 border-destructive/30 text-destructive'
          : 'bg-primary/10 border-primary/25 text-primary'
      }`}
    >
      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
      <span>Reservada · {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</span>
    </div>
  );
}

export default function SeatCheckout() {
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

  const [event, setEvent] = useState<EventSummary | null>(null);
  const [seats, setSeats] = useState<SeatSummary[]>([]);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [customer, setCustomer] = useState<CustomerData | null>(null);

  // Pagamento ativo
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [pixCode, setPixCode] = useState('');
  const [pixExpiresAt, setPixExpiresAt] = useState<Date | null>(null);
  const [isStartingPix, setIsStartingPix] = useState(false);
  const pixRequestInFlightRef = useRef(false);

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

  // Pré-fill: profile (Lovable Cloud) tem prioridade, depois user_metadata.
  useEffect(() => {
    if (!user || customer) return;
    const meta = (user.user_metadata || {}) as Record<string, any>;
    setCustomer({
      name: profile?.nome_completo || meta.name || meta.full_name || user.email?.split('@')[0] || '',
      email: profile?.email || user.email || '',
      cpf: profile?.cpf || meta.cpf || '',
      phone: profile?.whatsapp || meta.phone || meta.whatsapp || '',
    });
  }, [user, profile, customer]);

  // Decide o step inicial assim que customer estiver pronto.
  useEffect(() => {
    if (!customer || step !== null) return;
    if (!user) {
      setStep('form');
      return;
    }
    const digits = (customer.cpf || '').replace(/\D/g, '');
    const cpfOk = digits.length === 11 && validateCPF(digits);
    const nameOk = customer.name.trim().length >= 3;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email);
    setStep(cpfOk && nameOk && emailOk ? 'method' : 'cpf');
  }, [customer, user, step]);


  const subtotal = useMemo(() => {
    if (!hold) return 0;
    return seats.reduce((acc, s) => {
      const base = Number(s.base_price ?? 0);
      const extra = Number(s.extra_price ?? 0);
      const qty = addons[s.id] ?? 0;
      return acc + base + extra * qty;
    }, 0);
  }, [hold, seats, addons]);

  // Taxa do evento (mesma fonte usada pelas edges create-seat-pix / charge-seat-card).
  const [feePercent, setFeePercent] = useState<number>(10);
  const [feeFixed, setFeeFixed] = useState<number>(0);
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_event_fee', { _event_id: eventId, _method: 'pix' });
        const row = Array.isArray(data) ? data[0] : data;
        if (cancelled || !row) return;
        if (row.fee_percent != null) setFeePercent(Number(row.fee_percent));
        if (row.fee_fixed != null) setFeeFixed(Number(row.fee_fixed));
      } catch {
        // mantém defaults (10% / 0)
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  const serviceFee = useMemo(() => {
    if (subtotal <= 0) return 0;
    return Math.max(0, Math.round((subtotal * feePercent / 100 + feeFixed) * 100) / 100);
  }, [subtotal, feePercent, feeFixed]);

  const totalAmount = useMemo(
    () => Math.round((subtotal + serviceFee) * 100) / 100,
    [subtotal, serviceFee]
  );


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
    if (eventId) clearStoredOrderId(eventId);
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
    if (pixRequestInFlightRef.current) return;
    pixRequestInFlightRef.current = true;
    setIsStartingPix(true);
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
        if (data.error === 'payment_already_started') {
          updateHoldExpiresAt(data.holdExpiresAt ?? null);
          if (data.orderId) setOrderId(data.orderId);
          if (data.paymentId) setPaymentId(String(data.paymentId));
          handleProviderUnreachable(data.orderId ?? null);
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
    } finally {
      pixRequestInFlightRef.current = false;
      setIsStartingPix(false);
    }
  }, [hold, eventId, customer, seatPayload, updateHoldExpiresAt, handleHoldErrorRedirect, handleProviderUnreachable, handlePaymentFailedGeneric]);

  // ----- Detector único (PIX + cartão). Fonte da verdade: webhook gravou orders.status='paid'.
  // Tentativa 1: edge check-mercadopago-payment (faz cross-validation valor+ext_ref).
  // Tentativa 2 (fallback): leitura direta de orders.status — seguro porque o webhook
  // só grava 'paid' após validar signature + external_reference + amount.
  const checkPaymentStatus = useCallback(async (): Promise<boolean> => {
    if (!orderId) return false;
    try {
      const { data, error } = await supabase.functions.invoke('check-mercadopago-payment', {
        body: { paymentId: paymentId || null, orderId },
      });
      if (!error && data?.paid === true) return true;
    } catch { /* segue pro fallback */ }
    try {
      const { data: row } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .maybeSingle();
      return row?.status === 'paid' || row?.status === 'completed';
    } catch {
      return false;
    }
  }, [orderId, paymentId]);

  const handlePaymentConfirmed = useCallback(() => {
    if (eventId) clearStoredOrderId(eventId);
    clearLocalHold();
    setStep('success');
  }, [clearLocalHold, eventId]);

  // Polling do step 'awaiting' (cartão approved_pending). 90s sem paid → leitura
  // direta final; se paid → success; senão → step 'verifying' terminal (nunca
  // spinner infinito). PIX NÃO usa este timeout — espera natural do usuário.
  useEffect(() => {
    if (step !== 'awaiting' || !orderId) return;
    let cancelled = false;
    let inFlight = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();
    const HARD_TIMEOUT_MS = 90_000;
    const tick = async () => {
      if (cancelled) return;
      if (inFlight) { timeoutId = setTimeout(tick, 4000); return; }
      inFlight = true;
      try {
        const paid = await checkPaymentStatus();
        if (cancelled) return;
        if (paid) { handlePaymentConfirmed(); return; }
      } finally { inFlight = false; }
      if (cancelled) return;
      if (Date.now() - startedAt >= HARD_TIMEOUT_MS) {
        // Última tentativa direta — webhook pode ter gravado fora da janela do edge
        try {
          const { data: row } = await supabase
            .from('orders').select('status').eq('id', orderId).maybeSingle();
          if (cancelled) return;
          if (row?.status === 'paid' || row?.status === 'completed') {
            handlePaymentConfirmed();
            return;
          }
        } catch { /* cai pro verifying */ }
        setStep('verifying');
        return;
      }
      timeoutId = setTimeout(tick, 4000);
    };
    timeoutId = setTimeout(tick, 2000);
    return () => { cancelled = true; if (timeoutId) clearTimeout(timeoutId); };
  }, [step, orderId, checkPaymentStatus, handlePaymentConfirmed]);

  // Idempotência ao montar: se já há orderId salvo pra este evento, checa status.
  // Se paid → vai direto pra success (anti-double-payment). Se terminal → limpa e segue fluxo normal.
  useEffect(() => {
    if (!eventId || !user) return;
    const stored = readStoredOrderId(eventId);
    if (!stored) return;
    let cancelled = false;
    (async () => {
      const { data: row } = await supabase
        .from('orders').select('status').eq('id', stored).maybeSingle();
      if (cancelled) return;
      const s = row?.status;
      if (s === 'paid' || s === 'completed') {
        setOrderId(stored);
        clearLocalHold();
        setStep('success');
      } else if (s && ['cancelled','refunded','failed','expired','charged_back'].includes(s)) {
        clearStoredOrderId(eventId);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId, user, clearLocalHold]);

  // Persist orderId quando setado (sobrevive a refresh — anti-double-payment).
  useEffect(() => {
    if (eventId && orderId) writeStoredOrderId(eventId, orderId);
  }, [eventId, orderId]);


  // ----- Render -----
  if (!eventId || loadingEvent) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-32 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></main>
      </div>
    );
  }
  if (!hold || !event || !customer || step === null) {
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
          <div className="flex items-center justify-between mb-4 gap-3">
            <button
              type="button"
              onClick={() => navigate(`/evento/${eventId}`)}
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar ao mapa
            </button>
            {step !== 'success' && <ReservedPill expiresAt={hold.expiresAt} />}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 mb-5">
            {(['method', 'pix', 'card', 'awaiting'] as Step[]).includes(step) ? (
              <div className="mb-5">
                <SeatOrderSummary event={event} seats={seats} addons={addons} totalAmount={totalAmount} />
              </div>
            ) : (
              <>
                <h1 className="font-display font-bold text-xl mb-1">{event.title}</h1>
                <p className="text-sm text-muted-foreground mb-3">{event.venue} — {event.city}/{event.state}</p>
              </>
            )}
            {step === 'form' && !user && (

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

            {step === 'cpf' && user && (
              <motion.div key="cpf" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <CheckoutStepCPF
                  initialCPF={customer.cpf}
                  initialName={customer.name}
                  initialEmail={customer.email}
                  requireName={customer.name.trim().length < 3}
                  requireEmail={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)}
                  onContinue={(cpf, name, email) => {
                    setCustomer({
                      ...customer,
                      cpf,
                      name: name?.trim() ? name.trim() : customer.name,
                      email: email?.trim() ? email.trim() : customer.email,
                    });
                    setStep('method');
                  }}
                />
              </motion.div>
            )}



            {step === 'method' && (
              <motion.div key="method" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
                <h2 className="font-display font-semibold text-lg">Como você quer pagar?</h2>

                <button
                  type="button"
                  onClick={handleStartPix}
                  disabled={isStartingPix}
                  aria-label="Pagar com PIX, aprovação imediata, recomendado"
                  className="group relative w-full overflow-hidden rounded-2xl p-5 text-left text-white shadow-lg shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #c026d3 55%, #ec4899 100%)' }}
                >
                  <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/20 backdrop-blur px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    <Zap className="w-3 h-3" aria-hidden="true" />
                    Recomendado
                  </span>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center flex-shrink-0 border border-white/20">
                      {isStartingPix ? (
                        <Loader2 className="w-7 h-7 animate-spin" aria-hidden="true" />
                      ) : (
                        <QrCode className="w-7 h-7" aria-hidden="true" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pr-16">
                      <p className="font-display font-bold text-lg leading-tight">
                        {isStartingPix ? 'Gerando PIX...' : 'Pagar com PIX'}
                      </p>
                      <p className="text-sm text-white/85 mt-0.5">Aprovação na hora · sem taxas extras</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-white/80 group-hover:translate-x-1 transition-transform flex-shrink-0" aria-hidden="true" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setStep('card')}
                  aria-label="Pagar com cartão de crédito em até 12 parcelas"
                  className="group w-full rounded-2xl p-5 text-left bg-card border border-border/70 transition-all duration-300 hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10 active:scale-[0.99]"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-secondary/60 border border-border/60 flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-7 h-7 text-foreground/80" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-semibold text-base leading-tight">Pagar com cartão</p>
                      <p className="text-sm text-muted-foreground mt-0.5">Crédito · parcele em até 12x</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0" aria-hidden="true" />
                  </div>
                </button>

                <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                  <span>Pagamento 100% seguro e criptografado</span>
                </div>
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
                    if (eventId) clearStoredOrderId(eventId);
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

            {step === 'verifying' && (
              <motion.div key="verifying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-10 space-y-5">
                <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/15 flex items-center justify-center">
                  <Clock className="w-8 h-8 text-amber-500" />
                </div>
                <h2 className="font-display font-semibold text-lg">Pagamento em verificação</h2>
                <p className="text-sm text-muted-foreground">
                  Sua transação foi enviada e está sendo confirmada. Se já foi aprovada, seus ingressos aparecerão em Meus Ingressos em alguns instantes.
                </p>
                <div className="flex flex-col gap-2">
                  <Button variant="hero" size="lg" onClick={() => navigate('/meus-ingressos')}>
                    Ver meus ingressos
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      const paid = await checkPaymentStatus();
                      if (paid) handlePaymentConfirmed();
                      else toast.info('Ainda não confirmado. Tente novamente em alguns segundos.');
                    }}
                  >
                    Verificar de novo
                  </Button>
                </div>
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
          </div>
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
