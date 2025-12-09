import { Link } from 'react-router-dom';
import { Ticket, Instagram, Facebook, Twitter, Mail, Phone } from 'lucide-react';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    plataforma: [
      { label: 'Como Funciona', href: '#como-funciona' },
      { label: 'Preços', href: '/precos' },
      { label: 'Para Produtores', href: '/produtores' },
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
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
                <Ticket className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-display font-bold text-xl">
                Ingressos<span className="gradient-text">RP</span>
              </span>
            </Link>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs">
              A plataforma mais simples para comprar e vender ingressos em Ribeirão Preto e região.
            </p>
            <div className="flex gap-4">
              {[Instagram, Facebook, Twitter].map((Icon, index) => (
                <a
                  key={index}
                  href="#"
                  className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  <Icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-display font-semibold mb-4">Plataforma</h4>
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
            <h4 className="font-display font-semibold mb-4">Suporte</h4>
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
            <h4 className="font-display font-semibold mb-4">Contato</h4>
            <ul className="space-y-3">
              <li>
                <a
                  href="mailto:contato@ingressosrp.com.br"
                  className="flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  contato@ingressosrp.com.br
                </a>
              </li>
              <li>
                <a
                  href="tel:+5516999999999"
                  className="flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  (16) 99999-9999
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-muted-foreground text-sm">
            © {currentYear} IngressosRP. Todos os direitos reservados.
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
