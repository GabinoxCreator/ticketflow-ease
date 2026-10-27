// O pixel da CASA: a FestPag anunciando a si mesma.
//
// Dois mundos usam o mesmo site e não podem se misturar:
// - pixel do PRODUTOR: cada produtor cadastra o dele em Configurações e ele
//   mede a página do evento DELE (`useEventPixel` → RPC `get_event_tracking`).
// - pixel da CASA (este): mede a landing comercial `/lp`, para onde a nossa
//   conta de anúncios (act_719925697227572) manda o tráfego.
// Quem garante que um evento não cai no Gerenciador do outro é o `trackSingle`
// de `src/lib/metaPixel.ts` — ver o aviso da OS-306 no topo daquele arquivo.
//
// Por que fica escrito no código e não em variável de ambiente: id de pixel é
// público (vai no HTML de qualquer forma, não é segredo) e o site é publicado
// pelo Lovable, onde variável nova precisa ser cadastrada à mão em cada
// ambiente. É o mesmo motivo do GTM em `src/lib/googleTagManager.ts`.
//
// Nasceu em 26/10/2026 (OS-306): a conta de anúncios da FestPag não tinha
// pixel nenhum, e a campanha "TRAFAEGO - LP1" parou de entregar porque otimiza
// para visualização da página e a Meta não conseguia medir isso.
export const FESTPAG_PIXEL_ID = '2956557088016820';
