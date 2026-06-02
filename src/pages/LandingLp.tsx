import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import logoFestpag from '@/assets/logo-festpag.png';
import totemAsset from '@/assets/festpag-totem.jpg.asset.json';


const LP_CSS = `
.lp-root *, .lp-root *::before, .lp-root *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ==========================================================================
   DESIGN TOKENS — restraint over volume
   ========================================================================== */
.lp-root {
  /* Brand */
  --fest-blue: #6B5CF0;
  --fest-pink: #E040A0;
  --fest-grad: linear-gradient(90deg, var(--fest-blue), var(--fest-pink));

  /* Surface */
  --bg-0: #08000f;
  --bg-1: #0d0119;
  --surface: #14082A;
  --surface-hi: #1A0D33;
  --border-1: rgba(255,255,255,0.06);
  --border-2: rgba(255,255,255,0.14);

  /* Text */
  --fg:       #ffffff;
  --fg-soft:  rgba(255,255,255,0.78);
  --fg-mute:  rgba(255,255,255,0.58);
  --fg-dim:   rgba(255,255,255,0.38);
  --label:    rgba(255,255,255,0.50);

  /* Type — fontes via Helmet: Space Grotesk (heading) + DM Sans (body) */
  --font-head: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'DM Sans', system-ui, sans-serif;

  /* Type scale — silenciado */
  --fs-display: clamp(36px, 4.8vw, 56px);
  --fs-h2:      clamp(26px, 3vw, 36px);
  --fs-h3:      18px;
  --fs-h4:      15px;
  --fs-lead:    17px;
  --fs-body:    15px;
  --fs-small:   13px;
  --fs-label:   11px;

  /* Spacing (8pt) */
  --s-1: 8px; --s-2: 16px; --s-3: 24px; --s-4: 32px;
  --s-5: 48px; --s-6: 64px; --s-7: 96px;

  /* Radius */
  --r-card: 12px;
  --r-input: 10px;
  --r-pill: 999px;

  background: var(--bg-0);
  color: var(--fg);
  font-family: var(--font-body);
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
  background: rgba(8,0,15,0.82);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--border-1);
  padding: 0 clamp(20px, 4vw, 40px);
  display: flex; align-items: center; justify-content: space-between;
  height: 68px;
}
.lp-root .nav-logo { height: 30px; width: auto; }

/* ==========================================================================
   BUTTONS — hierarquia clara
   ========================================================================== */
.lp-root .btn {
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--font-head);
  font-size: 14px; font-weight: 600;
  letter-spacing: -0.005em;
  height: 44px; padding: 0 22px;
  border-radius: var(--r-pill);
  border: 1px solid transparent;
  text-decoration: none;
  cursor: pointer;
  transition: opacity .2s, background .2s, border-color .2s;
  white-space: nowrap;
}
.lp-root .btn-primary {
  background: var(--fest-grad);
  color: #fff;
  box-shadow: 0 8px 24px -12px rgba(224,64,160,0.40);
}
.lp-root .btn-primary:hover { opacity: .92; }
.lp-root .btn-secondary {
  background: transparent;
  color: var(--fg);
  border-color: var(--border-2);
}
.lp-root .btn-secondary:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.24); }
.lp-root .btn-lg { height: 52px; padding: 0 28px; font-size: 15px; }

/* ==========================================================================
   HERO
   ========================================================================== */
.lp-root .hero {
  min-height: 88vh;
  display: flex; align-items: center;
  padding: clamp(56px, 7vw, 96px) clamp(20px, 4vw, 32px);
  position: relative; overflow: hidden;
}
.lp-root .hero::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 65% 50% at 50% 110%, rgba(180,0,255,0.14) 0%, transparent 65%),
    radial-gradient(ellipse 35% 35% at 18% 18%, rgba(100,60,255,0.08) 0%, transparent 60%),
    radial-gradient(ellipse 35% 35% at 82% 12%, rgba(224,64,160,0.07) 0%, transparent 60%);
}
.lp-root .hero::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse 70% 60% at 50% 50%, #000 40%, transparent 100%);
}
.lp-root .hero-grid {
  position: relative; z-index: 2;
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: clamp(32px, 5vw, 64px);
  align-items: center;
}
.lp-root .hero-copy { display: flex; flex-direction: column; align-items: flex-start; text-align: left; }
.lp-root .hero-eyebrow {
  font-size: var(--fs-label);
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--label);
  font-weight: 600;
  margin-bottom: var(--s-3);
}
.lp-root .hero-logo { height: 52px; width: auto; margin-bottom: var(--s-4); }
.lp-root .hero-headline {
  font-family: var(--font-head);
  font-size: var(--fs-display);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.025em;
  max-width: 580px;
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
  max-width: 520px;
  line-height: 1.5;
}
.lp-root .hero-ctas {
  display: flex; gap: 12px; flex-wrap: wrap;
  margin-top: var(--s-5);
}
.lp-root .hero-visual {
  position: relative;
  justify-self: center;
  width: 100%;
  max-width: 460px;
  aspect-ratio: 3 / 4;
  animation: heroFadeIn 700ms ease-out both;
}
.lp-root .hero-visual::before {
  content: ''; position: absolute; inset: -8%;
  background:
    radial-gradient(ellipse 55% 45% at 30% 35%, rgba(107,92,240,0.55) 0%, transparent 70%),
    radial-gradient(ellipse 55% 45% at 70% 65%, rgba(224,64,160,0.45) 0%, transparent 70%);
  filter: blur(60px);
  z-index: 0;
}
.lp-root .hero-visual img {
  position: relative; z-index: 1;
  width: 100%; height: 100%; object-fit: cover;
  border-radius: 22px;
  -webkit-mask-image: radial-gradient(ellipse 75% 78% at 50% 48%, #000 55%, transparent 96%);
          mask-image: radial-gradient(ellipse 75% 78% at 50% 48%, #000 55%, transparent 96%);
  filter: saturate(1.05) contrast(1.02);
}
.lp-root .hero-visual::after {
  content: ''; position: absolute; inset: 0; z-index: 2; pointer-events: none;
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(8,0,15,0.35) 0%, transparent 25%, transparent 70%, rgba(8,0,15,0.6) 100%),
    linear-gradient(90deg, rgba(8,0,15,0.25) 0%, transparent 20%, transparent 80%, rgba(8,0,15,0.25) 100%);
  -webkit-mask-image: radial-gradient(ellipse 75% 78% at 50% 48%, #000 55%, transparent 96%);
          mask-image: radial-gradient(ellipse 75% 78% at 50% 48%, #000 55%, transparent 96%);
}
@keyframes heroFadeIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ==========================================================================
   SECTIONS — ritmo único, ênfase discreta
   ========================================================================== */
.lp-root section {
  padding: clamp(72px, 9vw, 104px) clamp(20px, 4vw, 32px);
  position: relative;
}
.lp-root section:nth-of-type(even) { background: var(--bg-1); }
.lp-root .section-inner { max-width: 980px; margin: 0 auto; }
.lp-root .section-label {
  font-family: var(--font-head);
  font-size: var(--fs-label);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--label);
  font-weight: 600;
  margin-bottom: 14px;
}
.lp-root .section-title {
  font-family: var(--font-head);
  font-size: var(--fs-h2);
  font-weight: 700;
  line-height: 1.18;
  letter-spacing: -0.02em;
  color: var(--fg);
  max-width: 720px;
}
.lp-root .section-title em {
  font-style: normal;
  color: var(--fest-pink);
}
.lp-root .divider {
  width: 32px; height: 2px; border-radius: 2px;
  margin: var(--s-3) 0 var(--s-5);
  background: var(--fest-grad);
}
.lp-root .section-desc {
  font-size: var(--fs-lead);
  color: var(--fg-soft);
  max-width: 620px;
  line-height: 1.55;
}
.lp-root .section-foot {
  margin-top: var(--s-4);
  font-size: var(--fs-small);
  color: var(--fg-dim);
}

/* ==========================================================================
   CARDS — superfície real
   ========================================================================== */
.lp-root .card {
  background: var(--surface);
  border: 1px solid var(--border-1);
  border-radius: var(--r-card);
  padding: 22px;
  transition: border-color .25s, background .25s, transform .25s;
}
.lp-root .card:hover {
  border-color: var(--border-2);
  background: var(--surface-hi);
  transform: translateY(-2px);
}
.lp-root .card h4 {
  font-family: var(--font-head);
  font-size: var(--fs-h4);
  font-weight: 600;
  color: var(--fg);
  margin-bottom: 6px;
  letter-spacing: -0.01em;
}
.lp-root .card p {
  font-size: var(--fs-small);
  color: var(--fg-mute);
  line-height: 1.55;
}

.lp-root .grid-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

/* Impacto financeiro */
.lp-root .fin-list { display: flex; flex-direction: column; gap: 8px; }
.lp-root .fin-card {
  background: var(--surface);
  border: 1px solid var(--border-1);
  border-left: 2px solid var(--fest-pink);
  border-radius: var(--r-input);
  padding: 16px 20px;
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--s-2);
}
.lp-root .fin-bad { font-family: var(--font-head); font-size: var(--fs-h4); font-weight: 600; color: var(--fg); }
.lp-root .fin-good { font-size: var(--fs-small); color: var(--fg-mute); }

/* Tags */
.lp-root .tags-wrap { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.lp-root .tag, .lp-root .who-tag {
  font-family: var(--font-body);
  border: 1px solid var(--border-1);
  background: var(--surface);
  color: var(--fg-soft);
  font-size: var(--fs-small); font-weight: 500;
  padding: 9px 16px;
  border-radius: var(--r-pill);
  transition: border-color .2s, background .2s;
}
.lp-root .tag:hover, .lp-root .who-tag:hover {
  border-color: var(--border-2);
  background: var(--surface-hi);
}
.lp-root .who-tags { display: flex; flex-wrap: wrap; gap: 8px; }

/* Ecossistema — linha conectora */
.lp-root .eco-flow { display: flex; flex-direction: column; gap: 0; }
.lp-root .eco-step {
  background: var(--surface);
  border: 1px solid var(--border-1);
  border-radius: var(--r-card);
  padding: 20px 22px;
  transition: border-color .25s, background .25s;
}
.lp-root .eco-step:hover { border-color: var(--border-2); background: var(--surface-hi); }
.lp-root .eco-step h4 {
  font-family: var(--font-head);
  font-size: var(--fs-h4); font-weight: 600;
  color: var(--fg);
  margin-bottom: 4px;
  letter-spacing: -0.01em;
}
.lp-root .eco-step p { font-size: var(--fs-small); color: var(--fg-mute); }
.lp-root .eco-link {
  width: 1px; height: 24px;
  margin: 0 auto;
  background: linear-gradient(180deg, var(--fest-blue), var(--fest-pink));
  opacity: .55;
}

/* Métricas (totem) */
.lp-root .metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: var(--s-3);
}
.lp-root .metric {
  background: var(--surface);
  border: 1px solid var(--border-1);
  border-radius: var(--r-card);
  padding: 26px 16px;
  text-align: center;
}
.lp-root .metric-val {
  font-family: var(--font-head);
  font-size: 32px; font-weight: 700;
  color: var(--fg);
  letter-spacing: -0.025em;
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
  color: var(--fg-mute);
  background: var(--surface);
  border: 1px solid var(--border-1);
  padding: 7px 14px;
  border-radius: var(--r-pill);
}

/* Facepag */
.lp-root .face-cards { display: flex; flex-direction: column; gap: 12px; }
.lp-root .face-card {
  background: var(--surface);
  border: 1px solid var(--border-1);
  border-radius: var(--r-card);
  padding: 22px;
  display: flex; align-items: flex-start; gap: 18px;
  transition: border-color .25s, background .25s;
}
.lp-root .face-card:hover { border-color: var(--border-2); background: var(--surface-hi); }
.lp-root .face-icon {
  width: 44px; height: 44px; border-radius: 50%;
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--border-1);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; flex-shrink: 0;
}
.lp-root .face-card h4 {
  font-family: var(--font-head);
  font-size: var(--fs-h4); font-weight: 600;
  color: var(--fg); margin-bottom: 4px;
  letter-spacing: -0.01em;
}
.lp-root .face-card p { font-size: var(--fs-small); color: var(--fg-mute); }

/* Compare */
.lp-root .compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.lp-root .cmp-box {
  background: var(--surface);
  border: 1px solid var(--border-1);
  border-radius: var(--r-card);
  padding: 24px;
}
.lp-root .cmp-title {
  font-family: var(--font-head);
  font-size: var(--fs-label);
  letter-spacing: 1.5px; text-transform: uppercase;
  font-weight: 600; margin-bottom: var(--s-2);
}
.lp-root .cmp-box.old .cmp-title { color: rgba(255,120,140,0.85); }
.lp-root .cmp-box.new .cmp-title { color: rgba(170,170,255,0.9); }
.lp-root .cmp-item {
  font-size: var(--fs-body);
  color: var(--fg-soft);
  padding: 10px 0;
  display: flex; align-items: center; gap: 12px;
  border-bottom: 1px solid var(--border-1);
}
.lp-root .cmp-item:last-child { border-bottom: none; }
.lp-root .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.lp-root .dot-r { background: #FF5070; }
.lp-root .dot-b { background: var(--fest-blue); }

/* ==========================================================================
   FORM
   ========================================================================== */
.lp-root .form-section {
  padding: clamp(80px, 10vw, 112px) clamp(20px, 4vw, 32px);
  background: var(--bg-1);
}
.lp-root .form-inner { max-width: 520px; margin: 0 auto; }
.lp-root .form-card {
  background: var(--surface);
  border: 1px solid var(--border-1);
  border-radius: 16px;
  padding: clamp(32px, 5vw, 48px);
}
.lp-root .form-logo {
  display: flex; justify-content: center;
  margin-bottom: var(--s-4);
}
.lp-root .form-logo img { height: 44px; width: auto; }
.lp-root .form-heading {
  font-family: var(--font-head);
  font-size: var(--fs-label);
  letter-spacing: 1.5px; text-transform: uppercase;
  color: var(--label);
  font-weight: 600;
  text-align: center;
  margin-bottom: 10px;
}
.lp-root .form-title {
  font-family: var(--font-head);
  font-size: 26px; font-weight: 700;
  text-align: center;
  color: var(--fg);
  margin-bottom: var(--s-4);
  letter-spacing: -0.02em;
  line-height: 1.15;
}
.lp-root .form-title span {
  background: var(--fest-grad);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.lp-root .sep {
  height: 1px;
  background: var(--border-1);
  margin: 0 0 var(--s-4);
}

.lp-root .field { margin-bottom: 16px; }
.lp-root .field label {
  display: block;
  font-family: var(--font-head);
  font-size: var(--fs-label);
  letter-spacing: 1.2px;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--label);
  margin-bottom: 8px;
}
.lp-root .field input,
.lp-root .field select {
  width: 100%;
  height: 48px;
  background: rgba(0,0,0,0.25);
  border: 1px solid var(--border-1);
  border-radius: var(--r-input);
  padding: 0 14px;
  font-size: var(--fs-body);
  font-family: var(--font-body);
  color: var(--fg);
  outline: none;
  transition: border-color .2s, background .2s;
  -webkit-appearance: none; appearance: none;
}
.lp-root .field input::placeholder { color: rgba(255,255,255,0.28); }
.lp-root .field input:focus,
.lp-root .field select:focus {
  border-color: var(--border-2);
  background: rgba(0,0,0,0.35);
}
.lp-root .sel-wrap { position: relative; }
.lp-root .sel-wrap::after {
  content: '';
  position: absolute; right: 16px; top: 50%;
  transform: translateY(-50%);
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid rgba(255,255,255,0.45);
  pointer-events: none;
}
.lp-root .field select { cursor: pointer; color: rgba(255,255,255,0.28); }
.lp-root .field select.filled { color: var(--fg); }
.lp-root .field select option { background: var(--surface); color: var(--fg); }

.lp-root .submit-btn {
  width: 100%; margin-top: 8px;
  height: 52px;
  border: none; border-radius: var(--r-pill);
  font-family: var(--font-head);
  font-size: 15px; font-weight: 600;
  letter-spacing: -0.005em;
  background: var(--fest-grad);
  color: #fff; cursor: pointer;
  transition: opacity .2s;
  box-shadow: 0 8px 24px -12px rgba(224,64,160,0.40);
}
.lp-root .submit-btn:hover { opacity: .92; }
.lp-root .submit-btn:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; }

.lp-root .ok-msg {
  text-align: center; padding: 24px 20px;
  color: var(--fg);
  font-family: var(--font-head);
  font-size: var(--fs-h4); font-weight: 600;
}
.lp-root .ok-sub {
  font-family: var(--font-body);
  font-size: var(--fs-small); color: var(--fg-mute);
  font-weight: 400; margin-top: 6px;
}
.lp-root .err-msg {
  margin-top: 14px; padding: 12px 14px;
  background: rgba(255, 80, 80, 0.08);
  border: 1px solid rgba(255, 80, 80, 0.22);
  border-radius: var(--r-input);
  color: #FFB0B8; font-size: var(--fs-small); text-align: center;
}

/* ==========================================================================
   FOOTER
   ========================================================================== */
.lp-root footer {
  background: #000;
  padding: var(--s-6) clamp(20px, 4vw, 32px);
  text-align: center;
  border-top: 1px solid var(--border-1);
}
.lp-root .footer-logo {
  display: flex; justify-content: center; margin-bottom: var(--s-2);
}
.lp-root .footer-logo img { height: 36px; width: auto; opacity: .9; }
.lp-root .footer-tagline {
  font-size: 14px; color: var(--fg-mute); margin-bottom: 6px;
}
.lp-root .footer-url {
  color: var(--fg-mute); font-size: var(--fs-small);
  text-decoration: none;
  transition: color .2s;
}
.lp-root .footer-url:hover { color: var(--fg); }
.lp-root .footer-cta-wrap { margin-top: var(--s-4); }

/* ==========================================================================
   MOBILE
   ========================================================================== */
@media (max-width: 720px) {
  .lp-root .grid-2,
  .lp-root .compare { grid-template-columns: 1fr; }
  .lp-root .metrics { grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .lp-root .metric { padding: 18px 8px; }
  .lp-root .metric-val { font-size: 24px; }
  .lp-root .fin-card { flex-direction: column; align-items: flex-start; gap: 4px; }
  .lp-root .hero-logo { height: 44px; }
  .lp-root .hero-ctas { flex-direction: column; width: 100%; }
  .lp-root .hero-ctas .btn { width: 100%; }
  .lp-root .hero-grid { grid-template-columns: 1fr; gap: 40px; }
  .lp-root .hero-copy { align-items: center; text-align: center; }
  .lp-root .hero-ctas { justify-content: center; }
  .lp-root .hero-visual { max-width: 320px; aspect-ratio: 3 / 4; }
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
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <style>{LP_CSS}</style>
      </Helmet>
      <div className="lp-root">
        {/* NAV */}
        <nav>
          <img src={logoFestpag} alt="Festpag" className="nav-logo" />

          <a href="#contato" className="btn btn-secondary">Falar com a equipe</a>
        </nav>

        {/* HERO */}
        <div className="hero">
          <p className="hero-eyebrow">O banco oficial dos eventos</p>
          <img src={logoFestpag} alt="Festpag" className="hero-logo" />
          <h1 className="hero-headline">A operação inteligente para eventos que querem <span>vender mais</span></h1>
          <p className="hero-sub">Reduzir filas e operar com controle total. Do ingresso ao consumo, tudo conectado em um único ecossistema.</p>
          <div className="hero-ctas">
            <a href="#contato" className="btn btn-primary btn-lg">Falar com a equipe</a>
            <a href="#ecossistema" className="btn btn-secondary btn-lg">Ver soluções</a>
          </div>

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
            <p className="section-foot">Quando a operação trava, o evento vende menos.</p>
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
        <section id="ecossistema">

          <div className="section-inner">
            <div className="section-label">Ecossistema</div>
            <h2 className="section-title">A Festpag nasceu para<br /><em>profissionalizar a operação dos eventos</em></h2>
            <div className="divider" />
            <div className="eco-flow">
              <div className="eco-step"><h4>Ticketaria</h4><p>Venda, lotes, QR Code e check-in integrado.</p></div>
              <div className="eco-link" />
              <div className="eco-step"><h4>Totens</h4><p>Autoatendimento e redução de filas.</p></div>
              <div className="eco-link" />
              <div className="eco-step"><h4>Smart POS</h4><p>Venda móvel com controle total da equipe.</p></div>
              <div className="eco-link" />
              <div className="eco-step"><h4>Facepag</h4><p>Pagamento por biometria facial de alta precisão.</p></div>
              <div className="eco-link" />
              <div className="eco-step"><h4>Gestão</h4><p>Dados, relatórios e fechamento financeiro.</p></div>
            </div>
            <p className="section-foot">Do ingresso ao consumo, toda operação integrada.</p>
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
            <p className="section-foot">O evento começa na experiência de compra.</p>
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
            <p className="section-foot">Menos tempo esperando. Mais tempo consumindo.</p>
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
            <p className="section-foot">Tecnologia exclusiva FestPag. O público aproveita mais. A operação vende mais.</p>
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
            <p className="section-foot">Do ingresso ao consumo, toda operação integrada.</p>
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
                    {submitting ? 'Enviando...' : 'Enviar formulário'}
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
          <div className="footer-cta-wrap"><a href="#contato" className="btn btn-primary">Falar com a equipe</a></div>
        </footer>
      </div>
    </>
  );
}
