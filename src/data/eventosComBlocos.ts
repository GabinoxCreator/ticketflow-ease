/*
 * Quais eventos têm uma parte própria na página, com a cara do evento (OS-444).
 *
 * Essa parte (o dia em etapas, shows, setores, lugar, patrocinadores) é montada por
 * nós, no código, para um evento de cada vez. Não é tela do produtor (decisão do
 * Gabriel, 18/11: "é só nós que montamos aqui"). Este arquivo fica pequeno de
 * propósito: é o único pedaço que vai no carregamento inicial da página do evento. O
 * conteúdo e as fotos moram em `fogoEFumaca.ts` (junto do componente
 * `BlocosDoEvento`) e só baixam na página de um evento desta lista (OS-435: a entrada
 * do site não pode engordar).
 *
 * Evento fora da lista: a página fica exatamente como antes.
 */

/** Fogo & Fumaça Festival, 12/12/2026, Complexo Swift (slug `fogo-fumaca-festival`). */
export const EVENTO_FOGO_E_FUMACA = 'd9945e04-78e4-4b28-8913-0fc5adfbbeab';

const EVENTOS_COM_BLOCOS = new Set<string>([EVENTO_FOGO_E_FUMACA]);

/** Pelo id do evento (nunca pelo slug: o slug muda, o id não). */
export function eventoTemBlocos(eventId: string | null | undefined): boolean {
  return !!eventId && EVENTOS_COM_BLOCOS.has(eventId);
}
