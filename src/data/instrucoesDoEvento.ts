/*
 * O "como funciona" de um evento — mostrado uma vez, ao abrir a página.
 *
 * Existe porque o rodeio tem regras que o comprador NÃO espera, e todas elas
 * decepcionam quando descobertas na hora errada:
 *
 *  · a arena é de graça (quem acha que está pagando para entrar, desiste);
 *  · é 1 ingresso por pessoa em cada noite (quem ia levar os amigos, trava no
 *    carrinho sem entender);
 *  · o passe trava no CPF de quem usar (quem ia revezar com a família descobre
 *    na portaria, no dia).
 *
 * Descobrir qualquer uma dessas no meio da compra é atrito; descobrir na
 * portaria é briga. Contar antes custa dez segundos (Gabriel, 24/08).
 *
 * Segue o padrão de dado curado por evento (`eventTicketLimits`,
 * `donationCampaigns`, `mapasDeArena`): evento sem entrada aqui **não mostra
 * pop-up nenhum**, que é o caso de todos os outros.
 */

export interface PassoDaInstrucao {
  /** Nome do ícone do lucide-react. */
  icone: 'Ticket' | 'UserCheck' | 'CalendarDays' | 'Armchair' | 'PartyPopper';
  titulo: string;
  texto: string;
  /** Destaca o passo — para a regra que mais surpreende. */
  atencao?: boolean;
}

export interface InstrucoesDoEvento {
  titulo: string;
  subtitulo: string;
  passos: PassoDaInstrucao[];
  /**
   * Muda quando o conteúdo muda. Quem já leu a versão anterior vê de novo —
   * caso contrário, uma correção importante nunca chegaria a quem já fechou
   * o pop-up uma vez.
   */
  versao: number;
}

export const INSTRUCOES_POR_EVENTO: Record<string, InstrucoesDoEvento> = {
  // Novo Horizonte Rodeo 2026
  '53a35128-4902-46b0-99cf-11c7769c52b7': {
    titulo: 'Como funciona o Rodeo',
    subtitulo: 'Trinta segundos de leitura para você não ter surpresa na portaria.',
    versao: 1,
    passos: [
      {
        icone: 'PartyPopper',
        titulo: 'A arena é de graça',
        texto: 'Entrar no rodeio não custa nada. O que se compra aqui é o acesso à boate, que é um setor fechado, com entrada própria.',
      },
      {
        icone: 'UserCheck',
        titulo: '1 ingresso por pessoa em cada noite',
        texto: 'Cada CPF leva um ingresso por noite. Para levar alguém, a compra tem que sair no CPF dessa pessoa — é o que impede a revenda na porta.',
        atencao: true,
      },
      {
        icone: 'CalendarDays',
        titulo: 'Ingresso da noite ou passe das 5',
        texto: 'O ingresso avulso vale só a noite dele. O passe permanente vale as cinco noites e sai bem mais barato que comprar uma a uma.',
      },
      {
        icone: 'Ticket',
        titulo: 'O passe trava no CPF de quem usar',
        texto: 'Você pode passar o passe para outra pessoa enquanto ninguém entrou com ele. Depois da primeira entrada, ele fica preso ao CPF de quem entrou — não dá para revezar entre amigos.',
        atencao: true,
      },
      {
        icone: 'Armchair',
        titulo: 'Camarote é à parte',
        texto: 'São 100 camarotes em cinco fileiras, com entrada exclusiva e as 5 noites incluídas. Quem tem camarote não entra na boate, e vice-versa.',
      },
    ],
  },
};

export function getInstrucoesDoEvento(eventId: string | undefined | null): InstrucoesDoEvento | null {
  if (!eventId) return null;
  return INSTRUCOES_POR_EVENTO[eventId] ?? null;
}

/** Chave do "já li" no navegador. A versão entra para poder mostrar de novo. */
export function chaveDeLeitura(eventId: string, versao: number): string {
  return `instrucoes:${eventId}:v${versao}`;
}
