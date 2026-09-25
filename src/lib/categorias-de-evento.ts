/*
 * As categorias de evento do site — fonte única.
 *
 * Nasceu em 23/09/2026, do pedido do Gabriel de ter a barra de categorias na home
 * (referência: Sympla e Ingresse). O que faltava não era a barra: é que o campo
 * `events.category` estava CRAVADO em 'Outros' no código do criar-evento, então
 * 26 dos 38 eventos nasceram sem categoria nenhuma.
 *
 * A vitrine mostra TODAS as categorias numa linha única que arrasta para o lado
 * (decisão do Gabriel em 24/09/2026), só com o ícone e o nome — sem contagem de
 * eventos. Clicar numa categoria sem evento leva a uma tela que diz que ainda
 * não há nada ali, e não a um vazio sem explicação.
 *
 * 'outros' existe mas nunca aparece: é onde caem os testes, as demonstrações e o
 * evento cujo produtor não escolheu nada.
 *
 * Para acrescentar uma categoria: uma linha aqui, com o ícone.
 */

export interface CategoriaDeEvento {
  /** Valor gravado em `events.category`. Nunca muda depois de publicado. */
  slug: string;
  /** O que aparece nos cards e no seletor do produtor. */
  nome: string;
  /** Aparece na vitrine da home? 'outros' não aparece. */
  naBarra: boolean;
  /** Nome do ícone do lucide-react, desenhado no card. */
  icone: IconeDeCategoria;
  /**
   * Rótulo curto SÓ para a vitrine da home, onde o card tem 116px e o nome
   * completo quebraria em duas linhas apertadas. O nome inteiro continua valendo
   * no seletor do produtor e na mensagem de "ainda não temos evento em...".
   */
  nomeCurto?: string;
}

/** Só os ícones usados aqui — a lista fechada evita importar a biblioteca inteira. */
export type IconeDeCategoria =
  | 'Music' | 'PartyPopper' | 'FerrisWheel' | 'UtensilsCrossed' | 'Trophy'
  | 'HeartHandshake' | 'Drama' | 'Laugh' | 'Presentation' | 'Palette'
  | 'Baby' | 'Shapes';

export const CATEGORIAS: CategoriaDeEvento[] = [
  { slug: 'shows-e-musica', nome: 'Shows e Música', nomeCurto: 'Shows', naBarra: true, icone: 'Music' },
  { slug: 'festas', nome: 'Festas', naBarra: true, icone: 'PartyPopper' },
  { slug: 'festivais-e-rodeios', nome: 'Festivais e Rodeios', nomeCurto: 'Festivais', naBarra: true, icone: 'FerrisWheel' },
  { slug: 'gastronomia', nome: 'Gastronomia', naBarra: true, icone: 'UtensilsCrossed' },
  { slug: 'esportes', nome: 'Esportes', naBarra: true, icone: 'Trophy' },
  { slug: 'beneficente', nome: 'Beneficente', naBarra: true, icone: 'HeartHandshake' },
  { slug: 'espetaculos-e-teatro', nome: 'Espetáculos e Teatro', nomeCurto: 'Teatro', naBarra: true, icone: 'Drama' },
  { slug: 'comedia', nome: 'Comédia', naBarra: true, icone: 'Laugh' },
  { slug: 'palestras-e-congressos', nome: 'Palestras e Congressos', nomeCurto: 'Palestras', naBarra: true, icone: 'Presentation' },
  { slug: 'cultura-e-lazer', nome: 'Cultura e Lazer', nomeCurto: 'Cultura', naBarra: true, icone: 'Palette' },
  { slug: 'infantil', nome: 'Infantil e Família', nomeCurto: 'Infantil', naBarra: true, icone: 'Baby' },
  // Onde caem teste, demonstração e quem não escolheu. Nunca na vitrine.
  { slug: 'outros', nome: 'Outros', naBarra: false, icone: 'Shapes' },
];

export const CATEGORIA_PADRAO = 'outros';

const PORSLUG = new Map(CATEGORIAS.map((c) => [c.slug, c]));

/** As que o produtor pode escolher — sem 'Outros', que é o padrão de quem não escolhe. */
export const CATEGORIAS_ESCOLHIVEIS = CATEGORIAS.filter((c) => c.slug !== CATEGORIA_PADRAO);

export function nomeDaCategoria(slug: string | null | undefined): string {
  if (!slug) return 'Outros';
  return PORSLUG.get(slug)?.nome ?? 'Outros';
}

/**
 * A vitrine da home mostra TODAS as categorias (decisão do Gabriel, 24/09/2026:
 * "coloca todas; se o cara clicar numa que não tem evento, não aparece evento
 * nenhum, beleza"). Antes só apareciam as que tinham evento — ele preferiu a
 * vitrine cheia, que é o que a Sympla faz.
 *
 * 'outros' continua de fora: é onde caem teste e demonstração.
 */
export function categoriasDaVitrine(): CategoriaDeEvento[] {
  return CATEGORIAS.filter((c) => c.naBarra);
}

/** O que a vitrine escreve embaixo do ícone. */
export function rotuloCurto(c: CategoriaDeEvento): string {
  return c.nomeCurto ?? c.nome;
}
