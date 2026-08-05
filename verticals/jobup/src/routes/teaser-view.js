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
:root{--bg:#0b1220;--card:#141b29;--line:#243049;--txt:#e9eef7;--mut:#8a98b0;--cy:#22d3ee;--vi:#8b5cf6;--warn:#fbbf24}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);
font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:880px;margin:0 auto;padding:34px 20px 90px}
.orbbar{display:flex;gap:18px;align-items:center;background:var(--card);border:1px solid var(--line);
border-radius:18px;padding:18px 20px;position:sticky;top:12px;z-index:20}
.orb{width:64px;height:64px;flex:0 0 64px;border-radius:50%;cursor:pointer;
background:radial-gradient(circle at 35% 30%,#a5f3fc,#22d3ee 42%,#4c1d95 100%);
box-shadow:0 0 0 0 rgba(34,211,238,.5);transition:transform .2s}
.orb:hover{transform:scale(1.05)}
.orb.speaking{animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(34,211,238,.45)}70%{box-shadow:0 0 0 18px rgba(34,211,238,0)}100%{box-shadow:0 0 0 0 rgba(34,211,238,0)}}
.obtitle{font-weight:700}.obstat{color:var(--mut);font-size:14px;min-height:20px}
.btn{border:1px solid var(--line);background:transparent;color:var(--txt);border-radius:999px;
padding:8px 16px;font:inherit;font-size:14px;cursor:pointer;margin-right:8px}
.btn.primary{background:linear-gradient(90deg,var(--cy),var(--vi));color:#08111f;font-weight:700;border:0}
.btn:disabled{opacity:.45;cursor:default}
.screen{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px;margin:22px 0;
opacity:.55;transition:opacity .3s,border-color .3s}
.screen.active{opacity:1;border-color:var(--cy)}
.screen h2{margin:0 0 4px;font-size:21px}
.screen .num{color:var(--mut);font-size:12px;letter-spacing:.16em;text-transform:uppercase}
.chip{display:inline-block;background:#1b2536;border:1px solid var(--line);border-radius:999px;
padding:4px 11px;font-size:13px;margin:4px 6px 0 0}
.chip.sim{border-color:var(--warn);color:var(--warn)}
.job{border-top:1px solid var(--line);padding:14px 0}
.job:first-of-type{border-top:0}
.job .t{font-weight:600}.job .m{color:var(--mut);font-size:14px}
.score{float:right;font-weight:800;color:var(--cy)}
.empty{border:1px dashed var(--line);border-radius:12px;padding:18px;color:var(--mut)}
pre{background:#0d1524;border:1px solid var(--line);border-radius:12px;padding:14px;overflow:auto;
font-size:12.5px;max-height:280px}
.price{font-size:42px;font-weight:800}
ul.inc{list-style:none;padding:0;margin:12px 0}ul.inc li{padding:5px 0 5px 22px;position:relative}
ul.inc li:before{content:"\\2022";position:absolute;left:4px;color:var(--cy)}
.note{color:var(--mut);font-size:13px;margin-top:12px}
.loading{text-align:center;padding:70px 0;color:var(--mut)}
@media(max-width:600px){.orbbar{flex-direction:column;text-align:center}.wrap{padding:18px 14px 70px}}
`;

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
  h+=open(1,'Your personal site');
  h+='<div style="font-size:24px;font-weight:700">'+esc(p.name||'')+'</div>';
  if(p.headline)h+='<div style="color:var(--cy)">'+esc(p.headline)+'</div>';
  if(p.summary)h+='<p>'+esc(p.summary)+'</p>';
  if((p.skills||[]).length)h+='<div>'+p.skills.slice(0,14).map(function(x){
    return '<span class="chip">'+esc(typeof x==='string'?x:x.name)+'</span>';}).join('')+'</div>';
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
