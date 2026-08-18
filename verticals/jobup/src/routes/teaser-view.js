'use strict';

// =============================================================
// THE CONVERSION SURFACE (spec section 7).
//
// Eight screens, narrated by Ava (EN) or Dalia (ES) over the keyless Edge TTS
// route. One short segment per screen, prefetched one ahead, blob-cached in the
// client — the donor manuelstagg.com pattern, ported.
//
// Honesty is RENDERED, not merely asserted: an empty job pool prints the reason
// and shows nothing. Anything simulated wears a visible chip.
// =============================================================

const express = require('express');
const teaser = require('../services/teaser');
const router = express.Router();

const CSS = `
:root{--bg:#0a0a0e;--bg2:#101016;--card:#16161d;--card2:#1c1c24;
--line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.15);
--ink:#f5f5f7;--mut:#a6a9b4;--faint:#767a86;--cy:#22d3ee;--warn:#e6b45a;
--grad:linear-gradient(120deg,#5b7bff 0%,#e64980 52%,#ff922b 100%);
--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
--sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
--r:14px;--r-lg:22px;--r-xl:30px;--shadow:0 4px 14px rgba(0,0,0,.45),0 20px 50px rgba(0,0,0,.4)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);
line-height:1.55;letter-spacing:-.011em;-webkit-font-smoothing:antialiased;position:relative}
body::before{content:"";position:fixed;inset:0 0 auto 0;height:980px;z-index:0;pointer-events:none;
background:radial-gradient(58% 34% at 50% 20%,rgba(66,99,235,.42),transparent 68%),
radial-gradient(66% 40% at 50% 44%,rgba(230,73,128,.34),transparent 70%),
radial-gradient(78% 42% at 50% 68%,rgba(255,146,43,.26),transparent 74%);
filter:blur(30px);-webkit-mask-image:linear-gradient(180deg,#000 0%,#000 60%,transparent 100%);
mask-image:linear-gradient(180deg,#000 0%,#000 60%,transparent 100%)}
.wrap{position:relative;z-index:2;max-width:880px;margin:0 auto;padding:30px 20px 90px}
.orbbar{display:flex;gap:18px;align-items:center;background:rgba(22,22,29,.86);border:1px solid var(--line);
border-radius:var(--r-lg);padding:18px 20px;position:sticky;top:12px;z-index:20;backdrop-filter:blur(14px);box-shadow:var(--shadow)}
.orbwrap{position:relative;width:76px;height:76px;flex:0 0 76px;display:grid;place-items:center}
.orb{width:64px;height:64px;border-radius:50%;cursor:pointer;position:relative;z-index:2;
background:radial-gradient(circle at 38% 32%,#a5f3fc,#22d3ee 30%,#3b82f6 58%,#8b5cf6 80%,#ec4899 100%);
box-shadow:0 8px 32px rgba(34,211,238,.28);transition:transform .25s cubic-bezier(.34,1.56,.64,1);
animation:breathe 4.5s ease-in-out infinite}
.orb{cursor:default}
.orb.ready{cursor:pointer}
.orb.ready:hover{transform:scale(1.07)}
.orb::after{content:"";position:absolute;inset:0;border-radius:50%;
background:conic-gradient(from 0deg,transparent 0deg,rgba(255,255,255,.42) 60deg,transparent 130deg);
opacity:0;transition:opacity .3s}
.orb.speaking{animation:breathe 1.5s ease-in-out infinite}
.orb.speaking::after{opacity:1;animation:spin 2.6s linear infinite}
/* Rings only exist while speaking — an idle orb should be calm, not busy. */
.ring{position:absolute;inset:6px;border-radius:50%;border:2px solid rgba(34,211,238,.55);
opacity:0;pointer-events:none}
.orb.speaking ~ .ring{animation:ripple 2.1s ease-out infinite}
.orb.speaking ~ .ring.r2{animation-delay:.7s}
.orb.speaking ~ .ring.r3{animation-delay:1.4s}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.055)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes ripple{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.9);opacity:0}}
/* Level meter: shows the voice is actually running, not a frozen graphic. */
.bars{display:flex;gap:3px;align-items:flex-end;height:15px;margin-top:7px;opacity:0;transition:opacity .3s}
.bars.on{opacity:1}
.bars i{width:3px;background:linear-gradient(180deg,#22d3ee,#8b5cf6);border-radius:2px;height:20%;
animation:eq .9s ease-in-out infinite}
.bars i:nth-child(2){animation-delay:.12s}.bars i:nth-child(3){animation-delay:.24s}
.bars i:nth-child(4){animation-delay:.36s}.bars i:nth-child(5){animation-delay:.48s}
.bars i:nth-child(6){animation-delay:.6s}.bars i:nth-child(7){animation-delay:.72s}
@keyframes eq{0%,100%{height:18%}50%{height:100%}}
@media(prefers-reduced-motion:reduce){
  .orb,.orb.speaking,.orb.speaking::after,.orb.speaking ~ .ring,.bars i{animation:none}
  .orb.speaking{box-shadow:0 0 0 6px rgba(34,211,238,.25),0 8px 32px rgba(34,211,238,.28)}
}
.btn.nudge{animation:nudge 1.8s ease-in-out infinite}
@keyframes nudge{0%,100%{box-shadow:0 0 0 0 rgba(139,92,246,.55)}
50%{box-shadow:0 0 0 12px rgba(139,92,246,0)}}
@media(prefers-reduced-motion:reduce){.btn.nudge{animation:none;outline:2px solid rgba(139,92,246,.6)}}
.alwayson{background:rgba(34,211,238,.045);border:1px solid rgba(34,211,238,.22);
border-radius:15px;padding:16px 18px;margin:6px 0 14px}
.ao-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px}
.live{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:11px;
letter-spacing:.14em;color:#3ad07f}
.live i{width:7px;height:7px;border-radius:50%;background:#3ad07f;animation:blink 1.9s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(58,208,127,.6)}
50%{opacity:.55;box-shadow:0 0 0 6px rgba(58,208,127,0)}}
.ao-clock{font-family:var(--mono);font-size:12px;color:var(--cyan)}
.cycle{display:grid;gap:9px}
.cy{display:flex;gap:11px;align-items:flex-start;padding:9px 11px;border-radius:11px;
background:rgba(255,255,255,.02);border:1px solid transparent;transition:all .45s ease;opacity:.5}
.cy.on{opacity:1;background:rgba(34,211,238,.09);border-color:rgba(34,211,238,.3)}
.cy .dot{width:9px;height:9px;border-radius:50%;background:var(--faint);margin-top:6px;
flex:0 0 9px;transition:all .45s ease}
.cy.on .dot{background:var(--cyan);box-shadow:0 0 10px rgba(34,211,238,.85)}
.cy strong{font-size:14.5px}
.ao-note{color:var(--faint);font-size:12.5px;font-family:var(--mono);line-height:1.6;margin-top:13px}
@media(prefers-reduced-motion:reduce){.live i{animation:none}.cy{opacity:1}}
.seg{font-family:var(--mono);font-size:11.5px;color:var(--faint);margin-left:10px}
.obtitle{font-weight:780;letter-spacing:-.02em}
.obstat{color:var(--mut);font-size:13.5px;min-height:20px;font-family:var(--mono)}
.btn{border:1px solid var(--line2);background:transparent;color:var(--ink);border-radius:999px;
padding:9px 18px;font:inherit;font-size:14px;cursor:pointer;margin-right:8px;transition:all .15s ease}
.btn:hover{border-color:var(--cy);color:var(--cy)}
.btn.primary{background:var(--grad);color:#fff;font-weight:750;border:0;box-shadow:var(--shadow)}
.btn.primary:hover{transform:translateY(-2px);color:#fff}
.btn:disabled{opacity:.4;cursor:default;transform:none}
.screen{background:var(--card);border:1px solid var(--line);border-radius:var(--r-xl);padding:28px;margin:22px 0;
opacity:.5;transition:opacity .35s ease,border-color .35s ease,transform .35s ease}
.screen.active{opacity:1;border-color:var(--line2);transform:translateY(-2px)}
.screen h2{margin:0 0 6px;font-size:23px;font-weight:790;letter-spacing:-.03em}
.screen .num{color:var(--faint);font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-family:var(--mono);margin-bottom:8px}
.chip{display:inline-block;background:var(--card2);border:1px solid var(--line);border-radius:999px;
padding:5px 12px;font-size:13px;margin:4px 6px 0 0;font-family:var(--mono)}
.chip.sim{border-color:rgba(230,180,90,.4);color:var(--warn);background:rgba(230,180,90,.1)}
.job{border-top:1px solid var(--line);padding:15px 0}
.job:first-of-type{border-top:0}
.job .t{font-weight:700}.job .m{color:var(--mut);font-size:14px}
.score{float:right;font-weight:830;font-size:19px;background:var(--grad);
-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.empty{border:1px dashed var(--line2);border-radius:var(--r);padding:20px;color:var(--mut)}
pre{background:#0d0d13;border:1px solid var(--line);border-radius:var(--r);padding:15px;overflow:auto;
font-size:12.5px;max-height:280px;font-family:var(--mono);color:var(--mut)}
.price{font-size:56px;font-weight:830;letter-spacing:-.045em}
ul.inc{list-style:none;padding:0;margin:14px 0}
ul.inc li{padding:6px 0 6px 24px;position:relative;color:var(--mut);font-size:14.5px}
ul.inc li:before{content:"";position:absolute;left:2px;top:14px;width:8px;height:8px;border-radius:50%;background:var(--grad)}
.note{color:var(--faint);font-size:13px;margin-top:12px;font-family:var(--mono);line-height:1.6}
.preview{position:relative;border:1px solid var(--line2);border-radius:var(--r-lg);overflow:hidden;
background:#07080c;height:440px;box-shadow:var(--shadow)}
.preview iframe{width:200%;height:880px;border:0;transform:scale(.5);transform-origin:0 0;display:block}
.preview::after{content:"";position:absolute;inset:0;pointer-events:none;
box-shadow:inset 0 -50px 60px -30px rgba(7,8,12,.9)}
@media(max-width:600px){.preview{height:330px}.preview iframe{width:250%;height:1000px;transform:scale(.4)}}
.pclockbig{font-size:clamp(40px,9vw,66px);font-weight:830;letter-spacing:-.04em;line-height:1;
font-variant-numeric:tabular-nums;background:linear-gradient(120deg,#22d3ee,#6366f1 55%,#8b5cf6);
-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:6px}
.pclockbig.over{background:linear-gradient(120deg,#e6b45a,#f0a04b);-webkit-background-clip:text;
background-clip:text;-webkit-text-fill-color:transparent;font-size:clamp(20px,4.4vw,30px)}
.pcaption{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;
color:var(--faint);margin-bottom:20px}
.pbar{height:6px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;
max-width:420px;margin:0 auto 16px}
.pbar i{display:block;height:100%;width:0%;border-radius:99px;
background:linear-gradient(90deg,#22d3ee,#6366f1,#8b5cf6);transition:width .6s cubic-bezier(.4,0,.2,1)}
.pstage{font-size:15.5px;color:var(--ink);margin-bottom:7px}
.pmeta{display:flex;gap:14px;justify-content:center;font-family:var(--mono);
font-size:12px;color:var(--faint);flex-wrap:wrap}
.pmeta .over{color:var(--cyan)}
.loading{text-align:center;padding:80px 0;color:var(--mut);font-family:var(--mono)}
@media(max-width:600px){.orbbar{flex-direction:column;text-align:center}.wrap{padding:16px 14px 70px}}

/* ===== SUBSCRIBE FROM WHEREVER YOU ARE ==============================
   This preview is eight screens long, and it used to carry exactly one
   button, at the bottom of the last one. A visitor who had decided by
   screen two had no way to act on it, and a visitor on a phone had to
   scroll past a 440px site preview, a JSON block and a code sample to
   find the thing they came to press. Somebody genuinely gave up.

   So the CTA now exists in four places that all call the SAME function:
   a strip above the fold, a strip at the halfway mark, the full pitch on
   screen 8, and a bar pinned to the bottom of the viewport that never
   scrolls away. Four buttons, one code path — there is no arrangement of
   clicks that reaches a different checkout.                            */
.ctastrip{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;
background:linear-gradient(135deg,rgba(91,123,255,.16),rgba(230,73,128,.10) 60%,rgba(255,146,43,.08));
border:1px solid var(--line2);border-radius:var(--r-lg);padding:18px 20px;margin:20px 0;
box-shadow:var(--shadow)}
.ctastrip .cs-price{font-size:27px;font-weight:830;letter-spacing:-.035em;line-height:1.15}
.ctastrip .cs-price em{font-style:normal;font-size:14px;font-weight:500;color:var(--mut);letter-spacing:0}
.ctastrip .cs-sub{color:var(--mut);font-size:13.5px;margin-top:3px;max-width:46ch}
.ctastrip .btn{margin-right:0;white-space:nowrap;font-size:15.5px;padding:13px 24px;min-height:50px}
@media(max-width:620px){.ctastrip{flex-direction:column;align-items:stretch;text-align:center}
.ctastrip .cs-sub{max-width:none}.ctastrip .btn{width:100%}}

/* The bar that never scrolls away. It slides in once the preview is real
   — never while the build is still running, because there is nothing to
   buy yet — and slides out again when the full CTA on screen 8 is on
   screen, so you are never shown the same button twice at once. */
.stickybuy{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;
gap:14px;align-items:center;justify-content:space-between;
background:rgba(14,14,19,.95);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
border-top:1px solid var(--line2);
padding:11px 18px calc(11px + env(safe-area-inset-bottom));
box-shadow:0 -10px 34px rgba(0,0,0,.55);
transform:translateY(135%);pointer-events:none;
transition:transform .32s cubic-bezier(.4,0,.2,1)}
.stickybuy.on{transform:translateY(0);pointer-events:auto}
.sb-left{min-width:0}
.sb-price{font-weight:820;font-size:17.5px;letter-spacing:-.025em;white-space:nowrap}
.sb-price em{font-style:normal;font-weight:500;font-size:12.5px;color:var(--mut)}
.sb-note{font-family:var(--mono);font-size:11px;color:var(--faint);line-height:1.5;
overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stickybuy .btn{margin-right:0;white-space:nowrap;font-size:15px;padding:12px 22px;min-height:48px}
@media(max-width:430px){.sb-note{display:none}.stickybuy{padding-left:14px;padding-right:14px}
.stickybuy .btn{padding:12px 16px;font-size:14.5px}}
@media(prefers-reduced-motion:reduce){.stickybuy{transition:none}}
/* Room for the bar, added once and never removed, so hiding it on screen 8
   does not shift the page under the reader's thumb. */
body.hasbuy .wrap{padding-bottom:150px}

/* Errors land next to the eye, not at the bottom of screen 8. A person who
   pressed the button at the top would never have seen the old message. */
.toast{position:fixed;left:50%;top:14px;transform:translate(-50%,-160%);z-index:80;
max-width:min(560px,calc(100vw - 28px));background:rgba(35,18,24,.97);
border:1px solid rgba(248,113,113,.5);color:#ffc9c9;border-radius:14px;
padding:13px 18px;font-size:14px;line-height:1.5;box-shadow:var(--shadow);
transition:transform .28s cubic-bezier(.4,0,.2,1)}
.toast.on{transform:translate(-50%,0)}
/* Stripe test mode. The checkout that follows is pixel-identical to the real
   one and takes no money, so every place that offers it says so. */
.testchip{display:inline-block;background:rgba(230,180,90,.14);border:1px solid rgba(230,180,90,.45);
color:#f0d5a6;border-radius:999px;padding:4px 11px;font-family:var(--mono);font-size:11px;
letter-spacing:.08em;text-transform:uppercase;margin-bottom:9px}
.sb-note.test{color:#f0d5a6}
@media(prefers-reduced-motion:reduce){.toast{transition:none}}
`;


