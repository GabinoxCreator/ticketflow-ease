// Leva a decisão do banner de cookies para o BANCO, na linha do próprio titular.
//
// Por que isto existe (29/09/2026): a API de Conversões manda a compra para a
// Meta a partir do NOSSO SERVIDOR, e não do navegador. O servidor não enxerga o
// localStorage — então, sem isto, ele não teria como saber se aquele comprador
// autorizou marketing, e a única saída seria mandar tudo (ilegal) ou não mandar
// nada (inútil). Gravando a decisão no perfil, o servidor fecha por padrão:
// quem não autorizou não é enviado.
//
// LGPD: consentimento é do TITULAR, revogável e registrado com data e versão
// (mesmo padrão do `facial_consent_at`). Guardar só no localStorage era prova
// fraca e morria a cada troca de navegador. Se ele revoga, apagamos os
// identificadores de anúncio e o servidor para de enviar na hora.
import { supabase } from '@/integrations/supabase/client';
import { getConsent } from './cookieConsent';
import { getFbCookies } from './metaPixel';

let ultimoGravado: string | null = null;

export async function syncMarketingConsent(): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return;

    const consent = getConsent();
    if (!consent) return; // ainda não decidiu — nada a registrar

    const { fbp, fbc } = consent.marketing ? getFbCookies() : { fbp: null, fbc: null };

    // Não repetir a mesma gravação a cada render/navegação.
    const assinatura = `${user.id}|${consent.marketing}|${consent.version}|${fbp ?? ''}|${fbc ?? ''}`;
    if (assinatura === ultimoGravado) return;

    const { error } = await supabase
      .from('profiles')
      // `as any`: types.ts é auto-gerado e ainda não conhece estas colunas novas.
      .update({
        marketing_consent: consent.marketing,
        marketing_consent_at: consent.decidedAt,
        marketing_consent_version: consent.version,
        // Revogou → apaga os identificadores de anúncio junto.
        fbp,
        fbc,
      } as any)
      .eq('id', user.id);

    if (!error) ultimoGravado = assinatura;
  } catch {
    /* registrar consentimento nunca pode derrubar a navegação */
  }
}

export function resetMarketingConsentCache() {
  ultimoGravado = null;
}
