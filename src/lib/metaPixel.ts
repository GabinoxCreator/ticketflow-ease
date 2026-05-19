// Minimal Meta Pixel loader. Loads the fbq script once per pixel id and
// exposes helpers to track standard browser-side events. Only call these
// when the producer has tracking_enabled === true and a valid pixel id.

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

const initialized = new Set<string>();
let scriptInjected = false;

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

export function initMetaPixel(pixelId: string | null | undefined) {
  if (!pixelId || typeof window === 'undefined') return;
  injectScript();
  if (initialized.has(pixelId)) return;
  try {
    window.fbq?.('init', pixelId);
    initialized.add(pixelId);
  } catch (err) {
    console.warn('[metaPixel] init failed', err);
  }
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
