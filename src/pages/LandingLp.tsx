import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';

const LP_CSS = `
.lp-root *, .lp-root *::before, .lp-root *::after { box-sizing: border-box; margin: 0; padding: 0; }

.lp-root {
  --fest-blue: #6B5CF0;
  --fest-mid: #A050D0;
  --fest-pink: #E040A0;
  --fest-dark: #08000f;
  --fest-dark2: #110020;
  --fest-dark3: #180030;
  --fest-card: #1a0032;
  --fest-border: rgba(160,80,255,0.18);
  --fest-border-bright: rgba(200,80,255,0.4);
  --white: #fff;
  --muted: rgba(255,255,255,0.55);
  --dimmed: rgba(255,255,255,0.25);

  background: var(--fest-dark);
  color: var(--white);
  font-family: 'DM Sans', sans-serif;
  font-size: 16px;
  line-height: 1.65;
  overflow-x: hidden;
  scroll-behavior: smooth;
}

.lp-root .logo-mark { display: inline-block; line-height: 0; }

.lp-root nav {
  position: sticky; top: 0; z-index: 100;
  background: rgba(8,0,15,0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--fest-border);
  padding: 0 40px;
  display: flex; align-items: center; justify-content: space-between;
  height: 64px;
}
.lp-root .nav-cta {
  background: linear-gradient(90deg, var(--fest-blue), var(--fest-pink));
  color: #fff; font-family: 'Syne', sans-serif;
  font-size: 13px; font-weight: 700;
  padding: 9px 22px; border-radius: 30px; border: none;
  cursor: pointer; text-decoration: none; letter-spacing: 0.5px;
  transition: opacity .2s;
}
.lp-root .nav-cta:hover { opacity: .85; }

.lp-root .hero {
  min-height: 92vh;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center;
  padding: 80px 32px 100px;
  position: relative;
  overflow: hidden;
}
.lp-root .hero::before {
  content: '';
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 50% 110%, rgba(180,0,255,0.22) 0%, transparent 65%),
    radial-gradient(ellipse 40% 40% at 20% 20%, rgba(100,60,255,0.12) 0%, transparent 60%),
    radial-gradient(ellipse 40% 40% at 80% 10%, rgba(224,64,160,0.1) 0%, transparent 60%);
  pointer-events: none;
}
.lp-root .hero::after {
  content: '';
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(160,80,255,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(160,80,255,0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  pointer-events: none;
}
.lp-root .hero-logo { position: relative; z-index: 2; margin-bottom: 36px; }
.lp-root .hero-headline {
  font-family: 'Syne', sans-serif;
  font-size: clamp(28px, 5vw, 52px);
  font-weight: 800;
  line-height: 1.1;
  position: relative; z-index: 2;
  max-width: 720px;
}
.lp-root .hero-headline span {
  background: linear-gradient(90deg, var(--fest-blue), var(--fest-pink));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.lp-root .hero-sub {
  font-size: 18px; color: var(--muted);
  margin-top: 18px; max-width: 560px;
  position: relative; z-index: 2;
}
.lp-root .hero-tag {
  color: var(--fest-pink); font-size: 14px;
  margin-top: 10px; position: relative; z-index: 2;
  font-weight: 500;
}
.lp-root .hero-btn {
  display: inline-block; margin-top: 36px;
  background: linear-gradient(90deg, var(--fest-blue), var(--fest-pink));
  color: #fff; font-family: 'Syne', sans-serif;
  font-size: 14px; font-weight: 700; letter-spacing: 0.5px;
  padding: 15px 40px; border-radius: 40px; border: none;
  cursor: pointer; text-decoration: none;
  position: relative; z-index: 2;
  transition: transform .2s, opacity .2s;
}
.lp-root .hero-btn:hover { transform: translateY(-2px); opacity: .9; }

.lp-root section { padding: 72px 32px; }
.lp-root section:nth-of-type(even) { background: var(--fest-dark2); }
.lp-root .section-inner { max-width: 900px; margin: 0 auto; }
.lp-root .section-label {
  font-size: 10px; letter-spacing: 3.5px; text-transform: uppercase;
  color: #9060C0; font-weight: 700; margin-bottom: 12px;
}
.lp-root .section-title {
  font-family: 'Syne', sans-serif;
  font-size: clamp(24px, 4vw, 38px);
  font-weight: 800; line-height: 1.15; color: var(--white);
}
.lp-root .section-title em {
  font-style: normal;
  background: linear-gradient(90deg, var(--fest-blue), var(--fest-pink));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.lp-root .divider { width: 36px; height: 3px; border-radius: 2px; margin: 16px 0 36px;
  background: linear-gradient(90deg, var(--fest-blue), var(--fest-pink)); }
.lp-root .section-desc { font-size: 16px; color: var(--muted); max-width: 600px; }

.lp-root .cards-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 32px; }
.lp-root .prob-card {
  background: var(--fest-card);
  border: 1px solid var(--fest-border);
  border-radius: 14px; padding: 22px 20px;
  transition: border-color .2s;
}
.lp-root .prob-card:hover { border-color: var(--fest-border-bright); }
.lp-root .prob-card h4 { font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 700; color: var(--white); margin-bottom: 6px; }
.lp-root .prob-card p { font-size: 14px; color: var(--muted); }
.lp-root .bottom-note { margin-top: 28px; font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.7); }

.lp-root .fin-list { display: flex; flex-direction: column; gap: 10px; margin-top: 32px; }
.lp-root .fin-card {
  background: var(--fest-card);
  border-left: 3px solid var(--fest-pink);
  border-radius: 10px; padding: 16px 20px;
  display: flex; align-items: center; justify-content: space-between;
}
.lp-root .fin-bad { font-size: 15px; font-weight: 600; color: var(--white); }
.lp-root .fin-good { font-size: 13px; color: #C060E0; font-style: italic; }

.lp-root .tags-wrap { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; }
.lp-root .tag {
  border: 1px solid rgba(200,100,255,0.35);
  color: #D080FF; font-size: 13px; font-weight: 500;
  padding: 10px 20px; border-radius: 30px;
  transition: background .2s;
}
.lp-root .tag:hover { background: rgba(200,100,255,0.08); }

.lp-root .eco-flow { display: flex; flex-direction: column; gap: 0; margin-top: 32px; }
.lp-root .eco-step {
  background: var(--fest-card);
  border: 1px solid rgba(120,80,255,0.25);
  border-radius: 14px; padding: 18px 22px;
  transition: border-color .2s;
}
.lp-root .eco-step:hover { border-color: rgba(180,80,255,0.5); }
.lp-root .eco-step h4 {
  font-family: 'Syne', sans-serif;
  font-size: 14px; font-weight: 700; color: #B080FF; margin-bottom: 4px;
}
.lp-root .eco-step p { font-size: 14px; color: var(--muted); }
.lp-root .eco-arrow { text-align: center; color: var(--fest-pink); font-size: 22px; padding: 4px 0; }

.lp-root .feat-card {
  background: var(--fest-card);
  border: 1px solid var(--fest-border);
  border-radius: 14px; padding: 20px 20px; margin-bottom: 14px;
  transition: border-color .2s;
}
.lp-root .feat-card:hover { border-color: var(--fest-border-bright); }
.lp-root .feat-card h4 { font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700; color: #A080FF; margin-bottom: 6px; }
.lp-root .feat-card p { font-size: 14px; color: var(--muted); }

.lp-root .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 32px 0 24px; }
.lp-root .metric {
  background: #0d001a;
  border: 1px solid rgba(200,50,200,0.25);
  border-radius: 12px; padding: 20px 12px; text-align: center;
}
.lp-root .metric-val { font-family: 'Syne', sans-serif; font-size: 32px; font-weight: 800; color: var(--fest-pink); }
.lp-root .metric-label { font-size: 12px; color: var(--muted); margin-top: 4px; }
.lp-root .chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
.lp-root .chip {
  font-size: 12px; color: var(--muted);
  background: rgba(120,60,200,0.18);
  padding: 5px 13px; border-radius: 20px;
}

.lp-root .pos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 32px; }

.lp-root .face-cards { display: flex; flex-direction: column; gap: 14px; margin-top: 32px; }
.lp-root .face-card {
  background: var(--fest-card);
  border: 1px solid var(--fest-border);
  border-radius: 14px; padding: 20px 20px;
  display: flex; align-items: flex-start; gap: 16px;
  transition: border-color .2s;
}
.lp-root .face-card:hover { border-color: var(--fest-border-bright); }
.lp-root .face-icon {
  width: 44px; height: 44px; border-radius: 50%;
  background: linear-gradient(135deg, var(--fest-blue), var(--fest-pink));
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; flex-shrink: 0;
}
.lp-root .face-card h4 { font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700; color: var(--white); margin-bottom: 4px; }
.lp-root .face-card p { font-size: 14px; color: var(--muted); }

.lp-root .compare { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 32px; }
.lp-root .cmp-box { background: var(--fest-card); border-radius: 14px; padding: 22px 20px; }
.lp-root .cmp-box.old { border: 1px solid rgba(255,80,80,0.25); }
.lp-root .cmp-box.new { border: 1px solid rgba(100,100,255,0.35); }
.lp-root .cmp-title { font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; font-weight: 700; margin-bottom: 16px; }
.lp-root .cmp-box.old .cmp-title { color: #FF6080; }
.lp-root .cmp-box.new .cmp-title { color: #8888FF; }
.lp-root .cmp-item { font-size: 14px; color: rgba(255,255,255,0.72); padding: 7px 0; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); }
.lp-root .cmp-item:last-child { border-bottom: none; }
.lp-root .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.lp-root .dot-r { background: #FF5070; }
.lp-root .dot-b { background: var(--fest-blue); }

.lp-root .who-tags { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; }
.lp-root .who-tag {
  border: 1px solid rgba(120,80,255,0.35);
  color: #C080FF; font-size: 13px; font-weight: 500;
  padding: 10px 20px; border-radius: 30px;
  transition: background .2s;
}
.lp-root .who-tag:hover { background: rgba(120,80,255,0.1); }

.lp-root .form-section {
  padding: 80px 32px;
  background: var(--fest-dark3);
  position: relative; overflow: hidden;
}
.lp-root .form-section::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 70% 60% at 50% 100%, rgba(180,0,255,0.18) 0%, transparent 70%);
  pointer-events: none;
}
.lp-root .form-inner { max-width: 580px; margin: 0 auto; position: relative; z-index: 2; }
.lp-root .form-card {
  background: rgba(10, 0, 20, 0.85);
  border: 1px solid rgba(160,80,255,0.3);
  border-radius: 24px;
  padding: 48px 44px 52px;
}
.lp-root .form-logo { display: flex; justify-content: center; margin-bottom: 36px; }
.lp-root .form-heading {
  font-size: 10px; letter-spacing: 4px; text-transform: uppercase;
  color: #9060C0; font-weight: 700; text-align: center; margin-bottom: 8px;
}
.lp-root .form-title {
  font-family: 'Syne', sans-serif; font-size: 26px; font-weight: 800;
  text-align: center; color: var(--white); margin-bottom: 32px;
}
.lp-root .form-title span {
  background: linear-gradient(90deg, var(--fest-blue), var(--fest-pink));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.lp-root .sep { height: 1px; background: linear-gradient(90deg, transparent, rgba(160,80,255,0.3), transparent); margin: 0 0 32px; }

.lp-root .field { margin-bottom: 20px; }
.lp-root .field label {
  display: block; font-size: 10px; letter-spacing: 2.5px;
  text-transform: uppercase; font-weight: 700; color: #8050B0;
  margin-bottom: 8px;
}
.lp-root .field input, .lp-root .field select {
  width: 100%;
  background: rgba(20, 0, 40, 0.9);
  border: 1px solid rgba(160,80,255,0.22);
  border-radius: 12px;
  padding: 14px 18px;
  font-size: 15px; font-family: 'DM Sans', sans-serif;
  color: var(--white);
  outline: none;
  transition: border-color .2s;
  -webkit-appearance: none; appearance: none;
}
.lp-root .field input::placeholder { color: rgba(255,255,255,0.2); }
.lp-root .field input:focus, .lp-root .field select:focus { border-color: rgba(180,80,255,0.65); }
.lp-root .sel-wrap { position: relative; }
.lp-root .sel-wrap::after {
  content: '';
  position: absolute; right: 16px; top: 50%;
  transform: translateY(-50%);
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid rgba(160,80,255,0.55);
  pointer-events: none;
}
.lp-root .field select { cursor: pointer; color: rgba(255,255,255,0.22); }
.lp-root .field select.filled { color: var(--white); }
.lp-root .field select option { background: #16002a; color: var(--white); }

.lp-root .submit-btn {
  width: 100%; margin-top: 10px;
  padding: 16px; border: none; border-radius: 14px;
  font-family: 'Syne', sans-serif;
  font-size: 13px; font-weight: 800;
  letter-spacing: 1.5px; text-transform: uppercase;
  background: linear-gradient(90deg, var(--fest-blue) 0%, var(--fest-mid) 50%, var(--fest-pink) 100%);
  color: var(--white); cursor: pointer;
  transition: opacity .2s, transform .15s;
}
.lp-root .submit-btn:hover { opacity: .88; transform: translateY(-1px); }
.lp-root .submit-btn:active { transform: scale(.98); }
.lp-root .submit-btn:disabled { opacity: .6; cursor: not-allowed; transform: none; }

.lp-root .ok-msg {
  text-align: center;
  padding: 24px 20px; color: #C060E0;
  font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 700;
}
.lp-root .ok-sub { font-family: 'DM Sans', sans-serif; font-size: 14px; color: var(--muted); font-weight: 400; margin-top: 6px; }

.lp-root .err-msg {
  margin-top: 14px; padding: 12px 14px;
  background: rgba(255, 80, 80, 0.12);
  border: 1px solid rgba(255, 80, 80, 0.35);
  border-radius: 10px;
  color: #FFB0B8; font-size: 13px; text-align: center;
}

.lp-root footer {
  background: #000; padding: 56px 32px;
  text-align: center; border-top: 1px solid rgba(160,80,255,0.15);
}
.lp-root .footer-logo { display: flex; justify-content: center; margin-bottom: 14px; }
.lp-root .footer-tagline { font-size: 15px; color: var(--muted); margin-bottom: 8px; }
.lp-root .footer-url { color: #B070E0; font-size: 14px; text-decoration: none; }
.lp-root .footer-url:hover { color: var(--fest-pink); }
.lp-root .footer-cta {
  display: inline-block; margin-top: 28px;
  background: linear-gradient(90deg, var(--fest-blue), var(--fest-pink));
  color: #fff; font-family: 'Syne', sans-serif;
  font-size: 13px; font-weight: 800; letter-spacing: 0.5px;
  padding: 13px 36px; border-radius: 40px;
  text-decoration: none; transition: opacity .2s;
}
.lp-root .footer-cta:hover { opacity: .85; }

@media (max-width: 600px) {
  .lp-root .cards-grid, .lp-root .pos-grid, .lp-root .compare { grid-template-columns: 1fr; }
  .lp-root .metrics { grid-template-columns: 1fr 1fr; }
  .lp-root .form-card { padding: 32px 24px 36px; }
  .lp-root nav { padding: 0 20px; }
  .lp-root section { padding: 56px 20px; }
}
`;

