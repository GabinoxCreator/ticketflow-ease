import { Link } from 'react-router-dom';
import { openCookiePreferences } from '@/lib/cookieConsent';
import { razaoSocialComCnpj } from '@/lib/identidade-festpag';
import { Mail, MessageCircle } from 'lucide-react';
import logoFestpag from '@/assets/logo-festpag.png';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    plataforma: [
      { label: 'Para Produtores', href: '/area-do-produtor' },
    ],
    suporte: [
      { label: 'Central de Ajuda', href: '/ajuda' },
      { label: 'Entenda a taxa', href: '/taxa' },
      // OS-374: o porquê da facial, a base legal e o que fazemos com ela (seção 7).
      { label: 'Reconhecimento facial', href: '/privacidade#reconhecimento-facial' },
    ],
    legal: [
      { label: 'Política de Privacidade', href: '/privacidade' },
      { label: 'Política de Reembolso', href: '/reembolso' },
      { label: 'Termos de Uso', href: '/termos' },
    ],
  };

  return (
    <footer className="bg-card border-t border-border">
      <div className="container px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link to="/" className="inline-block mb-4" aria-label="FestPag: página inicial">
              <img src={logoFestpag} alt="FestPag" className="h-8 w-auto" />
            </Link>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs">
              Somos uma rede de pagamentos e tecnologias para grandes eventos
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Plataforma</h4>
            <ul className="space-y-3">
              {footerLinks.plataforma.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-muted-foreground text-sm hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Suporte</h4>
            <ul className="space-y-3">
              {footerLinks.suporte.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-muted-foreground text-sm hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Contato</h4>
            <ul className="space-y-3">
              <li>
                <a
                  href="mailto:suporte@festpag.digital"
                  className="flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  suporte@festpag.digital
                </a>
              </li>
              <li>
                {/* É o WhatsApp do atendimento (o resto do site já o chama assim),
                    não um telefone de ligação: o link abre a conversa (OS-410). */}
                <a
                  href="https://wa.me/551153046659"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp (11) 5304-6659"
                  className="flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp (11) 5304-6659
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-muted-foreground text-sm text-center md:text-left">
            <p>© {currentYear} FestPag. Todos os direitos reservados.</p>
            <p className="mt-1">{razaoSocialComCnpj()}</p>
          </div>
          <div className="flex gap-6">
            {footerLinks.legal.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="text-muted-foreground text-sm hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
            {/* Revogabilidade LGPD: reabre o banner de consentimento */}
            <button
              type="button"
              onClick={openCookiePreferences}
              className="text-muted-foreground text-sm hover:text-foreground transition-colors"
            >
              Preferências de cookies
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
