import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2, Pencil, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { AuthModalV2 } from '@/components/auth/AuthModalV2';
import { useAuth } from '@/contexts/AuthContext';
import { useEventSeats, type EventSeatRow } from '@/hooks/useEventSeats';
import { useSeatHold, MENSAGEM_DA_TRAVA, readStoredOrderId } from '@/hooks/useSeatHold';
import { SeatMapRenderer } from '@/components/seated/SeatMapRenderer';
import { SelectionPanel } from '@/components/seated/SelectionPanel';
import { SeatDetailModal } from '@/components/seated/SeatDetailModal';
import { goToSeatCheckout } from '@/lib/seatCheckoutNav';
import type { VStatus } from '@/components/seated/SeatNode';
import { vocabularioAssento } from '@/lib/vocabularioAssento';
import { supabase } from '@/integrations/supabase/client';
import { EntradaDoAluno } from '@/components/seated/EntradaDoAluno';
import {
  useListaDoEvento, lerAluno, guardarAluno, esquecerAluno, quandoAbre,
  type AlunoConferido,
} from '@/hooks/useListaDeAlunos';

/** Mapa grande (teatro): arrastar começa em cima das poltronas também. */
const MAPA_GRANDE = 150;

const formatarPreco = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Props {
  event: any;
  zoom?: number;
}

