/*
 * As categorias de evento do site — fonte única.
 *
 * Nasceu em 23/09/2026, do pedido do Gabriel de ter a barra de categorias na home
 * (referência: Sympla e Ingresse). O que faltava não era a barra: é que o campo
 * `events.category` estava CRAVADO em 'Outros' no código do criar-evento, então
 * 26 dos 38 eventos nasceram sem categoria nenhuma.
 *
 * Duas regras que fazem a barra funcionar num catálogo pequeno:
 *   1. a barra só mostra categoria que TEM evento publicado no futuro — nunca
 *      leva ninguém para uma tela vazia;
 *   2. 'outros' existe mas nunca aparece na barra: é onde caem os testes, as
 *      demonstrações e o evento cujo produtor não escolheu nada.
 *
 * Para acrescentar uma categoria: uma linha aqui. Ela fica invisível até o
 * primeiro evento dela ser publicado.
 */

export interface CategoriaDeEvento {
  /** Valor gravado em `events.category`. Nunca muda depois de publicado. */
  slug: string;
  /** O que aparece na barra e no seletor do produtor. */
  nome: string;
  /** Aparece na barra da home? 'outros' não aparece. */
  naBarra: boolean;
}

export const CATEGORIAS: CategoriaDeEvento[] = [
  { slug: 'shows-e-musica', nome: 'Shows e Música', naBarra: true },
  { slug: 'festas', nome: 'Festas', naBarra: true },
  { slug: 'festivais-e-rodeios', nome: 'Festivais e Rodeios', naBarra: true },
  { slug: 'gastronomia', nome: 'Gastronomia', naBarra: true },
  { slug: 'esportes', nome: 'Esportes', naBarra: true },
  { slug: 'beneficente', nome: 'Beneficente', naBarra: true },
  // Cadastradas e ainda sem evento — entram na barra sozinhas no dia em que
  // o primeiro for publicado. Não há nada a fazer no código quando isso acontecer.
  { slug: 'espetaculos-e-teatro', nome: 'Espetáculos e Teatro', naBarra: true },
  { slug: 'comedia', nome: 'Comédia', naBarra: true },
  { slug: 'palestras-e-congressos', nome: 'Palestras e Congressos', naBarra: true },
  { slug: 'cultura-e-lazer', nome: 'Cultura e Lazer', naBarra: true },
  { slug: 'infantil', nome: 'Infantil e Família', naBarra: true },
  // Onde caem teste, demonstração e quem não escolheu. Nunca na barra.
  { slug: 'outros', nome: 'Outros', naBarra: false },
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
 * A barra da home: só as categorias que têm evento na lista recebida, na ordem
 * em que estão declaradas acima. Catálogo pequeno não vira tela vazia.
 */
export function categoriasComEvento(categoriasDosEventos: Array<string | null | undefined>): CategoriaDeEvento[] {
  const presentes = new Set(categoriasDosEventos.filter(Boolean) as string[]);
  return CATEGORIAS.filter((c) => c.naBarra && presentes.has(c.slug));
}
