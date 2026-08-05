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
.orb{width:64px;height:64px;flex:0 0 64px;border-radius:50%;cursor:pointer;
background:radial-gradient(circle at 38% 32%,#a5f3fc,#22d3ee 30%,#3b82f6 58%,#8b5cf6 80%,#ec4899 100%);
box-shadow:0 0 0 0 rgba(34,211,238,.5),0 8px 32px rgba(34,211,238,.28);transition:transform .2s}
.orb:hover{transform:scale(1.06)}
.orb.speaking{animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(34,211,238,.45),0 8px 32px rgba(34,211,238,.28)}
70%{box-shadow:0 0 0 20px rgba(34,211,238,0),0 8px 32px rgba(139,92,246,.4)}
100%{box-shadow:0 0 0 0 rgba(34,211,238,0),0 8px 32px rgba(34,211,238,.28)}}
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
  <div class="orb" id="orb" title="Play"></div>
  <div style="flex:1">
    <div class="obtitle">${lang === 'es' ? 'Dalia' : 'Ava'} &mdash; JobUp</div>
    <div class="obstat" id="stat">Building your ecosystem&hellip;</div>
    <div style="margin-top:10px">
      <button class="btn primary" id="play">Play the walkthrough</button>
      <button class="btn" id="stop" disabled>Stop</button>
    </div>
  </div>
</div>

<div id="body"><div class="loading">Building your ecosystem&hellip;</div></div>
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
function poll(){
  fetch(API_BASE+'/api/v1/intake/teaser/'+encodeURIComponent(TOKEN))
    .then(function(r){return r.json();}).then(function(j){
    if(j.status==='pending'){setTimeout(poll,1500);return;}
    if(j.status!=='ready'||!j.payload){
      document.getElementById('body').innerHTML=
        '<div class="screen active"><h2>We could not finish this preview</h2>'+
        '<p class="note">Nothing was fabricated to fill the gap. Please try again.</p></div>';
      document.getElementById('stat').textContent='Build failed.';return;}
    payload=j.payload;narration=j.narration||[];render();
  }).catch(function(){setTimeout(poll,2500);});
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

  h+=open(6,'Your three agents');
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
  document.getElementById('stat').textContent='Ready. Press play and I will walk you through it.';
  var b=document.getElementById('buy');
  if(b)b.addEventListener('click',checkout);
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
    orb.classList.add('speaking');speechSynthesis.speak(u);
  }
  function run(t){
    if(t!==token)return;
    if(i>=narration.length){finish();return;}
    highlight(i);
    stat.textContent='Speaking \\u2014 '+(i+1)+' of '+narration.length;
    function next(){if(t!==token)return;i++;run(t);}
    if(neuralOK){
      if(i+1<narration.length)fetchSeg(i+1).catch(function(){});
      fetchSeg(i).then(function(url){
        if(t!==token)return;
        audio=new Audio(url);audio.onended=next;
        audio.onerror=function(){neuralOK=false;browserSpeak(i,next);};
        orb.classList.add('speaking');
        audio.play().catch(function(){neuralOK=false;browserSpeak(i,next);});
      }).catch(function(){if(t!==token)return;neuralOK=false;browserSpeak(i,next);});
    }else{browserSpeak(i,next);}
  }
  function finish(){
    token++;orb.classList.remove('speaking');
    if(audio){try{audio.pause();}catch(e){}audio=null;}
    if(window.speechSynthesis)speechSynthesis.cancel();
    playBtn.disabled=false;stopBtn.disabled=true;i=0;
    stat.textContent='Finished. Press play to hear it again.';
  }
  function start(){
    if(!narration.length){stat.textContent='Nothing to narrate yet.';return;}
    token++;i=0;playBtn.disabled=true;stopBtn.disabled=false;run(token);
  }
  playBtn.addEventListener('click',start);
  orb.addEventListener('click',function(){playBtn.disabled?finish():start();});
  stopBtn.addEventListener('click',finish);
  window.addEventListener('beforeunload',function(){if(window.speechSynthesis)speechSynthesis.cancel();});
})();

poll();
</script></body></html>`);
});

module.exports = router;
