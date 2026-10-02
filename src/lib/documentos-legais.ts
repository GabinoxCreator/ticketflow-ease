/*
 * Fonte única dos documentos legais do site: onde moram, e em que versão estão.
 *
 * A "versão" é a data de última atualização do texto. Ela vai junto com o aceite
 * na tabela `aceites_legais` — é o que responde "aceitou O QUÊ", e não só "aceitou".
 *
 * ⚠️ REGRA: mudou o texto de uma das páginas, mude a data AQUI no mesmo commit.
 * A página lê a data deste arquivo, então as duas nunca saem de sincronia — mas
 * se a data não mudar, os aceites novos continuam apontando para o texto velho.
 */

export type DocumentoLegal = 'termos' | 'privacidade' | 'reembolso';

/** Data da última atualização de cada documento, no formato do banco (AAAA-MM-DD). */
export const VERSOES_LEGAIS: Record<DocumentoLegal, string> = {
  termos: '2026-04-14',
  /* 01/10/2026: a política dizia "não guardamos a sua foto" e guardamos desde
   * sempre. Corrigido, mais o compartilhamento com o fornecedor facial, a foto
   * na lista de dados coletados e o prazo em que ela fica. */
  privacidade: '2026-10-01',
  reembolso: '2026-09-30',
};

export const CAMINHOS_LEGAIS: Record<DocumentoLegal, string> = {
  termos: '/termos',
  privacidade: '/privacidade',
  reembolso: '/reembolso',
};

export const NOMES_LEGAIS: Record<DocumentoLegal, string> = {
  termos: 'Termos de Uso',
  privacidade: 'Política de Privacidade',
  reembolso: 'Política de Reembolso',
};

/** Com o artigo junto, para a frase do aviso sair correta sem regra de gramática no código. */
export const ROTULOS_COM_ARTIGO: Record<DocumentoLegal, string> = {
  termos: 'os Termos de Uso',
  privacidade: 'a Política de Privacidade',
  reembolso: 'a Política de Reembolso',
};

/** "14 de abril de 2026" — o que aparece no topo de cada página. */
export function dataPorExtenso(documento: DocumentoLegal): string {
  const [ano, mes, dia] = VERSOES_LEGAIS[documento].split('-').map(Number);
  const meses = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  return `${dia} de ${meses[mes - 1]} de ${ano}`;
}

/**
 * As versões que acompanham um aceite. Sempre em bloco, porque o aviso na tela
 * cita mais de um documento e o que foi aceito é o conjunto.
 */
export function versoesDe(...documentos: DocumentoLegal[]): Record<string, string> {
  return Object.fromEntries(documentos.map((d) => [d, VERSOES_LEGAIS[d]]));
}

/** O que o cadastro aceita: termos + privacidade. */
export const VERSOES_CADASTRO = versoesDe('termos', 'privacidade');

/** O que a compra aceita: termos + reembolso (é o que fixa prazo e regra de devolução). */
export const VERSOES_CHECKOUT = versoesDe('termos', 'reembolso');

/*
 * O resumo da regra de reembolso, para todo lugar que a cita FORA da Política:
 * página do evento, Central de Ajuda e tela de pagamento.
 *
 * Por que mora aqui (01/10/2026): o site dizia o prazo de três jeitos. A página
 * do evento juntava "7 dias da compra" com "48h antes do evento" numa condição
 * só, a Central de Ajuda tratava como dois caminhos, e a Política ainda tinha
 * uma terceira redação. Prazo de reembolso dito de formas diferentes é brecha
 * numa reclamação: vale a mais favorável ao comprador.
 *
 * ⚠️ REGRA: este texto ESPELHA as seções 2, 3, 4 e 7 da Política de Reembolso
 * (`src/pages/PoliticaReembolso.tsx`). Quem manda é a Política, porque é ela que
 * o comprador aceita. Mudou lá, muda aqui no mesmo commit. Nenhuma página
 * escreve prazo de reembolso por conta própria: importa daqui.
 */
export const RESUMO_REEMBOLSO = {
  prazo:
    'O reembolso pode ser pedido em até 7 dias corridos após a compra, desde que ainda faltem mais de 7 dias para o evento. Fora desse prazo, o pedido é aceito até 48 horas antes do início do evento.',
  taxa:
    'Na desistência do comprador é devolvido o valor dos ingressos; a taxa de serviço não é reembolsável.',
  produtor:
    'Se o evento for cancelado, adiado ou alterado pelo produtor, o reembolso é integral.',
  /** A versão curta, para a tela de pagamento. */
  taxaNoPagamento: 'Em caso de desistência da compra, a taxa de serviço não é reembolsável.',
} as const;