function maskPhone(raw: string): string {
  const v = raw.replace(/\D/g, '').slice(0, 11);
  if (v.length <= 10) {
    return v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3').replace(/-$/, '');
  }
  return v.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3').replace(/-$/, '');
}

export default function LandingLp() {
  const [nome, setNome] = useState('');
  const [cidade, setCidade] = useState('');
  const [tipoEvento, setTipoEvento] = useState('');
  const [telefone, setTelefone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  async function handleSubmit() {
    setErrorMsg(null);
    if (!nome.trim() || !cidade.trim() || !tipoEvento || !telefone.trim()) {
      setErrorMsg('Por favor, preencha todos os campos antes de enviar.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke('submit-landing-lead', {
        body: {
          nome: nome.trim(),
          cidade: cidade.trim(),
          tipo_evento: tipoEvento,
          telefone: telefone.trim(),
        },
      });
      if (error) throw error;
      setSuccess(true);
    } catch (err) {
      console.error('[lp] submit error', err);
      setErrorMsg('Não foi possível enviar agora. Tente novamente em instantes.');
    } finally {
      setSubmitting(false);
    }
  }

  // Mantém comportamento original do <select>: cor muda quando preenchido
  useEffect(() => {
    if (selectRef.current) {
      if (tipoEvento) selectRef.current.classList.add('filled');
      else selectRef.current.classList.remove('filled');
    }
  }, [tipoEvento]);

  return (
    <>
      <Helmet>
        <title>Festpag Digital — O banco oficial dos eventos</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
        <style>{LP_CSS}</style>
      </Helmet>
      <div className="lp-root">
        {/* NAV */}
        <nav>
          <svg width="130" height="38" viewBox="0 0 340 96" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="nav-lg" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6B5CF0" />
                <stop offset="45%" stopColor="#A850D0" />
                <stop offset="100%" stopColor="#E040A0" />
              </linearGradient>
            </defs>
            <text x="0" y="72" fontFamily="Arial Black,Arial,sans-serif" fontWeight="900" fontSize="82" fill="url(#nav-lg)">festpag</text>
            <rect x="155" y="60" width="5" height="32" fill="#7B6CF6" rx="1" />
            <text x="160" y="90" fontFamily="Arial Black,Arial,sans-serif" fontWeight="700" fontSize="24" fill="url(#nav-lg)">.digital</text>
          </svg>
          <a href="#contato" className="nav-cta">Quero mais informações</a>
        </nav>

        {/* HERO */}
        <div className="hero">
          <div className="hero-logo">
            <svg width="360" height="108" viewBox="0 0 520 152" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="hero-lg" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#6B5CF0" />
                  <stop offset="30%" stopColor="#8B5CE8" />
                  <stop offset="60%" stopColor="#C040B0" />
                  <stop offset="100%" stopColor="#E840A0" />
                </linearGradient>
                <linearGradient id="hero-lg2" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#7B6CF6" />
                  <stop offset="100%" stopColor="#D040B0" />
                </linearGradient>
              </defs>
              <text x="0" y="116" fontFamily="Arial Black,Arial,sans-serif" fontWeight="900" fontSize="130" fill="url(#hero-lg)">festpag</text>
              <rect x="222" y="98" width="9" height="52" fill="#7260F0" rx="1.5" />
              <text x="231" y="148" fontFamily="Arial Black,Arial,sans-serif" fontWeight="700" fontSize="42" fill="url(#hero-lg2)">.digital</text>
            </svg>
          </div>
          <h1 className="hero-headline">A operação inteligente para eventos que querem <span>vender mais</span></h1>
          <p className="hero-sub">Reduzir filas e operar com controle total. Do ingresso ao consumo, tudo conectado em um único ecossistema.</p>
          <p className="hero-tag">O banco oficial dos eventos</p>
          <a href="#contato" className="hero-btn">Quero mais informações</a>
        </div>

        {/* PROBLEMA */}
        <section>
          <div className="section-inner">
            <div className="section-label">O problema</div>
            <h2 className="section-title">O mercado de eventos evoluiu.<br /><em>A operação ainda não.</em></h2>
            <div className="divider" />
            <div className="cards-grid">
              <div className="prob-card"><h4>Filas longas</h4><p>Público espera. Venda para.</p></div>
              <div className="prob-card"><h4>Check-in lento</h4><p>Entrada confusa e sem controle.</p></div>
              <div className="prob-card"><h4>Venda manual</h4><p>Erros, fraudes e sem rastreio.</p></div>
              <div className="prob-card"><h4>Falta de dados</h4><p>Decisões tomadas no escuro.</p></div>
            </div>
            <p className="bottom-note">Cada gargalo operacional representa perda de faturamento.</p>
          </div>
        </section>

        {/* IMPACTO FINANCEIRO */}
        <section>
          <div className="section-inner">
            <div className="section-label">Impacto financeiro</div>
            <h2 className="section-title">O problema não é só operacional.<br /><em>É financeiro.</em></h2>
            <div className="divider" />
            <div className="fin-list">
              <div className="fin-card"><span className="fin-bad">Filas longas</span><span className="fin-good">menos consumo</span></div>
              <div className="fin-card"><span className="fin-bad">Entrada lenta</span><span className="fin-good">experiência ruim</span></div>
              <div className="fin-card"><span className="fin-bad">Venda manual</span><span className="fin-good">mais erros</span></div>
              <div className="fin-card"><span className="fin-bad">Sem dados</span><span className="fin-good">decisões cegas</span></div>
            </div>
            <p style={{ marginTop: 24, fontSize: 14, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic' }}>Quando a operação trava, o evento vende menos.</p>
          </div>
        </section>

        {/* PÚBLICO */}
        <section>
          <div className="section-inner">
            <div className="section-label">Comportamento do público</div>
            <h2 className="section-title">O público mudou.<br /><em>Os eventos também precisam mudar.</em></h2>
            <div className="divider" />
            <p className="section-desc">O público já vive no digital. O evento precisa acompanhar esse comportamento.</p>
            <div className="tags-wrap">
              <span className="tag">Compra pelo celular</span>
              <span className="tag">Usa autoatendimento</span>
              <span className="tag">Paga por aproximação</span>
              <span className="tag">Quer rapidez</span>
              <span className="tag">Valoriza experiência fluida</span>
              <span className="tag">Não tolera filas</span>
            </div>
          </div>
        </section>

        {/* ECOSSISTEMA */}
        <section>
          <div className="section-inner">
            <div className="section-label">Ecossistema</div>
            <h2 className="section-title">A Festpag nasceu para<br /><em>profissionalizar a operação dos eventos</em></h2>
            <div className="divider" />
            <div className="eco-flow">
              <div className="eco-step"><h4>Ticketaria</h4><p>Venda, lotes, QR Code e check-in integrado.</p></div>
              <div className="eco-arrow">↓</div>
              <div className="eco-step"><h4>Totens</h4><p>Autoatendimento e redução de filas.</p></div>
              <div className="eco-arrow">↓</div>
              <div className="eco-step"><h4>Smart POS</h4><p>Venda móvel com controle total da equipe.</p></div>
              <div className="eco-arrow">↓</div>
              <div className="eco-step"><h4>Facepag</h4><p>Pagamento por biometria facial de alta precisão.</p></div>
              <div className="eco-arrow">↓</div>
              <div className="eco-step"><h4>Gestão</h4><p>Dados, relatórios e fechamento financeiro.</p></div>
            </div>
            <p style={{ marginTop: 24, fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Do ingresso ao consumo, toda operação integrada.</p>
          </div>
        </section>

        {/* TICKETARIA */}
        <section>
          <div className="section-inner">
            <div className="section-label">Ticketaria</div>
            <h2 className="section-title">Venda ingressos com<br /><em>mais controle e menos atrito.</em></h2>
            <div className="divider" />
            <div className="feat-card"><h4>Venda online</h4><p>Lotes, Pix, cartão e QR Code gerado automaticamente após confirmação.</p></div>
            <div className="feat-card"><h4>Controle de acesso</h4><p>Check-in na portaria com validação em tempo real. Sem ingresso falso.</p></div>
            <div className="feat-card"><h4>Gestão completa</h4><p>Cortesias, cupons, comissários, painel administrativo e rastreabilidade total.</p></div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', marginTop: 8 }}>O evento começa na experiência de compra.</p>
          </div>
        </section>

        {/* TOTEM */}
        <section>
          <div className="section-inner">
            <div className="section-label">Totem de autoatendimento</div>
            <h2 className="section-title">Autoatendimento que<br /><em>acelera o consumo.</em></h2>
            <div className="divider" />
            <div className="metrics">
              <div className="metric"><div className="metric-val">10×</div><div className="metric-label">mais atendimentos</div></div>
              <div className="metric"><div className="metric-val">&lt;1min</div><div className="metric-label">por transação</div></div>
              <div className="metric"><div className="metric-val">5</div><div className="metric-label">meios de pagamento</div></div>
            </div>
            <div className="chip-row">
              <span className="chip">Cardápio digital personalizado</span>
              <span className="chip">Impressão na hora</span>
              <span className="chip">Facepag integrado</span>
              <span className="chip">Identidade visual do evento</span>
              <span className="chip">Atualização em tempo real</span>
            </div>
            <p style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>Menos tempo esperando. Mais tempo consumindo.</p>
          </div>
        </section>

        {/* SMART POS */}
        <section>
          <div className="section-inner">
            <div className="section-label">Smart POS</div>
            <h2 className="section-title">Mobilidade para vender<br /><em>em qualquer ponto do evento.</em></h2>
            <div className="divider" />
            <div className="pos-grid">
              <div className="prob-card"><h4>Bares</h4><p>Venda rápida nos balcões com mobilidade total.</p></div>
              <div className="prob-card"><h4>Camarotes</h4><p>Atendimento personalizado e integrado.</p></div>
              <div className="prob-card"><h4>Pista e VIP</h4><p>Caixas móveis em circulação pelo evento.</p></div>
              <div className="prob-card"><h4>Contingência</h4><p>Reforço onde há mais demanda.</p></div>
            </div>
          </div>
        </section>

        {/* FACEPAG */}
        <section>
          <div className="section-inner">
            <div className="section-label">Facepag — exclusivo Festpag</div>
            <h2 className="section-title">Pague só com o rosto.<br /><em>Sem cartão. Sem celular. Sem fila.</em></h2>
            <div className="divider" />
            <div className="face-cards">
              <div className="face-card">
                <div className="face-icon">👤</div>
                <div><h4>Cadastro único</h4><p>O participante se cadastra uma vez e é reconhecido em qualquer ponto do evento.</p></div>
              </div>
              <div className="face-card">
                <div className="face-icon">⚡</div>
                <div><h4>Menos de 5 segundos</h4><p>Transação por biometria facial com criptografia de ponta a ponta.</p></div>
              </div>
              <div className="face-card">
                <div className="face-icon">✓</div>
                <div><h4>Zero atrito</h4><p>Sem cartão, pulseira ou celular. Só o rosto. Disponível nos totens.</p></div>
              </div>
            </div>
            <p style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Tecnologia exclusiva FestPag. O público aproveita mais. A operação vende mais.</p>
          </div>
        </section>

        {/* MODELO */}
        <section>
          <div className="section-inner">
            <div className="section-label">O novo modelo de eventos</div>
            <h2 className="section-title">O futuro dos eventos<br /><em>não combina com improviso.</em></h2>
            <div className="divider" />
            <div className="compare">
              <div className="cmp-box old">
                <div className="cmp-title">Modelo antigo</div>
                <div className="cmp-item"><span className="dot dot-r" />Filas longas</div>
                <div className="cmp-item"><span className="dot dot-r" />Operação manual</div>
                <div className="cmp-item"><span className="dot dot-r" />Controles frágeis</div>
                <div className="cmp-item"><span className="dot dot-r" />Venda descentralizada</div>
                <div className="cmp-item"><span className="dot dot-r" />Fechamento confuso</div>
              </div>
              <div className="cmp-box new">
                <div className="cmp-title">Modelo Festpag</div>
                <div className="cmp-item"><span className="dot dot-b" />Operação integrada</div>
                <div className="cmp-item"><span className="dot dot-b" />Autoatendimento</div>
                <div className="cmp-item"><span className="dot dot-b" />Dados em tempo real</div>
                <div className="cmp-item"><span className="dot dot-b" />Pagamentos inteligentes</div>
                <div className="cmp-item"><span className="dot dot-b" />Controle operacional total</div>
              </div>
            </div>
          </div>
        </section>

        {/* PARA QUEM É */}
        <section>
          <div className="section-inner">
            <div className="section-label">Para quem é</div>
            <h2 className="section-title">Uma solução criada para eventos que querem<br /><em>mais vendas, menos improviso e mais controle</em></h2>
            <div className="divider" />
            <div className="who-tags">
              <span className="who-tag">Shows</span>
              <span className="who-tag">Festivais</span>
              <span className="who-tag">Rodeios</span>
              <span className="who-tag">Arenas</span>
              <span className="who-tag">Feiras</span>
              <span className="who-tag">Festas temáticas</span>
              <span className="who-tag">Camarotes</span>
              <span className="who-tag">Eventos corporativos</span>
              <span className="who-tag">Food parks</span>
              <span className="who-tag">Eventos gastronômicos</span>
            </div>
            <p style={{ marginTop: 24, fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Do ingresso ao consumo, toda operação integrada.</p>
          </div>
        </section>

        {/* FORMULÁRIO */}
        <div className="form-section" id="contato">
          <div className="form-inner">
            <div className="form-card">
              <div className="form-logo">
                <svg width="260" height="84" viewBox="0 0 520 168" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="form-lg" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#6B5CF0" />
                      <stop offset="25%" stopColor="#8B5AE0" />
                      <stop offset="55%" stopColor="#C040B5" />
                      <stop offset="100%" stopColor="#E840A0" />
                    </linearGradient>
                    <linearGradient id="form-lg2" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#7060F0" />
                      <stop offset="100%" stopColor="#D040B0" />
                    </linearGradient>
                  </defs>
                  <text x="0" y="126" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="140" fill="url(#form-lg)">festpag</text>
                  <rect x="246" y="108" width="10" height="58" fill="#7260F2" rx="2" />
                  <text x="256" y="164" fontFamily="Arial Black, Arial, sans-serif" fontWeight="700" fontSize="46" fill="url(#form-lg2)">.digital</text>
                </svg>
              </div>

              <p className="form-heading">Quer mais informações?</p>
              <h3 className="form-title">Fale com a <span>nossa equipe</span></h3>
              <div className="sep" />

              {success ? (
                <div className="ok-msg">
                  Recebemos seu contato!
                  <div className="ok-sub">Em breve nossa equipe vai falar com você.</div>
                </div>
              ) : (
                <div>
                  <div className="field">
                    <label>Nome</label>
                    <input
                      type="text"
                      placeholder="Seu nome completo"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                  <div className="field">
                    <label>Cidade</label>
                    <input
                      type="text"
                      placeholder="Sua cidade"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                  <div className="field">
                    <label>Tipo de evento</label>
                    <div className="sel-wrap">
                      <select
                        ref={selectRef}
                        value={tipoEvento}
                        onChange={(e) => setTipoEvento(e.target.value)}
                        disabled={submitting}
                      >
                        <option value="" disabled>Selecione o tipo de evento</option>
                        <option>Show</option>
                        <option>Festival</option>
                        <option>Rodeio</option>
                        <option>Arena</option>
                        <option>Feira</option>
                        <option>Festa temática</option>
                        <option>Camarote</option>
                        <option>Evento corporativo</option>
                        <option>Food park</option>
                        <option>Evento gastronômico</option>
                        <option>Outro</option>
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label>Telefone para contato</label>
                    <input
                      type="tel"
                      placeholder="(00) 00000-0000"
                      value={telefone}
                      onChange={(e) => setTelefone(maskPhone(e.target.value))}
                      disabled={submitting}
                      inputMode="tel"
                    />
                  </div>
                  <button className="submit-btn" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? 'Enviando...' : 'Quero ser contactado'}
                  </button>
                  {errorMsg && <div className="err-msg">{errorMsg}</div>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <footer>
          <div className="footer-logo">
            <svg width="200" height="60" viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="ft-lg" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#6B5CF0" />
                  <stop offset="50%" stopColor="#C040B0" />
                  <stop offset="100%" stopColor="#E040A0" />
                </linearGradient>
                <linearGradient id="ft-lg2" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#7B6CF6" />
                  <stop offset="100%" stopColor="#D040B0" />
                </linearGradient>
              </defs>
              <text x="0" y="88" fontFamily="Arial Black,Arial,sans-serif" fontWeight="900" fontSize="96" fill="url(#ft-lg)">festpag</text>
              <rect x="184" y="74" width="7" height="40" fill="#7060F0" rx="1" />
              <text x="191" y="110" fontFamily="Arial Black,Arial,sans-serif" fontWeight="700" fontSize="34" fill="url(#ft-lg2)">.digital</text>
            </svg>
          </div>
          <p className="footer-tagline">O banco oficial dos eventos</p>
          <a href="https://festpag.digital" className="footer-url">festpag.digital</a>
          <br />
          <a href="#contato" className="footer-cta">Quero mais informações</a>
        </footer>
      </div>
    </>
  );
}