const EventDetailsSeated = ({ event, zoom = 1 }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const eventId: string = event.id;

  const { data: seats, isLoading: seatsLoading } = useEventSeats(eventId);
  const {
    hold,
    addons,
    holdSelected,
    releaseCurrent,
    setSeatAddon,
    markProceeding,
  } = useSeatHold(eventId, user?.id);

  const [isHolding, setIsHolding] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [modalSeatId, setModalSeatId] = useState<string | null>(null);

  // ---- Lista de alunos (OS-346; modelo novo na OS-365) ----
  // Evento com lista: antes do mapa vem a tela do aluno (CPF), e no mapa a
  // família escolhe várias poltronas de uma vez, até o que resta do aluno, só
  // na sessão em que ele dança. Quem trava de verdade é o servidor
  // (hold_seats_aluno).
  const { data: lista, isLoading: listaLoading } = useListaDoEvento(eventId);
  const temLista = !!lista?.tem_lista;
  const [aluno, setAluno] = useState<AlunoConferido | null>(null);
  const [etapa, setEtapa] = useState<'entrada' | 'mapa'>('entrada');
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  // Recado da trava NA TELA (não em aviso flutuante: no celular o aviso do topo
  // cobria a faixa "Convites de..." e o "Trocar sessão ou aluno").
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 7000);
    return () => clearTimeout(t);
  }, [aviso]);
  const location = useLocation();

  /** O aluno dança nesta sessão? (Se não, a entrada mostra a sessão certa.) */
  const dancaNesta = useCallback(
    (a: AlunoConferido | null) => !!a && (lista?.sessao == null || (a.sessoes ?? []).includes(lista.sessao)),
    [lista?.sessao],
  );

  useEffect(() => {
    if (!lista?.lista_id) return;
    const guardado = lerAluno(lista.lista_id);
    setAluno(guardado);
    setEtapa(dancaNesta(guardado) ? 'mapa' : 'entrada');
  }, [lista?.lista_id, dancaNesta]);

  /** Atualiza quantos convites restam (depois de uma compra, de outra aba). */
  const atualizarAluno = useCallback(async (): Promise<AlunoConferido | null> => {
    if (!aluno?.passe || !user) return null;
    const rpc = supabase.rpc as unknown as (
      fn: string, args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
    const { data, error } = await rpc.call(supabase, 'aluno_pelo_passe', { _passe: aluno.passe });
    if (error || !data) return null;
    const r = data as Record<string, unknown>;
    if (r.ok === true) {
      const novo = r as unknown as AlunoConferido;
      guardarAluno(novo);
      setAluno(novo);
      return novo;
    }
    esquecerAluno(lista?.lista_id);
    setAluno(null);
    setEscolhidas([]);
    setEtapa('entrada');
    toast.info(MENSAGEM_DA_TRAVA.aluno_obrigatorio);
    return null;
  }, [aluno?.passe, user, lista?.lista_id]);

  /** O recado de uma recusa do servidor, com o número real de convites. */
  const recadoDaRecusa = useCallback(async (codigo: string) => {
    if (codigo === 'aluno_obrigatorio') { trocarAlunoRef.current?.(null); toast.info(MENSAGEM_DA_TRAVA.aluno_obrigatorio); return; }
    if (codigo === 'seats_unavailable') { setAviso('Alguém escolheu uma dessas poltronas antes de você. Escolha outra.'); return; }
    const atual = await atualizarAluno();
    // Sessão em que o aluno não dança: a entrada mostra qual é a dele.
    if (codigo === 'sessao_do_aluno') { setEscolhidas([]); setEtapa('entrada'); return; }
    if (codigo === 'limite_do_aluno') {
      const n = atual?.restantes ?? 0;
      setAviso(n > 0 ? `Este aluno tem ${n} ${n === 1 ? 'convite' : 'convites'} para usar.` : MENSAGEM_DA_TRAVA.limite_do_aluno);
    } else if (codigo === 'venda_nao_abriu') {
      setAviso(atual?.abre_em ? `A venda para este aluno abre em ${quandoAbre(atual.abre_em)}.` : MENSAGEM_DA_TRAVA.venda_nao_abriu);
    }
  }, [atualizarAluno]);

  // Recusa que veio da tela de pagamento (o pagamento manda o código para cá).
  const recusaDoPagamento = (location.state as { recusaDaTrava?: string } | null)?.recusaDaTrava;
  const recusaMostradaRef = useRef(false);

  useEffect(() => {
    if (!(temLista && etapa === 'mapa')) return;
    if (recusaDoPagamento && !recusaMostradaRef.current) {
      recusaMostradaRef.current = true;
      void recadoDaRecusa(recusaDoPagamento);
      return;
    }
    void atualizarAluno();
    // Só ao entrar no mapa: o resto do tempo quem manda é a recusa do servidor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temLista, etapa]);

  const trocarAluno = useCallback((novo: AlunoConferido | null) => {
    if (!novo) esquecerAluno(lista?.lista_id);
    setAluno(novo);
    setEscolhidas([]);
    setEtapa('entrada');
  }, [lista?.lista_id]);
  const trocarAlunoRef = useRef(trocarAluno);
  trocarAlunoRef.current = trocarAluno;

  // Reserva já feita e ainda sem pagamento gerado: dá para mexer nela. Com PIX
  // ou cartão começado (pedido guardado), a reserva é do pagamento: só segue.
  const pagamentoComecado = !!hold && !!readStoredOrderId(eventId);
  const [soltando, setSoltando] = useState(false);
  const queryClient = useQueryClient();
  /** Solta a reserva e volta à escolha, com as mesmas poltronas marcadas. */
  const mudarPoltronas = useCallback(async () => {
    if (!hold || pagamentoComecado) return;
    const antes = hold.seatIds;
    setSoltando(true);
    // Enquanto solta, as poltronas da própria família não são "outra família".
    reservandoRef.current = true;
    try {
      await releaseCurrent();
      queryClient.setQueryData<EventSeatRow[] | undefined>(['event-seats', eventId], (prev) =>
        prev?.map((x) => (antes.includes(x.id) ? { ...x, status: 'available' as const, hold_expires_at: null } : x)));
      setEscolhidas(antes);
      await atualizarAluno();
    } finally {
      reservandoRef.current = false;
      setSoltando(false);
    }
  }, [hold, pagamentoComecado, releaseCurrent, queryClient, eventId, atualizarAluno]);
  /** "Trocar sessão ou aluno": com reserva solta, a poltrona volta para a venda. */
  const irParaEntrada = useCallback(async () => {
    if (hold && !pagamentoComecado) { await releaseCurrent(); await atualizarAluno(); }
    setEscolhidas([]);
    setEtapa('entrada');
  }, [hold, pagamentoComecado, releaseCurrent, atualizarAluno]);

  /**
   * Link direto para uma unidade: `?unidade=C007`.
   *
   * É o link que o produtor manda para o dono do camarote — ele abre o mapa já
   * com a unidade combinada aberta, mostrando número, piso, quantos ingressos
   * por dia e o valor fechado. Sem isso o comprador cairia num mapa de 100
   * unidades e teria que caçar a dele.
   *
   * Abre UMA vez só: se a pessoa fechar o modal para olhar o mapa, não fica
   * reabrindo na cara dela a cada render.
   */
  const [searchParams] = useSearchParams();
  const unidadeDoLink = searchParams.get('unidade');
  const jaAbriuDoLink = useRef(false);

  /**
   * Link de PACOTE: `?unidades=C007,C008,C009`.
   *
   * A negociação de camarote costuma fechar mais de um. Mandar um link por
   * unidade é o caminho mais curto para o comprador pagar o primeiro, esquecer
   * o segundo, e o produtor descobrir na véspera. Com o pacote ele confere tudo
   * numa tela e paga de uma vez.
   */
  const codigosDoPacote = useMemo(() => {
    const bruto = searchParams.get('unidades');
    if (!bruto) return [] as string[];
    return bruto.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
  }, [searchParams]);

  const unidadesDoPacote = useMemo(() => {
    if (!codigosDoPacote.length || !seats?.length) return [] as typeof seats;
    return seats.filter((s) => codigosDoPacote.includes((s.code ?? '').toLowerCase()));
  }, [codigosDoPacote, seats]);

  /** Só dá para reservar o pacote inteiro se TODAS ainda estiverem livres. */
  const pacoteDisponivel = unidadesDoPacote.length > 0
    && unidadesDoPacote.every((s) => s.status === 'available' || s.status === 'held');

  const totalDoPacote = useMemo(
    () => unidadesDoPacote.reduce((soma, s) => soma + Number(s.base_price ?? 0), 0),
    [unidadesDoPacote],
  );

  useEffect(() => {
    // Link de pacote tem tela própria — não abre o modal de uma unidade.
    if (codigosDoPacote.length > 0) return;
    if (jaAbriuDoLink.current || !unidadeDoLink || !seats?.length) return;
    const alvo = seats.find(
      (s) => (s.code ?? '').toLowerCase() === unidadeDoLink.toLowerCase(),
    );
    if (!alvo) return;
    jaAbriuDoLink.current = true;
    // Só abre se ainda dá para comprar. Unidade já vendida abriria um modal
    // sem saída — melhor deixar o mapa falar por si.
    if (alvo.status === 'available' || alvo.status === 'held') {
      setModalSeatId(alvo.id);
    }
  }, [unidadeDoLink, seats, codigosDoPacote]);

  const myHoldSeatIds = useMemo(() => new Set(hold?.seatIds ?? []), [hold]);

  /** Códigos que vieram no link, para o mapa marcá-los. */
  const idsDoPacote = useMemo(
    () => new Set(unidadesDoPacote.map((s) => s.id)),
    [unidadesDoPacote],
  );

  const escolhidasSet = useMemo(() => new Set(escolhidas), [escolhidas]);

  const resolveVisualStatus = useCallback(
    (seat: EventSeatRow): VStatus => {
      // Link de pacote: as unidades combinadas nascem MARCADAS no mapa. Sem
      // isto o comprador abria um mapa de 100 iguais, com uma barra no topo
      // falando de "4 unidades" que ele não conseguia enxergar — e a dúvida,
      // numa compra de dezenas de milhares, faz a pessoa parar (Gabriel, 20/08).
      if (idsDoPacote.has(seat.id) && (seat.status === 'available' || seat.status === 'held')) {
        return 'selected-mine';
      }
      // 'manual' = mesa fechada pelo produtor fora do checkout. Tratada como
      // indisponível no mapa público (não clicável, mesma aparência de sold).
      if (seat.status === 'manual') return 'sold';
      if (seat.status === 'sold') return 'sold';
      // Lista de alunos: poltrona fora da venda (as fileiras que a escola
      // guarda no 1º dia) aparece "Em uso", como se outra família estivesse
      // comprando (pedido da escola, decisão do Gabriel em 03/11/2026).
      if (seat.status === 'blocked') return temLista ? 'held-other' : 'blocked';
      // Lista de alunos: as poltronas escolhidas (ainda não seguradas) aparecem
      // como "sua escolha" enquanto continuarem livres.
      if (escolhidasSet.has(seat.id) && seat.status === 'available') return 'selected-mine';
      if (seat.status === 'held') {
        const stillValid =
          seat.hold_expires_at && new Date(seat.hold_expires_at).getTime() > Date.now();
        if (stillValid) {
          // "Meu assento" vem do estado local do hold (myHoldSeatIds) — o
          // held_by_user_id saiu do select público (PII).
          if (myHoldSeatIds.has(seat.id)) {
            return 'selected-mine';
          }
          return 'held-other';
        }
      }
      return 'available';
    },
    [user, myHoldSeatIds, idsDoPacote, escolhidasSet, temLista]
  );

  // Escolhida que outra família levou (o mapa atualiza ao vivo) sai da escolha.
  // Durante a própria reserva o mapa marca as poltronas como seguradas antes de
  // a escolha ser limpa: isso não é "outra família".
  const reservandoRef = useRef(false);
  useEffect(() => {
    if (reservandoRef.current || !escolhidas.length || !seats?.length) return;
    const livres = escolhidas.filter((id) => seats.find((s) => s.id === id)?.status === 'available');
    if (livres.length !== escolhidas.length) {
      setEscolhidas(livres);
      setAviso('Uma poltrona que você escolheu acabou de ser reservada por outra família.');
    }
  }, [seats, escolhidas]);

  const handleToggleSeat = useCallback(
    (seatId: string) => {
      if (hold) return; // já tem reserva ativa, não abre modal
      const seat = (seats ?? []).find((s) => s.id === seatId);
      if (!seat) return;
      if (temLista) {
        // Lista de alunos: toque escolhe/desfaz, até o que resta da criança.
        if (escolhidasSet.has(seatId)) {
          setEscolhidas((prev) => prev.filter((id) => id !== seatId));
          return;
        }
        if (resolveVisualStatus(seat) !== 'available') return;
        const restantes = aluno?.restantes ?? 0;
        if (escolhidas.length >= restantes) {
          setAviso(restantes > 0
            ? `Este aluno tem ${restantes} ${restantes === 1 ? 'convite' : 'convites'} para usar.`
            : 'Os convites deste aluno já foram usados.');
          return;
        }
        setEscolhidas((prev) => [...prev, seatId]);
        return;
      }
      if (resolveVisualStatus(seat) !== 'available') return;
      setModalSeatId(seatId);
    },
    [seats, resolveVisualStatus, hold, temLista, escolhidasSet, escolhidas.length, aluno?.restantes]
  );

  const totalEscolhido = useMemo(
    () => escolhidas.reduce((soma, id) => soma + Number((seats ?? []).find((s) => s.id === id)?.base_price ?? 0), 0),
    [escolhidas, seats],
  );

  const rotulosDasEscolhidas = useMemo(
    () => escolhidas.map((id) => (seats ?? []).find((s) => s.id === id)).map((s) => s?.label ?? s?.code).join(' · '),
    [escolhidas, seats],
  );

  /** Lista de alunos: tipos de poltrona com cor própria, fora da venda e cadeirante. */
  const legendaExtra = useMemo(() => {
    if (!temLista) return [] as { label: string; color: string }[];
    const itens = new Map<string, string>();
    for (const s of seats ?? []) {
      if (s.color && s.seat_type_name && s.status === 'available') itens.set(s.seat_type_name, s.color);
    }
    const saida = [...itens].map(([label, color]) => ({ label, color }));
    const objetos = ((event.map_snapshot as { map_objects?: { text_content?: string | null }[] })?.map_objects ?? []);
    if (objetos.some((o) => o.text_content === '♿')) {
      saida.push({ label: '♿ Espaço para cadeirante', color: '#2563EB' });
    }
    return saida;
  }, [temLista, seats, event.map_snapshot]);

  const reservarEscolhidas = useCallback(async () => {
    if (!user) { setAuthOpen(true); return; }
    if (!aluno || !escolhidas.length) return;
    // Antes do horário do lote a tela NÃO barra pelo relógio do celular: quem
    // decide é o servidor (`venda_nao_abriu`), e a tela mostra o que ele disser.
    setAviso(null);
    setIsHolding(true);
    reservandoRef.current = true;
    try {
      const result = await holdSelected(escolhidas, undefined, {
        passe: aluno.passe,
        onErro: (codigo) => {
          if (codigo === 'limite_do_aluno' || codigo === 'seats_unavailable') setEscolhidas([]);
          void recadoDaRecusa(codigo);
        },
      });
      if (!result) return;
      setEscolhidas([]);
      goToSeatCheckout(navigate, markProceeding, eventId);
    } finally {
      reservandoRef.current = false;
      setIsHolding(false);
    }
  }, [user, aluno, escolhidas, holdSelected, recadoDaRecusa, navigate, markProceeding, eventId]);

  const modalSeat = useMemo(
    () => (seats ?? []).find((s) => s.id === modalSeatId) ?? null,
    [seats, modalSeatId]
  );

  const handleConfirmReserve = useCallback(
    async (seatId: string, qty: number) => {
      if (!user) {
        setAuthOpen(true);
        return;
      }
      setIsHolding(true);
      try {
        const initial = qty > 0 ? { [seatId]: qty } : undefined;
        const result = await holdSelected([seatId], initial);
        if (!result) {
          setModalSeatId(null);
          return;
        }
        setModalSeatId(null);
        goToSeatCheckout(navigate, markProceeding, eventId);
      } finally {
        setIsHolding(false);
      }
    },
    [user, holdSelected, navigate, markProceeding, eventId]
  );

  const reservarPacote = useCallback(async () => {
    if (!user) { setAuthOpen(true); return; }
    if (!pacoteDisponivel) return;
    setIsHolding(true);
    try {
      const ids = unidadesDoPacote.map((s) => s.id);
      // ⚠️ SEM adicionais. Aqui morava um bug caro (achado em 20/08): este trecho
      // mandava `addons = base_capacity`, confundindo "quantos ingressos o
      // camarote dá" com "quantas pessoas ALÉM da capacidade". A capacidade já
      // está no preço; adicional é só o que passa dela.
      //
      // O estrago não era só o resumo dizer "80 pessoas": o servidor RECUSA a
      // cotação de adicional que não cabe, a tela engolia o erro, e o comprador
      // ficava sem parcelamento vendo um total menor do que seria cobrado. Numa
      // venda de R$ 22 mil. Quem fechar o pacote com ingresso extra ajusta na
      // tela do mapa — que é onde o extra tem preço na frente.
      const result = await holdSelected(ids);
      if (!result) return;
      goToSeatCheckout(navigate, markProceeding, eventId);
    } finally {
      setIsHolding(false);
    }
  }, [user, pacoteDisponivel, unidadesDoPacote, holdSelected, navigate, markProceeding, eventId]);

  if (temLista && etapa === 'entrada') {
    return (
      <>
        <Helmet>
          <title>{event.title} - Convites - FestPag</title>
        </Helmet>
        <EntradaDoAluno
          eventId={eventId}
          evento={event}
          lista={lista!}
          aluno={aluno}
          onAluno={trocarAluno}
          onSessaoAtual={() => setEtapa('mapa')}
        />
      </>
    );
  }

  if (listaLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!event.map_snapshot) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground mb-4" />
        <h1 className="font-display font-bold text-2xl mb-2">Mapa ainda não disponível</h1>
        <p className="text-muted-foreground">
          O produtor está finalizando o mapa deste evento. Tente novamente em instantes.
        </p>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{event.title} - Mapa de {vocabularioAssento(event.seat_noun).Plural} - FestPag</title>
      </Helmet>

      {/* Link de pacote: o comprador vê o que foi combinado e paga tudo de uma
          vez. Fica ACIMA do mapa porque é a razão de ele ter aberto a página —
          o mapa é conferência, não busca. */}
      {unidadesDoPacote.length > 0 && (
        <div className="border-b border-border bg-card/80 backdrop-blur px-4 py-3">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="min-w-0">
              <p className="font-display font-semibold text-base leading-tight">
                {unidadesDoPacote.length === 1
                  ? 'Sua reserva'
                  : `Seu pacote · ${unidadesDoPacote.length} unidades`}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {unidadesDoPacote.map((s) => s.label ?? s.code).join(' · ')}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total</p>
                <p className="font-display font-bold text-xl gradient-text tabular-nums">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalDoPacote)}
                </p>
              </div>
              <Button
                variant="hero" size="lg"
                onClick={reservarPacote}
                disabled={!pacoteDisponivel || isHolding}
              >
                {isHolding
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reservando…</>
                  : pacoteDisponivel ? 'Reservar e pagar' : 'Indisponível'}
              </Button>
            </div>
          </div>
          {!pacoteDisponivel && unidadesDoPacote.length > 0 && (
            <p className="max-w-3xl mx-auto text-xs text-amber-400 mt-2">
              Alguma das unidades deste link já não está disponível. Fale com quem enviou.
            </p>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_360px] lg:grid-rows-[minmax(0,1fr)] gap-0 h-full min-h-0">
        <div className="min-w-0 min-h-0 h-full flex flex-col">
          {temLista && aluno && (
            <div className="flex items-center gap-3 px-3 py-2 border-b border-border bg-card/80 text-sm shrink-0">
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">Convites de {aluno.primeiro_nome}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {aluno.liberado || new Date(aluno.abre_em).getTime() <= Date.now()
                    ? `Restam ${aluno.restantes} de ${aluno.limite}${(aluno.sessoes ?? []).length > 1 ? ' · somando as duas sessões' : ''}`
                    : `A venda para este aluno abre em ${quandoAbre(aluno.abre_em)}`}
                </p>
              </div>
              {!pagamentoComecado && (
                <button
                  type="button"
                  onClick={() => void irParaEntrada()}
                  className="text-xs text-primary hover:underline shrink-0"
                >
                  Trocar sessão ou aluno
                </button>
              )}
            </div>
          )}
          {seatsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex-1 min-h-0">
              <SeatMapRenderer
                snapshot={event.map_snapshot}
                seats={seats ?? []}
                resolveVisualStatus={resolveVisualStatus}
                onToggleSeat={handleToggleSeat}
                zoom={zoom}
                fillHeight
                arrastarSobreAssentos={(seats?.length ?? 0) > MAPA_GRANDE}
              />
            </div>
          )}
          {temLista && aviso && (
            <div role="status" className="shrink-0 px-3 py-2 text-sm font-medium border-t border-amber-500/30 bg-amber-500/10 text-foreground">
              {aviso}
            </div>
          )}
          <div className="flex flex-wrap gap-3 px-3 py-2 text-xs text-muted-foreground border-t border-border bg-card/60 shrink-0">

            <Legend color="hsl(var(--seat-available))" label="Disponível" />
            <Legend color="hsl(var(--seat-selected))" label={temLista ? 'Sua escolha' : 'Sua reserva'} />
            <Legend color="hsl(var(--seat-held))" label="Em uso" />
            <Legend color="hsl(var(--seat-sold))" label="Vendido" />
            {temLista && legendaExtra.map((l) => <Legend key={l.label} color={l.color} label={l.label} />)}
          </div>

          {/* Celular: a escolha fica numa barra fixa embaixo do mapa (o painel
              lateral só existe na tela grande). */}
          {temLista && aluno && (
            <div className="lg:hidden shrink-0 border-t border-border bg-card px-3 py-3">
              {hold ? (
                <div className="flex flex-col-reverse gap-2">
                  {!pagamentoComecado && (
                    <Button
                      variant="outline" size="lg" className="w-full"
                      disabled={soltando}
                      onClick={() => void mudarPoltronas()}
                    >
                      {soltando ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Pencil className="w-4 h-4 mr-2" /> Mudar poltronas</>}
                    </Button>
                  )}
                  <Button
                    variant="hero" size="lg" className="w-full"
                    onClick={() => goToSeatCheckout(navigate, markProceeding, eventId)}
                  >
                    <Ticket className="w-4 h-4 mr-2" /> Ir para pagamento
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">
                      {escolhidas.length
                        ? `${escolhidas.length} ${escolhidas.length === 1 ? 'poltrona' : 'poltronas'} · ${formatarPreco(totalEscolhido)}`
                        : 'Toque nas poltronas livres'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {escolhidas.length
                        ? rotulosDasEscolhidas
                        : `Até ${aluno.restantes} para ${aluno.primeiro_nome} · use + para aproximar`}
                    </p>
                  </div>
                  <Button
                    variant="hero" size="lg" className="shrink-0"
                    disabled={!escolhidas.length || isHolding}
                    onClick={reservarEscolhidas}
                  >
                    {isHolding ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reservar'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className={`border-t lg:border-t-0 lg:border-l border-border bg-background overflow-y-auto p-4 min-h-0 ${temLista ? 'hidden lg:block' : ''}`}>
          {temLista && aluno && !hold ? (
            <div className="bg-card rounded-2xl border border-border p-5 sticky top-4 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Convites de</p>
                <h3 className="font-display font-semibold text-lg">{aluno.primeiro_nome}</h3>
                <p className="text-sm text-muted-foreground">
                  Restam {aluno.restantes} de {aluno.limite}{(aluno.sessoes ?? []).length > 1 ? ', somando as duas sessões' : ''}.
                </p>
              </div>
              {escolhidas.length ? (
                <ul className="space-y-1.5 text-sm">
                  {escolhidas.map((id) => {
                    const s = (seats ?? []).find((x) => x.id === id);
                    return (
                      <li key={id} className="flex justify-between gap-3">
                        <span className="truncate">{s?.label ?? s?.code}{s?.seat_type_name ? ` · ${s.seat_type_name}` : ''}</span>
                        <span className="tabular-nums text-muted-foreground">{formatarPreco(Number(s?.base_price ?? 0))}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Toque nas poltronas livres no mapa (até {aluno.restantes}).
                </p>
              )}
              <Button
                variant="hero" size="lg" className="w-full"
                disabled={!escolhidas.length || isHolding}
                onClick={reservarEscolhidas}
              >
                {isHolding
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reservando…</>
                  : escolhidas.length
                    ? `Reservar ${escolhidas.length} ${escolhidas.length === 1 ? 'poltrona' : 'poltronas'} · ${formatarPreco(totalEscolhido)}`
                    : 'Reservar'}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                A reserva segura as poltronas por 10 minutos enquanto você paga. A taxa de serviço aparece no pagamento.
              </p>
            </div>
          ) : (
          <SelectionPanel
            seatNoun={event.seat_noun}
            unidadesDoPacote={unidadesDoPacote}
            seats={seats ?? []}
            hold={hold}
            addons={addons}
            eventId={eventId}
            onRelease={releaseCurrent}
            setSeatAddon={setSeatAddon}
            markProceeding={markProceeding}
          />
          )}
        </aside>
      </div>

      <SeatDetailModal
        seatNoun={event.seat_noun}
        seat={modalSeat}
        open={!!modalSeatId}
        isProcessing={isHolding}
        onClose={() => !isHolding && setModalSeatId(null)}
        onConfirm={handleConfirmReserve}
      />

      <AuthModalV2
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={() => setAuthOpen(false)}
      />
    </>
  );
};

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block w-3 h-3 rounded-sm border border-border"
        style={{ backgroundColor: color }}
      />
      {label}
    </div>
  );
}

export default EventDetailsSeated;
