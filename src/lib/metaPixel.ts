// Meta Pixel (navegador). Carrega o fbq uma vez por pixel e dispara os eventos
// padrão. Só entra em ação quando o produtor tem tracking_enabled === true e um
// pixel válido (quem decide isso é a RPC get_event_tracking).
//
// LGPD: o Pixel é cookie de MARKETING de terceiro (envia dados de navegação à
// Meta/EUA). O gate do produtor NÃO é consentimento do titular — por isso o
// script SÓ é injetado após opt-in do visitante no banner de cookies
// (hasMarketingConsent).
//
// ⚠️ 29/09/2026 — O BURACO QUE ISTO CONSERTA (caso Luana / Filhos da Luz):
// antes, quando o visitante aceitava os cookies, a gente apenas ligava o pixel
// (`fbq('init')`) e não mandava mais nada. `init` sozinho NÃO é evento: a Meta
// recebia o pixel acendendo e nenhum PageView. Como 100% do tráfego de anúncio
// é gente que chega pela PRIMEIRA vez — ou seja, sempre cai no banner —, o
// Gerenciador de Eventos ficava zerado. Provado em produção com navegador de
// verdade na página do Carlos Caetano.
//
// A correção: o que a página tenta disparar ANTES da decisão fica guardado num
// buffer da PÁGINA ATUAL e é enviado no instante em que o visitante aceita.
// Isso não é rastreamento retroativo: é a página em que ele está no momento do
// aceite. Cada PageView novo ZERA o buffer, então navegação anterior ao aceite
// morre — de propósito.
//
// ⚠️ 26/10/2026 (OS-306) — DOIS PIXELS VIVEM AQUI E NÃO PODEM SE MISTURAR:
// o pixel do PRODUTOR (a página do evento dele) e o pixel da CASA (a landing
// comercial da FestPag, `src/lib/festpagPixel.ts`). Numa mesma aba o visitante
// pode passar pelos dois (landing → página de evento), e `fbq('track', ...)`
// manda o evento para TODOS os pixels já iniciados: a compra do produtor
// cairia no Gerenciador da FestPag e o nosso PageView no dele. Por isso todo
// envio daqui é `trackSingle`, que nomeia o pixel de destino.
import { hasMarketingConsent, CONSENT_CHANGED_EVENT } from './cookieConsent';

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

type PixelPayload = Record<string, unknown>;
type BufferedEvent = { name: string; payload?: PixelPayload; eventId?: string };

const initialized = new Set<string>();
// Pixels que não podem usar a configuração automática da Meta (ver
// `desligarAutoConfig`). Consultado na hora do init.
const semAutoConfig = new Set<string>();
let scriptInjected = false;
let consentListenerArmed = false;

// Buffer da página atual: o que foi pedido enquanto ainda não havia decisão.
// É trocado inteiro a cada PageView (página nova = buffer novo).
let pendingPixelId: string | null = null;
let pendingEvents: BufferedEvent[] = [];

function armConsentListener() {
  if (consentListenerArmed || typeof window === 'undefined') return;
  consentListenerArmed = true;
  window.addEventListener(CONSENT_CHANGED_EVENT, () => {
    if (!hasMarketingConsent()) {
      // Revogou: para de guardar e não manda nada.
      pendingEvents = [];
      return;
    }
    flushPending();
  });
}

function flushPending() {
  if (!pendingPixelId || pendingEvents.length === 0) return;
  const pixelId = pendingPixelId;
  const eventos = pendingEvents;
  pendingEvents = [];
  doInit(pixelId);
  for (const ev of eventos) send(pixelId, ev);
}

