import { useState, type ReactNode } from 'react';
import { EVENTO_FOGO_E_FUMACA } from '@/data/eventosComBlocos';
import FogoEFumaca, { FaixaDoFogo } from './fogo/FogoEFumaca';

/*
 * A parte da página do evento que tem a cara do evento (OS-444). Fica no lugar do
 * "Sobre o evento", logo depois dos ingressos (decisão do Gabriel, 19/11). No Fogo,
 * este pedaço também liga o tema que dá a cara do festival à página inteira.
 *
 * Carregado sob demanda pela página do evento, só para os eventos de
 * `eventosComBlocos.ts`: o resto do site não baixa este arquivo, nem as fotos, nem a
 * fonte. Hoje só o Fogo & Fumaça tem (decisão do Gabriel, 18/11: exclusivo dele,
 * montado por nós no código).
 */

export interface PropsDosBlocos {
  eventId: string;
  /** Há ingresso à venda agora? Sem venda, os botões de ingresso somem. */
  temVenda: boolean;
  /** O rodapé da tela está livre? (falso com a barra do carrinho aparecendo) */
  rodapeLivre: boolean;
  /** O "Sobre o evento" de sempre: aparece se este pedaço não baixar ou não servir. */
  seFalhar?: ReactNode;
}

/*
 * O estilo deste pedaço chegou? O navegador baixa o código e o estilo em arquivos
 * separados, e um pode falhar sem o outro. Sem o estilo a parte do evento sairia
 * desmontada, então o pedaço se comporta como se não tivesse baixado: a página mostra
 * o "Sobre o evento" de sempre e fica inteira no visual normal. Quem avisa que o estilo
 * chegou é o próprio `fogo.css`, com a marca `--estilo-do-fogo` na raiz da página.
 */
function estiloChegou() {
  return getComputedStyle(document.documentElement).getPropertyValue('--estilo-do-fogo').trim() === '1';
}

export default function BlocosDoEvento({ eventId, temVenda, rodapeLivre, seFalhar }: PropsDosBlocos) {
  const [comEstilo] = useState(estiloChegou);
  if (comEstilo && eventId === EVENTO_FOGO_E_FUMACA) {
    return <FogoEFumaca temVenda={temVenda} rodapeLivre={rodapeLivre} />;
  }
  return <>{seFalhar}</>;
}

/** A faixa curta do topo da página, antes dos ingressos. */
export function FaixaDoEvento({ eventId }: { eventId: string }) {
  const [comEstilo] = useState(estiloChegou);
  if (comEstilo && eventId === EVENTO_FOGO_E_FUMACA) return <FaixaDoFogo />;
  return null;
}
