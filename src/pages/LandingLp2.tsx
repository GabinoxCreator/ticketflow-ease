import { Helmet } from 'react-helmet-async';
import { Ticket, Tablet, CreditCard, ScanLine, LayoutDashboard, Mouse } from 'lucide-react';
import logoFestpag from '@/assets/logo-festpag.png';
import totemImg from '@/assets/lp2/totem-cardapio.png';
import macbookImg from '@/assets/lp2/macbook-dashboard.png';
import iphoneImg from '@/assets/lp2/iphone-ingressos.png';
import posImg from '@/assets/lp2/maquininha-pagamento.png';

const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)'/%3E%3C/svg%3E\")";

const CSS = `
.lp2 *, .lp2 *::before, .lp2 *::after { box-sizing: border-box; margin: 0; padding: 0; }
.lp2 {
  --bg: #0A0710;
  --fg: #F2EFF9;
  --fg-soft: rgba(242,239,249,.74);
  --blue: #5F6EF9;
  --grad: linear-gradient(100deg, #5F6EF9 0%, #B86AD9 52%, #F766C6 100%);
  --font-head: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}
.lp2-scroll {
  height: 100vh; overflow-y: auto; overflow-x: hidden;
  scroll-snap-type: y mandatory;
}
.lp2 .noise {
  position: fixed; inset: 0; z-index: 1; pointer-events: none;
  opacity: .045; background-image: ${NOISE};
}
.lp2 img { display: block; max-width: 100%; height: auto; }

/* topbar */
.lp2-top {
  position: fixed; top: 0; left: 0; right: 0; z-index: 40;
  height: 72px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 clamp(20px, 4vw, 56px);
}
.lp2-top img { height: 26px; width: auto; }
.lp2-btn {
  font-family: var(--font-body); font-size: 14px; font-weight: 500;
  border-radius: 14px; padding: 11px 20px; cursor: pointer; border: 0;
  color: #fff; background-image: var(--grad);
  box-shadow: 0 10px 30px rgba(95,110,249,.28);
  transition: transform .2s ease, box-shadow .2s ease;
}
.lp2-btn:hover { transform: translateY(-1px); box-shadow: 0 14px 36px rgba(95,110,249,.36); }
.lp2-btn-ghost {
  font-family: var(--font-body); font-size: 14px; font-weight: 500;
  border-radius: 14px; padding: 11px 20px; cursor: pointer;
  color: var(--fg); background: transparent;
  border: 1px solid rgba(242,239,249,.18);
  transition: border-color .2s ease;
}
.lp2-btn-ghost:hover { border-color: rgba(242,239,249,.42); }

/* sections */
.lp2-sec {
  position: relative; z-index: 2;
  min-height: 100vh; scroll-snap-align: start;
  display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.05fr);
  align-items: center; gap: clamp(24px, 4vw, 64px);
  padding: 112px clamp(20px, 4vw, 56px) 72px;
}
.lp2-copy { max-width: 600px; }

.lp2-badge {
  display: inline-flex; align-items: center; gap: 9px;
  border-radius: 999px; padding: 7px 15px;
  border: 1px solid rgba(95,110,249,.3); background: rgba(95,110,249,.09);
  font-size: 11.5px; letter-spacing: .11em; text-transform: uppercase;
  color: var(--fg-soft);
}
.lp2-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--blue); box-shadow: 0 0 10px var(--blue); }

.lp2-h1 {
  font-family: var(--font-head); font-weight: 600; letter-spacing: -0.03em;
  line-height: 1.03; font-size: clamp(38px, 5.2vw, 68px);
  margin: 28px 0 22px;
}
.lp2-h1 .g {
  background-image: var(--grad);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.lp2-sub { font-size: 17px; line-height: 1.6; color: var(--fg-soft); max-width: 480px; }

.lp2-tags { display: flex; flex-wrap: wrap; gap: 10px; margin: 32px 0 0; }
.lp2-tag {
  display: inline-flex; align-items: center; gap: 8px;
  border-radius: 14px; padding: 10px 15px; font-size: 13.5px;
  border: 1px solid rgba(95,110,249,.3); background: rgba(95,110,249,.09);
  color: var(--fg);
  opacity: 0; transform: translateY(8px);
  animation: lp2-tag-in .5s ease forwards;
}
@keyframes lp2-tag-in { to { opacity: 1; transform: translateY(0); } }
.lp2-cta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 36px; }

/* art */
.lp2-art { position: relative; height: min(76vh, 720px); }
.lp2-glow, .lp2-glow2 { position: absolute; border-radius: 50%; pointer-events: none; }
.lp2-glow {
  width: 62%; height: 62%; left: 16%; top: 12%;
  background: radial-gradient(circle, rgba(95,110,249,.22) 0%, transparent 70%);
  filter: blur(60px);
}
.lp2-glow2 {
  width: 36%; height: 36%; right: 6%; bottom: 12%;
  background: radial-gradient(circle, rgba(247,102,198,.14) 0%, transparent 70%);
  filter: blur(50px);
}
.lp2-dev {
  position: absolute;
  filter: drop-shadow(0 40px 60px rgba(0,0,0,.7));
  animation: lp2-float 8s ease-in-out infinite;
}
@keyframes lp2-float { 0%,100% { transform: translateY(-9px); } 50% { transform: translateY(9px); } }
.lp2-mac    { width: 56%; left: 0; top: 12%; rotate: -3deg; animation-delay: 0s; z-index: 1; }
.lp2-totem  { width: 34%; left: 40%; top: 2%; animation-delay: -2.4s; z-index: 3; }
.lp2-iphone { width: 19%; left: 30%; top: 42%; rotate: -5deg; animation-delay: -4.6s; z-index: 4; }
.lp2-pos    { width: 17%; right: 2%; bottom: 4%; rotate: 5deg; animation-delay: -6.2s; z-index: 2; }

.lp2-thread { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 5; pointer-events: none; overflow: visible; }
.lp2-thread path {
  fill: none; stroke: rgba(242,239,249,.5); stroke-width: 1.5;
  stroke-dasharray: 900; stroke-dashoffset: 900;
  animation: lp2-draw 2s ease-out .4s forwards;
}
@keyframes lp2-draw { to { stroke-dashoffset: 0; } }
.lp2-thread circle { fill: #9AA6FF; opacity: 0; animation: lp2-fade .5s ease 2.3s forwards; }
@keyframes lp2-fade { to { opacity: 1; } }

/* rail */
.lp2-rail {
  position: fixed; right: 26px; top: 50%; transform: translateY(-50%); z-index: 30;
  display: flex; flex-direction: column; gap: 12px;
}
.lp2-rail span { width: 6px; height: 6px; border-radius: 50%; background: rgba(242,239,249,.24); }
.lp2-rail span.on { background: var(--blue); box-shadow: 0 0 10px var(--blue); }

.lp2-scrollhint {
  position: absolute; bottom: 28px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px;
  font-size: 10.5px; letter-spacing: .22em; text-transform: uppercase;
  color: rgba(242,239,249,.42);
}

.lp2-sec2 { display: flex; align-items: center; justify-content: flex-start; }
.lp2-sec2 h2 { font-family: var(--font-head); font-weight: 600; letter-spacing: -.03em; font-size: clamp(28px, 4vw, 46px); }

@media (max-width: 1023px) {
  .lp2-scroll { scroll-snap-type: none; }
  .lp2-sec { grid-template-columns: 1fr; min-height: auto; padding-top: 104px; }
  .lp2-copy { order: 1; }
  .lp2-art { order: 2; height: 58vw; min-height: 320px; }
  .lp2-rail { display: none; }
  .lp2-thread { display: none; }
  .lp2-scrollhint { position: static; transform: none; margin: 40px auto 0; justify-content: center; }
}
@media (prefers-reduced-motion: reduce) {
  .lp2 *, .lp2 *::before, .lp2 *::after { animation: none !important; transition: none !important; }
  .lp2-tag { opacity: 1; transform: none; }
  .lp2-thread path { stroke-dashoffset: 0; }
  .lp2-thread circle { opacity: 1; }
}
`;

