import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatEventDate, getEventEndInstant } from '@/lib/eventTime';


export interface UserTicket {
  id: string;
  order_id: string;
  ticket_code: string;
  holder_name: string;
  holder_email: string | null;
  holder_phone: string | null;
  status: 'pending' | 'valid' | 'used' | 'cancelled';
  validated_at: string | null;
  created_at: string;
  /**
   * NULO quando o evento do ingresso não é legível pelo cliente: a política
   * pública de `events` só expõe `status='published'`, então evento em rascunho
   * ou finalizado volta vazio no embed. O ingresso continua válido — código e QR
   * moram na própria linha de `tickets` — então ele PRECISA continuar aparecendo.
   * Use `ticketEventDisplay()` para exibir sem tratar nulo em cada tela.
   */
  event: {
    id: string;
    slug: string | null;
    title: string;
    date: string;
    time: string;
    end_date: string | null;
    end_time: string | null;
    venue: string;
    city: string;
    state: string;
    image_url: string | null;
  } | null;
  lot: {
    name: string;
    price: number;
  } | null;
  seat: {
    label: string | null;
    code: string | null;
    seat_type_name: string | null;
  } | null;
  /**
   * Transferência em andamento, quando existe. Enquanto ela está aqui, o
   * ingresso aparece como "transferindo" e o dono só tem a opção de cancelar —
   * ele continua sendo o dono até alguém aceitar.
   */
  transfer?: {
    id: string;
    status: string;
    expires_at: string;
    to_cpf_final: string;
  } | null;
}

/**
 * Dados do evento prontos para a tela, tolerando evento ausente.
 *
 * Existe para que nenhuma tela precise repetir verificação de nulo (eram 16
 * pontos só em Meus Ingressos) e para que a falta de evento nunca vire tela
 * quebrada — no máximo um cartão com menos informação.
 */
export function ticketEventDisplay(event: UserTicket['event']) {
  return {
    available: !!event,
    title: event?.title ?? 'Evento não disponível',
    dateLabel: event?.date
      ? formatEventDate(event.date, { day: '2-digit', month: 'long' })
      : '—',
    timeLabel: event?.time ? event.time.slice(0, 5) : '—',
    placeLabel: event ? `${event.venue} — ${event.city}/${event.state}` : 'Local não informado',
    imageUrl: event?.image_url ?? null,
    /** `null` quando não há evento legível: não dá para linkar o que não abre. */
    href: event ? `/evento/${event.slug ?? event.id}` : null,
  };
}

export function useUserTickets() {
  const { user } = useAuth();

  const { data: tickets, isLoading, error, refetch } = useQuery({
    queryKey: ['user-tickets', user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Adota pedidos "órfãos" (venda manual/portaria feita antes da conta
      // existir): a RPC vincula por e-mail+CPF no servidor. Best-effort —
      // falha aqui nunca bloqueia a listagem.
      try {
        await (supabase.rpc as any)('claim_my_orphan_orders');
      } catch { /* noop */ }

      const { data, error } = await supabase
        .from('tickets')
        .select(`
          id,
          order_id,
          ticket_code,
          holder_name,
          holder_email,
          holder_phone,
          status,
          validated_at,
          created_at,
          event:events(id, slug, title, date, time, end_date, end_time, venue, city, state, image_url),
          lot:event_lots(name, price),
          seat:event_seats(label, code, seat_type_name)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Filter out pending tickets (not yet paid)
      const lista = (data as unknown as UserTicket[]).filter(t => t.status !== 'pending');

      // Transferências em andamento dos ingressos desta pessoa. Consulta
      // separada de propósito: um embed aqui faria a lista inteira depender de
      // uma tabela que a maioria dos clientes nunca vai usar, e ingresso é o
      // que não pode sumir da tela. Falhar aqui só tira o aviso de
      // "transferindo" — nunca o ingresso.
      try {
        const ids = lista.map(t => t.id);
        if (ids.length > 0) {
          // `as any` porque `types.ts` é auto-gerado e ainda não tem a tabela
          // nova — mesmo contorno já usado no `claim_my_orphan_orders` acima.
          // Sai sozinho quando os tipos forem regerados.
          const { data: transfers } = await (supabase as any)
            .from('ticket_transfers')
            .select('id, ticket_id, status, expires_at, to_cpf')
            .in('ticket_id', ids)
            .eq('status', 'pendente');
          const porTicket = new Map<string, any>();
          for (const tr of transfers ?? []) porTicket.set(tr.ticket_id, tr);
          for (const t of lista) {
            const tr = porTicket.get(t.id);
            t.transfer = tr
              ? { id: tr.id, status: tr.status, expires_at: tr.expires_at, to_cpf_final: String(tr.to_cpf ?? '').slice(-3) }
              : null;
          }
        }
      } catch { /* sem o aviso de transferência, mas com os ingressos na tela */ }

      return lista;
    },
    enabled: !!user,
  });


  // Comparação determinística em America/Sao_Paulo:
  // getEventEndInstant -> Date (UTC) via fromZonedTime; now -> Date (UTC).
  // Ambos os lados em UTC, independente do fuso do navegador.
  const now = new Date();

  // Ingresso sem evento legível NÃO pode derrubar a lista. Antes, o
  // getEventEndInstant recebia nulo, lançava, e a página inteira ficava PRETA —
  // o cliente não via nem os ingressos bons. Sem a data não há como saber se o
  // evento passou, então ele conta como "próximo": errar mostrando é melhor que
  // esconder ingresso de evento que ainda vai acontecer.
  const jaTerminou = (t: UserTicket): boolean | null =>
    t.event ? getEventEndInstant(t.event) < now : null;

  const upcomingTickets = tickets?.filter(t => {
    if (t.status === 'cancelled') return false;
    return jaTerminou(t) !== true;
  }) || [];

  const pastTickets = tickets?.filter(t => {
    if (t.status === 'cancelled') return false;
    return jaTerminou(t) === true;
  }) || [];


  const cancelledTickets = tickets?.filter(t => t.status === 'cancelled') || [];

  return {
    tickets,
    upcomingTickets,
    pastTickets,
    cancelledTickets,
    isLoading,
    error,
    /** Recarrega a lista — usado depois de iniciar ou cancelar uma transferência. */
    refetch,
  };
}
