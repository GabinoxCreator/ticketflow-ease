import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import logoFestpag from '@/assets/brand/logo-gradiente.png';
import devTotemCardapio from '@/assets/lp3/totem-cardapio.webp';
import devTotemCheckin from '@/assets/lp3/totem-checkin.webp';
import devPosCatalogo from '@/assets/lp3/pos-catalogo.webp';
import devPosPagamento from '@/assets/lp3/pos-pagamento.webp';
import devMacbook from '@/assets/lp3/macbook-dashboard.webp';
import devIphone from '@/assets/lp3/iphone-evento.webp';

/* ==========================================================================
   Landing comercial (/lp) — v3, aprovada em 19/08/2026.
   Marca FestPag v0.1: Noite #0A0710, gradiente como assinatura (uso escasso),
   Space Grotesk + Inter. Todo o CSS é escopado em .lp3 para não vazar no site.
   Movimento: rolagem com encaixe (scroll snap), entrada e saída por seção e
   um palco fixo que troca de aparelho a cada módulo do ecossistema.
   ========================================================================== */

const LP3_CSS = `.lp3 *,.lp3 *::before,.lp3 *::after{box-sizing:border-box;margin:0;padding:0}.lp3{
 --noite:#0A0710;--surface:#131021;--surface2:#1B1533;--nevoa:#F2EFF9;
 --soft:rgba(242,239,249,.72);--mute:rgba(242,239,249,.46);--line:rgba(242,239,249,.10);
 --azul:#5F6EF9;--roxo:#B86AD9;--rosa:#F766C6;--azulc:#B3BAFF;
 --grad:linear-gradient(100deg,#5F6EF9 0%,#B86AD9 52%,#F766C6 100%);
 --r:14px;--ease:cubic-bezier(.16,.84,.28,1);
 --head:'Space Grotesk',ui-sans-serif,system-ui,sans-serif;--body:'Inter',ui-sans-serif,system-ui,sans-serif;
}.lp3{background:var(--noite);color:var(--nevoa);font-family:var(--body);-webkit-font-smoothing:antialiased;position:fixed;inset:0;overflow:hidden;z-index:1}.lp3 img{max-width:100%;display:block}.lp3 h1,.lp3 h2,.lp3 h3,.lp3 .disp{font-family:var(--head);font-weight:600;letter-spacing:-.03em;line-height:1.05;text-wrap:balance}.lp3 .g{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}.lp3 em{font-style:normal;color:var(--azulc)}.lp3 #flow{position:fixed;inset:0;z-index:0;pointer-events:none}.lp3 .halo{position:fixed;z-index:0;pointer-events:none;border-radius:50%;filter:blur(110px);opacity:.5;transition:opacity 1.2s var(--ease),transform 1.6s var(--ease)}.lp3 .halo-a{width:52vw;height:52vw;left:-14vw;top:-16vw;background:radial-gradient(circle,rgba(95,110,249,.5),transparent 66%)}.lp3 .halo-b{width:46vw;height:46vw;right:-12vw;bottom:-14vw;background:radial-gradient(circle,rgba(247,102,198,.34),transparent 66%)}.lp3 .grid-bg{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.5;
 background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);
 background-size:88px 88px;mask-image:radial-gradient(ellipse 90% 70% at 50% 45%,#000 30%,transparent 78%)}.lp3 .noise{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.5;
 background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.04'/%3E%3C/svg%3E")}.lp3 .top{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;justify-content:space-between;
 padding:20px clamp(20px,4vw,56px);backdrop-filter:blur(14px);background:linear-gradient(180deg,rgba(10,7,16,.86),rgba(10,7,16,0));
 transition:background .4s,transform .4s var(--ease)}.lp3 .top img{height:30px;width:auto}.lp3 .top-r{display:flex;align-items:center;gap:14px}.lp3 .prog{position:fixed;top:0;left:0;height:2px;z-index:70;background:var(--grad);width:0;transition:width .18s linear}.lp3 .btn{font-family:var(--head);font-weight:600;font-size:15px;border:0;cursor:pointer;border-radius:var(--r);
 padding:13px 22px;transition:transform .25s var(--ease),box-shadow .25s var(--ease),background .25s;position:relative;overflow:hidden}.lp3 .btn-p{background:var(--grad);color:#fff;box-shadow:0 10px 30px -12px rgba(95,110,249,.9)}.lp3 .btn-p:hover{transform:translateY(-2px);box-shadow:0 16px 40px -12px rgba(184,106,217,.95)}.lp3 .btn-s{background:rgba(242,239,249,.06);color:var(--nevoa);border:1px solid var(--line)}.lp3 .btn-s:hover{background:rgba(242,239,249,.12);transform:translateY(-2px)}.lp3 .btn-lg{font-size:17px;padding:17px 30px}.lp3 .btn:focus-visible,.lp3 a:focus-visible,.lp3 input:focus-visible,.lp3 select:focus-visible{outline:2px solid var(--azulc);outline-offset:3px}.lp3 .rail{position:fixed;right:clamp(14px,2.4vw,34px);top:50%;transform:translateY(-50%);z-index:60;display:flex;flex-direction:column;gap:16px;align-items:flex-end}.lp3 .rdot{display:flex;align-items:center;gap:10px;background:none;border:0;cursor:pointer;padding:2px}.lp3 .rdot span{font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);opacity:0;transform:translateX(6px);
 transition:opacity .3s,transform .3s;white-space:nowrap;font-family:var(--head)}.lp3 .rdot i{width:7px;height:7px;border-radius:50%;background:rgba(242,239,249,.26);transition:all .4s var(--ease);flex:none}.lp3 .rdot:hover span{opacity:1;transform:none}.lp3 .rdot.on i{background:var(--grad);width:9px;height:9px;box-shadow:0 0 0 4px rgba(95,110,249,.18)}.lp3 .rdot.on span{opacity:1;transform:none;color:var(--nevoa)}.lp3 .rsub{display:flex;flex-direction:column;gap:7px;align-items:flex-end;margin:-6px 1px 0 0;max-height:0;overflow:hidden;transition:max-height .5s var(--ease)}.lp3 .rsub.open{max-height:120px}.lp3 .rsub-b{background:none;border:0;padding:3px;cursor:pointer;line-height:0;display:block}.lp3 .rsub-b i{display:block;width:4px;height:4px;border-radius:50%;background:rgba(242,239,249,.22);transition:all .35s}.lp3 .rsub-b:hover i{background:rgba(242,239,249,.6)}.lp3 .rsub-b.on i{background:var(--azulc);transform:scale(1.6)}.lp3 .scroller{height:100vh;height:100svh;overflow-y:scroll;scroll-snap-type:y mandatory;position:relative;z-index:10;scrollbar-width:none}.lp3 .scroller::-webkit-scrollbar{display:none}.lp3 .sec{min-height:100vh;min-height:100svh;scroll-snap-align:start;scroll-snap-stop:always;display:flex;align-items:center;
 position:relative;padding:96px 0 72px}.lp3 .wrap{width:min(1180px,calc(100vw - 200px));margin:0 auto;position:relative;z-index:2}.lp3 [data-anim]{opacity:0;transform:translateY(30px);transition:opacity .78s var(--ease),transform .78s var(--ease);
 transition-delay:calc(var(--d,0)*68ms)}.lp3 .is-on [data-anim]{opacity:1;transform:none}.lp3 .sec[data-dir="up"]:not(.is-on) [data-anim]{transform:translateY(-30px)}.lp3 [data-anim="scale"]{transform:translateY(30px) scale(.96)}.lp3 .is-on [data-anim="scale"]{transform:none}.lp3 [data-anim="left"]{transform:translateX(-34px)}.lp3 .is-on [data-anim="left"]{transform:none}.lp3 [data-anim="clip"]{opacity:1;clip-path:inset(0 100% 0 0);transform:none}.lp3 .is-on [data-anim="clip"]{clip-path:inset(0 0 0 0);transition:clip-path 1s var(--ease);transition-delay:calc(var(--d,0)*68ms)}.lp3 .eyebrow{display:inline-flex;align-items:center;gap:9px;font-family:var(--head);font-size:12.5px;letter-spacing:.16em;
 text-transform:uppercase;color:var(--azulc);font-weight:600;border:1px solid rgba(95,110,249,.3);
 background:rgba(95,110,249,.09);padding:8px 15px;border-radius:999px;margin-bottom:26px}.lp3 .eyebrow i{width:6px;height:6px;border-radius:50%;background:var(--azul);box-shadow:0 0 9px var(--azul);animation:lp3-pulse 2.6s infinite}@keyframes lp3-pulse{0%,100%{opacity:1}50%{opacity:.35}}.lp3 h1{font-size:clamp(38px,5.4vw,72px)}.lp3 h2{font-size:clamp(30px,4.1vw,54px)}.lp3 .lead{font-size:clamp(16px,1.35vw,20px);line-height:1.6;color:var(--soft);max-width:62ch;margin-top:22px}.lp3 .foot-note{margin-top:36px;font-size:14.5px;color:var(--mute);border-left:2px solid rgba(95,110,249,.5);padding-left:14px}.lp3 .hero-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.02fr);gap:clamp(24px,4vw,64px);align-items:center}.lp3 .hero-txt{max-width:600px}.lp3 .hero-ctas{display:flex;gap:14px;flex-wrap:wrap;margin-top:38px}.lp3 .hero-chips{display:flex;flex-wrap:wrap;gap:9px;margin-top:34px}.lp3 .chip{font-size:13.5px;padding:9px 15px;border-radius:11px;border:1px solid var(--line);
 background:rgba(242,239,249,.045);color:var(--soft);transition:all .35s var(--ease);cursor:default}.lp3 .chip:hover{border-color:rgba(95,110,249,.5);background:rgba(95,110,249,.1);color:var(--nevoa);transform:translateY(-2px)}.lp3 .hero-art{position:relative;height:clamp(400px,58vh,620px);perspective:1400px}.lp3 .hero-art img{position:absolute;filter:drop-shadow(0 40px 60px rgba(0,0,0,.7));animation:lp3-float 9s ease-in-out infinite}.lp3 .hp-totem{height:100%;left:24%;top:0;z-index:3;animation-delay:-1s}.lp3 .hp-mac{width:76%;left:-8%;top:24%;z-index:1;animation-delay:-4s;opacity:.94}.lp3 .hp-pos{height:44%;right:-2%;bottom:6%;z-index:4;animation-delay:-6.4s}.lp3 .hp-ip{height:40%;left:10%;bottom:2%;z-index:2;animation-delay:-2.6s}@keyframes lp3-float{0%,100%{transform:translateY(-10px)}50%{transform:translateY(10px)}}.lp3 .scrollhint{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);display:flex;flex-direction:column;
 align-items:center;gap:9px;font-size:11.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--mute);font-family:var(--head)}.lp3 .scrollhint b{display:block;width:1px;height:34px;background:linear-gradient(180deg,var(--azul),transparent);animation:lp3-drop 2.1s infinite}@keyframes lp3-drop{0%{transform:scaleY(0);transform-origin:top}45%{transform:scaleY(1);transform-origin:top}
 46%{transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom}}.lp3 .nums{display:grid;grid-template-columns:repeat(4,1fr);gap:26px;margin-top:44px}.lp3 .ncard{border:1px solid var(--line);border-radius:18px;padding:32px 26px;background:linear-gradient(160deg,rgba(242,239,249,.05),rgba(242,239,249,.012));
 position:relative;overflow:hidden;transition:border-color .4s,transform .4s var(--ease)}.lp3 .ncard::after{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:var(--grad);opacity:0;transition:opacity .5s}.lp3 .ncard:hover{border-color:rgba(95,110,249,.4);transform:translateY(-4px)}.lp3 .ncard:hover::after{opacity:1}.lp3 .nval{font-family:var(--head);white-space:nowrap;font-size:clamp(30px,3.2vw,46px);font-weight:600;letter-spacing:-.04em;line-height:1;
 background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;font-variant-numeric:tabular-nums}.lp3 .nlab{font-size:14.5px;color:var(--soft);margin-top:12px;line-height:1.45}.lp3 .probs{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-top:42px}.lp3 .prob{display:flex;gap:18px;padding:26px 24px;border:1px solid var(--line);border-radius:16px;
 background:rgba(242,239,249,.022);transition:all .45s var(--ease)}.lp3 .prob:hover{background:rgba(242,239,249,.05);border-color:rgba(242,239,249,.2)}.lp3 .prob-i{width:38px;height:38px;flex:none;border-radius:11px;border:1px solid rgba(242,239,249,.16);
 display:grid;place-items:center;color:var(--mute)}.lp3 .prob:hover .prob-i{border-color:rgba(95,110,249,.55);color:var(--azulc)}.lp3 .prob h3{font-size:19px;margin-bottom:7px;letter-spacing:-.01em}.lp3 .prob p{font-size:15px;color:var(--mute);line-height:1.5}.lp3 .ecards{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-top:44px}.lp3 .ecard{border:1px solid var(--line);border-radius:16px;padding:24px 20px;background:linear-gradient(165deg,rgba(242,239,249,.045),rgba(242,239,249,.01));
 transition:all .45s var(--ease);position:relative;overflow:hidden}.lp3 .ecard::before{content:"";position:absolute;inset:0;background:var(--grad);opacity:0;transition:opacity .45s;z-index:-1}.lp3 .ecard:hover{transform:translateY(-6px);border-color:rgba(95,110,249,.45);background:rgba(95,110,249,.08)}.lp3 .ecard b{font-family:var(--head);font-size:12px;letter-spacing:.18em;color:var(--azulc);display:block;margin-bottom:14px}.lp3 .ecard h3{font-size:17px;margin-bottom:8px;line-height:1.2}.lp3 .ecard p{font-size:13.5px;color:var(--mute);line-height:1.5}.lp3 .scan{position:relative;width:min(340px,80%);aspect-ratio:1;margin:0 auto;display:grid;place-items:center}.lp3 .scan-box{position:absolute;inset:12%;border-radius:26px;border:1px solid rgba(95,110,249,.3)}.lp3 .scan-box i{position:absolute;width:34px;height:34px;border:2px solid var(--azulc);opacity:.9}.lp3 .scan-box i:nth-child(1){top:-1px;left:-1px;border-right:0;border-bottom:0;border-radius:12px 0 0 0}.lp3 .scan-box i:nth-child(2){top:-1px;right:-1px;border-left:0;border-bottom:0;border-radius:0 12px 0 0}.lp3 .scan-box i:nth-child(3){bottom:-1px;left:-1px;border-right:0;border-top:0;border-radius:0 0 0 12px}.lp3 .scan-box i:nth-child(4){bottom:-1px;right:-1px;border-left:0;border-top:0;border-radius:0 0 12px 0}.lp3 .scan-line{position:absolute;left:12%;right:12%;height:2px;background:var(--grad);box-shadow:0 0 22px rgba(95,110,249,.85);
 border-radius:2px;animation:lp3-scanmove 3.4s cubic-bezier(.5,0,.5,1) infinite}@keyframes lp3-scanmove{0%,100%{top:14%}50%{top:84%}}.lp3 .scan-face{width:52%;opacity:.5}.lp3 .scan-tag{position:absolute;bottom:-2px;left:50%;transform:translateX(-50%);font-family:var(--head);font-size:12.5px;
 letter-spacing:.14em;text-transform:uppercase;color:var(--azulc);background:rgba(95,110,249,.12);
 border:1px solid rgba(95,110,249,.3);padding:8px 16px;border-radius:999px;white-space:nowrap}.lp3 .fp-3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:44px}.lp3 .stage{position:fixed;inset:0;z-index:5;pointer-events:none;opacity:0;transition:opacity .6s var(--ease);perspective:1600px}.lp3 .stage.on{opacity:1}.lp3 .stage-in{position:absolute;right:7vw;top:50%;transform:translateY(-50%);width:38vw;height:74vh;display:grid;place-items:center}.lp3 .sdev{position:absolute;max-height:100%;width:auto;opacity:0;transform:rotateY(-26deg) translateX(90px) scale(.9);
 transition:opacity .75s var(--ease),transform .95s var(--ease);filter:drop-shadow(0 46px 70px rgba(0,0,0,.78))}.lp3 .sdev.on{opacity:1;transform:rotateY(0) translateX(0) scale(1)}.lp3 .sdev.out{opacity:0;transform:rotateY(22deg) translateX(-70px) scale(.92)}.lp3 .sdev.tall{height:100%}.lp3 .sdev.wide{width:100%;height:auto}.lp3 .stage-ring{position:absolute;width:74%;aspect-ratio:1;border-radius:50%;border:1px solid rgba(95,110,249,.16);
 animation:lp3-spin 26s linear infinite}.lp3 .stage-ring::after{content:"";position:absolute;top:-4px;left:50%;width:7px;height:7px;border-radius:50%;background:var(--rosa);
 box-shadow:0 0 14px var(--rosa)}@keyframes lp3-spin{to{transform:rotate(360deg)}}.lp3 .mod-wrap{width:min(1180px,calc(100vw - 200px));margin:0 auto}.lp3 .mod{max-width:520px}.lp3 .mod-n{font-family:var(--head);font-size:13px;letter-spacing:.2em;color:var(--mute);margin-bottom:16px;font-variant-numeric:tabular-nums}.lp3 .mod h2{font-size:clamp(28px,3.4vw,44px)}.lp3 .mod .lead{font-size:17px;margin-top:18px}.lp3 .mod-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:28px}.lp3 .mtag{font-size:13px;padding:8px 13px;border-radius:10px;border:1px solid rgba(95,110,249,.26);
 background:rgba(95,110,249,.08);color:var(--soft)}.lp3 .mod-line{width:0;height:1px;background:var(--grad);margin:26px 0 0;transition:width 1s var(--ease) .35s}.lp3 .is-on .mod-line{width:120px}.lp3 .fp{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center}.lp3 .steps{display:flex;flex-direction:column;gap:14px;margin-top:34px}.lp3 .step{display:flex;gap:18px;align-items:flex-start;padding:20px 22px;border-radius:15px;border:1px solid var(--line);
 background:rgba(242,239,249,.025);transition:all .45s var(--ease)}.lp3 .step:hover{border-color:rgba(95,110,249,.42);background:rgba(95,110,249,.06)}.lp3 .step-n{font-family:var(--head);font-size:13px;font-weight:600;width:30px;height:30px;flex:none;border-radius:9px;
 display:grid;place-items:center;background:var(--grad);color:#fff}.lp3 .step h3{font-size:17.5px;margin-bottom:5px}.lp3 .step p{font-size:14.5px;color:var(--mute);line-height:1.5}.lp3 .track{position:relative;margin-top:52px;padding-left:30px}.lp3 .track::before{content:"";position:absolute;left:6px;top:6px;bottom:6px;width:1px;background:var(--line)}.lp3 .track::after{content:"";position:absolute;left:6px;top:6px;width:1px;height:0;background:var(--grad);transition:height 1.5s var(--ease) .3s}.lp3 .is-on .track::after{height:calc(100% - 12px)}.lp3 .tstep{position:relative;padding:0 0 26px}.lp3 .tstep:last-child{padding-bottom:0}.lp3 .tstep::before{content:"";position:absolute;left:-27px;top:6px;width:9px;height:9px;border-radius:50%;
 background:var(--noite);border:1px solid rgba(242,239,249,.32);transition:all .4s}.lp3 .tstep.hot::before{background:var(--grad);border-color:transparent;box-shadow:0 0 0 4px rgba(95,110,249,.16)}.lp3 .tstep h3{font-size:18px;margin-bottom:5px}.lp3 .tstep p{font-size:14.5px;color:var(--mute);line-height:1.5;max-width:56ch}.lp3 .track-h{position:relative;display:grid;grid-template-columns:repeat(6,1fr);gap:22px;margin-top:56px;padding-top:34px}.lp3 .track-h::before{content:"";position:absolute;left:0;right:0;top:5px;height:1px;background:var(--line)}.lp3 .track-h::after{content:"";position:absolute;left:0;top:5px;height:1px;width:0;background:var(--grad);transition:width 1.8s var(--ease) .35s}.lp3 .is-on .track-h::after{width:100%}.lp3 .hstep{position:relative}.lp3 .hstep::before{content:"";position:absolute;left:0;top:-34px;width:11px;height:11px;border-radius:50%;
 background:var(--noite);border:1px solid rgba(242,239,249,.3);transition:all .45s var(--ease)}.lp3 .hstep.hot::before{background:var(--grad);border-color:transparent;box-shadow:0 0 0 5px rgba(95,110,249,.16)}.lp3 .hstep b{display:block;font-family:var(--head);font-size:12px;letter-spacing:.16em;color:var(--mute);margin-bottom:9px}.lp3 .hstep h3{font-size:16.5px;margin-bottom:7px;line-height:1.25}.lp3 .hstep p{font-size:13.5px;color:var(--mute);line-height:1.5}.lp3 .who{display:flex;flex-wrap:wrap;gap:11px;margin-top:40px;max-width:900px}.lp3 .wtag{font-family:var(--head);font-size:clamp(15px,1.5vw,21px);font-weight:500;padding:13px 20px;border-radius:13px;
 border:1px solid var(--line);background:rgba(242,239,249,.03);transition:all .4s var(--ease);color:var(--soft)}.lp3 .wtag:hover{border-color:transparent;background:var(--grad);color:#fff;transform:translateY(-3px) rotate(-1deg)}.lp3 .form-grid{display:grid;grid-template-columns:1fr .92fr;gap:clamp(32px,5vw,72px);align-items:center}.lp3 .card{border:1px solid var(--line);border-radius:22px;padding:clamp(26px,2.4vw,38px);width:100%;background:linear-gradient(160deg,rgba(27,21,51,.9),rgba(19,16,33,.7));
 backdrop-filter:blur(10px)}.lp3 .field{margin-bottom:16px}.lp3 .field label{display:block;font-size:13px;letter-spacing:.05em;color:var(--mute);margin-bottom:7px;font-weight:500}.lp3 .field input,.lp3 .field select{width:100%;padding:14px 16px;border-radius:12px;border:1px solid var(--line);
 background:rgba(10,7,16,.6);color:var(--nevoa);font-family:var(--body);font-size:15px;transition:border-color .3s,background .3s}.lp3 .field input::placeholder{color:rgba(242,239,249,.3)}.lp3 .field input:focus,.lp3 .field select:focus{border-color:var(--azul);background:rgba(10,7,16,.85);outline:none}.lp3 .form-note{font-size:12.5px;color:var(--mute);margin-top:14px;line-height:1.5}.lp3 .consent{display:flex;gap:11px;align-items:flex-start;margin:6px 0 18px;cursor:pointer;font-size:13px;
 color:var(--soft);line-height:1.5}.lp3 .consent input{appearance:none;width:19px;height:19px;flex:none;margin-top:1px;border-radius:6px;
 border:1px solid rgba(242,239,249,.28);background:rgba(10,7,16,.6);cursor:pointer;
 transition:background .25s,border-color .25s;position:relative}.lp3 .consent input:checked{background:var(--grad);border-color:transparent}.lp3 .consent input:checked::after{content:"";position:absolute;left:6px;top:2px;width:5px;height:10px;
 border:2px solid #fff;border-top:0;border-left:0;transform:rotate(42deg)}.lp3 .consent a{color:var(--azulc);text-decoration:underline;text-underline-offset:2px}.lp3 .consent a:hover{color:var(--nevoa)}.lp3 .err-msg{margin-top:13px;font-size:13.5px;color:#FFB4C8;background:rgba(247,102,198,.1);
 border:1px solid rgba(247,102,198,.3);border-radius:11px;padding:11px 14px;line-height:1.45}.lp3 .ok-msg{font-family:var(--head);font-size:24px;font-weight:600;letter-spacing:-.02em;text-align:center;padding:34px 8px}.lp3 .ok-sub{font-family:var(--body);font-size:15px;font-weight:400;color:var(--soft);margin-top:12px;letter-spacing:0}.lp3 .btn:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none}.lp3 .contact-alt{display:flex;flex-direction:column;gap:12px;margin-top:30px}.lp3 .calt{display:flex;align-items:center;gap:13px;font-size:15px;color:var(--soft)}.lp3 .calt b{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:rgba(95,110,249,.12);
 border:1px solid rgba(95,110,249,.28);flex:none}.lp3 .endfoot{position:absolute;bottom:26px;left:0;right:0;text-align:center;font-size:12.5px;color:var(--mute);letter-spacing:.04em}@media (max-width:1080px){.lp3 .hero-grid,.lp3 .fp,.lp3 .form-grid{grid-template-columns:1fr;gap:34px}
.lp3 .top{padding:14px 18px;backdrop-filter:blur(8px);background:linear-gradient(180deg,rgba(10,7,16,.72),rgba(10,7,16,0) 76%)}
.lp3 .top.top-hide{transform:translateY(-100%)}
.lp3 .hero-art{height:52vh;order:-1;perspective:none}
.lp3 .hero-art img{animation:lp3-float 9s ease-in-out infinite}
.lp3 .hp-mac,.lp3 .hp-pos{display:none}
.lp3 .hp-totem{height:92%;left:50%;top:2%;transform:translateX(-56%);z-index:2}
.lp3 .hp-ip{height:46%;left:auto;right:4%;bottom:0;top:auto;z-index:3}
.lp3 .nums{grid-template-columns:repeat(2,1fr);gap:16px}.lp3 .probs{grid-template-columns:1fr}.lp3 .track-h{grid-template-columns:repeat(2,1fr);gap:26px 20px;padding-top:0}.lp3 .track-h::before,.lp3 .track-h::after{display:none}.lp3 .hstep::before{position:static;display:block;margin-bottom:10px}.lp3 .ecards{grid-template-columns:repeat(2,1fr)}.lp3 .fp-3{grid-template-columns:1fr}
.lp3 .stage-in{right:auto;left:0;top:0;transform:none;width:100%;height:48svh;padding:88px 0 16px}
.lp3 .sdev,.lp3 .sdev.tall,.lp3 .sdev.wide{height:auto;width:auto;max-height:100%;max-width:76vw}
.lp3 .stage-ring{display:none}.lp3 .mod-sec{align-items:flex-end;padding-bottom:84px}.lp3 .mod-sec .mod-wrap{padding-top:52svh}.lp3 .rail span{display:none}.lp3 .wrap,.lp3 .mod-wrap{width:90vw}.lp3 .sec{padding:92px 0 64px}.lp3 .mod{max-width:none}}@media (max-width:680px){.lp3 .nums{grid-template-columns:1fr 1fr;gap:12px}.lp3 .ncard{padding:22px 18px}.lp3 .card{padding:24px}
.lp3 .hero-art{height:44vh}.lp3 .hp-totem{height:88%}.lp3 .hp-ip{height:40%}}@media (prefers-reduced-motion:reduce){.lp3 *{animation:none!important;transition-duration:.01ms!important}.lp3 [data-anim]{opacity:1!important;transform:none!important;clip-path:none!important}.lp3 .sdev{opacity:1}.lp3 html{scroll-behavior:auto}}`;

