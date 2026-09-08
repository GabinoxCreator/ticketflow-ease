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
  icone: 'Ticket' | 'UserCheck' | 'CalendarDays' | 'Armchair' | 'PartyPopper' | 'HeartHandshake';
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
  // 3ª Porcada do Amor de Mirassol — almoço beneficente (Hospital de Amor de Barretos).
  // ⚠️ Nasceu com "1 convite por CPF", como a Confra do Bem. A organização DESFEZ a
  // regra em 08/09 e o passo saiu daqui junto com a trava do servidor — texto que
  // promete regra que não existe mais é pior do que texto nenhum. A `versao` subiu
  // para 2 de propósito: quem já tinha lido a v1 vê o pop-up de novo, agora certo.
  '4d0cfbee-7207-4dd4-b3be-c7bc9151bd1f': {
    titulo: 'Como funciona a Porcada do Amor',
    subtitulo: 'Trinta segundos de leitura antes de garantir o seu convite.',
    versao: 2,
    passos: [
      {
        icone: 'Ticket',
        titulo: 'O convite já inclui o almoço',
        texto: 'Open food do porco no rolete das 11h30 às 19h30, em salão climatizado. Não é ficha: o almoço está dentro do convite.',
      },
      {
        icone: 'PartyPopper',
        titulo: 'O dia inteiro tem atração',
        texto: 'Super show ao vivo, bingo, sorteios, leilões de prendas e área kids para a criançada.',
      },
      {
        icone: 'HeartHandshake',
        titulo: 'Quer ajudar além do convite?',
        texto: 'Tem um botão de doação nesta página, com o PIX da associação. A doação é voluntária e independente da compra — o valor vai direto para a conta da associação, em prol do Hospital de Amor de Barretos.',
      },
    ],
  },

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
