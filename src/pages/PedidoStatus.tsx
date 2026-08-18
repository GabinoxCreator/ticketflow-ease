import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, Loader2, Ticket, AlertCircle, ArrowLeft, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CheckoutStepPix } from '@/components/checkout/CheckoutStepPix';
import { supabase } from '@/integrations/supabase/client';
import { readPendingCheckout, clearPendingCheckout } from '@/lib/pendingCheckout';

/*
 * Acompanhamento do pedido — /pedido/:orderId
 *
 * POR QUE ESTA TELA EXISTE (incidente de 13/08): o checkout do PIX vivia inteiro
 * dentro do modal, em memória. O cliente saía para o app do banco e, ao voltar,
 * o Supabase reemitia o token (onAuthStateChange) → `profile` mudava de referência
 * → o efeito de abertura do modal rodava de novo e devolvia o passo para 'payment'.
 * Resultado: pagamento aprovado, ingresso emitido, e a tela parada na escolha de
 * meio de pagamento — cliente achando que não pagou (e alguns pagaram duas vezes).
 *
 * Esta tela tem ENDEREÇO PRÓPRIO: sobrevive a recarregar, a fechar o navegador e
 * a voltar do app do banco. Três caminhos de confirmação, do mais rápido ao mais
 * teimoso:
 *   1. realtime na própria linha do pedido (chega no instante em que o webhook aprova);
 *   2. verificação quando a aba volta ao foco (o retorno do app do banco);
 *   3. polling de 5s chamando a edge, que também RECONCILIA com o Mercado Pago
 *      quando o webhook não chegou.
 * O QR só some da tela quando o pedido sai de 'pending'.
 */

type OrderRow = {
  id: string;
  status: string;
  total_amount: number;
  expires_at: string | null;
  event_id: string;
  mp_payment_id: string | null;
  provider_transaction_id: string | null;
  payment_method: string | null;
};

const POLL_MS = 5000;