type Mod = {
  id: string; n: string; kicker: string; head: JSX.Element; desc: string; tags: string[];
};

const MODULES: Mod[] = [
  { id: 'm1', n: '01', kicker: 'TICKETEIRA',
    head: <>A receita começa <span className="g">antes do portão abrir</span></>,
    desc: 'Venda online com lotes, Pix e cartão. O ingresso sai com QR Code vinculado à biometria facial: a portaria valida o check-in em 2 segundos, sem fila e sem precisar de celular.',
    tags: ['Lotes e cupons', 'Cortesias', 'Comissários', 'Check-in facial em 2 segundos', 'Portaria em tempo real'] },
  { id: 'm2', n: '02', kicker: 'TOTEM DE AUTOATENDIMENTO',
    head: <>Autoatendimento de verdade. <span className="g">A fila desaparece.</span></>,
    desc: 'O cliente pede e paga sozinho, com o cardápio e a identidade visual do seu evento, e sai com a ficha impressa na hora.',
    tags: ['Cardápio personalizado', 'Impressão na hora', 'Pix, cartão e aproximação'] },
  { id: 'm3', n: '03', kicker: 'SMART POS',
    head: <>Um caixa completo <span className="g">em cada ponto de venda</span></>,
    desc: 'Maquininha própria para vender em qualquer lugar: balcão, camarote, pista ou food truck. Venda por catálogo, sem digitar valor e sem errar.',
    tags: ['Venda móvel', 'Controle por operador', 'Comprovante impresso', 'Reforço de contingência'] },
  { id: 'm4', n: '04', kicker: 'FESTCASH',
    head: <>Seu rosto <span className="g">é a carteira do evento</span></>,
    desc: 'Carteira cashless vinculada ao CPF: o cliente recarrega o saldo pelo próprio rosto, no totem, e paga do mesmo jeito no balcão. Sem pulseira descartável para comprar. Sem cartão caro para ficar recarregando.',
    tags: ['Cadastro único por CPF', 'Sem pulseira nem cartão', 'Recarga no totem'] },
  { id: 'm5', n: '05', kicker: 'GESTÃO E REPASSE',
    head: <>Você enxerga o evento <span className="g">enquanto ele acontece</span></>,
    desc: 'Você acompanha a venda durante o evento e recebe o fechamento detalhado, com receita, taxas e custos abertos linha a linha. O repasse sai por Pix, sem surpresa.',
    tags: ['Dados em tempo real', 'Fechamento linha a linha', 'Repasse por Pix'] },
];