const TAGS = [
  { icon: Ticket, label: 'Ticketeira' },
  { icon: Tablet, label: 'Totem Autoatendimento' },
  { icon: CreditCard, label: 'Maquininhas' },
  { icon: ScanLine, label: 'Controle de Acesso' },
  { icon: LayoutDashboard, label: 'Gestão Completa' },
];

const LandingLp2 = () => (
  <div className="lp2">
    <Helmet>
      <title>FestPag — Sistema de gestão completo para grandes eventos</title>
      <meta
        name="description"
        content="Ticketeira, totem de autoatendimento, maquininhas e controle de acesso na mesma operação, com dados ao vivo."
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <style>{CSS}</style>
    </Helmet>

    <div className="noise" />

    <header className="lp2-top">
      <img src={logoFestpag} alt="FestPag" />
      <button className="lp2-btn" type="button">Falar com especialista</button>
    </header>

    <div className="lp2-rail" aria-hidden="true">
      <span className="on" /><span /><span /><span /><span />
    </div>

    <div className="lp2-scroll">
      <section className="lp2-sec">
        <div className="lp2-copy">
          <div className="lp2-badge"><i className="lp2-dot" />87 totens em operação · 18 clientes</div>

          <h1 className="lp2-h1">
            O sistema de <span className="g">gestão completo</span> para grandes eventos
          </h1>

          <p className="lp2-sub">Soluções integradas para venda, operação e controle do seu evento.</p>

          <div className="lp2-tags">
            {TAGS.map(({ icon: Icon, label }, i) => (
              <span key={label} className="lp2-tag" style={{ animationDelay: `${i * 70}ms` }}>
                <Icon size={15} strokeWidth={1.5} />
                {label}
              </span>
            ))}
          </div>

          <div className="lp2-cta">
            <button className="lp2-btn" type="button">Falar com especialista</button>
            <button className="lp2-btn-ghost" type="button">Ver o ecossistema</button>
          </div>
        </div>

        <div className="lp2-art">
          <div className="lp2-glow" />
          <div className="lp2-glow2" />
          <img className="lp2-dev lp2-mac" src={macbookAsset.url} alt="Painel do produtor FestPag em um notebook" />
          <img className="lp2-dev lp2-totem" src={totemAsset.url} alt="Totem de autoatendimento FestPag com pinpad" />
          <img className="lp2-dev lp2-iphone" src={iphoneAsset.url} alt="Ingresso digital com QR Code no celular" />
          <img className="lp2-dev lp2-pos" src={posAsset.url} alt="Maquininha FestPag na tela de pagamento" />
          <svg className="lp2-thread" viewBox="0 0 600 600" preserveAspectRatio="none" aria-hidden="true">
            <path d="M -260 470 L 130 470 C 200 470 208 420 208 372" />
            <circle cx="208" cy="368" r="4" />
          </svg>
        </div>

        <div className="lp2-scrollhint"><Mouse size={13} strokeWidth={1.5} />Role para ver</div>
      </section>

      <section className="lp2-sec lp2-sec2">
        <h2>Seção 2</h2>
      </section>
    </div>
  </div>
);

export default LandingLp2;
