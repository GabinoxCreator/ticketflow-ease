/*
 * Planta do local, por evento — para o comprador entender onde vai ficar.
 *
 * É informativo, não é o mapa de escolher camarote (esse é `/evento/:id/mapa`,
 * desenhado a partir de `event_seats`). Aqui o comprador vê a arena inteira:
 * onde é o palco, o que é pago, o que é livre, por onde se entra.
 *
 * Segue o padrão de `eventTicketLimits` e `donationCampaigns`: dado curado por
 * evento num lugar só, em vez de `if` espalhado pelas telas (§0-A do framework
 * do Rodeio — nada por "se o evento for o rodeio"). Evento sem entrada aqui
 * simplesmente não mostra planta nenhuma, que é o caso de todos os outros.
 *
 * ⚠️ SEM PREÇO, de propósito (decisão do Gabriel, 20/08). O preço muda por lote,
 * por negociação e ao longo da venda; repetido aqui, envelheceria e passaria a
 * mentir. Quem quer valor abre o mapa de camarotes.
 */

export interface SetorDaArena {
  id: string;
  nome: string;
  /** Uma linha, do jeito que se explica para alguém que nunca foi. */
  descricao: string;
  cor: string;
  /** Texto claro sobre a cor? Usado para o contraste do rótulo. */
  textoEscuro?: boolean;
}

export interface MapaDeArena {
  titulo: string;
  /** Chamada curta acima da planta. */
  resumo: string;
  setores: SetorDaArena[];
  camarote: {
    /** Fileiras que se afastam da arena. */
    degraus: number;
    porDegrau: number;
    /** Quantas pessoas cabem em cada um. */
    pessoas: number;
    /** A fileira colada na grade é a mais perto do show. */
    notaDeOrdem: string;
  };
  /** Onde ficam as portas. Confirmado com o produtor em 20/08. */
  entradas: string;
  /**
   * Como chamar a lista de ingressos nesta arena.
   *
   * No rodeio a arena é de graça: TODO ingresso vendido é para entrar na boate.
   * Chamar a lista de "Ingressos" faz o comprador achar que está pagando para
   * entrar no evento — e ele pode desistir por isso, sem saber que o que está
   * comprando é o acesso ao setor fechado (Gabriel, 23/08).
   *
   * Nulo = "Ingressos", como em todos os outros eventos.
   */
  tituloDosIngressos?: string;
}

export const MAPAS_DE_ARENA: Record<string, MapaDeArena> = {
  // Novo Horizonte Rodeio 2026 — planta confirmada com o produtor em 20/08/2026:
  // 5 degraus, 20 camarotes por degrau, o degrau colado na arena é o mais perto
  // do show, e as entradas ficam na base dos setores de camarote e boate.
  '53a35128-4902-46b0-99cf-11c7769c52b7': {
    titulo: 'Como é a arena',
    resumo: 'O palco fica ao norte, a arena no centro. Boate e camarote são setores separados, cada um com a sua entrada.',
    setores: [
      {
        id: 'palco',
        nome: 'Palco',
        descricao: 'Onde acontecem os shows, na cabeceira da arena.',
        cor: '#F5A623',
        textoEscuro: true,
      },
      {
        id: 'arena',
        nome: 'Arena',
        descricao: 'O centro, onde acontece o rodeio. Entrada gratuita.',
        cor: '#14181E',
      },
      {
        id: 'boate',
        nome: 'Boate',
        descricao: 'Setor fechado, com ingresso próprio. Quem tem camarote não entra aqui.',
        cor: '#E12229',
      },
      {
        id: 'camarote',
        nome: 'Camarote',
        descricao: 'Cinco fileiras voltadas para a arena, com ingresso próprio e entrada exclusiva.',
        cor: '#1E9BF0',
      },
    ],
    camarote: {
      degraus: 5,
      porDegrau: 20,
      pessoas: 10,
      notaDeOrdem: 'A primeira fileira é a colada na grade da arena — a mais perto do show.',
    },
    entradas: 'As portas de camarote e boate ficam na parte de baixo de cada setor.',
    tituloDosIngressos: 'Ingressos Boate',
  },
};

export function getMapaDaArena(eventId: string | undefined | null): MapaDeArena | null {
  if (!eventId) return null;
  return MAPAS_DE_ARENA[eventId] ?? null;
}
