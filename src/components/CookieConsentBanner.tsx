// Banner de consentimento de cookies (LGPD). Aparece enquanto não houver
// decisão registrada (ou quando a versão do consentimento mudar) e pode ser
// reaberto pelo rodapé ("Preferências de cookies"). "Aceitar todos" libera os
// cookies de marketing (Meta Pixel — ver src/lib/metaPixel.ts, que só carrega
// após este opt-in); "Somente essenciais" mantém apenas o necessário pro site
// funcionar (sessão/login/carrinho), que não depende de consentimento.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getConsent, setConsent, OPEN_PREFERENCES_EVENT } from '@/lib/cookieConsent';

const CookieConsentBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getConsent() === null) setVisible(true);
    const reopen = () => setVisible(true);
    window.addEventListener(OPEN_PREFERENCES_EVENT, reopen);
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, reopen);
  }, []);

  if (!visible) return null;

  const decide = (marketing: boolean) => {
    setConsent(marketing);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Preferências de cookies"
      className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card shadow-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Cookie className="h-6 w-6 shrink-0 mt-0.5 text-muted-foreground" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Cookies e privacidade</p>
            <p className="text-sm text-muted-foreground">
              Usamos cookies essenciais para o site funcionar (login, compra). Com a sua
              autorização, também usamos cookies de <b>marketing</b> (como o Pixel da Meta)
              para medir campanhas dos produtores. Você pode mudar de ideia quando quiser em
              "Preferências de cookies" no rodapé. Saiba mais na{' '}
              <Link to="/privacidade" className="underline hover:text-foreground">
                Política de Privacidade
              </Link>
              .
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={() => decide(false)}>
            Somente essenciais
          </Button>
          <Button onClick={() => decide(true)}>Aceitar todos</Button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsentBanner;