export default function PedidoStatus() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [eventTitle, setEventTitle] = useState<string>('');
  // Qual provedor confere este pagamento. Default 'mercadopago' porque é o que
  // vale para todo evento que ainda não migrou — nunca chutar 'marcel'.
  const [paymentProvider, setPaymentProvider] = useState<string>('mercadopago');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // O código PIX não é persistido no banco (a edge só devolve na resposta), então
  // guardamos localmente para conseguir remostrar o QR na volta. Sem ele a tela
  // ainda funciona: mostra o status e o botão de verificar.
  const [pending] = useState(() => (orderId ? readPendingCheckout(orderId) : null));
  const [pixCode] = useState<string | null>(pending?.pixCode ?? null);

  const isPaid = order?.status === 'paid';
  const isPending = order?.status === 'pending';
  const isDead = !!order && !isPaid && !isPending; // expired / failed / cancelled

  const fetchOrder = useCallback(async (): Promise<OrderRow | null> => {
    if (!orderId) return null;
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, total_amount, expires_at, event_id, mp_payment_id, provider_transaction_id, payment_method')
      .eq('id', orderId)
      .maybeSingle();
    if (error) {
      console.warn('[PEDIDO] erro ao ler pedido:', error.message);
      return null;
    }
    if (!data) {
      setNotFound(true);
      return null;
    }
    setOrder(data as OrderRow);
    return data as OrderRow;
  }, [orderId]);

  // Carga inicial + título do evento.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const row = await fetchOrder();
      if (cancelled) return;
      if (row?.event_id) {
        const { data: ev } = await supabase
          .from('events')
          .select('title, payment_provider')
          .eq('id', row.event_id)
          .maybeSingle();
        if (!cancelled && ev?.title) setEventTitle(ev.title);
        if (!cancelled && ev?.payment_provider) setPaymentProvider(ev.payment_provider);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchOrder]);

  // Limpa o rascunho local assim que o pedido deixa de estar pendente.
  useEffect(() => {
    if (orderId && order && order.status !== 'pending') clearPendingCheckout(orderId);
  }, [orderId, order]);

  /* ---------- caminho 1: realtime na linha do pedido ---------- */
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order-status-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload) => {
          const next = payload.new as Partial<OrderRow>;
          if (next?.status) setOrder((prev) => (prev ? { ...prev, ...next } as OrderRow : prev));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  /* ---------- caminho 2 e 3: verificação ativa ----------
   * A edge é a autoridade: ela consulta o Mercado Pago e promove o pedido se o
   * webhook não tiver chegado. Guardamos em ref o que o efeito precisa, para o
   * polling NÃO reiniciar a cada render (foi um dos defeitos do checkout antigo:
   * o timer de 5s recomeçava do zero antes de disparar). */
  const checkRef = useRef<() => Promise<boolean>>(async () => false);

  const checkPaymentStatus = useCallback(async (): Promise<boolean> => {
    if (!orderId) return false;
    try {
      // A edge é escolhida pelo provedor DO EVENTO. Chamar a do Mercado Pago num
      // pedido do Marcel devolve 400 ("paymentId and orderId are required") e o
      // cliente fica olhando "aguardando" até o reconciliador passar — foi o que
      // apareceu na verificação em produção da madrugada de 18/08.
      const checkFn = paymentProvider === 'marcel' ? 'marcel-check-pix' : 'check-mercadopago-payment';
      const { data, error } = checkFn === 'marcel-check-pix'
        // A edge do Marcel só precisa do pedido: ela busca o id da transação no
        // banco sozinha (e, se não houver, reconcilia pelo purchaseId).
        ? await supabase.functions.invoke('marcel-check-pix', { body: { orderId } })
        : await supabase.functions.invoke('check-mercadopago-payment', {
            body: { orderId, paymentId: order?.mp_payment_id ?? pending?.paymentId ?? null },
          });
      // As duas edges respondem `paid`; a do Marcel também manda `pago`.
      if (!error && (data?.paid === true || data?.pago === true)) {
        await fetchOrder();
        return true;
      }
    } catch (e) {
      console.warn('[PEDIDO] verificação falhou (segue tentando):', e);
    }
    // Mesmo sem resposta da edge, reler o banco cobre o caso do webhook já ter aprovado.
    const row = await fetchOrder();
    return row?.status === 'paid';
  }, [orderId, order?.mp_payment_id, order?.provider_transaction_id, pending?.paymentId, paymentProvider, fetchOrder]);

  useEffect(() => { checkRef.current = checkPaymentStatus; }, [checkPaymentStatus]);

  useEffect(() => {
    if (!orderId || !isPending) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    const tick = async () => {
      if (cancelled) return;
      if (!inFlight) {
        inFlight = true;
        try { await checkRef.current(); } finally { inFlight = false; }
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);

    // O momento exato em que o cliente volta do app do banco.
    const onVisible = () => { if (document.visibilityState === 'visible') void checkRef.current(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [orderId, isPending]);

  const noop = useCallback(() => {}, []);
  const handleExpire = useCallback(() => { void fetchOrder(); }, [fetchOrder]);

  /* ---------------------------- render ---------------------------- */

  if (loading) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando seu pedido…</p>
        </div>
      </Shell>
    );
  }

  if (notFound || !order) {
    return (
      <Shell>
        <div className="text-center space-y-4 py-12">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
          <h1 className="font-display font-bold text-xl">Pedido não encontrado</h1>
          <p className="text-sm text-muted-foreground">
            Se você acabou de pagar, o ingresso pode já estar na sua conta.
          </p>
          <Button variant="hero" className="w-full h-12" onClick={() => navigate('/meus-ingressos')}>
            <Ticket className="w-4 h-4 mr-2" /> Ver meus ingressos
          </Button>
        </div>
      </Shell>
    );
  }

  if (isPaid) {
    return (
      <Shell>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-5 py-8"
        >
          <div className="mx-auto w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-11 h-11 text-emerald-400" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display font-bold text-2xl">Pagamento confirmado!</h1>
            <p className="text-muted-foreground text-sm">
              {eventTitle ? <>Seu ingresso para <b>{eventTitle}</b> já está na sua conta.</> : 'Seu ingresso já está na sua conta.'}
            </p>
          </div>
          <div className="rounded-xl bg-card/60 border border-border/60 p-3">
            <p className="text-[11px] text-muted-foreground">
              Pedido #{order.id.slice(0, 8).toUpperCase()} · {formatPrice(Number(order.total_amount))}
            </p>
          </div>
          <Button variant="hero" className="w-full h-14 text-base" onClick={() => navigate('/meus-ingressos')}>
            <Ticket className="w-5 h-5 mr-2" /> Ver meus ingressos
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate('/')}>
            Voltar ao início
          </Button>
        </motion.div>
      </Shell>
    );
  }

  if (isDead) {
    return (
      <Shell>
        <div className="text-center space-y-4 py-10">
          <Clock className="w-12 h-12 text-amber-500 mx-auto" />
          <h1 className="font-display font-bold text-xl">Este pedido não foi concluído</h1>
          <p className="text-sm text-muted-foreground">
            O prazo de pagamento expirou ou a compra não foi finalizada. Se o valor saiu da sua conta,
            fale com a gente pela Central de Ajuda — nós verificamos e regularizamos.
          </p>
          <Button variant="hero" className="w-full h-12" onClick={() => navigate(`/evento/${order.event_id}`)}>
            Comprar novamente
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate('/ajuda')}>
            Preciso de ajuda
          </Button>
        </div>
      </Shell>
    );
  }

  // Pendente: com o código guardado, remostra o QR; sem ele, mostra a espera.
  return (
    <Shell>
      {pixCode && order.expires_at ? (
        <div className="space-y-4">
          <Banner />
          <CheckoutStepPix
            pixCode={pixCode}
            totalAmount={Number(order.total_amount)}
            expiresAt={new Date(order.expires_at)}
            onExpire={handleExpire}
            onPaymentConfirmed={noop}
            checkPaymentStatus={checkPaymentStatus}
          />
        </div>
      ) : (
        <div className="text-center space-y-5 py-10">
          <div className="mx-auto w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center">
            <Clock className="w-10 h-10 text-amber-500 animate-pulse" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display font-bold text-xl">Aguardando a confirmação do pagamento</h1>
            <p className="text-sm text-muted-foreground">
              Assim que o banco confirmar, esta tela muda sozinha e o ingresso aparece na sua conta.
              Pode deixar aberta.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Verificando…</span>
          </div>
          <div className="rounded-xl bg-card/60 border border-border/60 p-3">
            <p className="text-[11px] text-muted-foreground">
              Pedido #{order.id.slice(0, 8).toUpperCase()} · {formatPrice(Number(order.total_amount))}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Já pagou e ainda aparece assim? Não pague de novo — confira em Meus Ingressos ou fale com a gente.
          </p>
          <Button variant="outline" className="w-full h-12" onClick={() => navigate('/meus-ingressos')}>
            <Ticket className="w-4 h-4 mr-2" /> Ver meus ingressos
          </Button>
        </div>
      )}
    </Shell>
  );
}

function Banner() {
  return (
    <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 text-center">
      <p className="text-xs text-foreground/80">
        Esta página fica te esperando. <b>Pode ir ao app do banco e voltar</b> — a confirmação aparece aqui sozinha.
      </p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-[100dvh] bg-background relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-20 w-80 h-80 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-accent/10 blur-3xl" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-md px-5 py-6">
        <button
          onClick={() => navigate('/')}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Início
        </button>
        {children}
        <div className="mt-6 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3 h-3 text-primary" />
          <p className="text-[10px] text-muted-foreground tracking-wide">
            Pagamento 100% seguro · Criptografia SSL
          </p>
        </div>
      </div>
    </div>
  );
}

const formatPrice = (p: number) =>
  p.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
