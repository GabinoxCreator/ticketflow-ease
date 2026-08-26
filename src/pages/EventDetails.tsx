import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabasePublic } from '@/integrations/supabase/publicClient';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  Calendar,
  Clock,
  MapPin,
  Heart,
  AlertCircle,
  Loader2,
  Star,
} from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useEvent } from '@/hooks/useEvents';
import { getEventEndInstant } from '@/lib/eventTime';
import { isLotOpenForSale } from '@/lib/lot-availability';
import { safeRandomUUID } from '@/lib/uuid';

import { useEventLots } from '@/hooks/useEventLots';
import { useEventSeatAvailability } from '@/hooks/useEventSeatAvailability';
import { CheckoutModal } from '@/components/checkout/CheckoutModal';
import { AuthModal } from '@/components/auth/AuthModal';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { trackPageView, trackViewContent, trackInitiateCheckout } from '@/lib/metaPixel';
import festpagLogo from '@/assets/logo-festpag.png';
import { LotCard } from '@/components/event/LotCard';
import {
  LikeSignupInviteDialog,
  shouldShowLikeInvite,
  markLikeInviteShown,
} from '@/components/event/LikeSignupInviteDialog';
import { getTicketLimitForEvent } from '@/data/eventTicketLimits';
import { PriceAndShareBar } from '@/components/event/PriceAndShareBar';
import { MesaReservaCTA } from '@/components/event/MesaReservaCTA';
import { EventPolicies } from '@/components/event/EventPolicies';
import type { SummaryItem } from '@/components/event/EventOrderSummary';
import { EventCartSheet } from '@/components/event/EventCartSheet';
import { EventCartMiniBar } from '@/components/event/EventCartMiniBar';
import { EventDonationBanner } from '@/components/event/EventDonationBanner';
import { EventBeneficiaryBanner } from '@/components/event/EventBeneficiaryBanner';
import { DonationModal } from '@/components/event/DonationModal';
import { getDonationCampaign, isDonationCampaignReady, isBeneficentEvent } from '@/data/donationCampaigns';
import { trackDonationClick } from '@/lib/donationTelemetry';
import { useDonationProgress } from '@/hooks/useDonationProgress';
import { podeSomarMaisUm, regraValeNesteEvento } from '@/lib/umIngressoPorNoite';
import { AvisoUmPorNoite } from '@/components/event/AvisoUmPorNoite';
import { MapaArena } from '@/components/event/MapaArena';
import { getMapaDaArena } from '@/data/mapasDeArena';
import { InstrucoesDoEventoDialog, BotaoComoFunciona } from '@/components/event/InstrucoesDoEventoDialog';
import { getInstrucoesDoEvento } from '@/data/instrucoesDoEvento';

// Temporário: bloco de instituição beneficiada específico deste evento.
// Generalizar junto do "modo evento beneficente" (ver roadmap).
const MATTEO_EVENT_SLUG = '3-feijoada-do-matteo';

const getAnonymousId = () => {
  let id = localStorage.getItem('anonymous_like_id');
  if (!id) {
    id = safeRandomUUID();
    localStorage.setItem('anonymous_like_id', id);
  }
  return id;
};

/**
 * Tira do nome do lote o pedaço que o cabeçalho do grupo já diz.
 *
 * O lote se chama "1º Lote - Sábado 10/10" — é o nome oficial, o que sai no
 * ingresso, no relatório e no painel. Mas dentro do bloco "SÁBADO 10/10" a
 * data aparece duas vezes na mesma altura da tela: o olho lê ruído em vez de
 * lote. Aqui só a apresentação muda; o nome no banco continua completo.
 */
function semRepetirOGrupo(nomeDoLote: string, tituloDoGrupo: string): string {
  const normalizar = (t: string) => t.trim().toLowerCase();
  const grupo = normalizar(tituloDoGrupo);
  if (!grupo) return nomeDoLote;

  // Aceita os separadores que o produtor usa na mão: "-", "–", "—", "·".
  const corte = nomeDoLote.replace(/\s*[-–—·]\s*[^-–—·]+$/, '');
  const sufixo = nomeDoLote.slice(corte.length).replace(/^\s*[-–—·]\s*/, '');

  if (corte && normalizar(sufixo) === grupo) return corte.trim();
  return nomeDoLote;
}

