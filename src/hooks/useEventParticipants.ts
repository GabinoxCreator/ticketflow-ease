import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/lib/painelDoProdutor';
import { POR_PAGINA, semRepetido, lerPaginaDeIngressos, lerTodosOsIngressos, type FiltroIngressos } from '@/lib/painelDoEvento';

export interface Ticket {
  id: string;
  order_id: string;
  event_id: string;
  lot_id: string;
  user_id: string | null;
  holder_name: string;
  holder_email: string | null;
  holder_phone: string | null;
  ticket_code: string;
  status: 'pending' | 'valid' | 'used' | 'cancelled';
  validated_at: string | null;
  created_at: string;
  lot?: {
    name: string;
    price: number;
    group_ticket_enabled?: boolean | null;
    group_ticket_quantity?: number | null;
  };
  /** Pedido do ingresso (só o estado), para separar tentativa não paga de cancelamento de verdade. */
  order?: { status: string } | null;
}

/** Status que a tela pede → passagem que a função `produtor_mudar_ingresso` aceita. */
const ACAO_POR_STATUS: Partial<Record<Ticket['status'], string>> = {
  used: 'validar',
  valid: 'desfazer_validacao',
  cancelled: 'cancelar',
};

/** Recusa da função em português de dono (o código cru fica no console). */
function mensagemDoErro(bruta: string | undefined): string {
  const m = bruta ?? '';
  if (m.includes('ingresso_em_reembolso')) return 'Este ingresso tem um pedido de reembolso em análise e está bloqueado.';
  if (m.includes('passagem_nao_permitida')) return 'Este ingresso não pode mudar assim (cancelado não volta; pedido não pago não faz check-in).';
  if (m.includes('ingresso_nao_encontrado')) return 'Ingresso não encontrado neste evento.';
  if (m.includes('nao_autenticado')) return 'Sua sessão caiu. Entre de novo.';
  console.error('[produtor_mudar_ingresso]', m);
  return 'Não deu para mudar o ingresso. Tente de novo.';
}

/**
 * Check-in, desfazer e cancelar um ingresso. O produtor não escreve mais na tabela de
 * ingressos (OS-265): tudo passa pela função da casa, que confere o dono do evento e só
 * aceita essas três passagens. Ingresso cancelado não volta.
 */
export function useMudarIngresso(eventId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: Ticket['status'] }) => {
      const acao = ACAO_POR_STATUS[status];
      if (!acao) throw new Error('Essa mudança não é permitida neste ingresso.');

      // A função ainda não está nos tipos gerados (types.ts é do Lovable).
      const rpcSemTipo = supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string } | null }>;
      const { data, error } = await rpcSemTipo.call(supabase, 'produtor_mudar_ingresso', {
        _ticket_id: ticketId,
        _acao: acao,
      });

      if (error) throw new Error(mensagemDoErro(error.message));
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-participants', eventId] });
      // Tudo o que o evento mostra a partir dos ingressos (OS-408): os totais ("Entraram",
      // "Cancelados", ocupação), a receita por lote e o gráfico por dia moram em
      // ['event-orders', evento, ...]; os vendidos por lote, em ['lot-sales', ...].
      queryClient.invalidateQueries({ queryKey: ['event-orders', eventId] });
      queryClient.invalidateQueries({ queryKey: ['lot-sales'] });
      toast.success('Status do ingresso atualizado!');
    },
    onError: (error: Error) => {
      toast.error(mensagemDeErro(error, 'Erro ao atualizar ingresso'));
    },
  });
}

/**
 * Participantes em PÁGINAS de 50 (OS-408, etapa 4): a situação e a busca são filtradas
 * no banco, com a mesma regra de antes (ingresso de tentativa não paga não aparece).
 */
export function useEventParticipantsPage(eventId: string | undefined, filtro: FiltroIngressos = { situacao: 'todos' }) {
  const termo = (filtro.busca || '').trim();
  const consulta = useInfiniteQuery({
    queryKey: ['event-participants', eventId, 'pagina', filtro.situacao, termo, filtro.loteId || ''],
    queryFn: ({ pageParam }) =>
      lerPaginaDeIngressos(eventId as string, { situacao: filtro.situacao, busca: termo, loteId: filtro.loteId || null }, pageParam, pageParam + POR_PAGINA - 1),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const lidas = todas.reduce((s, p) => s + p.linhas.length, 0);
      return ultima.linhas.length > 0 && lidas < ultima.total ? lidas : undefined;
    },
    enabled: !!eventId,
  });
  const paginas = consulta.data?.pages ?? [];
  return {
    tickets: semRepetido(paginas.flatMap((p) => p.linhas)),
    total: paginas.length ? paginas[paginas.length - 1].total : 0,
    temMais: !!consulta.hasNextPage,
    carregarMais: () => consulta.fetchNextPage(),
    carregandoMais: consulta.isFetchingNextPage,
    isLoading: consulta.isLoading,
    error: consulta.error,
  };
}

/**
 * A lista INTEIRA de participantes (lida em blocos de 500, nunca cortada pelo teto).
 * Hoje só a aba de check-in antiga usa (fora do painel desde 20/08); as telas do painel
 * usam a página acima.
 */
export function useEventParticipants(eventId: string | undefined) {
  const { data: tickets, isLoading, error } = useQuery({
    queryKey: ['event-participants', eventId, 'tudo'],
    queryFn: () => lerTodosOsIngressos(eventId as string, { situacao: 'todos' }),
    enabled: !!eventId,
  });
  const updateTicketStatus = useMudarIngresso(eventId);

  const validTickets = tickets?.filter(t => t.status === 'valid') || [];
  const usedTickets = tickets?.filter(t => t.status === 'used') || [];
  const cancelledTickets = tickets?.filter(t => t.status === 'cancelled') || [];

  return {
    tickets,
    validTickets,
    usedTickets,
    cancelledTickets,
    totalTickets: tickets?.length || 0,
    isLoading,
    error,
    updateTicketStatus,
  };
}
