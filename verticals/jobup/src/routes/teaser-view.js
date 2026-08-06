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
.orb:hover{transform:scale(1.07)}
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
    <div class="orb" id="orb" title="Play the walkthrough" role="button" tabindex="0"
         aria-label="Play the walkthrough"></div>
    <span class="ring r1"></span><span class="ring r2"></span><span class="ring r3"></span>
  </div>
  <div style="flex:1">
    <div class="obtitle">${lang === 'es' ? 'Dalia' : 'Ava'} &mdash; JobUp</div>
    <div class="obstat" id="stat">Building your ecosystem&hellip;</div>
    <div style="margin-top:10px">
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

<script>
var API_BASE=(location.hostname.endsWith('jobup.dev')?'':'/jobup');
var TOKEN=${JSON.stringify(req.params.token)};
var VOICE=${JSON.stringify(lang === 'es' ? 'dalia' : 'ava')};
var LANG=${JSON.stringify(lang)};
var payload=null,narration=[];

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

// Poll until the background build finishes (Cloudflare ~100s ceiling).
var T=LANG==='es'
  ? {step:'Paso',of:'de',left:'restante',over:'Tardando mas de lo normal \u2014 seguimos trabajando',
     elapsed:'transcurrido',remaining:'tiempo restante aproximado',almost:'Casi listo'}
  : {step:'Step',of:'of',left:'left',over:'Taking longer than usual \u2014 still working',
     elapsed:'elapsed',remaining:'estimated time remaining',almost:'Almost there'};

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

  h+=open(5,'Your AI-readable identity',
    'This is what a recruiting system, a search engine or an AI assistant reads when it looks you up.');
  h+='<pre>'+esc(JSON.stringify((s.identity||{}).json_ld||{},null,2))+'</pre>';
  h+='<div><span class="chip">resume.json</span><span class="chip">JSON-LD</span>'+
     '<span class="chip">agent card</span><span class="chip">llms.txt</span></div></div>';

  h+=open(6,'Your three agents','They run around the clock, whether or not you are looking.');
  h+='<div class="alwayson">'+
       '<div class="ao-head"><span class="live"><i></i>ALWAYS ON</span>'+
       '<span class="ao-clock" id="ao-clock">24 / 7</span></div>'+
       '<div class="cycle">'+
         '<div class="cy" data-k="0"><span class="dot"></span><div><strong>Searching</strong>'+
           '<div class="m">Approved job boards, every day</div></div></div>'+
         '<div class="cy" data-k="1"><span class="dot"></span><div><strong>Scoring</strong>'+
           '<div class="m">Each opening against your resume</div></div></div>'+
         '<div class="cy" data-k="2"><span class="dot"></span><div><strong>Tailoring</strong>'+
           '<div class="m">Your resume for the ones that fit</div></div></div>'+
         '<div class="cy" data-k="3"><span class="dot"></span><div><strong>Drafting</strong>'+
           '<div class="m">Outreach that waits for your approval</div></div></div>'+
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

  var c=(s.cta)||{price_usd:97,includes:[],non_renewal:''};
  h+=open(8,'Build my ecosystem');
  h+='<div class="price">$'+c.price_usd+'<span style="font-size:17px;color:var(--mut)"> / year</span></div>';
  h+='<ul class="inc">'+(c.includes||[]).map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul>';
  h+='<button class="btn primary" id="buy" style="font-size:16px;padding:13px 26px">Submit to build my ecosystem</button>';
  h+='<p class="note">'+esc(c.non_renewal||'')+'</p>';
  h+='<p class="note">JobUp never applies on your behalf. You review and submit every application yourself.</p>';
  h+='<div id="buyout" class="note"></div></div>';

  document.getElementById('body').innerHTML=h;
  document.getElementById('stat').textContent='Ready \u2014 press play and I will walk you through it.';
  try{window.dispatchEvent(new Event('jobup:ready'));}catch(e){}
  var b=document.getElementById('buy');
  if(b)b.addEventListener('click',checkout);
  startAlwaysOn();
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

function checkout(){
  var out=document.getElementById('buyout');
  out.textContent='Opening checkout...';
  var p=(payload.screens.site&&payload.screens.site.profile)||{};
  fetch(API_BASE+'/api/v1/billing/checkout',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:p.email||'',name:p.name||'',teaser_token:TOKEN})})
    .then(function(r){return r.json();}).then(function(j){
      if(j.url){location.href=j.url;return;}
      // Honest when unconfigured — never a fake URL.
      out.textContent=j.error||'Checkout is not available right now.';
    }).catch(function(){out.textContent='Could not reach checkout.';});
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
