/*
 * Script do Mercado Pago: carrega SÓ quando o formulário de cartão do Mercado
 * Pago aparece (OS-410, 09/11/2026).
 *
 * Antes os dois scripts ficavam no `index.html` e baixavam em TODA página do
 * site (home, termos, ajuda), para todo visitante. Desde a OS-269 (21/10) toda
 * venda nova é pela rota do Marcel, que não usa nenhum dos dois: o
 * `window.MercadoPago` só é lido por `CheckoutStepCard` e `SeatCheckoutCard`
 * (cartão de evento `mercadopago`), e o `MP_DEVICE_SESSION_ID` do
 * `security.js` é ignorado pelas edges `marcel-*`.
 *
 * Chamar mais de uma vez não duplica: o script entra uma vez só na página.
 */
const SDK = 'https://sdk.mercadopago.com/js/v2';
const SEGURANCA = 'https://www.mercadopago.com/v2/security.js';

function porNaPagina(src: string, atributos: Record<string, string> = {}) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  for (const [nome, valor] of Object.entries(atributos)) script.setAttribute(nome, valor);
  document.head.appendChild(script);
}

export function carregarMercadoPago() {
  if (typeof document === 'undefined') return;
  porNaPagina(SDK);
  // Antifraude do Mercado Pago: grava `window.MP_DEVICE_SESSION_ID`.
  porNaPagina(SEGURANCA, { view: 'checkout' });
}
