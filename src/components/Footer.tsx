import { Link } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';
import logoFestpag from '@/assets/logo-festpag.png';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    plataforma: [
      { label: 'Para Produtores', href: '/area-do-produtor' },
      { label: 'Preços', href: '/precos' },
      { label: 'Blog', href: '/blog' },
    ],
    suporte: [
      { label: 'Central de Ajuda', href: '/ajuda' },
      { label: 'Contato', href: '/contato' },
      { label: 'FAQ', href: '/faq' },
      { label: 'Termos de Uso', href: '/termos' },
    ],
    legal: [
      { label: 'Política de Privacidade', href: '/privacidade' },
      { label: 'Política de Reembolso', href: '/reembolso' },
      { label: 'Termos de Serviço', href: '/termos-servico' },
    ],
  };

  return (
    <footer className="bg-card border-t border-border">
      <div className="container px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link to="/" className="inline-block mb-4">
              <img src={logoFestpag} alt="FestPag" className="h-8 w-auto" />
            </Link>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs">
              A plataforma completa para comprar e vender ingressos para eventos.
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
                  href="mailto:contato@festpag.com.br"
                  className="flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  contato@festpag.com.br
                </a>
              </li>
              <li>
                <a
                  href="tel:+5517999999999"
                  className="flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  (17) 99999-9999
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-muted-foreground text-sm">
            © {currentYear} FestPag. Todos os direitos reservados.
          </p>
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
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