const DEVICES = [
  { id: 'm1', src: devIphone, alt: 'Página do evento no celular', cls: 'tall' },
  { id: 'm2', src: devTotemCardapio, alt: 'Totem com o cardápio do evento', cls: 'tall' },
  { id: 'm3', src: devPosCatalogo, alt: 'Maquininha com o catálogo de produtos', cls: 'tall' },
  { id: 'm4', src: devTotemCheckin, alt: 'Totem com check-in por reconhecimento facial', cls: 'tall' },
  { id: 'm5', src: devMacbook, alt: 'Painel do produtor no notebook', cls: 'wide' },
];

const PROBLEMAS = [
  { t: 'Filas longas', d: 'Enquanto o público espera, ninguém consome. Fila é receita parada.',
    p: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { t: 'Check-in lento', d: 'Entrada travada, ingresso duplicado e nenhum controle de quem já entrou.',
    p: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M8 15h3" /></> },
  { t: 'Venda no caderno', d: 'Dinheiro solto, erro de troco e nenhum rastro do que saiu de cada ponto.',
    p: <><path d="M5 4h14v16l-7-3-7 3z" /><path d="M9 9h6" /></> },
  { t: 'Fechamento no escuro', d: 'O acerto vem dias depois, sem detalhes e sem como conferir.',
    p: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></> },
];

const ECARDS = [
  { n: '01', t: 'Ticketeira', d: 'Venda online, lotes, cupons e QR Code vinculado à facial.' },
  { n: '02', t: 'Totem', d: 'O público pede e paga sozinho, com impressão na hora.' },
  { n: '03', t: 'Smart POS', d: 'Maquininha própria com catálogo em cada ponto de venda.' },
  { n: '04', t: 'FestCash', d: 'Carteira cashless: o rosto recarrega e paga, sem pulseira nem cartão.' },
  { n: '05', t: 'Gestão', d: 'Venda ao vivo, fechamento aberto e repasse por Pix.' },
];

const ETAPAS = [
  { t: 'Proposta em até 24 horas', d: 'Você conta o tamanho do evento e recebe equipamentos, taxa e prazos.' },
  { t: 'Contrato digital', d: 'Chega por link e é assinado na hora. Sem imprimir nem escanear.' },
  { t: 'Visita técnica', d: 'Energia, internet e a posição de cada ponto conferidas antes.' },
  { t: 'Entrega item a item', d: 'Cada equipamento conferido e assinado pelos dois lados.' },
  { t: 'Evento ao vivo', d: 'Venda, meio de pagamento e movimento por ponto em tempo real.' },
  { t: 'Fechamento e repasse', d: 'Receita, taxas e custos linha a linha. Você aprova antes do repasse.' },
];

const FP_PASSOS = [
  { n: '01', t: 'Cadastro único por CPF', d: 'Uma vez só, com autorização explícita de quem se cadastra.' },
  { n: '02', t: 'Recarga no próprio totem', d: 'O cliente carrega o saldo pelo próprio rosto, sem comprar cartão nem pulseira.' },
  { n: '03', t: 'Pagamento em segundos', d: 'Olhou para a câmera, pagou. Sem procurar cartão no bolso.' },
];

const PUBLICO = ['Shows', 'Festivais', 'Rodeios', 'Arenas', 'Feiras', 'Festas temáticas', 'Camarotes',
  'Eventos corporativos', 'Food parks', 'Eventos gastronômicos', 'Bares e casas noturnas'];

const TIPOS = ['Show', 'Festival', 'Rodeio', 'Arena', 'Feira', 'Festa temática', 'Camarote',
  'Evento corporativo', 'Food park', 'Evento gastronômico', 'Bar ou casa noturna', 'Outro'];

/* Grupos do trilho lateral: os cinco módulos ficam sob "Ecossistema". */
const GRUPOS = [
  { label: 'Início', first: 'inicio', subs: [] as string[] },
  { label: 'O problema', first: 'problema', subs: [] },
  { label: 'Ecossistema', first: 'eco', subs: ['m1', 'm2', 'm3', 'm4', 'm5'] },
  { label: 'FestCash', first: 'facepag', subs: [] },
  { label: 'Como funciona', first: 'operacao', subs: [] },
  { label: 'Para quem é', first: 'publico', subs: [] },
  { label: 'Contato', first: 'contato', subs: [] },
];
const LABEL_DE: Record<string, string> = {
  inicio: 'Início', problema: 'O problema', eco: 'Ecossistema',
  m1: 'Ecossistema', m2: 'Ecossistema', m3: 'Ecossistema', m4: 'Ecossistema', m5: 'Ecossistema',
  facepag: 'FestCash', operacao: 'Como funciona', publico: 'Para quem é', contato: 'Contato',
};

function maskPhone(raw: string): string {
  const v = raw.replace(/\D/g, '').slice(0, 11);
  if (v.length <= 10) {
    return v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3').replace(/[-\s]*$/, '');
  }
  return v.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3').replace(/[-\s]*$/, '');
}

const d = (i: number) => ({ '--d': i }) as React.CSSProperties;

export default function LandingLp() {
  const [nome, setNome] = useState('');
  const [cidade, setCidade] = useState('');
  const [tipoEvento, setTipoEvento] = useState('');
  const [telefone, setTelefone] = useState('');
  const [aceite, setAceite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [active, setActive] = useState('inicio');
  const scRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulseRef = useRef<(() => void) | null>(null);
  const contadosRef = useRef<Set<string>>(new Set());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!nome.trim() || !cidade.trim() || !tipoEvento || !telefone.trim()) {
      setErrorMsg('Por favor, preencha todos os campos antes de enviar.');
      return;
    }
    if (!aceite) {
      setErrorMsg('Autorize o contato para enviar o formulário.');
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

  const irPara = useCallback((id: string) => {
    const alvo = document.getElementById(id);
    const sc = scRef.current;
    if (!alvo || !sc) return;
    const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sc.scrollTo({ top: alvo.offsetTop, behavior: reduz ? 'auto' : 'smooth' });
  }, []);

  /* Entradas e saídas: a seção visível ganha .is-on; ao sair, os filhos voltam
     na direção oposta à da rolagem (data-dir), o que dá a sensação de saída. */
  useEffect(() => {
    const sc = scRef.current;
    if (!sc) return;
    const secs = Array.from(sc.querySelectorAll<HTMLElement>('.sec'));
    if (!secs.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const s = e.target as HTMLElement;
          if (e.isIntersecting && e.intersectionRatio > 0.5) {
            s.classList.add('is-on');
            setActive(s.id);
            pulseRef.current?.();
            if (!contadosRef.current.has(s.id)) {
              contadosRef.current.add(s.id);
              contar(s);
              acenderEtapas(s);
            }
          } else {
            s.classList.remove('is-on');
          }
        });
      },
      { root: sc, threshold: [0, 0.5, 0.75] },
    );
    secs.forEach((s) => io.observe(s));

    let ultimo = 0;
    const topEl = document.querySelector<HTMLElement>('.lp3 .top');
    const onScroll = () => {
      const dir = sc.scrollTop > ultimo ? 'down' : 'up';
      ultimo = sc.scrollTop;
      secs.forEach((s) => { s.dataset.dir = dir; });
      /* Some a barra fixa do topo ao rolar para baixo (só tem efeito visual no
         mobile — a regra .top-hide só existe dentro do @media(max-width:1080px)). */
      if (topEl) topEl.classList.toggle('top-hide', dir === 'down' && sc.scrollTop > 80);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });

    secs[0]?.classList.add('is-on');
    return () => { io.disconnect(); sc.removeEventListener('scroll', onScroll); };
  }, []);

  /* Fundo: pontos de luz correndo em trilhos — as transações atravessando o sistema. */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0, boost = 0, raf = 0;
    let trilhos: { y: number; amp: number; ph: number; fr: number }[] = [];
    let pontos: { l: number; x: number; v: number; s: number }[] = [];

    const montar = () => {
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W * DPR; cv.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const n = Math.max(6, Math.round(H / 118));
      trilhos = Array.from({ length: n }, (_, i) => ({
        y: (i + 0.5) * (H / n), amp: 12 + Math.random() * 26,
        ph: Math.random() * 6.28, fr: 0.0016 + Math.random() * 0.0022,
      }));
      pontos = Array.from({ length: Math.round(n * 2.4) }, (_, j) => ({
        l: j % n, x: Math.random() * W, v: 0.28 + Math.random() * 0.62, s: 1 + Math.random() * 1.5,
      }));
    };

    const cor = (t: number) => {
      const a = [95, 110, 249], b = [184, 106, 217], c = [247, 102, 198];
      const [de, para, k] = t < 0.5 ? [a, b, t / 0.5] : [b, c, (t - 0.5) / 0.5];
      return de.map((v, i) => Math.round(v + (para[i] - v) * k)).join(',');
    };

    const quadro = () => {
      ctx.clearRect(0, 0, W, H);
      if (boost > 0) boost -= 0.016;
      const sp = 1 + Math.max(0, boost) * 2.6;
      pontos.forEach((p) => {
        const t = trilhos[p.l];
        if (!t) return;
        p.x += p.v * sp;
        if (p.x > W + 60) p.x = -60;
        const y = t.y + Math.sin(p.x * t.fr + t.ph) * t.amp;
        const c = cor(Math.min(1, Math.max(0, p.x / W)));
        const g = ctx.createLinearGradient(p.x - 54, y, p.x, y);
        g.addColorStop(0, `rgba(${c},0)`);
        g.addColorStop(1, `rgba(${c},0.5)`);
        ctx.strokeStyle = g; ctx.lineWidth = p.s * 0.9; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x - 54, y); ctx.lineTo(p.x, y); ctx.stroke();
        ctx.fillStyle = `rgba(${c},0.85)`;
        ctx.beginPath(); ctx.arc(p.x, y, p.s * 0.95, 0, 6.284); ctx.fill();
      });
      raf = requestAnimationFrame(quadro);
    };

    montar(); quadro();
    pulseRef.current = () => { boost = 1; };
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(t); t = setTimeout(montar, 180); };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf); clearTimeout(t);
      window.removeEventListener('resize', onResize);
      pulseRef.current = null;
    };
  }, []);

  const grupoAtivo = LABEL_DE[active] ?? 'Início';
  const progresso = (() => {
    const idx = Object.keys(LABEL_DE).indexOf(active);
    return ((idx + 1) / Object.keys(LABEL_DE).length) * 100;
  })();

  return (
    <>
      <Helmet>
        <title>FestPag.digital — O banco oficial dos eventos</title>
        <meta
          name="description"
          content="Ticketeira, totem de autoatendimento, Smart POS e FestCash (carteira cashless por reconhecimento facial) em uma operação só. Do ingresso ao último pedido, com dados em tempo real e repasse transparente."
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <style>{LP3_CSS}</style>
      </Helmet>

      <div className="lp3">
        <canvas id="flow" ref={canvasRef} aria-hidden="true" />
        <div className="grid-bg" aria-hidden="true" />
        <div className="halo halo-a" aria-hidden="true" />
        <div className="halo halo-b" aria-hidden="true" />
        <div className="noise" aria-hidden="true" />
        <div className="prog" style={{ width: `${progresso}%` }} aria-hidden="true" />

        <header className="top">
          <img src={logoFestpag} alt="FestPag" />
          <div className="top-r">
            <button type="button" className="btn btn-p" onClick={() => irPara('contato')}>
              Falar com a equipe
            </button>
          </div>
        </header>

        <nav className="rail" aria-label="Navegação por seções">
          {GRUPOS.map((g) => (
            <div key={g.label}>
              <button
                type="button"
                className={`rdot${grupoAtivo === g.label ? ' on' : ''}`}
                onClick={() => irPara(g.first)}
                aria-label={`Ir para ${g.label}`}
              >
                <span>{g.label}</span><i />
              </button>
              {g.subs.length > 0 && (
                <div className={`rsub${grupoAtivo === g.label ? ' open' : ''}`}>
                  {g.subs.map((s, si) => (
                    <button
                      key={s}
                      type="button"
                      className={`rsub-b${active === s ? ' on' : ''}`}
                      onClick={() => irPara(s)}
                      aria-label={`Ir para o módulo ${si + 1} do ecossistema`}
                    ><i /></button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className={`stage${active.startsWith('m') && active.length === 2 ? ' on' : ''}`} aria-hidden="true">
          <div className="stage-in">
            <div className="stage-ring" />
            {DEVICES.map((dv, i) => {
              const atual = DEVICES.findIndex((x) => x.id === active);
              const cls = dv.id === active ? 'on' : (atual > i && atual !== -1 ? 'out' : '');
              return <img key={dv.id} className={`sdev ${dv.cls} ${cls}`} src={dv.src} alt={dv.alt} loading="lazy" />;
            })}
          </div>
        </div>

        <main className="scroller" ref={scRef}>
          <section className="sec" id="inicio">
            <div className="wrap hero-grid">
              <div className="hero-txt">
                <div className="eyebrow" data-anim style={d(0)}><i />O banco oficial dos eventos</div>
                <h1 data-anim style={d(1)}>Do ingresso ao último pedido, <span className="g">uma operação só</span></h1>
                <p className="lead" data-anim style={d(2)}>
                  Ticketeira, autoatendimento, maquininha e FestCash, a carteira cashless por
                  reconhecimento facial. Dados em tempo real durante o evento e repasse transparente no fim.
                </p>
                <div className="hero-chips" data-anim style={d(3)}>
                  {['Ticketeira', 'Totem de autoatendimento', 'Smart POS', 'FestCash', 'Gestão e repasse']
                    .map((c) => <span className="chip" key={c}>{c}</span>)}
                </div>
                <div className="hero-ctas" data-anim style={d(4)}>
                  <button type="button" className="btn btn-p btn-lg" onClick={() => irPara('contato')}>Falar com a equipe</button>
                  <button type="button" className="btn btn-s btn-lg" onClick={() => irPara('eco')}>Ver o ecossistema</button>
                </div>
              </div>
              <div className="hero-art" data-anim="scale" style={d(2)}>
                <img className="hp-mac" src={devMacbook} alt="Painel do produtor" loading="eager" />
                <img className="hp-totem" src={devTotemCardapio} alt="Totem FestPag" loading="eager" />
                <img className="hp-ip" src={devIphone} alt="Ingresso no celular" loading="eager" />
                <img className="hp-pos" src={devPosPagamento} alt="Maquininha FestPag" loading="eager" />
              </div>
            </div>
            <div className="scrollhint" aria-hidden="true"><b />Role</div>
          </section>

          <section className="sec" id="problema">
            <div className="wrap">
              <div className="eyebrow" data-anim style={d(0)}><i />O problema</div>
              <h2 data-anim style={d(1)}>O mercado de eventos evoluiu. <em>A operação ainda não.</em></h2>
              <div className="probs">
                {PROBLEMAS.map((p, i) => (
                  <div className="prob" data-anim="left" style={d(2 + i)} key={p.t}>
                    <div className="prob-i">
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{p.p}</svg>
                    </div>
                    <div><h3>{p.t}</h3><p>{p.d}</p></div>
                  </div>
                ))}
              </div>
              <p className="foot-note" data-anim style={d(6)}>Cada gargalo operacional é faturamento que não entrou.</p>
            </div>
          </section>

          <section className="sec" id="eco">
            <div className="wrap">
              <div className="eyebrow" data-anim style={d(0)}><i />Ecossistema</div>
              <h2 data-anim style={d(1)}>Cinco peças que <span className="g">conversam entre si</span></h2>
              <p className="lead" data-anim style={d(2)}>
                Cada uma resolve um pedaço do evento. Juntas viram uma operação única: o mesmo
                cadastro, o mesmo relatório, o mesmo fechamento.
              </p>
              <div className="ecards">
                {ECARDS.map((c, i) => (
                  <div className="ecard" data-anim style={d(3 + i)} key={c.n}>
                    <b>{c.n}</b><h3>{c.t}</h3><p>{c.d}</p>
                  </div>
                ))}
              </div>
              <p className="foot-note" data-anim style={d(8)}>Role para ver cada uma delas funcionando.</p>
            </div>
          </section>

          {MODULES.map((m) => (
            <section className="sec mod-sec" id={m.id} key={m.id}>
              <div className="mod-wrap">
                <div className="mod">
                  <div className="mod-n" data-anim style={d(0)}>{m.n} / 05 &nbsp;·&nbsp; {m.kicker}</div>
                  <h2 data-anim style={d(1)}>{m.head}</h2>
                  <p className="lead" data-anim style={d(2)}>{m.desc}</p>
                  <div className="mod-tags" data-anim style={d(3)}>
                    {m.tags.map((t) => <span className="mtag" key={t}>{t}</span>)}
                  </div>
                  <div className="mod-line" />
                </div>
              </div>
            </section>
          ))}

          <section className="sec" id="facepag">
            <div className="wrap">
              <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto' }}>
                <div className="eyebrow" data-anim style={d(0)}><i />FestCash · a carteira cashless da FestPag</div>
                <h2 data-anim style={d(1)}>O saldo mora no rosto. <em>Nada de pulseira, nada de cartão.</em></h2>
                <p className="lead" data-anim style={d(2)}>
                  Vinculado ao CPF do cliente: sem pulseira descartável para comprar, sem cartão caro
                  para ficar recarregando. Ele carrega o saldo pelo próprio rosto, no totem, e paga do mesmo jeito.
                </p>
              </div>
              <div className="scan" data-anim="scale" style={d(3)} aria-hidden="true">
                <div className="scan-box"><i /><i /><i /><i /></div>
                <svg className="scan-face" viewBox="0 0 100 110" fill="none" stroke="rgba(179,186,255,.75)" strokeWidth="1.4">
                  <path d="M50 8c18 0 30 13 30 32 0 22-13 42-30 42S20 62 20 40C20 21 32 8 50 8z" />
                  <path d="M38 38h7M55 38h7M50 46v10h-5M42 65c5 4 11 4 16 0" />
                </svg>
                <div className="scan-line" />
                <div className="scan-tag">Reconhecido em segundos</div>
              </div>
              <div className="fp-3">
                {FP_PASSOS.map((p, i) => (
                  <div className="step" data-anim style={d(4 + i)} key={p.n}>
                    <div className="step-n">{p.n}</div>
                    <div><h3>{p.t}</h3><p>{p.d}</p></div>
                  </div>
                ))}
              </div>
              <p className="foot-note" data-anim style={d(7)}>
                Menos atrito na hora de pagar é mais consumo por pessoa ao longo da noite.
              </p>
            </div>
          </section>

          <section className="sec" id="operacao">
            <div className="wrap">
              <div className="eyebrow" data-anim style={d(0)}><i />Como funciona</div>
              <h2 data-anim style={d(1)}>Da proposta ao repasse, <span className="g">tudo registrado</span></h2>
              <p className="lead" data-anim style={d(2)}>
                Você não fica no escuro em nenhuma etapa. Cada passo tem responsável, prazo e registro.
              </p>
              <div className="track-h">
                {ETAPAS.map((e, i) => (
                  <div className="hstep" data-anim style={d(3 + i)} key={e.t}>
                    <b>ETAPA {i + 1}</b><h3>{e.t}</h3><p>{e.d}</p>
                  </div>
                ))}
              </div>
              <p className="foot-note" data-anim style={d(9)}>
                Nossa equipe fica dentro do evento: instala, treina, opera e resolve. Não entregamos um login.
              </p>
            </div>
          </section>

          <section className="sec" id="publico">
            <div className="wrap">
              <div className="eyebrow" data-anim style={d(0)}><i />Para quem é</div>
              <h2 data-anim style={d(1)}>Feito para quem opera <em>com público de verdade</em></h2>
              <div className="who">
                {PUBLICO.map((p, i) => (
                  <span className="wtag" data-anim style={d(2 + Math.floor(i / 2))} key={p}>{p}</span>
                ))}
              </div>
              <p className="foot-note" data-anim style={d(8)}>
                Do food park de fim de semana ao rodeio de vários dias: o mesmo sistema, na medida de cada operação.
              </p>
            </div>
          </section>

          <section className="sec" id="contato">
            <div className="wrap form-grid">
              <div>
                <div className="eyebrow" data-anim style={d(0)}><i />Contato</div>
                <h2 data-anim style={d(1)}>Vamos falar sobre <span className="g">o seu evento</span></h2>
                <p className="lead" data-anim style={d(2)}>
                  Conte o que você organiza e o tamanho esperado. A equipe responde em até 24 horas
                  com uma proposta de operação.
                </p>
                <div className="contact-alt">
                  <div className="calt" data-anim style={d(3)}>
                    <b><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></b>
                    WhatsApp (11) 5304-6659
                  </div>
                  <div className="calt" data-anim style={d(4)}>
                    <b><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" /></svg></b>
                    festpag.digital
                  </div>
                </div>
                <p className="foot-note" data-anim style={d(5)}>Atendemos eventos em todo o Brasil.</p>
              </div>

              <form className="card" data-anim="scale" onSubmit={handleSubmit} noValidate>
                {success ? (
                  <div className="ok-msg">
                    Recebemos seu contato!
                    <div className="ok-sub">Em breve nossa equipe vai falar com você.</div>
                  </div>
                ) : (
                  <>
                    <div className="field">
                      <label htmlFor="lp-nome">Nome</label>
                      <input id="lp-nome" type="text" placeholder="Seu nome completo" value={nome}
                        onChange={(e) => setNome(e.target.value)} disabled={submitting} autoComplete="name" />
                    </div>
                    <div className="field">
                      <label htmlFor="lp-cidade">Cidade</label>
                      <input id="lp-cidade" type="text" placeholder="Sua cidade" value={cidade}
                        onChange={(e) => setCidade(e.target.value)} disabled={submitting} autoComplete="address-level2" />
                    </div>
                    <div className="field">
                      <label htmlFor="lp-tipo">Tipo de evento</label>
                      <select id="lp-tipo" value={tipoEvento} onChange={(e) => setTipoEvento(e.target.value)} disabled={submitting}>
                        <option value="" disabled>Selecione o tipo de evento</option>
                        {TIPOS.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="lp-tel">Telefone para contato</label>
                      <input id="lp-tel" type="tel" placeholder="(00) 00000-0000" value={telefone}
                        onChange={(e) => setTelefone(maskPhone(e.target.value))} disabled={submitting} inputMode="tel" autoComplete="tel" />
                    </div>
                    <label className="consent">
                      <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
                      <span>
                        Autorizo a FestPag a usar meus dados para entrar em contato sobre a criação do
                        meu evento. Consulte a <a href="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.
                      </span>
                    </label>
                    <button type="submit" className="btn btn-p btn-lg" style={{ width: '100%', marginTop: 6 }} disabled={submitting || !aceite}>
                      {submitting ? 'Enviando...' : 'Quero uma proposta'}
                    </button>
                    {errorMsg && <div className="err-msg">{errorMsg}</div>}
                    <p className="form-note">Resposta em até 24 horas. Seus dados são usados apenas para esse contato.</p>
                  </>
                )}
              </form>
            </div>
            <div className="endfoot">FestPag.digital · Do ingresso ao último pedido, uma operação só.</div>
          </section>

        </main>
      </div>
    </>
  );
}

/* Conta os números de zero até o valor real quando a seção entra. */
function contar(sec: HTMLElement) {
  const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  sec.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    const fim = Number(el.dataset.count || 0);
    const pre = el.dataset.pre || '';
    const suf = el.dataset.suf || '';
    if (reduz) { el.textContent = pre + fim.toLocaleString('pt-BR') + suf; return; }
    let t0 = 0;
    const passo = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min((t - t0) / 1500, 1);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + Math.round(fim * e).toLocaleString('pt-BR') + suf;
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  });
}

/* Acende as etapas do "como funciona" em sequência, junto com o trilho. */
function acenderEtapas(sec: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  sec.querySelectorAll<HTMLElement>('.hstep').forEach((s, i) => {
    window.setTimeout(() => s.classList.add('hot'), 420 + i * 230);
  });
}