/**
 * Live preview of the subscriber's actual site, rendered from the teaser's own
 * extracted profile. Screen 1 embeds this — so the visitor is looking at the
 * REAL template, not a mock-up of it.
 */
router.get('/:token/site', async (req, res) => {
  const row = await teaser.get(req.params.token);
  if (!row || row.status !== 'ready' || !row.payload) {
    return res.status(404).type('text/plain').send('Preview not ready.');
  }
  const siteRender = require('../services/site-render');
  const settingsSvc = require('../services/settings');
  const site = row.payload.screens && row.payload.screens.site;
  const profile = (site && site.profile) || {};
  const addr = (row.payload.screens && row.payload.screens.address) || {};
  const url = addr.url || 'https://' + (row.address_offer || 'you.jobup.dev');
  // Preview shows the profile as the SUBSCRIBER would publish it, so contact
  // fields are opted in here. The live site still honours their own settings.
  const settings = settingsSvc.sanitize({ privacy: { email: true, phone: true, location: true } });
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.type('html').send(siteRender.page(profile, settings,
    { name: profile.name || row.name, url, slug: 'preview' }));
});

router.get('/:token', async (req, res) => {
  const row = await teaser.get(req.params.token);
  if (!row) return res.status(404).type('text/plain').send('Teaser not found.');

  const lang = row.language === 'es' ? 'es' : 'en';

  res.type('html').send(`<!doctype html><html lang="${lang}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Your JobUp ecosystem</title><style>${CSS}</style></head><body><div class="wrap">

<div class="orbbar">
  <div class="orbwrap">
    <div class="orb" id="orb" title="Building your preview" role="img" tabindex="-1"
         aria-label="Building your preview"></div>
    <span class="ring r1"></span><span class="ring r2"></span><span class="ring r3"></span>
  </div>
  <div style="flex:1">
    <div class="obtitle">${lang === 'es' ? 'Dalia' : 'Ava'} &mdash; JobUp</div>
    <div class="obstat" id="stat">Building your ecosystem&hellip;</div>
    <!-- THE VOICE CANNOT BE OFFERED BEFORE THERE IS ANYTHING TO NARRATE.
         While the resume is being read this row was already showing "Play the
         walkthrough", so people pressed it, nothing happened, and the wait
         read as a broken page. It is revealed by render(). -->
    <div style="margin-top:10px;display:none" id="voicerow">
      <button class="btn primary" id="play">Play the walkthrough</button>
      <button class="btn" id="stop" disabled>Stop</button>
      <span class="seg" id="seg"></span>
    </div>
    <div class="bars" id="bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
  </div>
</div>

<div id="body"><div class="loading" id="prog">
  <div class="pclockbig" id="pclockbig">&mdash;</div>
  <div class="pcaption" id="pcaption">${lang === 'es' ? 'tiempo restante aproximado' : 'estimated time remaining'}</div>
  <div class="pbar"><i id="pfill"></i></div>
  <div class="pstage" id="pstage">${lang === 'es' ? 'Construyendo tu ecosistema' : 'Building your ecosystem'}&hellip;</div>
  <div class="pmeta"><span id="pstep"></span><span id="ppct"></span></div>
</div></div>
</div>

<!-- Pinned to the viewport, filled in and revealed only once the preview is
     really ready. Before that it sits off-screen with pointer-events off. -->
<div class="stickybuy" id="stickybuy" aria-hidden="true">
  <div class="sb-left">
    <div class="sb-price" id="sb-price"></div>
    <div class="sb-note" id="sb-note"></div>
  </div>
  <button class="btn primary cta" id="sb-btn" data-cta="sticky" type="button"></button>
</div>
<div class="toast" id="toast" role="alert" aria-live="assertive"></div>

<script>
var API_BASE=(location.hostname.endsWith('jobup.dev')?'':'/jobup');
var TOKEN=${JSON.stringify(req.params.token)};
var VOICE=${JSON.stringify(lang === 'es' ? 'dalia' : 'ava')};
// TEST MODE IS LIVE SERVER STATE, NOT A PROPERTY OF THIS PREVIEW.
//
// The payload is built once and stored, so a teaser created before the switch
// carries no test_mode and would offer a $59 button with nothing saying the
// card is never charged. Which Stripe account the NEXT click will hit is known
// only now, at render time, so it is injected rather than read back out of a
// row that was frozen days ago.
var TEST_MODE=${JSON.stringify(require('../services/billing').isTestMode())};
var LANG=${JSON.stringify(lang)};
var payload=null,narration=[];

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

// Poll until the background build finishes (Cloudflare ~100s ceiling).
var T=LANG==='es'
  ? {step:'Paso',of:'de',left:'restante',over:'Tardando mas de lo normal \u2014 seguimos trabajando',
     elapsed:'transcurrido',remaining:'tiempo restante aproximado',almost:'Casi listo',
     // --- the subscribe controls -------------------------------------
     ctaPaid:'Crear mi ecosistema', ctaFree:'Crear mi cuenta',
     perYear:' / a\u00f1o', freePrice:'Gratis mientras estamos en vista previa',
     topSub:'Todo lo que sigue se construy\u00f3 a partir de tu hoja de vida. '+
            'Puedes crear tu cuenta desde aqu\u00ed, desde la mitad o desde el final.',
     midHead:'\u00bfYa lo tienes claro?',
     sbNotePaid:'Pago seguro, luego tu contrase\u00f1a y qu\u00e9 deben buscar tus agentes.',
     sbNoteFree:'Sin pago. Solo tu contrase\u00f1a y qu\u00e9 deben buscar tus agentes.',
     opening:'Abriendo\u2026',
     testChip:'Modo de prueba', testNote:'Modo de prueba: no se cobra ninguna tarjeta.',
     ctaFail:'No pudimos abrir el siguiente paso. Int\u00e9ntalo de nuevo.'}
  : {step:'Step',of:'of',left:'left',over:'Taking longer than usual \u2014 still working',
     elapsed:'elapsed',remaining:'estimated time remaining',almost:'Almost there',
     ctaPaid:'Build my ecosystem', ctaFree:'Build my account',
     perYear:' / year', freePrice:'Free while we are in preview',
     topSub:'Everything below was built from your resume. '+
            'You can create your account from here, from the middle, or from the end.',
     midHead:'Seen enough?',
     sbNotePaid:'Secure checkout, then your password and what your agents should hunt for.',
     sbNoteFree:'No payment. Just your password and what your agents should hunt for.',
     opening:'Opening\u2026',
     testChip:'Test mode', testNote:'Test mode \u2014 no card is charged.',
     ctaFail:'We could not open the next step. Please try again.'};

function mmss(ms){
  var s=Math.max(0,Math.round(ms/1000));
  return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
}

// Real progress: the stage the build has actually reached, plus a countdown
// against the typical duration. When it runs long we say so rather than
// letting a bar sit at 99% pretending.
function showProgress(pr){
  if(!pr) return;
  var el=document.getElementById('pfill'); if(!el) return;
  var byStage=pr.total?(pr.n/pr.total):0;
  var byTime=pr.typical_ms?Math.min(pr.elapsed_ms/pr.typical_ms,1):0;
  // Never let the bar exceed what the stages actually justify by much, and
  // never let it hit 100% before the payload is really here.
  var pct=Math.min(96,Math.round(Math.max(byStage,byTime*0.9)*100));
  el.style.width=pct+'%';
  if(pr.label) document.getElementById('pstage').textContent=pr.label+'\u2026';
  document.getElementById('pstep').textContent=pr.n?(T.step+' '+pr.n+' '+T.of+' '+pr.total):'';
  var left=(pr.typical_ms||0)-(pr.elapsed_ms||0);
  var big=document.getElementById('pclockbig'),cap=document.getElementById('pcaption');
  var pctEl=document.getElementById('ppct');
  if(pctEl)pctEl.textContent=pct+'%';
  if(left>1000){
    big.className='pclockbig'; big.textContent=mmss(left);
    cap.textContent=T.remaining;
  }else{
    // Never freeze on 0:00 pretending — say plainly that it is running long.
    big.className='pclockbig over'; big.textContent=T.over;
    cap.textContent=mmss(pr.elapsed_ms)+' '+T.elapsed;
  }
  var st=document.getElementById('stat');
  if(st) st.textContent=(pr.label||'Building your ecosystem')+'\u2026';
}

// The poll returns every ~1.2s; tick locally in between so the countdown
// actually counts rather than stepping.
var _pr=null,_prAt=0;
setInterval(function(){
  if(!_pr)return;
  showProgress({stage:_pr.stage,label:_pr.label,n:_pr.n,total:_pr.total,
    typical_ms:_pr.typical_ms,elapsed_ms:_pr.elapsed_ms+(Date.now()-_prAt)});
},1000);

function poll(){
  fetch(API_BASE+'/api/v1/intake/teaser/'+encodeURIComponent(TOKEN))
    .then(function(r){return r.json();}).then(function(j){
    if(j.status==='pending'){_pr=j.progress;_prAt=Date.now();showProgress(j.progress);setTimeout(poll,1200);return;}
    if(j.status!=='ready'||!j.payload){
      document.getElementById('body').innerHTML=
        '<div class="screen active"><h2>We could not finish this preview</h2>'+
        '<p class="note">Nothing was fabricated to fill the gap. Please try again.</p></div>';
      document.getElementById('stat').textContent='Build failed.';return;}
    // Finish the bar before swapping the content in.
    _pr=null;
    var f=document.getElementById('pfill'); if(f)f.style.width='100%';
    payload=j.payload;narration=j.narration||[];
    try{ render(); }
    catch(err){
      // A render fault is NOT a network blip. Retrying it forever would leave
      // the visitor staring at "Building..." while the data was ready all along.
      console.error('[teaser] render failed:',err);
      document.getElementById('body').innerHTML=
        '<div class="screen active"><h2>Your preview is ready but did not draw</h2>'+
        '<p class="note">The data is fine. Reload this page and it should appear.</p>'+
        '<p class="note">'+esc(String(err&&err.message||err))+'</p></div>';
      document.getElementById('stat').textContent='Display error.';
    }
  }).catch(function(e){
    // Only reached for genuine transport/JSON failures now.
    setTimeout(poll,2500);
  });
}

function render(){
  var s=payload.screens,h='';
  function open(n,title,sub){return '<div class="screen" id="sc'+n+'"><div class="num">Screen '+n+' of 8</div>'+
    '<h2>'+esc(title)+'</h2>'+(sub?'<p class="note">'+esc(sub)+'</p>':'');}

  // The CTA is resolved ONCE, here, and every one of the four buttons is drawn
  // from these three values. A price that appeared on one button and not
  // another would be the worst possible bug in this file.
  var c=(s.cta)||{price_usd:null,includes:[],non_renewal:''};
  var CTA_LABEL=c.price_usd?T.ctaPaid:T.ctaFree;
  var PRICE_HTML=c.price_usd
    ? '$'+c.price_usd+'<em>'+T.perYear+'</em>'
    : T.freePrice;
  var SB_NOTE=c.price_usd?T.sbNotePaid:T.sbNoteFree;

  var TEST=TEST_MODE||Boolean(c.test_mode);
  var TEST_CHIP=TEST?'<div class="testchip">'+esc(T.testChip)+'</div>':'';

  function strip(where,head,sub){
    return '<div class="ctastrip"><div>'+TEST_CHIP+'<div class="cs-price">'+
      (head||PRICE_HTML)+'</div><div class="cs-sub">'+esc(sub||'')+'</div></div>'+
      '<button class="btn primary cta" type="button" data-cta="'+where+'">'+
      esc(CTA_LABEL)+'</button></div>';
  }

  // TOP — above the fold, before a single screen has been scrolled past.
  h+=strip('top',null,T.topSub);

  var p=(s.site&&s.site.profile)||{};
  h+=open(1,'Your personal site','This is the real page, rendered from your resume — not a mock-up.');
  h+='<div class="preview"><iframe src="'+API_BASE+'/teaser/'+encodeURIComponent(TOKEN)+'/site" '+
     'title="Preview of your personal site" loading="lazy"></iframe></div>';
  h+='<div style="margin-top:12px"><span class="chip">'+esc(s.address&&s.address.address||'your address')+'</span>'+
     ((p.skills||[]).length?'<span class="chip">'+p.skills.length+' skills</span>':'')+
     ((p.experience||[]).length?'<span class="chip">'+p.experience.length+' roles</span>':'')+'</div>';
  if(s.site&&s.site.is_simulated)h+='<div class="chip sim">structured without a language model</div>';
  h+='</div>';

  h+=open(2,'Your web address');
  h+= (s.address&&s.address.available)
    ? '<div style="font-size:22px;font-weight:700;color:var(--cy)">'+esc(s.address.address)+'</div>'+
      '<p class="note">'+(s.address.exact_match?'Your exact name is available.':'Your exact name was taken, so this is the next rung of the ladder.')+'</p>'
    : '<div class="empty">'+esc((s.address&&s.address.reason)||'No address available.')+'</div>';
  h+='</div>';

  h+=open(3,'Jobs that match you right now');
  var m=s.matches||{items:[],pool_available:false};
  if(!m.pool_available||!m.items.length){
    h+='<div class="empty"><strong>No openings shown.</strong><br>'+
       'We could not reach the live job pool for this preview. We show you nothing rather than invent a listing, a company or a salary.</div>';
  }else{
    h+= m.items.map(function(j){
      return '<div class="job"><span class="score">'+j.score+'</span>'+
        '<div class="t">'+esc(j.title)+'</div>'+
        '<div class="m">'+esc(j.employer||'')+(j.location?' &middot; '+esc(j.location):'')+'</div>'+
        (j.explanation?'<div class="m" style="margin-top:6px">'+esc(j.explanation)+'</div>':'')+
        (j.compensation?'<div class="m">Compensation as stated by the posting: '+esc(j.compensation)+'</div>':'')+
        ((j.missing||[]).length?'<div style="margin-top:6px">'+j.missing.slice(0,4).map(function(x){
          return '<span class="chip">missing: '+esc(x)+'</span>';}).join('')+'</div>':'')+
        (j.is_simulated?'<div class="chip sim">heuristic score</div>':'')+'</div>';
    }).join('');
    h+='<p class="note">Every score above came from actually scoring that posting against your resume.</p>';
  }
  h+='</div>';

  h+=open(4,'Your resume, tailored to one of them');
  if(s.tailored){
    h+='<p class="note">Tailored for <strong>'+esc(s.tailored.job_title)+'</strong> at '+esc(s.tailored.employer)+'</p>';
    if((s.tailored.changes||[]).length)
      h+='<ul class="inc">'+s.tailored.changes.slice(0,6).map(function(c){return '<li>'+esc(c)+'</li>';}).join('')+'</ul>';
    if((s.tailored.flagged||[]).length)
      h+='<div class="chip sim">'+s.tailored.flagged.length+' term(s) flagged for your confirmation &mdash; nothing is added that you did not write</div>';
    if(s.tailored.is_simulated)
      h+='<div class="chip sim">returned unchanged &mdash; no language model configured</div>';
    if(s.tailored.preview)h+='<pre>'+esc(s.tailored.preview)+'</pre>';
  }else{
    h+='<div class="empty">No tailored version in this preview &mdash; there was no matched posting to tailor against.</div>';
  }
  h+='</div>';

  // MIDDLE — the halfway mark. Four screens is where most people have made up
  // their mind; the honest renewal terms ride along so the decision is informed
  // rather than merely convenient.
  h+=strip('middle',T.midHead,c.non_renewal||'');

  h+=open(5,'Your AI-readable identity',
    'This is what a recruiting system, a search engine or an AI assistant reads when it looks you up.');
  h+='<pre>'+esc(JSON.stringify((s.identity||{}).json_ld||{},null,2))+'</pre>';
  h+='<div><span class="chip">resume.json</span><span class="chip">JSON-LD</span>'+
     '<span class="chip">agent card</span><span class="chip">llms.txt</span></div></div>';

  h+=open(6,'Your two agents','They run around the clock, whether or not you are looking. They find and check \u2014 they never act for you.');
  h+='<div class="alwayson">'+
       '<div class="ao-head"><span class="live"><i></i>ALWAYS ON</span>'+
       '<span class="ao-clock" id="ao-clock">24 / 7</span></div>'+
       '<div class="cycle">'+
         '<div class="cy" data-k="0"><span class="dot"></span><div><strong>Searching</strong>'+
           '<div class="m">Approved job boards, every day</div></div></div>'+
         '<div class="cy" data-k="1"><span class="dot"></span><div><strong>Scoring</strong>'+
           '<div class="m">Each opening against your resume</div></div></div>'+
         '<div class="cy" data-k="2"><span class="dot"></span><div><strong>Explaining</strong>'+
           '<div class="m">Why it fits, and what you are missing</div></div></div>'+
         '<div class="cy" data-k="3"><span class="dot"></span><div><strong>Waiting for you</strong>'+
           '<div class="m">You decide what is worth pursuing</div></div></div>'+
       '</div>'+
       '<div class="ao-note">This is the loop, not a recording of results. '+
         'Real openings appear in your dashboard as the Hunter finds them &mdash; '+
         'and only real ones.</div>'+
     '</div>';
  h+=(s.agents||[]).map(function(a){
    return '<div class="job"><div class="t">'+esc(a.name)+'</div><div class="m">'+esc(a.does)+'</div></div>';}).join('');
  h+='</div>';

  h+=open(7,'Your private dashboard',
    'Matches, pipeline, tailored resumes, outreach awaiting your approval, agent activity and a full export &mdash; visible only to you.');
  h+='<div><span class="chip">'+m.items.length+' matches</span>'+
     '<span class="chip">pipeline</span><span class="chip">tailoring</span>'+
     '<span class="chip">approvals</span><span class="chip">export</span></div></div>';

  h+=open(8,c.headline||'Build my ecosystem');
  h+=TEST_CHIP;
  // A price is shown only when there is one. With payment switched off the
  // block would otherwise read "$null / year".
  if(c.price_usd)
    h+='<div class="price">$'+c.price_usd+'<span style="font-size:17px;color:var(--mut)">'+T.perYear+'</span></div>';
  else
    h+='<div class="price" style="font-size:26px">'+esc(T.freePrice)+'</div>';
  h+='<ul class="inc">'+(c.includes||[]).map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul>';
  // BOTTOM \u2014 the full pitch. Same class, same handler as the other three.
  h+='<button class="btn primary cta" id="buy" type="button" data-cta="bottom" '+
     'style="font-size:16px;padding:13px 26px">'+esc(CTA_LABEL)+'</button>';
  h+='<p class="note">'+esc(c.non_renewal||'')+'</p>';
  h+='<p class="note">JobUp never applies on your behalf. You review and submit every application yourself.</p>';
  h+='<div id="buyout" class="note"></div></div>';

  document.getElementById('body').innerHTML=h;
  document.getElementById('stat').textContent='Ready \u2014 press play and I will walk you through it.';
  try{window.dispatchEvent(new Event('jobup:ready'));}catch(e){}

  // The pinned bar carries the same label and the same price as the rest.
  var sb=document.getElementById('stickybuy');
  document.getElementById('sb-price').innerHTML=PRICE_HTML;
  var sbn=document.getElementById('sb-note');
  sbn.textContent=TEST?T.testNote:SB_NOTE;
  sbn.className='sb-note'+(TEST?' test':'');
  document.getElementById('sb-btn').textContent=CTA_LABEL;

  // ONE handler for all four. Attached by class, so a button added later
  // cannot accidentally be wired to something else.
  var all=document.querySelectorAll('.cta');
  for(var q=0;q<all.length;q++) all[q].addEventListener('click',checkout);

  // Now — and only now — the voice is real: there is a payload and narration.
  var vr=document.getElementById('voicerow');
  if(vr) vr.style.display='';
  var orbEl=document.getElementById('orb');
  if(orbEl){
    orbEl.setAttribute('role','button');
    orbEl.setAttribute('tabindex','0');
    orbEl.setAttribute('aria-label','Play the walkthrough');
    orbEl.title='Play the walkthrough';
    orbEl.classList.add('ready');
  }

  showStickyBuy(sb);
  startAlwaysOn();
}

/**
 * Reveal the pinned bar, then keep it out of the way of the real thing: while
 * the screen-8 button is actually on screen there is no reason to show a second
 * copy of it directly underneath.
 */
function showStickyBuy(sb){
  if(!sb)return;
  document.body.classList.add('hasbuy');
  function on(v){
    sb.classList.toggle('on',v);
    sb.setAttribute('aria-hidden',v?'false':'true');
  }
  on(true);
  var target=document.getElementById('buy');
  if(!target||!('IntersectionObserver' in window))return;   // no observer: leave it up
  try{
    new IntersectionObserver(function(entries){
      for(var i=0;i<entries.length;i++) on(!entries[i].isIntersecting);
    },{threshold:0.55}).observe(target);
  }catch(e){/* the bar simply stays visible */}
}

function toast(msg){
  var t=document.getElementById('toast');
  if(!t){alert(msg);return;}
  t.textContent=msg; t.classList.add('on');
  clearTimeout(toast._t);
  toast._t=setTimeout(function(){t.classList.remove('on');},7000);
}

// The always-on loop: steps through Searching -> Scoring -> Tailoring ->
// Drafting for as long as the page is open, so "around the clock" is shown
// rather than merely claimed. It illustrates the CYCLE — it never invents a
// posting, a company or a score.
function startAlwaysOn(){
  var cys=document.querySelectorAll('.cy'); if(!cys.length)return;
  var k=0;
  function step(){
    for(var i=0;i<cys.length;i++)cys[i].classList.toggle('on',i===k);
    k=(k+1)%cys.length;
  }
  step(); setInterval(step,1700);

  var clock=document.getElementById('ao-clock');
  if(clock) setInterval(function(){
    var d=new Date();
    clock.textContent='24 / 7  \u00b7  '+
      String(d.getHours()).padStart(2,'0')+':'+
      String(d.getMinutes()).padStart(2,'0')+':'+
      String(d.getSeconds()).padStart(2,'0');
  },1000);
}

// The CTA opens the account form, not a checkout.
//
// With the payment layer switched off, the next step is /build?t=<token> —
// choose a password, tell the agents what to hunt for. If billing is ever
// switched back on, the same button asks the server first and follows whatever
// it is told, so this page needs no second edit.
var CTA_BUSY=false;

/**
 * Every subscribe button on the page ends up here. They are locked together
 * while a checkout is opening: four buttons that each mint their own Stripe
 * session would be four sessions for one person, and a second tap while the
 * first request is in flight is the most likely way to do it.
 */
function ctaBusy(on){
  CTA_BUSY=on;
  var all=document.querySelectorAll('.cta');
  for(var i=0;i<all.length;i++){
    var b=all[i];
    b.disabled=on;
    if(on){ if(!b.getAttribute('data-label')) b.setAttribute('data-label',b.textContent);
            b.textContent=T.opening; }
    else if(b.getAttribute('data-label')) b.textContent=b.getAttribute('data-label');
  }
}

function chosenPlan(){ try{ return localStorage.getItem('jobup_plan')||''; }catch(e){ return ''; } }

function checkout(){
  if(CTA_BUSY)return;
  // If they arrived without picking a tier (from "Attach my resume"), OFFER THE
  // PLANS first — the pricing selection must happen before any Stripe step.
  if(!chosenPlan()){ showPlanPicker(); return; }
  doCheckout();
}

function doCheckout(){
  if(CTA_BUSY)return;
  var out=document.getElementById('buyout');
  if(out) out.textContent=T.opening;
  ctaBusy(true);
  fetch(API_BASE+'/api/v1/billing/checkout',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({teaser_token:TOKEN, plan:chosenPlan()})})
    .then(function(r){return r.json();}).then(function(j){
      if(j.build_url){location.href=j.build_url;return;}   // no payment: straight to the form
      if(j.url){location.href=j.url;return;}               // Stripe, when enabled
      ctaBusy(false);
      var msg=j.error||T.ctaFail;
      if(out) out.textContent=msg;
      toast(msg);
    }).catch(function(){
      // The form is the destination either way — a failed status call must not
      // strand somebody who has already decided to sign up.
      location.href=API_BASE+'/build?t='+encodeURIComponent(TOKEN);
    });
}

// The plan picker — three tiers, shown before checkout when none was pre-chosen.
function showPlanPicker(){
  if(document.getElementById('planpick')) return;
  var es=(LANG==='es');
  var PLANS=[
    {id:'free',name:'Free',price:'$0',sub:es?'La superficie de crecimiento':'The growth surface',
      feats:es?['Sitio de CV publico','5 coincidencias por semana','Eva (solo lectura)']:['Public CV site','5 matches a week','Eva chat (read-only)'],cls:'ghost'},
    {id:'search',name:'Search',price:'$29'+(es?'/mes':'/mo'),sub:es?'Para quien busca activamente':'For someone actively looking',pop:true,
      feats:es?['Coincidencias ilimitadas','40 evaluaciones al dia','10 curriculos al mes','Contacto y pipeline']:['Unlimited matches','40 scorings a day','10 tailored resumes a month','Outreach and pipeline'],cls:'solid'},
    {id:'landed',name:'Landed',price:'$99'+(es?'/mes':'/mo'),sub:es?'Para roles senior y urgentes':'For senior and urgent searches',
      feats:es?['Adaptacion ilimitada','Evaluacion prioritaria','Preparacion de entrevista','Una revision humana al mes']:['Unlimited tailoring','Priority scoring','Interview prep','One human review a month'],cls:'ghost'}
  ];
  function card(p){
    return '<div style="background:linear-gradient(180deg,#12141c,#0e0f15);border:1px solid '+(p.pop?'#22d3ee':'rgba(255,255,255,.12)')+';border-radius:16px;padding:20px;width:250px;display:flex;flex-direction:column;text-align:left">'
      +'<div style="font-size:19px;font-weight:800;color:#f2f4f8">'+p.name+(p.pop?' <span style="font-size:10px;font-weight:800;background:#22d3ee;color:#04120c;border-radius:999px;padding:2px 8px;vertical-align:middle">POPULAR</span>':'')+'</div>'
      +'<div style="color:#9aa3b2;font-size:12.5px;min-height:32px">'+p.sub+'</div>'
      +'<div style="font-size:30px;font-weight:800;color:#fff;margin:6px 0">'+p.price+'</div>'
      +'<ul style="list-style:none;padding:0;margin:10px 0;flex:1">'+p.feats.map(function(f){return '<li style="font-size:13px;color:#cfd6e4;padding:4px 0 4px 16px;position:relative"><span style="position:absolute;left:0;top:8px;width:9px;height:9px;border-radius:50%;background:rgba(52,211,153,.2);border:1px solid rgba(52,211,153,.5)"></span>'+f+'</li>';}).join('')+'</ul>'
      +'<button data-pick="'+p.id+'" style="border:0;border-radius:10px;padding:11px;font-weight:800;font-size:14px;cursor:pointer;'+(p.cls==='solid'?'background:linear-gradient(135deg,#4ade80,#22d3ee);color:#04120c':'background:transparent;border:1px solid rgba(255,255,255,.18);color:#f2f4f8')+'">'+(es?'Elegir ':'Choose ')+p.name+'</button>'
      +'</div>';
  }
  var ov=document.createElement('div'); ov.id='planpick';
  ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(5,6,10,.86);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
  ov.innerHTML='<div style="max-width:860px;width:100%">'
    +'<div style="text-align:center;margin-bottom:16px"><div style="font-size:22px;font-weight:800;color:#fff">'+(es?'Elige tu plan':'Choose your plan')+'</div>'
    +'<div style="color:#9aa3b2;font-size:14px">'+(es?'Cambia, baja o pausa cuando quieras. Tu sitio de CV siempre sigue activo.':'Change, downgrade or pause anytime. Your CV site always stays live.')+'</div></div>'
    +'<div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap">'+PLANS.map(card).join('')+'</div>'
    +'<div style="text-align:center;margin-top:14px"><button id="planpick-x" style="background:none;border:0;color:#9aa3b2;font-size:13px;cursor:pointer;text-decoration:underline">'+(es?'Cancelar':'Cancel')+'</button></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click',function(e){ if(e.target===ov) ov.remove(); });
  document.getElementById('planpick-x').onclick=function(){ ov.remove(); };
  Array.prototype.forEach.call(ov.querySelectorAll('[data-pick]'),function(b){
    b.onclick=function(){ try{ localStorage.setItem('jobup_plan',b.getAttribute('data-pick')); }catch(e){} ov.remove(); doCheckout(); };
  });
}

// Narration: segmented, prefetched one ahead, blob-cached, browser fallback.
(function(){
  var orb=document.getElementById('orb'),stat=document.getElementById('stat');
  var playBtn=document.getElementById('play'),stopBtn=document.getElementById('stop');
  var bars=document.getElementById('bars'),segEl=document.getElementById('seg');
  var PLAY_LABEL=LANG==='es'?'Reproducir el recorrido':'Play the walkthrough';
  var PAUSE_LABEL=LANG==='es'?'Pausa':'Pause';
  var RESUME_LABEL=LANG==='es'?'Continuar':'Resume';
  function speaking(on){
    orb.classList.toggle('speaking',!!on);
    if(bars)bars.classList.toggle('on',!!on);
  }
  var i=0,token=0,audio=null,cache={},neuralOK=true;

  function fetchSeg(n){
    if(cache[n])return Promise.resolve(cache[n]);
    return fetch('/api/tts/edge',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:narration[n],voice:VOICE,lang:LANG})})
      .then(function(r){if(!r.ok)throw new Error('tts');return r.blob();})
      .then(function(b){if(!b||b.size<200)throw new Error('empty');
        var u=URL.createObjectURL(b);cache[n]=u;return u;});
  }
  function highlight(n){
    for(var k=1;k<=8;k++){var el=document.getElementById('sc'+k);if(el)el.classList.remove('active');}
    var el2=document.getElementById('sc'+Math.max(1,Math.min(n,8)));
    if(el2){el2.classList.add('active');el2.scrollIntoView({behavior:'smooth',block:'center'});}
  }
  function browserSpeak(n,done){
    if(!window.speechSynthesis){done();return;}
    var u=new SpeechSynthesisUtterance(narration[n]);
    u.lang=LANG==='es'?'es-MX':'en-US';u.onend=done;u.onerror=done;
    speaking(true);speechSynthesis.speak(u);
  }
  function run(t){
    if(t!==token)return;
    if(i>=narration.length){finish();return;}
    highlight(i);
    stat.textContent='Speaking \\u2014 '+(i+1)+' of '+narration.length;
    function next(){if(t!==token||paused)return;i++;run(t);}
    if(neuralOK){
      if(i+1<narration.length)fetchSeg(i+1).catch(function(){});
      fetchSeg(i).then(function(url){
        if(t!==token)return;
        audio=new Audio(url);audio.onended=next;
        audio.onerror=function(){neuralOK=false;browserSpeak(i,next);};
        speaking(true);
        audio.play().catch(function(){neuralOK=false;browserSpeak(i,next);});
      }).catch(function(){if(t!==token)return;neuralOK=false;browserSpeak(i,next);});
    }else{browserSpeak(i,next);}
  }
  // Three states, not two: idle / playing / paused.
  //
  // Pause keeps the position — both the segment index AND the offset inside
  // the current clip — so resuming continues mid-sentence rather than
  // restarting the walkthrough. Stop is the only thing that goes back to zero.
  var paused=false;

  function setControls(state){
    if(state==='playing'){
      playBtn.disabled=false; playBtn.textContent=PAUSE_LABEL; stopBtn.disabled=false;
    }else if(state==='paused'){
      playBtn.disabled=false; playBtn.textContent=RESUME_LABEL; stopBtn.disabled=false;
    }else{
      playBtn.disabled=false; playBtn.textContent=PLAY_LABEL; stopBtn.disabled=true;
    }
  }

  function pause(){
    if(paused)return;
    paused=true; speaking(false);
    if(audio){try{audio.pause();}catch(e){}}
    // speechSynthesis has its own pause; it resumes the same utterance.
    if(window.speechSynthesis&&speechSynthesis.speaking){try{speechSynthesis.pause();}catch(e){}}
    setControls('paused');
    stat.textContent='Paused at '+(i+1)+' of '+narration.length+'. Press resume to continue.';
  }

  function resume(){
    if(!paused)return;
    paused=false; setControls('playing');
    stat.textContent='Speaking \u2014 '+(i+1)+' of '+narration.length;
    if(window.speechSynthesis&&speechSynthesis.paused){
      // Browser-speech path: the utterance is still loaded, just suspended.
      speaking(true);
      try{speechSynthesis.resume();}catch(e){}
      return;
    }
    if(audio){
      // Neural path: the element kept currentTime, so this continues mid-clip.
      speaking(true);
      audio.play().catch(function(){neuralOK=false;run(token);});
      return;
    }
    run(token);   // nothing buffered — pick the current segment back up
  }

  function finish(){
    token++;paused=false;speaking(false);
    if(segEl)segEl.textContent='';
    if(audio){try{audio.pause();}catch(e){}audio=null;}
    if(window.speechSynthesis)speechSynthesis.cancel();
    setControls('idle'); i=0;
    stat.textContent='Finished. Press play to hear it again.';
  }

  function start(){
    if(!narration.length){stat.textContent='Nothing to narrate yet.';return;}
    token++;i=0;paused=false;setControls('playing');run(token);
  }

  // One primary control: play -> pause -> resume.
  function toggle(){
    // Bound at boot, so it must refuse until there is something to say.
    if(!narration.length){
      stat.textContent='Still building your preview. The walkthrough starts when it is ready.';
      return;
    }
    if(paused){resume();return;}
    if(stopBtn.disabled){start();return;}   // idle
    pause();
  }

  playBtn.addEventListener('click',function(){
    playBtn.classList.remove('nudge');
    toggle();
  });
  orb.addEventListener('click',toggle);
  orb.addEventListener('keydown',function(e){
    if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});

  // Nudge, once, when the preview lands — autoplaying audio is blocked by
  // browsers and hostile besides, so we draw the eye instead.
  window.addEventListener('jobup:ready',function(){
    playBtn.classList.add('nudge');
    setTimeout(function(){playBtn.classList.remove('nudge');},9000);
  });

  stopBtn.addEventListener('click',finish);

  // Leaving the tab pauses rather than losing your place.
  document.addEventListener('visibilitychange',function(){
    if(document.hidden&&!stopBtn.disabled&&!paused)pause();
  });
  window.addEventListener('beforeunload',function(){if(window.speechSynthesis)speechSynthesis.cancel();});
  setControls('idle');
})();

poll();
</script></body></html>`);
});

module.exports = router;
