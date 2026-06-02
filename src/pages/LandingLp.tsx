import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import logoFestpag from '@/assets/logo-festpag.png';


const LP_CSS = `
.lp-root *, .lp-root *::before, .lp-root *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ==========================================================================
   DESIGN TOKENS — escala única, ritmo único, cor única
   ========================================================================== */
.lp-root {
  /* Brand */
  --fest-blue: #6B5CF0;
  --fest-mid:  #A050D0;
  --fest-pink: #E040A0;
  --fest-grad: linear-gradient(90deg, var(--fest-blue), var(--fest-pink));

  /* Surface */
  --bg-0: #08000f;
  --bg-1: #0d0119;
  --bg-2: #120125;
  --card: rgba(255,255,255,0.025);
  --card-hi: rgba(255,255,255,0.045);
  --border:   rgba(160,110,255,0.14);
  --border-2: rgba(200,110,255,0.30);

  /* Text */
  --fg:       #ffffff;
  --fg-soft:  rgba(255,255,255,0.72);
  --fg-mute:  rgba(255,255,255,0.50);
  --fg-dim:   rgba(255,255,255,0.32);
  --label:    #B492FF;

  /* Type scale — modular ratio 1.25 (Syne headings, DM Sans body) */
  --fs-display: clamp(40px, 6.2vw, 72px);
  --fs-h2:      clamp(28px, 3.8vw, 44px);
  --fs-h3:      20px;
  --fs-h4:      16px;
  --fs-lead:    18px;
  --fs-body:    15px;
  --fs-small:   13px;
  --fs-label:   11px;

  /* Spacing scale (8pt) */
  --s-1: 8px; --s-2: 16px; --s-3: 24px; --s-4: 32px;
  --s-5: 48px; --s-6: 64px; --s-7: 96px;

  /* Radius */
  --r-card: 16px;
  --r-input: 12px;
  --r-pill: 999px;

  background: var(--bg-0);
  color: var(--fg);
  font-family: 'DM Sans', system-ui, sans-serif;
  font-size: var(--fs-body);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.lp-root img { display: block; max-width: 100%; height: auto; }

/* ==========================================================================
   NAV
   ========================================================================== */
.lp-root nav {
  position: sticky; top: 0; z-index: 100;
  background: rgba(8,0,15,0.78);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--border);
  padding: 0 clamp(20px, 4vw, 40px);
  display: flex; align-items: center; justify-content: space-between;
  height: 68px;
}
.lp-root .nav-logo { height: 32px; width: auto; }
.lp-root .nav-cta {
  background: var(--fest-grad);
  color: #fff; font-family: 'Syne', sans-serif;
  font-size: var(--fs-small); font-weight: 700;
  padding: 10px 22px; border-radius: var(--r-pill); border: none;
  cursor: pointer; text-decoration: none; letter-spacing: .3px;
  transition: opacity .2s, transform .2s;
}
.lp-root .nav-cta:hover { opacity: .9; transform: translateY(-1px); }

/* ==========================================================================
   HERO
   ========================================================================== */
.lp-root .hero {
  min-height: 88vh;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center;
  padding: clamp(72px, 10vw, 120px) clamp(20px, 4vw, 32px);
  position: relative; overflow: hidden;
}
.lp-root .hero::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 70% 55% at 50% 110%, rgba(180,0,255,0.18) 0%, transparent 65%),
    radial-gradient(ellipse 40% 40% at 18% 18%, rgba(100,60,255,0.10) 0%, transparent 60%),
    radial-gradient(ellipse 40% 40% at 82% 12%, rgba(224,64,160,0.09) 0%, transparent 60%);
}
.lp-root .hero::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(160,80,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(160,80,255,0.03) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse 70% 60% at 50% 50%, #000 40%, transparent 100%);
}
.lp-root .hero > * { position: relative; z-index: 2; }
.lp-root .hero-logo { height: 64px; width: auto; margin-bottom: var(--s-4); }
.lp-root .hero-headline {
  font-family: 'Syne', sans-serif;
  font-size: var(--fs-display);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.02em;
  max-width: 880px;
}
.lp-root .hero-headline span {
  background: var(--fest-grad);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.lp-root .hero-sub {
  font-size: var(--fs-lead);
  color: var(--fg-soft);
  margin-top: var(--s-3);
  max-width: 620px;
  line-height: 1.55;
}
.lp-root .hero-tag {
  color: var(--fest-pink);
  font-family: 'Syne', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  margin-top: var(--s-2);
  letter-spacing: .3px;
}
.lp-root .hero-btn {
  display: inline-block; margin-top: var(--s-5);
  background: var(--fest-grad);
  color: #fff; font-family: 'Syne', sans-serif;
  font-size: 14px; font-weight: 700; letter-spacing: .5px;
  padding: 16px 36px; border-radius: var(--r-pill); border: none;
  cursor: pointer; text-decoration: none;
  box-shadow: 0 12px 40px -12px rgba(224,64,160,0.55);
  transition: transform .2s, box-shadow .2s, opacity .2s;
}
.lp-root .hero-btn:hover { transform: translateY(-2px); box-shadow: 0 16px 48px -10px rgba(224,64,160,0.7); }

/* ==========================================================================
   SECTIONS — ritmo único
   ========================================================================== */
.lp-root section {
  padding: clamp(72px, 9vw, 112px) clamp(20px, 4vw, 32px);
  position: relative;
}
.lp-root section:nth-of-type(even) { background: var(--bg-1); }
.lp-root .section-inner { max-width: 1040px; margin: 0 auto; }
.lp-root .section-label {
  font-size: var(--fs-label);
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--label);
  font-weight: 700;
  margin-bottom: var(--s-2);
}
.lp-root .section-title {
  font-family: 'Syne', sans-serif;
  font-size: var(--fs-h2);
  font-weight: 800;
  line-height: 1.12;
  letter-spacing: -0.015em;
  color: var(--fg);
  max-width: 760px;
}
.lp-root .section-title em {
  font-style: normal;
  background: var(--fest-grad);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.lp-root .divider {
  width: 40px; height: 3px; border-radius: 2px;
  margin: var(--s-3) 0 var(--s-5);
  background: var(--fest-grad);
}
.lp-root .section-desc {
  font-size: var(--fs-lead);
  color: var(--fg-soft);
  max-width: 640px;
  line-height: 1.55;
}
.lp-root .section-foot {
  margin-top: var(--s-4);
  font-size: var(--fs-small);
  color: var(--fg-dim);
  font-style: italic;
}

/* ==========================================================================
   CARDS — base unificada
   ========================================================================== */
.lp-root .card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  padding: 24px 22px;
  transition: border-color .25s, background .25s, transform .25s;
}
.lp-root .card:hover {
  border-color: var(--border-2);
  background: var(--card-hi);
}
.lp-root .card h4 {
  font-family: 'Syne', sans-serif;
  font-size: var(--fs-h4);
  font-weight: 700;
  color: var(--fg);
  margin-bottom: 6px;
  letter-spacing: -0.01em;
}
.lp-root .card p {
  font-size: var(--fs-body);
  color: var(--fg-mute);
  line-height: 1.55;
}

/* Problema / POS — 2 colunas */
.lp-root .grid-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--s-2);
}

/* Impacto financeiro */
.lp-root .fin-list { display: flex; flex-direction: column; gap: 10px; }
.lp-root .fin-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-left: 3px solid var(--fest-pink);
  border-radius: var(--r-input);
  padding: 18px 22px;
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--s-2);
}
.lp-root .fin-bad { font-size: var(--fs-h4); font-weight: 600; color: var(--fg); }
.lp-root .fin-good { font-size: var(--fs-small); color: var(--label); font-style: italic; }

/* Tags */
.lp-root .tags-wrap { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
.lp-root .tag {
  border: 1px solid var(--border-2);
  color: #D5B4FF;
  font-size: var(--fs-small); font-weight: 500;
  padding: 10px 18px;
  border-radius: var(--r-pill);
  transition: background .2s, border-color .2s;
}
.lp-root .tag:hover { background: rgba(200,100,255,0.08); border-color: rgba(220,140,255,0.5); }

/* Ecossistema (linha vertical) */
.lp-root .eco-flow { display: flex; flex-direction: column; gap: 0; }
.lp-root .eco-step {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  padding: 20px 22px;
  transition: border-color .25s, background .25s;
}
.lp-root .eco-step:hover { border-color: var(--border-2); background: var(--card-hi); }
.lp-root .eco-step h4 {
  font-family: 'Syne', sans-serif;
  font-size: var(--fs-h4); font-weight: 700;
  color: var(--label);
  margin-bottom: 4px;
  letter-spacing: -0.01em;
}
.lp-root .eco-step p { font-size: var(--fs-body); color: var(--fg-mute); }
.lp-root .eco-arrow {
  text-align: center; padding: 8px 0;
  color: var(--fest-pink);
  font-size: 20px; line-height: 1;
  opacity: .65;
}

/* Métricas (totem) */
.lp-root .metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--s-2);
  margin-bottom: var(--s-3);
}
.lp-root .metric {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  padding: 28px 16px;
  text-align: center;
}
.lp-root .metric-val {
  font-family: 'Syne', sans-serif;
  font-size: 36px; font-weight: 800;
  background: var(--fest-grad);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.02em;
  line-height: 1;
}
.lp-root .metric-label {
  font-size: var(--fs-small);
  color: var(--fg-mute);
  margin-top: 8px;
}
.lp-root .chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
.lp-root .chip {
  font-size: var(--fs-small);
  color: var(--fg-soft);
  background: rgba(120,60,200,0.16);
  border: 1px solid rgba(160,100,255,0.18);
  padding: 7px 14px;
  border-radius: var(--r-pill);
}

/* Facepag */
.lp-root .face-cards { display: flex; flex-direction: column; gap: var(--s-2); }
.lp-root .face-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  padding: 22px;
  display: flex; align-items: flex-start; gap: 18px;
  transition: border-color .25s, background .25s;
}
.lp-root .face-card:hover { border-color: var(--border-2); background: var(--card-hi); }
.lp-root .face-icon {
  width: 48px; height: 48px; border-radius: 50%;
  background: var(--fest-grad);
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; flex-shrink: 0;
  box-shadow: 0 8px 24px -8px rgba(224,64,160,0.5);
}
.lp-root .face-card h4 {
  font-family: 'Syne', sans-serif;
  font-size: var(--fs-h4); font-weight: 700;
  color: var(--fg); margin-bottom: 4px;
}
.lp-root .face-card p { font-size: var(--fs-body); color: var(--fg-mute); }

/* Compare */
.lp-root .compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s-2);
}
.lp-root .cmp-box {
  background: var(--card);
  border-radius: var(--r-card);
  padding: 26px 24px;
}
.lp-root .cmp-box.old { border: 1px solid rgba(255,90,110,0.22); }
.lp-root .cmp-box.new { border: 1px solid rgba(120,120,255,0.32); }
.lp-root .cmp-title {
  font-size: var(--fs-label);
  letter-spacing: 2.5px; text-transform: uppercase;
  font-weight: 700; margin-bottom: var(--s-2);
}
.lp-root .cmp-box.old .cmp-title { color: #FF6E88; }
.lp-root .cmp-box.new .cmp-title { color: #A8A8FF; }
.lp-root .cmp-item {
  font-size: var(--fs-body);
  color: var(--fg-soft);
  padding: 10px 0;
  display: flex; align-items: center; gap: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.lp-root .cmp-item:last-child { border-bottom: none; }
.lp-root .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.lp-root .dot-r { background: #FF5070; }
.lp-root .dot-b { background: var(--fest-blue); }

/* Who tags */
.lp-root .who-tags { display: flex; flex-wrap: wrap; gap: 10px; }
.lp-root .who-tag {
  border: 1px solid var(--border-2);
  color: #D5B4FF;
  font-size: var(--fs-small); font-weight: 500;
  padding: 10px 18px;
  border-radius: var(--r-pill);
  transition: background .2s;
}
.lp-root .who-tag:hover { background: rgba(120,80,255,0.1); }

/* ==========================================================================
   FORM
   ========================================================================== */
.lp-root .form-section {
  padding: clamp(80px, 10vw, 120px) clamp(20px, 4vw, 32px);
  background: var(--bg-2);
  position: relative; overflow: hidden;
}
.lp-root .form-section::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 70% 60% at 50% 100%, rgba(180,0,255,0.16) 0%, transparent 70%);
}
.lp-root .form-inner { max-width: 560px; margin: 0 auto; position: relative; z-index: 2; }
.lp-root .form-card {
  background: rgba(10, 0, 22, 0.88);
  border: 1px solid var(--border-2);
  border-radius: 24px;
  padding: clamp(32px, 5vw, 52px);
  box-shadow: 0 30px 80px -30px rgba(120,40,200,0.5);
}
.lp-root .form-logo {
  display: flex; justify-content: center;
  margin-bottom: var(--s-4);
}
.lp-root .form-logo img { height: 52px; width: auto; }
.lp-root .form-heading {
  font-size: var(--fs-label);
  letter-spacing: 3px; text-transform: uppercase;
  color: var(--label);
  font-weight: 700;
  text-align: center;
  margin-bottom: 10px;
}
.lp-root .form-title {
  font-family: 'Syne', sans-serif;
  font-size: 28px; font-weight: 800;
  text-align: center;
  color: var(--fg);
  margin-bottom: var(--s-4);
  letter-spacing: -0.015em;
  line-height: 1.15;
}
.lp-root .form-title span {
  background: var(--fest-grad);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.lp-root .sep {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-2), transparent);
  margin: 0 0 var(--s-4);
}

.lp-root .field { margin-bottom: 18px; }
.lp-root .field label {
  display: block;
  font-size: var(--fs-label);
  letter-spacing: 2px;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--label);
  margin-bottom: 8px;
}
.lp-root .field input,
.lp-root .field select {
  width: 100%;
  height: 48px;
  background: rgba(20, 0, 40, 0.75);
  border: 1px solid var(--border);
  border-radius: var(--r-input);
  padding: 0 16px;
  font-size: var(--fs-body);
  font-family: 'DM Sans', sans-serif;
  color: var(--fg);
  outline: none;
  transition: border-color .2s, background .2s;
  -webkit-appearance: none; appearance: none;
}
.lp-root .field input::placeholder { color: rgba(255,255,255,0.22); }
.lp-root .field input:focus,
.lp-root .field select:focus {
  border-color: rgba(200,110,255,0.7);
  background: rgba(30, 5, 55, 0.85);
}
.lp-root .sel-wrap { position: relative; }
.lp-root .sel-wrap::after {
  content: '';
  position: absolute; right: 16px; top: 50%;
  transform: translateY(-50%);
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid rgba(200,140,255,0.6);
  pointer-events: none;
}
.lp-root .field select { cursor: pointer; color: rgba(255,255,255,0.22); }
.lp-root .field select.filled { color: var(--fg); }
.lp-root .field select option { background: #16002a; color: var(--fg); }

.lp-root .submit-btn {
  width: 100%; margin-top: 10px;
  height: 52px;
  border: none; border-radius: var(--r-input);
  font-family: 'Syne', sans-serif;
  font-size: 13px; font-weight: 800;
  letter-spacing: 1.5px; text-transform: uppercase;
  background: var(--fest-grad);
  color: #fff; cursor: pointer;
  transition: opacity .2s, transform .15s, box-shadow .2s;
  box-shadow: 0 12px 30px -10px rgba(224,64,160,0.55);
}
.lp-root .submit-btn:hover { opacity: .92; transform: translateY(-1px); }
.lp-root .submit-btn:active { transform: scale(.98); }
.lp-root .submit-btn:disabled { opacity: .55; cursor: not-allowed; transform: none; box-shadow: none; }

.lp-root .ok-msg {
  text-align: center; padding: 28px 20px;
  color: var(--label);
  font-family: 'Syne', sans-serif;
  font-size: var(--fs-h4); font-weight: 700;
}
.lp-root .ok-sub {
  font-family: 'DM Sans', sans-serif;
  font-size: var(--fs-small); color: var(--fg-mute);
  font-weight: 400; margin-top: 6px;
}
.lp-root .err-msg {
  margin-top: 14px; padding: 12px 14px;
  background: rgba(255, 80, 80, 0.10);
  border: 1px solid rgba(255, 80, 80, 0.30);
  border-radius: 10px;
  color: #FFB0B8; font-size: var(--fs-small); text-align: center;
}

/* ==========================================================================
   FOOTER
   ========================================================================== */
.lp-root footer {
  background: #000;
  padding: var(--s-6) clamp(20px, 4vw, 32px);
  text-align: center;
  border-top: 1px solid var(--border);
}
.lp-root .footer-logo {
  display: flex; justify-content: center; margin-bottom: var(--s-2);
}
.lp-root .footer-logo img { height: 40px; width: auto; opacity: .92; }
.lp-root .footer-tagline {
  font-size: var(--fs-body); color: var(--fg-mute); margin-bottom: 6px;
}
.lp-root .footer-url {
  color: #C09BFF; font-size: var(--fs-small);
  text-decoration: none;
}
.lp-root .footer-url:hover { color: var(--fest-pink); }
.lp-root .footer-cta {
  display: inline-block; margin-top: var(--s-4);
  background: var(--fest-grad);
  color: #fff; font-family: 'Syne', sans-serif;
  font-size: var(--fs-small); font-weight: 700; letter-spacing: .5px;
  padding: 13px 32px; border-radius: var(--r-pill);
  text-decoration: none; transition: opacity .2s, transform .2s;
}
.lp-root .footer-cta:hover { opacity: .9; transform: translateY(-1px); }

/* ==========================================================================
   MOBILE
   ========================================================================== */
@media (max-width: 720px) {
  .lp-root .grid-2,
  .lp-root .compare { grid-template-columns: 1fr; }
  .lp-root .metrics { grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .lp-root .metric { padding: 18px 8px; }
  .lp-root .metric-val { font-size: 26px; }
  .lp-root .fin-card { flex-direction: column; align-items: flex-start; gap: 4px; }
  .lp-root .hero-logo { height: 48px; }
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
          <img src={logoFestpag} alt="Festpag" className="nav-logo" />

          <a href="#contato" className="nav-cta">Quero mais informações</a>
        </nav>

        {/* HERO */}
        <div className="hero">
          <img src={logoFestpag} alt="Festpag" className="hero-logo" />

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
            <div className="grid-2">
              <div className="card"><h4>Filas longas</h4><p>Público espera. Venda para.</p></div>
              <div className="card"><h4>Check-in lento</h4><p>Entrada confusa e sem controle.</p></div>
              <div className="card"><h4>Venda manual</h4><p>Erros, fraudes e sem rastreio.</p></div>
              <div className="card"><h4>Falta de dados</h4><p>Decisões tomadas no escuro.</p></div>
            </div>
            <p className="section-foot">Cada gargalo operacional representa perda de faturamento.</p>
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
            <div className="card" style={{marginBottom:14}}><h4>Venda online</h4><p>Lotes, Pix, cartão e QR Code gerado automaticamente após confirmação.</p></div>
            <div className="card" style={{marginBottom:14}}><h4>Controle de acesso</h4><p>Check-in na portaria com validação em tempo real. Sem ingresso falso.</p></div>
            <div className="card" style={{marginBottom:14}}><h4>Gestão completa</h4><p>Cortesias, cupons, comissários, painel administrativo e rastreabilidade total.</p></div>
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
            <div className="grid-2">
              <div className="card"><h4>Bares</h4><p>Venda rápida nos balcões com mobilidade total.</p></div>
              <div className="card"><h4>Camarotes</h4><p>Atendimento personalizado e integrado.</p></div>
              <div className="card"><h4>Pista e VIP</h4><p>Caixas móveis em circulação pelo evento.</p></div>
              <div className="card"><h4>Contingência</h4><p>Reforço onde há mais demanda.</p></div>
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
                <img src={logoFestpag} alt="Festpag" />
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
            <img src={logoFestpag} alt="Festpag" />
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