function injectScript() {
  if (scriptInjected || typeof window === 'undefined') return;
  if (window.fbq) {
    scriptInjected = true;
    return;
  }
  // Snippet base oficial do Meta Pixel
  /* eslint-disable */
  (function (f: any, b: Document, e: string, v: string) {
    let n: any, t: any, s: any;
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e) as HTMLScriptElement;
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode?.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  scriptInjected = true;
}

function doInit(pixelId: string) {
  injectScript();
  if (initialized.has(pixelId)) return;
  try {
    // Tem que vir ANTES do init: depois dele a Meta já ligou os automatismos.
    if (semAutoConfig.has(pixelId)) window.fbq?.('set', 'autoConfig', false, pixelId);
    window.fbq?.('init', pixelId);
    initialized.add(pixelId);
  } catch (err) {
    console.warn('[metaPixel] init falhou', err);
  }
}

// `eventId` existe para DEDUPLICAR com a API de Conversões (servidor): quando o
// mesmo evento chega pelos dois caminhos com o mesmo id, a Meta conta uma vez.
// `trackSingle` (e não `track`) porque a aba pode ter mais de um pixel iniciado
// — ver o aviso da OS-306 no topo deste arquivo.
function send(pixelId: string, { name, payload, eventId }: BufferedEvent) {
  try {
    if (eventId) window.fbq?.('trackSingle', pixelId, name, payload ?? {}, { eventID: eventId });
    else window.fbq?.('trackSingle', pixelId, name, payload ?? {});
  } catch {
    /* pixel nunca pode derrubar a página */
  }
}

// Dispara agora (se há consentimento) ou guarda para o instante do aceite.
function track(pixelId: string | null | undefined, ev: BufferedEvent, novaPagina = false) {
  if (!pixelId || typeof window === 'undefined') return;

  if (!hasMarketingConsent()) {
    armConsentListener();
    // Página nova (ou outro pixel) zera o que estava guardado.
    if (novaPagina || pendingPixelId !== pixelId) {
      pendingPixelId = pixelId;
      pendingEvents = [];
    }
    pendingEvents.push(ev);
    return;
  }

  doInit(pixelId);
  send(pixelId, ev);
}

export function initMetaPixel(pixelId: string | null | undefined) {
  if (!pixelId || typeof window === 'undefined') return;
  if (!hasMarketingConsent()) {
    armConsentListener();
    if (pendingPixelId !== pixelId) {
      pendingPixelId = pixelId;
      pendingEvents = [];
    }
    return;
  }
  doInit(pixelId);
}

// Desliga a "configuração automática" da Meta para UM pixel. Esse pacote faz o
// pixel agir sozinho: dispara evento em clique de botão (`SubscribedButtonClick`)
// e lê campos de formulário para casar a pessoa (advanced matching automático).
//
// O pixel da casa nasce com isso desligado porque o formulário desta landing
// tem NOME e TELEFONE: automatismo nenhum pode mandar isso para a Meta (LGPD).
// Quem decide o que vai é o nosso código, e ele manda só o evento.
//
// ⚠️ O que isto NÃO desliga (medido em 26/10 com janela de verdade, OS-306):
// a Meta continua disparando um PageView sozinha a cada troca de rota sem
// recarregar, para todo pixel já ligado na aba. Isso não está na nossa mão,
// é igual antes e depois desta mudança, e vale para os pixels de produtor do
// mesmo jeito (provado em /taxa e /ajuda, telas sem uma linha nossa de pixel).
//
// Chamar ANTES do primeiro evento daquele pixel. Não mexe nos outros pixels:
// o id vai no próprio comando.
export function desligarAutoConfig(pixelId: string | null | undefined) {
  if (!pixelId) return;
  semAutoConfig.add(pixelId);
}

export function trackPageView(pixelId: string | null | undefined) {
  track(pixelId, { name: 'PageView' }, true);
}

// Lead: a pessoa pediu contato (formulário da nossa landing). NUNCA mandar
// nome, telefone ou e-mail aqui — o visitante autorizou a FestPag a falar com
// ele, não a Meta a receber os dados dele.
export function trackLead(
  pixelId: string | null | undefined,
  payload?: { content_name?: string },
) {
  track(pixelId, { name: 'Lead', payload });
}

export function trackViewContent(
  pixelId: string | null | undefined,
  payload: { content_ids?: string[]; content_name?: string; content_type?: string; value?: number; currency?: string },
) {
  track(pixelId, { name: 'ViewContent', payload });
}

export function trackInitiateCheckout(
  pixelId: string | null | undefined,
  payload: { content_ids?: string[]; content_name?: string; num_items?: number; value?: number; currency?: string },
) {
  track(pixelId, { name: 'InitiateCheckout', payload });
}

// A compra. `eventId` é o id do pedido — é o que casa com o evento que o nosso
// servidor manda pela API de Conversões, para a Meta não contar duas vendas.
export function trackPurchase(
  pixelId: string | null | undefined,
  payload: { content_ids?: string[]; content_name?: string; content_type?: string; num_items?: number; value: number; currency?: string },
  eventId: string,
) {
  track(pixelId, { name: 'Purchase', payload: { currency: 'BRL', ...payload }, eventId });
}

// Cookies que o próprio pixel escreve no navegador. Mandados junto no evento de
// servidor, eles são o que mais aumenta a taxa de casamento (Event Match
// Quality) da API de Conversões — sem eles a Meta tem dificuldade de saber que
// aquela compra veio daquele clique no anúncio.
export function getFbCookies(): { fbp: string | null; fbc: string | null } {
  if (typeof document === 'undefined') return { fbp: null, fbc: null };
  const ler = (nome: string) => {
    const m = document.cookie.match(new RegExp('(^| )' + nome + '=([^;]+)'));
    return m ? decodeURIComponent(m[2]) : null;
  };
  return { fbp: ler('_fbp'), fbc: ler('_fbc') };
}
