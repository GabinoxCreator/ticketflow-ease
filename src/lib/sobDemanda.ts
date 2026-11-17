import { lazy, type ComponentType } from "react";

/**
 * Carregar uma tela só quando ela é usada (OS-435, 16/11/2026).
 *
 * Por que existe: o site era um arquivo único de 3,7 MB (1,05 MB comprimido) que o
 * celular tinha de baixar inteiro antes de mostrar a página do evento. Agora as telas
 * do roteador viram pedaços próprios, baixados na hora em que a pessoa vai para elas.
 * O caminho da compra de ingresso (página do evento com checkout, login e carrinho, e
 * a tela do pedido) continua no pedaço inicial: nada nele depende de um pedaço baixar
 * depois. O mapa de poltronas e o checkout de poltronas NÃO: baixam à parte, com
 * pré-carga (ver "As telas de poltrona", no fim deste arquivo); a reserva fica no
 * `sessionStorage` e volta se a página recarregar (`useSeatHold.ts`).
 *
 * O risco novo: uma aba aberta ANTES de um publish ainda aponta para os pedaços
 * velhos, que somem do servidor. Quando um pedaço não baixa, a página recarrega UMA
 * vez sozinha (pega o build novo). A trava é por QUANTIDADE, não por tempo: uma
 * recarga por aba para cada build (o endereço do arquivo de entrada, que muda a cada
 * publish). Falhou de novo no mesmo build, não recarrega mais: quem segura a tela é a
 * proteção das rotas (`src/components/ProtecaoDasRotas.tsx`), que mostra o aviso
 * aprovado com o botão "Tentar de novo" e não deixa o resto do site cair. Tentar de novo na mesma aba sem recarregar não adianta: o navegador
 * guarda a falha daquele arquivo e devolve a mesma falha sem ir à rede (medido no
 * Chromium em 16/11).
 */

const CHAVE_DA_RECARGA = "festpag:recarregou-por-pedaco";

/** O build desta página: o endereço do arquivo de entrada (este módulo mora nele). */
const ESTE_BUILD = import.meta.url;

/** Recarrega a página uma vez por build. Devolve `true` se mandou recarregar. */
export function recarregarUmaVez(): boolean {
  try {
    if (window.sessionStorage.getItem(CHAVE_DA_RECARGA) === ESTE_BUILD) return false;
    window.sessionStorage.setItem(CHAVE_DA_RECARGA, ESTE_BUILD);
  } catch {
    // Sem sessionStorage (aba privada antiga, bloqueio): não dá para saber se já
    // recarregou, então não recarrega, para não arriscar laço.
    return false;
  }
  window.location.reload();
  return true;
}

/** Busca o módulo; se o arquivo não baixa (ou quebra ao rodar), recarrega a página
 *  uma vez por build. */
export function importarComRecarga<M>(importar: () => Promise<M>): Promise<M> {
  return importar().catch((erro) => {
    if (recarregarUmaVez()) {
      // A página está recarregando: segura a tela como está até o reload.
      return new Promise<M>(() => {});
    }
    throw erro;
  });
}

/** `React.lazy` com a recarga única, para export default. */
export function sobDemanda<T extends ComponentType<any>>(
  importar: () => Promise<{ default: T }>,
) {
  return lazy(() => importarComRecarga(importar));
}

/*
 * As telas de poltrona (OS-435). O mapa (`/evento/:id/mapa`) e o checkout de poltronas
 * (`/checkout/mesa/:id`) baixam à parte. Um lugar só para o roteador (`src/App.tsx`) e
 * para as pré-cargas usarem o MESMO arquivo:
 *  - a página do evento COM poltrona já baixa o mapa enquanto a pessoa lê
 *    (`EventDetails.tsx`, quando `hasMap`); evento sem poltrona não baixa nada a mais
 *    (decisão do Gabriel, 17/11/2026: "Só em evento com poltrona");
 *  - a tela do mapa já baixa o checkout de poltronas (`App.tsx`).
 * Pré-carga que falha não faz nada na hora: a hora de abrir a tela segue a recarga
 * única de sempre (e a reserva volta do sessionStorage, ver `useSeatHold.ts`).
 */
export const carregarMapaDePoltronas = () => import("@/pages/EventMapPage");
export const carregarCheckoutDePoltronas = () => import("@/pages/SeatCheckout");

/** Baixa antes de precisar. Falha aqui não faz nada. */
export function preCarregar(carregar: () => Promise<unknown>): void {
  carregar().catch(() => {});
}