const EventDetails = () => {
  const { id: slugOrId } = useParams<{ id: string }>();
  const { data: event, isLoading: eventLoading } = useEvent(slugOrId);
  const eventId: string | undefined = (event as any)?.id;
  const ticketLimit = getTicketLimitForEvent(eventId); // null = sem limite
  const maxPerLot = ticketLimit ?? 10;
  const { lots, isLoading: lotsLoading } = useEventLots(eventId);
  const [selectedLots, setSelectedLots] = useState<Record<string, number>>({});
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [instrucoesAbertas, setInstrucoesAbertas] = useState(false);
  const [isDonationOpen, setIsDonationOpen] = useState(false);
  const prevTotalRef = useRef(0);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isLikeInviteOpen, setIsLikeInviteOpen] = useState(false);
  const { user } = useAuth();

  // O mapa tem interruptor PRÓPRIO, separado do status do evento: dá para estar
  // publicado vendendo ingresso com o camarote ainda fora do ar (Rodeo, 26/08).
  const hasMap =
    !!event &&
    event.status === 'published' &&
    (event.event_type === 'mesa' || event.event_type === 'hibrido') &&
    !!event.table_map_id &&
    (event as any).seat_map_public !== false;

  const { data: seatSectors } = useEventSeatAvailability(hasMap ? eventId : undefined);

  // Barra de arrecadação (curada por SQL) — só consulta no evento beneficente.
  // Hook no topo (antes dos early returns) p/ não quebrar a ordem dos hooks.
  const { data: donationProgress, isLoading: donationProgressLoading } =
    useDonationProgress(event?.slug, isBeneficentEvent(event));

  // Hardening #7: leitura e toggle do like passam por RPC (a tabela não é mais
  // acessível direto — o DELETE aberto deixava apagar curtida alheia em massa).
  // cast nos rpc: types.ts é auto-gerado e ainda não conhece as RPCs novas.
  useEffect(() => {
    if (!eventId) return;
    const anonymousId = getAnonymousId();
    (async () => {
      const { data, error } = await (supabase.rpc as any)('get_event_like_state', {
        _event_id: eventId,
        _anonymous_id: anonymousId,
      });
      if (error) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return;
      setLikeCount(Number(row.like_count) || 0);
      setLiked(!!row.liked);
    })();
  }, [eventId]);

  // Adota o like anônimo deste navegador quando a pessoa cria conta/entra
  // (mesma ideia do claim_my_orphan_orders). Idempotente e barato.
  useEffect(() => {
    if (!user) return;
    (supabase.rpc as any)('claim_my_anonymous_likes', {
      _anonymous_id: getAnonymousId(),
    });
  }, [user]);

  const handleLike = useCallback(async () => {
    if (!eventId) return;
    const anonymousId = getAnonymousId();
    const wasLiked = liked;

    // otimista: o coração responde na hora
    setLiked(!wasLiked);
    setLikeCount((prev) => Math.max(0, prev + (wasLiked ? -1 : 1)));

    const { data, error } = await (supabase.rpc as any)('toggle_event_like', {
      _event_id: eventId,
      _anonymous_id: anonymousId,
    });

    if (error) {
      setLiked(wasLiked);
      setLikeCount((prev) => Math.max(0, prev + (wasLiked ? 1 : -1)));
      toast.error('Não foi possível registrar sua curtida. Tente de novo.');
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      setLikeCount(Number(row.like_count) || 0);
      setLiked(!!row.liked);
    }

    // Funil: só quando ACABOU de curtir, visitante sem conta e sem convite recente.
    if (!wasLiked && !user && shouldShowLikeInvite()) {
      markLikeInviteShown();
      setIsLikeInviteOpen(true);
    }
  }, [eventId, liked, user]);

  // Auto-abre sheet apenas na transição 0 -> 1; fecha quando esvazia
  const totalForEffect = Object.values(selectedLots).reduce((s, q) => s + q, 0);
  useEffect(() => {
    const prev = prevTotalRef.current;
    if (prev === 0 && totalForEffect > 0) setIsCartOpen(true);
    if (totalForEffect === 0 && isCartOpen) setIsCartOpen(false);
    prevTotalRef.current = totalForEffect;
  }, [totalForEffect]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pixel ID vem de RPC pública dedicada (producer_profiles tem RLS fechada
  // pra anônimos, então o embed retornava null no site público).
  const [pixelId, setPixelId] = useState<string | null>(null);
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    supabase
      .rpc('get_event_tracking', { _event_id: eventId })
      .then(({ data }) => {
        if (cancelled) return;
        const row = Array.isArray(data) ? data[0] : null;
        setPixelId(row?.meta_pixel_id ?? null);
      });
    return () => { cancelled = true; };
  }, [eventId]);

  useEffect(() => {
    if (!pixelId || !event) return;
    trackPageView(pixelId);
    trackViewContent(pixelId, {
      content_ids: [event.id],
      content_name: event.title,
      content_type: 'product',
      currency: 'BRL',
    });
  }, [pixelId, event?.id]);

  const isLoading = eventLoading || lotsLoading;

  // ⚠️ ANTES dos returns antecipados abaixo. Hook depois de `return` roda em
  // uns renders e não em outros — o React conta os hooks e derruba a página
  // inteira (erro #310). Foi o que aconteceu aqui em 19/08.
  //
  // As noites do evento, em ordem de calendário. Evento comum não tem nenhuma,
  // e aí a vitrine segue agrupando por setor, como sempre.
  const { data: eventDays } = useQuery({
    queryKey: ['event-days-publico', eventId],
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Array<{ id: string; label: string; day_date: string }>> => {
      const { data, error } = await (supabasePublic as any)
        .from('event_days')
        .select('id, label, day_date')
        .eq('event_id', eventId)
        .order('day_date', { ascending: true });
      if (error) return [];
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display font-bold text-2xl mb-4">Evento não encontrado</h1>
          <Link to="/" className="text-primary hover:underline">
            Voltar para a página inicial
          </Link>
        </div>
      </div>
    );
  }

  const isEventFinished = event.status === 'finished' || getEventEndInstant(event) < new Date();
  // Lote agendado só entra na vitrine quando a hora chega; lote encadeado, quando o anterior esgota.
  const activeLots = isEventFinished ? [] : (lots || []).filter((lot) => isLotOpenForSale(lot, lots || []));


  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(`${dateString}T12:00:00Z`));
  };


  const formatPrice = (price: number) =>
    price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  /** `{ [event_day_id]: "Sábado 10/10" }` — deixa a mensagem citar a noite.
   *
   * ⚠️ SEM `useMemo` de propósito. Isto é calculado a partir de `activeLots`,
   * que só existe DEPOIS dos returns antecipados de "carregando" e "evento não
   * encontrado" — e hook depois de `return` roda em uns renders e não em
   * outros, derrubando a página inteira ("Rendered more hooks than during the
   * previous render"). Já quebrou a produção em 19/08 e quase de novo em 20/08.
   * São duas listas de dezenas de itens: memorizar não paga o risco. */
  const rotulosDeNoite: Record<string, string> = {};
  for (const d of eventDays ?? []) rotulosDeNoite[d.id] = d.label;

  const regraDeNoiteAtiva = regraValeNesteEvento(activeLots as any);

  // Planta do local. Dado curado por evento (mesmo padrão de limite de ingresso
  // e campanha de doação); evento sem planta não mostra nada.
  const mapaDaArena = getMapaDaArena(eventId);

  // "Como funciona": só em evento com instruções curadas. Ver o porquê no
  // próprio componente — pop-up ao abrir é caro e aqui se paga.
  const instrucoes = getInstrucoesDoEvento(eventId);

  const handleQuantityChange = (lotId: string, delta: number) => {
    const lote = activeLots.find((l) => l.id === lotId);

    // Somar: a regra "1 por pessoa em cada noite" é checada AQUI, no botão. O
    // servidor também recusa (é ele que manda), mas descobrir só no fim do
    // checkout — depois de montar o carrinho e digitar o CPF — é a pior hora
    // de contar. Em 20/08 dava para somar 3 da quarta e 4 da quinta sem aviso.
    if (delta > 0 && lote) {
      const bloqueio = podeSomarMaisUm(lote as any, selectedLots, activeLots as any, rotulosDeNoite);
      if (bloqueio) {
        toast.error(bloqueio.mensagem, { duration: 6000 });
        return;
      }
    }

    setSelectedLots((prev) => {
      const current = prev[lotId] || 0;
      const newValue = Math.max(0, Math.min(maxPerLot, current + delta));
      if (newValue === 0) {
        const { [lotId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [lotId]: newValue };
    });
  };

  const handleRemoveLot = (lotId: string) => {
    setSelectedLots((prev) => {
      const { [lotId]: _, ...rest } = prev;
      return rest;
    });
  };

  const totalAmount = Object.entries(selectedLots).reduce((total, [lotId, qty]) => {
    const lot = activeLots.find((l) => l.id === lotId);
    return total + (lot?.price || 0) * qty;
  }, 0);

  const totalTickets = Object.values(selectedLots).reduce((sum, qty) => sum + qty, 0);

  // "A partir de" — lotes + (se mesa) menor base_price
  const lotsFromPrice = activeLots.length
    ? Math.min(...activeLots.map((l) => l.price))
    : null;
  const seatsFromPrice = (seatSectors ?? [])
    .filter((s) => s.basePrice > 0)
    .reduce<number | null>(
      (min, s) => (min === null ? s.basePrice : Math.min(min, s.basePrice)),
      null,
    );
  const fromPrice = [lotsFromPrice, seatsFromPrice]
    .filter((v): v is number => v !== null && v > 0)
    .reduce<number | null>((min, v) => (min === null ? v : Math.min(min, v)), null);

  const fireInitiateCheckout = () => {
    if (!pixelId) return;
    trackInitiateCheckout(pixelId, {
      content_ids: Object.keys(selectedLots),
      content_name: event.title,
      num_items: totalTickets,
      value: totalAmount,
      currency: 'BRL',
    });
  };

  const handleCheckout = () => {
    if (totalTickets === 0) {
      toast.error('Selecione pelo menos um ingresso');
      return;
    }
    if (!user) {
      setIsAuthModalOpen(true);
    } else {
      fireInitiateCheckout();
      setIsCheckoutOpen(true);
    }
  };

  const handleAuthenticated = () => {
    setIsAuthModalOpen(false);
    fireInitiateCheckout();
    setIsCheckoutOpen(true);
  };

  const cartItems = Object.entries(selectedLots).map(([lotId, quantity]) => {
    const lot = activeLots.find((l) => l.id === lotId);
    return {
      lotId,
      lotName: lot?.name || '',
      quantity,
      price: lot?.price || 0,
      // Vai junto até o pagamento: é o que diz se a taxa entra por cima do
      // preço ou sai de dentro dele.
      modoTaxa: (lot as any)?.modo_taxa ?? null,
    };
  });

  const summaryItems: SummaryItem[] = cartItems.map((it) => ({
    id: it.lotId,
    name: it.lotName,
    quantity: it.quantity,
    price: it.price,
  }));

  /**
   * Agrupa os ingressos para a vitrine.
   *
   * Em evento de UM dia, agrupa por setor, como sempre foi.
   *
   * Em evento de VÁRIOS dias (o rodeio tem cinco noites e 18 lotes), agrupar
   * por setor joga tudo numa lista corrida: quem quer só a noite de sábado
   * precisa garimpar entre quarta, quinta e domingo. Aqui o grupo passa a ser a
   * NOITE, em ordem de calendário, com o passe que vale todas elas em primeiro
   * — é o produto de maior valor e quem o compra não precisa olhar o resto.
   */
  // Grupos da vitrine: [título, lotes, é o passe?].
  //
  // O passe vem marcado porque ele é o produto que o produtor quer vender —
  // vale as 5 noites e sai mais barato que comprar noite a noite. Numa lista
  // de 6 blocos iguais ele passa despercebido.
  const lotGroups: Array<[string, typeof activeLots, boolean]> = (() => {
    const temDias = (eventDays?.length ?? 0) > 0;

    if (!temDias) {
      const groups = new Map<string, typeof activeLots>();
      for (const lot of activeLots) {
        const key = lot.sector_name?.trim() || 'Ingresso';
        if (!groups.has(key)) groups.set(key, [] as typeof activeLots);
        groups.get(key)!.push(lot);
      }
      return Array.from(groups.entries())
        .sort(([a], [b]) => {
          if (a === 'Ingresso') return -1;
          if (b === 'Ingresso') return 1;
          return 0;
        })
        .map(([nome, lotes]) => [nome, lotes, false] as [string, typeof activeLots, boolean]);
    }

    const porDia = new Map<string, typeof activeLots>();
    const passes: typeof activeLots = [];
    const semDia: typeof activeLots = [];

    for (const lot of activeLots) {
      if ((lot as any).covers_all_days) { passes.push(lot); continue; }
      const dayId = (lot as any).event_day_id as string | null;
      if (!dayId) { semDia.push(lot); continue; }
      if (!porDia.has(dayId)) porDia.set(dayId, [] as typeof activeLots);
      porDia.get(dayId)!.push(lot);
    }

    const grupos: Array<[string, typeof activeLots, boolean]> = [];
    if (passes.length) grupos.push(['Passe · todas as noites', passes, true]);
    for (const d of eventDays ?? []) {
      const doDia = porDia.get(d.id);
      if (doDia?.length) grupos.push([d.label, doDia, false]);
    }
    if (semDia.length) grupos.push([semDia[0].sector_name?.trim() || 'Ingresso', semDia, false]);
    return grupos;
  })();

  const canonicalUrl = `https://festpag.digital/evento/${event.slug ?? event.id}`;

  const donationCampaign = getDonationCampaign({ slug: event.slug, id: event.id });
  const showDonation = isDonationCampaignReady(donationCampaign);
  // Override de vocabulário SÓ neste evento beneficente (ver roadmap.md). Outros = inalterado.
  const isBeneficent = isBeneficentEvent(event);
  // Bloco informativo da instituição beneficiada — só por slug, independente de
  // showDonation/isBeneficent (é outro evento e não envolve doação).
  const showBeneficiary = event.slug === MATTEO_EVENT_SLUG;



  return (
    <>
      <Helmet>
        <title>{event.title} - FestPag</title>
        <meta
          name="description"
          content={event.short_description || event.description || ''}
        />
        <meta property="og:title" content={`${event.title} - FestPag`} />
        <meta
          property="og:description"
          content={
            event.short_description ||
            event.description ||
            `Garanta seu ingresso para ${event.title} em ${event.city}.`
          }
        />
        <meta property="og:type" content="event" />
        <meta property="og:url" content={canonicalUrl} />
        {event.image_url && <meta property="og:image" content={event.image_url} />}
        <meta name="twitter:title" content={`${event.title} - FestPag`} />
        <meta
          name="twitter:description"
          content={
            event.short_description ||
            event.description ||
            `Garanta seu ingresso para ${event.title} em ${event.city}.`
          }
        />
        {event.image_url && <meta name="twitter:image" content={event.image_url} />}
        <link rel="canonical" href={canonicalUrl} />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />

        <main className={cn('pt-20 w-full pb-28 lg:pb-28')}>
          {isEventFinished && (
            <div className="w-full bg-destructive/10 border-b border-destructive/20">
              <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-center gap-2">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <span className="font-semibold text-destructive">Evento Encerrado</span>
              </div>
            </div>
          )}

          <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 lg:py-6">
            {/* Coluna única */}
            <div className="min-w-0 space-y-5 sm:space-y-6">
              {/* Hero: info + banner side-by-side em desktop */}
              <section className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-4 lg:gap-6 items-start">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4 order-2 md:order-1 min-w-0"
                >
                  <h1 className="font-display font-bold text-2xl sm:text-3xl md:text-4xl leading-tight break-words">
                    {event.title}
                  </h1>

                  <div className="space-y-1.5 min-w-0">
                    <p className="text-foreground font-semibold text-base sm:text-lg break-words">
                      {event.venue}
                    </p>
                    <p className="text-sm text-muted-foreground break-words">
                      {event.city}, {event.state}
                    </p>
                    {event.address && (
                      <div className="flex items-start gap-2 text-muted-foreground min-w-0">
                        <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                        <span className="text-sm break-words">{event.address}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span className="text-sm capitalize break-words">{formatDate(event.date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span className="text-sm">{event.time}</span>
                    </div>
                  </div>

                  {!isEventFinished && (
                    <PriceAndShareBar
                      fromPrice={fromPrice}
                      shareTitle={event.title}
                      shareText={event.short_description || undefined}
                      isBeneficent={isBeneficent}
                    />
                  )}

                  {showBeneficiary && <EventBeneficiaryBanner />}

                  {showDonation && (
                    <EventDonationBanner
                      onDonate={() => {
                        // Telemetria só no evento beneficente (fire-and-forget, não bloqueia).
                        if (isBeneficent) trackDonationClick(event.slug, 'doar');
                        setIsDonationOpen(true);
                      }}
                      // Barra de arrecadação só no evento beneficente.
                      progress={isBeneficent ? donationProgress ?? null : undefined}
                      progressLoading={isBeneficent && donationProgressLoading}
                    />
                  )}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="order-1 md:order-2"
                >
                  <div className="relative w-full rounded-2xl overflow-hidden shadow-xl shadow-primary/10 bg-muted">
                    <div className="aspect-[16/9] w-full">
                      <img
                        src={event.image_url || '/placeholder.svg'}
                        alt={event.title}
                        className="w-full h-full object-cover object-center"
                      />
                    </div>
                    <button
                      onClick={handleLike}
                      className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-full px-3 py-2 transition-colors hover:bg-black/80"
                      aria-label="Curtir evento"
                    >
                      <Heart
                        className={cn(
                          'w-5 h-5 transition-colors',
                          liked ? 'fill-red-500 text-red-500' : 'text-white',
                        )}
                      />
                      {likeCount > 0 && (
                        <span
                          className={cn(
                            'text-sm font-medium',
                            liked ? 'text-red-500' : 'text-white',
                          )}
                        >
                          {likeCount}
                        </span>
                      )}
                    </button>
                  </div>
                </motion.div>
              </section>

              {!isEventFinished && hasMap && eventId && (
                <MesaReservaCTA
                  eventId={eventId}
                  eventSlugOrId={event.slug ?? event.id}
                  description={(event as any).mesa_reserva_description}
                  seatNoun={(event as any).seat_noun}
                />
              )}

              {activeLots.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="space-y-4"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    {/* No rodeio a arena é gratuita e todo ingresso é da boate;
                        chamar de "Ingressos" faria o comprador achar que paga
                        para entrar no evento. Vem da planta curada do evento —
                        quem não tem planta continua lendo "Ingressos". */}
                    <h2 className="font-display font-bold text-xl">
                      {isBeneficent ? 'Convites' : (mapaDaArena?.tituloDosIngressos ?? 'Ingressos')}
                    </h2>
                    {isBeneficent && (
                      <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        1 Convite por CPF
                      </span>
                    )}
                    {/* A regra precisa aparecer ANTES de a pessoa montar o
                        carrinho, não na recusa do pagamento. */}
                    {regraDeNoiteAtiva && <AvisoUmPorNoite variante="chip" />}
                    {/* Caminho de volta para quem fechou o pop-up sem ler. */}
                    {instrucoes && <BotaoComoFunciona onClick={() => setInstrucoesAbertas(true)} />}
                  </div>
                  {lotGroups.map(([sectorName, sectorLots, ehPasse]) => (
                    <div
                      key={sectorName}
                      className={
                        ehPasse
                          ? 'relative rounded-2xl border-2 border-primary/60 bg-card/80 backdrop-blur-xl overflow-hidden shadow-xl shadow-primary/25 ring-1 ring-primary/20'
                          : 'rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl overflow-hidden shadow-lg shadow-primary/5'
                      }
                    >
                      <div
                        className={
                          ehPasse
                            ? 'px-5 md:px-6 py-4 bg-gradient-to-r from-primary/40 via-primary/25 to-accent/25 border-b border-primary/30 flex items-center justify-between gap-3'
                            : 'px-5 md:px-6 py-4 bg-gradient-to-r from-primary/15 via-primary/10 to-accent/10 border-b border-border/40'
                        }
                      >
                        <h3
                          className={
                            ehPasse
                              ? 'font-display font-bold text-sm uppercase tracking-[0.2em] text-primary-foreground flex items-center gap-2'
                              : 'font-display font-bold text-sm uppercase tracking-[0.2em] text-primary'
                          }
                        >
                          {ehPasse && <Star className="w-4 h-4 fill-current shrink-0" />}
                          {sectorName}
                        </h3>
                        {/* O selo é o que faz o passe ser lido primeiro numa lista
                            de seis blocos — sem ele, ele vira "mais um lote". */}
                        {ehPasse && (
                          <span className="shrink-0 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-lg">
                            Melhor escolha
                          </span>
                        )}
                      </div>
                      <div className="divide-y divide-border/40">
                        {sectorLots.map((lot) => (
                          <LotCard
                            key={lot.id}
                            lot={{ ...lot, name: semRepetirOGrupo(lot.name, sectorName) }}
                            nomeCompleto={lot.name}
                            quantity={selectedLots[lot.id] || 0}
                            onQuantityChange={(delta) => handleQuantityChange(lot.id, delta)}
                            formatPrice={formatPrice}
                            maxQuantity={maxPerLot}
                            bloqueioDeSoma={
                              podeSomarMaisUm(lot as any, selectedLots, activeLots as any, rotulosDeNoite)?.motivo ?? null
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}

              {/* A planta da arena, depois dos ingressos: quem chegou até aqui já
                  viu preço e data, e a pergunta que sobra é "onde eu vou ficar".
                  Só aparece em evento que tem planta curada — os outros nem
                  renderizam nada. */}
              {mapaDaArena && <MapaArena mapa={mapaDaArena} />}

              {(event.description || event.short_description) && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="py-2"
                >
                  <h3 className="font-display font-bold text-xl mb-4">Sobre o evento</h3>
                  <div className="text-muted-foreground leading-relaxed space-y-4">
                    {(event.description || event.short_description || '')
                      .split(/\n{2,}/)
                      .map((para: string, i: number) => (
                        <p key={i} className="whitespace-pre-wrap break-words">
                          {para}
                        </p>
                      ))}
                  </div>
                </motion.section>
              )}

              {(() => {
                const producer = (event as any).producer_profiles;
                const brandName = producer?.brand_name;
                const logoUrl = producer?.logo_url || festpagLogo;
                if (!brandName) return null;
                return (
                  <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="py-2"
                  >
                    <h3 className="font-display font-bold text-xl mb-4">Realização</h3>
                    <div className="flex items-center gap-4 p-4 rounded-2xl border border-border bg-card">
                      <div className="h-14 w-14 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                        <img src={logoUrl} alt={brandName} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{brandName}</p>
                        <p className="text-sm text-muted-foreground">Produtora do evento</p>
                      </div>
                    </div>
                  </motion.section>
                );
              })()}

              <EventPolicies isBeneficent={isBeneficent} />
            </div>

          </div>
        </main>

        <Footer />

        {!isEventFinished && totalTickets > 0 && (
          <EventCartMiniBar
            count={totalTickets}
            totalAmount={totalAmount}
            visible={!isCartOpen}
            onOpen={() => setIsCartOpen(true)}
            isBeneficent={isBeneficent}
          />
        )}

        {!isEventFinished && (
          <EventCartSheet
            open={isCartOpen && totalTickets > 0}
            onOpenChange={setIsCartOpen}
            items={summaryItems}
            totalAmount={totalAmount}
            totalCount={totalTickets}
            onCheckout={handleCheckout}
            avisoUmPorNoite={regraDeNoiteAtiva}
            onIncrement={(lotId) => handleQuantityChange(lotId, 1)}
            onDecrement={(lotId) => handleQuantityChange(lotId, -1)}
            onRemove={handleRemoveLot}
            isBeneficent={isBeneficent}
          />
        )}

        {/* "Como funciona" — abre sozinho na primeira visita e some para sempre

            depois de lido. Só existe em evento com instruções curadas. */}

        {instrucoes && (

          <InstrucoesDoEventoDialog

            eventId={eventId!}

            instrucoes={instrucoes}

            abertoPorFora={instrucoesAbertas}

            onFecharPorFora={() => setInstrucoesAbertas(false)}

          />

        )}


        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onAuthenticated={handleAuthenticated}
        />

        <LikeSignupInviteDialog
          open={isLikeInviteOpen}
          onOpenChange={setIsLikeInviteOpen}
          eventTitle={event.title}
        />

        {showDonation && donationCampaign && (
          <DonationModal
            open={isDonationOpen}
            onOpenChange={setIsDonationOpen}
            campaign={donationCampaign}
            isBeneficent={isBeneficent}
          />
        )}

        <CheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          eventId={eventId || ''}
          eventTitle={event.title}
          eventDate={event.date}
          eventTime={event.time}
          eventVenue={event.venue}
          items={cartItems}
          totalAmount={totalAmount}
        />
      </div>
    </>
  );
};

export default EventDetails;
