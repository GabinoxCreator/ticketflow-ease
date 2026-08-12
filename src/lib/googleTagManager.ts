// Google Tag Manager gateado por consentimento (LGPD). O snippet saiu do
// index.html: sem opt-in de marketing, NENHUM byte do Google carrega — mesmo
// padrão do metaPixel. Defesa extra: o Consent Mode v2 nasce 'denied', então
// mesmo que o GTM volte a ser incluído incondicionalmente um dia, tags com
// verificação de consentimento seguem mudas; revogar no banner devolve os
// sinais para 'denied' na mesma sessão (o script já carregado não descarrega,
// mas as tags param de disparar).
import { hasMarketingConsent, CONSENT_CHANGED_EVENT } from './cookieConsent';

const GTM_ID = 'GTM-KKL3FBX8';

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

let scriptInjected = false;
let listenerArmed = false;

function gtag(..._args: unknown[]) {
  // O Consent Mode exige o objeto `arguments` no dataLayer — array puro é ignorado
  // eslint-disable-next-line prefer-rest-params
  (window.dataLayer = window.dataLayer || []).push(arguments);
}

const CONSENT_SIGNALS = ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage'];

function consentState(state: 'granted' | 'denied') {
  return Object.fromEntries(CONSENT_SIGNALS.map((signal) => [signal, state]));
}

function injectScript() {
  if (scriptInjected) return;
  scriptInjected = true;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  const el = document.createElement('script');
  el.async = true;
  el.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
  document.head.appendChild(el);
}

function grant() {
  gtag('consent', 'update', consentState('granted'));
  injectScript();
}

export function initGoogleTagManager() {
  if (typeof window === 'undefined') return;
  // O default 'denied' precisa entrar no dataLayer antes de qualquer tag
  gtag('consent', 'default', consentState('denied'));
  if (!listenerArmed) {
    listenerArmed = true;
    window.addEventListener(CONSENT_CHANGED_EVENT, () => {
      if (hasMarketingConsent()) grant();
      else if (scriptInjected) gtag('consent', 'update', consentState('denied'));
    });
  }
  if (hasMarketingConsent()) grant();
}
