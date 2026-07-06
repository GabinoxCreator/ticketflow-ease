// Minimal Meta Pixel loader. Loads the fbq script once per pixel id and
// exposes helpers to track standard browser-side events. Only call these
// when the producer has tracking_enabled === true and a valid pixel id.
//
// LGPD: o Pixel é cookie de MARKETING de terceiro (envia dados de navegação à
// Meta/EUA). O gate do produtor NÃO é consentimento do titular — por isso o
// script SÓ é injetado após opt-in do visitante no banner de cookies
// (hasMarketingConsent). Sem consentimento, os inits ficam pendentes e são
// aplicados se o visitante aceitar durante a sessão; eventos anteriores ao
// aceite são descartados de propósito (não se rastreia retroativamente).
import { hasMarketingConsent, CONSENT_CHANGED_EVENT } from './cookieConsent';

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

const initialized = new Set<string>();
const pendingInit = new Set<string>();
let scriptInjected = false;
let consentListenerArmed = false;

function armConsentListener() {
  if (consentListenerArmed || typeof window === 'undefined') return;
  consentListenerArmed = true;
  window.addEventListener(CONSENT_CHANGED_EVENT, () => {
    if (!hasMarketingConsent()) return;
    for (const id of pendingInit) doInit(id);
    pendingInit.clear();
  });
}

function injectScript() {
  if (scriptInjected || typeof window === 'undefined') return;
  if (window.fbq) {
    scriptInjected = true;
    return;
  }
  // Standard Meta Pixel base snippet
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
    window.fbq?.('init', pixelId);
    initialized.add(pixelId);
  } catch (err) {
    console.warn('[metaPixel] init failed', err);
  }
}

export function initMetaPixel(pixelId: string | null | undefined) {
  if (!pixelId || typeof window === 'undefined') return;
  // LGPD: sem opt-in de marketing, NADA é injetado — fica pendente aguardando
  // o visitante decidir no banner.
  if (!hasMarketingConsent()) {
    pendingInit.add(pixelId);
    armConsentListener();
    return;
  }
  doInit(pixelId);
}

export function trackPageView(pixelId: string | null | undefined) {
  if (!pixelId) return;
  initMetaPixel(pixelId);
  try {
    window.fbq?.('track', 'PageView');
  } catch {}
}

export function trackViewContent(
  pixelId: string | null | undefined,
  payload: { content_ids?: string[]; content_name?: string; content_type?: string; value?: number; currency?: string },
) {
  if (!pixelId) return;
  initMetaPixel(pixelId);
  try {
    window.fbq?.('track', 'ViewContent', payload);
  } catch {}
}

export function trackInitiateCheckout(
  pixelId: string | null | undefined,
  payload: { content_ids?: string[]; content_name?: string; num_items?: number; value?: number; currency?: string },
) {
  if (!pixelId) return;
  initMetaPixel(pixelId);
  try {
    window.fbq?.('track', 'InitiateCheckout', payload);
  } catch {}
}
