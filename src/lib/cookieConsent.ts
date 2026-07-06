// Consentimento de cookies (LGPD). Cookies ESSENCIAIS (sessão/auth/carrinho)
// não dependem disto — funcionam sempre e constam na Política de Privacidade.
// O que é gateado aqui é MARKETING/publicidade (Meta Pixel etc.): esses scripts
// SÓ podem carregar após opt-in explícito do visitante (banner), e a decisão
// fica registrada com versão + data. Subir CONSENT_VERSION quando o escopo/texto
// mudar (força nova decisão).

export interface CookieConsent {
  marketing: boolean;
  version: string;
  decidedAt: string;
}

const STORAGE_KEY = 'festpag_cookie_consent';
export const CONSENT_VERSION = '1.0';
export const CONSENT_CHANGED_EVENT = 'cookie-consent-changed';
export const OPEN_PREFERENCES_EVENT = 'open-cookie-preferences';

export function getConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsent;
    if (parsed.version !== CONSENT_VERSION) return null; // escopo mudou → redecidir
    return parsed;
  } catch {
    return null;
  }
}

export function setConsent(marketing: boolean) {
  try {
    const consent: CookieConsent = {
      marketing,
      version: CONSENT_VERSION,
      decidedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  } catch {
    /* storage indisponível: segue sem persistir (o banner reaparece) */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: { marketing } }));
}

export function hasMarketingConsent(): boolean {
  return getConsent()?.marketing === true;
}

// Reabre o banner (revogabilidade — link "Preferências de cookies" no rodapé).
export function openCookiePreferences() {
  window.dispatchEvent(new CustomEvent(OPEN_PREFERENCES_EVENT));
}
