'use strict';

// =============================================================
// The subscriber's public website — ONE data-driven template.
//
// Modelled on anastagg.com, which is the quality bar: sticky nav, photo hero
// with an orbiting ring, eyebrow chip, contact pills, a share card, an AI voice
// panel, and numbered sections with a gradient timeline.
//
// The donor repo hand-authors a file per person (anastagg.html is 877 lines).
// That does not scale. Every subscriber renders from this one function, through
// the SAME privacy projection as resume.json, the agent card and llms.txt — so
// they can never state different things.
// =============================================================

const identity = require('./identity');
const settingsSvc = require('./settings');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function attr(s) { return esc(s).replace(/`/g, '&#96;'); }

const CSS = `
:root{--bg:#07080c;--bg2:#0b0d13;--card:#11141c;--card2:#161a24;
--line:rgba(255,255,255,.07);--line2:rgba(255,255,255,.14);
--ink:#eef2f8;--mut:#9aa3b4;--faint:#6b7385;
--cyan:#22d3ee;--cyan-bd:rgba(34,211,238,.32);--violet:#8b5cf6;--green:#3ad07f;
--grad:linear-gradient(120deg,#22d3ee 0%,#6366f1 55%,#8b5cf6 100%);
--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
--sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);min-height:100%}
body{color:var(--ink);font:16px/1.65 var(--sans);letter-spacing:-.011em;
-webkit-font-smoothing:antialiased;position:relative;overflow-x:hidden}
body::before{content:"";position:fixed;inset:0 0 auto 0;height:760px;z-index:0;pointer-events:none;
background:radial-gradient(58% 42% at 22% 0%,rgba(34,211,238,.16),transparent 68%),
radial-gradient(52% 40% at 82% 12%,rgba(139,92,246,.16),transparent 70%);filter:blur(24px)}
a{color:inherit;text-decoration:none}
.wrap{position:relative;z-index:2;max-width:1080px;margin:0 auto;padding:0 24px}
.nav{position:sticky;top:0;z-index:40;background:rgba(7,8,12,.82);backdrop-filter:blur(14px);
border-bottom:1px solid var(--line)}
.nav .wrap{display:flex;align-items:center;justify-content:space-between;padding:14px 24px;gap:16px}
.nav .who{display:flex;align-items:center;gap:10px;font-weight:750;letter-spacing:-.02em}
.nav .dot{width:10px;height:10px;border-radius:50%;background:var(--grad);box-shadow:0 0 12px rgba(34,211,238,.6)}
.nav .who .tag2{font-family:var(--mono);font-size:11px;color:var(--faint);letter-spacing:.12em}
.nav .acts{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.nbtn{border:1px solid var(--line2);border-radius:999px;padding:8px 15px;color:var(--ink);
background:transparent;font:inherit;font-size:13.5px;cursor:pointer;transition:all .15s ease}
.nbtn:hover{border-color:var(--cyan);color:var(--cyan)}
.nbtn.primary{background:var(--grad);border:0;color:#06121a;font-weight:700}
@media(max-width:640px){.nav .who .tag2{display:none}}
.hero{padding:52px 0 10px}
.hero-grid{display:grid;grid-template-columns:auto 1fr;gap:40px;align-items:center}
.photo-wrap{position:relative;width:210px;height:210px}
.ring-orbit{position:absolute;inset:-14px;border:1px dashed var(--line2);border-radius:34px;
animation:spin 26s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.photo,.photo-fallback{width:210px;height:210px;border-radius:26px;object-fit:cover;display:block;
border:1px solid var(--line2);box-shadow:0 24px 60px rgba(0,0,0,.6)}
.photo-fallback{display:grid;place-items:center;background:var(--grad);color:#06121a;
font-size:62px;font-weight:830;letter-spacing:-.04em}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11.5px;
letter-spacing:2.2px;color:var(--cyan);text-transform:uppercase;border:1px solid var(--cyan-bd);
background:rgba(34,211,238,.06);padding:6px 12px;border-radius:20px;margin-bottom:16px}
.eyebrow b{width:6px;height:6px;border-radius:50%;background:var(--green);
box-shadow:0 0 8px var(--green);animation:blink 1.6s steps(1) infinite}
@keyframes blink{50%{opacity:.25}}
.hero h1{font-size:clamp(38px,6vw,62px);line-height:1.03;margin:0 0 10px;font-weight:830;letter-spacing:-.04em}
.title-line{font-size:clamp(17px,2.3vw,22px);font-weight:700;margin-bottom:14px;background:var(--grad);
-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.subtitle{color:var(--mut);font-size:16.5px;max-width:680px;margin:0 0 20px}
.chips{display:flex;flex-wrap:wrap;gap:9px;margin-bottom:18px}
.chip{display:inline-flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--line);
border-radius:999px;padding:8px 15px;font-size:14px;color:var(--mut)}
.chip a{color:var(--mut)}.chip a:hover{color:var(--cyan)}
.social-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.sbtn{display:inline-flex;align-items:center;gap:9px;border:1px solid var(--line2);border-radius:12px;
padding:12px 20px;font-weight:650;font-size:14.5px;transition:all .15s ease}
.sbtn:hover{border-color:var(--cyan);color:var(--cyan)}
.sbtn.primary{background:var(--grad);border:0;color:#06121a}
.sharecard{display:flex;align-items:center;gap:16px;margin-top:20px;padding:15px 17px;
background:var(--card);border:1px solid var(--line);border-radius:16px;max-width:560px}
.sharehint{font-size:13.5px;color:var(--mut);margin-bottom:10px}
.sharebtns{display:flex;gap:8px;flex-wrap:wrap}
.shbtn{border:1px solid var(--line2);border-radius:10px;padding:8px 14px;font-size:13.5px;
background:transparent;color:var(--ink);font-family:inherit;cursor:pointer;transition:all .15s ease}
.shbtn:hover{border-color:var(--cyan);color:var(--cyan)}
.shbtn.primary{background:var(--grad);border:0;color:#06121a;font-weight:700}
.shbtn:disabled{opacity:.4;cursor:default}
@media(max-width:760px){.hero-grid{grid-template-columns:1fr;gap:28px;text-align:center}
.photo-wrap{margin:0 auto}.chips,.social-row{justify-content:center}
.subtitle{margin-left:auto;margin-right:auto}.sharecard{margin-left:auto;margin-right:auto}}
.voicebar{margin:34px auto 0;max-width:1080px;padding:0 24px;position:relative;z-index:2}
.voicecard{display:flex;align-items:center;gap:20px;background:linear-gradient(180deg,var(--card),var(--bg2));
border:1px solid var(--line);border-radius:20px;padding:22px 24px;position:relative;overflow:hidden}
.voicecard::before{content:"";position:absolute;left:0;top:0;height:100%;width:3px;background:var(--grad)}
.vorb{width:78px;height:78px;flex:0 0 78px;border-radius:50%;cursor:pointer;
background:radial-gradient(circle at 36% 30%,#a5f3fc,#22d3ee 32%,#6366f1 62%,#8b5cf6 100%);
box-shadow:0 0 0 0 rgba(34,211,238,.5),0 10px 34px rgba(34,211,238,.3);transition:transform .2s}
.vorb:hover{transform:scale(1.05)}
.vorb.speaking{animation:vpulse 1.3s ease-in-out infinite}
@keyframes vpulse{0%{box-shadow:0 0 0 0 rgba(34,211,238,.45),0 10px 34px rgba(34,211,238,.3)}
70%{box-shadow:0 0 0 22px rgba(34,211,238,0),0 10px 34px rgba(139,92,246,.42)}
100%{box-shadow:0 0 0 0 rgba(34,211,238,0),0 10px 34px rgba(34,211,238,.3)}}
.vname{font-weight:760;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.vtag{font-family:var(--mono);font-size:11px;letter-spacing:.1em;color:var(--cyan);
border:1px solid var(--cyan-bd);border-radius:8px;padding:3px 9px}
.vrole{color:var(--mut);font-size:14px;margin:4px 0 12px}
.vstatus{font-size:12.5px;color:var(--faint);font-family:var(--mono);margin-top:10px;min-height:18px}
@media(max-width:620px){.voicecard{flex-direction:column;text-align:center}}
section{padding:56px 0 0}
.sec-head{display:flex;align-items:center;gap:14px;margin-bottom:26px}
.sec-head .k{font-family:var(--mono);font-size:12px;color:var(--cyan);letter-spacing:2px;
border:1px solid var(--cyan-bd);border-radius:8px;padding:4px 9px;white-space:nowrap}
.sec-head h2{font-size:clamp(22px,3.4vw,30px);font-weight:810;letter-spacing:-.03em;margin:0}
.sec-head .rule{flex:1;height:1px;background:linear-gradient(90deg,var(--line2),transparent)}
.prose{color:var(--mut);font-size:16.5px;max-width:820px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:13px}
.gcard{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:17px 19px;
color:var(--mut);font-size:14.5px;transition:border-color .16s ease,transform .16s ease}
.gcard:hover{border-color:var(--line2);transform:translateY(-2px)}
.timeline{position:relative;padding-left:30px}
.timeline::before{content:"";position:absolute;left:8px;top:8px;bottom:8px;width:2px;
background:linear-gradient(180deg,var(--cyan),var(--violet),transparent)}
.tl{position:relative;margin-bottom:30px}
.tl::before{content:"";position:absolute;left:-27px;top:7px;width:12px;height:12px;border-radius:50%;
background:var(--bg);border:2px solid var(--cyan);box-shadow:0 0 12px rgba(34,211,238,.5)}
.tl .role{font-size:18px;font-weight:750}
.tl .org{color:var(--cyan);font-size:15px;font-weight:600;margin-top:2px}
.tl .when{font-family:var(--mono);font-size:12.5px;color:var(--faint);margin-top:3px;letter-spacing:.04em}
.tl ul{margin:11px 0 0;padding-left:18px;color:var(--mut)}
.tl ul li{margin:6px 0}
.tags{display:flex;flex-wrap:wrap;gap:8px}
.tag{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:7px 15px;
font-size:14px;color:var(--mut)}
a.tag:hover{border-color:var(--cyan);color:var(--cyan)}
.cta-final{background:linear-gradient(180deg,var(--card),var(--bg2));border:1px solid var(--line2);
border-radius:22px;padding:30px;margin:60px 0 0;text-align:center}
.cta-final h3{margin:0 0 8px;font-size:22px;font-weight:790;letter-spacing:-.03em}
.cta-final p{color:var(--mut);margin:0 0 18px}
footer{color:var(--faint);font-size:13px;margin-top:60px;border-top:1px solid var(--line);
padding:22px 0 50px;font-family:var(--mono);display:flex;gap:16px;flex-wrap:wrap;justify-content:space-between}
footer a{color:var(--faint)}footer a:hover{color:var(--ink)}
@media print{body::before,.nav,.voicebar,.sharecard,.cta-final,.ring-orbit{display:none!important}
body{background:#fff;color:#000}.title-line{-webkit-text-fill-color:#0b5}}
`;

function head(title, desc, ld, url) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${attr(desc)}">
<link rel="canonical" href="${attr(url)}">
<meta property="og:type" content="profile"><meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(desc)}"><meta property="og:url" content="${attr(url)}">
<link rel="alternate" type="application/json" href="${attr(url)}/resume.json">
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head><body>`;
}

function initials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (((p[0] || '')[0] || '') + ((p[p.length - 1] || '')[0] || '')).toUpperCase();
}

function nav(name, url, p) {
  return `<div class="nav"><div class="wrap">
  <a class="who" href="/"><span class="dot"></span><span>${esc(name)}</span><span class="tag2">CV</span></a>
  <div class="acts">
    <a class="nbtn" href="${attr(url)}/resume.json">R&eacute;sum&eacute; JSON</a>
    ${p.email ? `<a class="nbtn primary" href="mailto:${attr(p.email)}">Contact</a>` : ''}
  </div>
</div></div>`;
}

function heroBlock(p, name, url, roleLine) {
  // photo_url is set by the site handler when an asset exists; p.photo covers a
  // URL carried in the resume itself. Initials remain the honest fallback.
  const src = p.photo_url || p.photo;
  const photo = src
    ? `<img class="photo" src="${attr(src)}" alt="${attr(name)}" width="210" height="210">`
    : `<div class="photo-fallback">${esc(initials(name))}</div>`;

  const chips = [];
  if (p.location) chips.push(`<span class="chip">${esc(p.location)}</span>`);
  if (p.phone) chips.push(`<span class="chip"><a href="tel:${attr(p.phone)}">${esc(p.phone)}</a></span>`);
  if (p.email) chips.push(`<span class="chip"><a href="mailto:${attr(p.email)}">${esc(p.email)}</a></span>`);

  const social = [];
  if (p.linkedin) social.push(`<a class="sbtn primary" href="${attr(p.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>`);
  if (p.email) social.push(`<a class="sbtn${p.linkedin ? '' : ' primary'}" href="mailto:${attr(p.email)}">Email me</a>`);
  social.push(`<a class="sbtn" href="${attr(url)}/resume.json">R&eacute;sum&eacute; (JSON)</a>`);

  return `<header class="hero"><div class="wrap hero-grid">
  <div class="photo-wrap"><div class="ring-orbit"></div>${photo}</div>
  <div>
    ${roleLine ? `<div class="eyebrow"><b></b> ${esc(roleLine)}</div>` : ''}
    <h1>${esc(name)}</h1>
    ${p.headline ? `<div class="title-line">${esc(p.headline)}</div>` : ''}
    ${p.summary ? `<p class="subtitle">${esc(p.summary)}</p>` : ''}
    ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
    <div class="social-row">${social.join('')}</div>
    <div class="sharecard"><div>
      <div class="sharehint">Share this profile, or save the contact card.</div>
      <div class="sharebtns">
        <button class="shbtn primary" id="sh-share">Share</button>
        <button class="shbtn" id="sh-vcard">Save contact</button>
        <button class="shbtn" id="sh-copy">Copy link</button>
      </div>
    </div></div>
  </div>
</div></header>`;
}

function voiceBlock(name) {
  return `<div class="voicebar"><div class="voicecard">
  <div class="vorb" id="vorb" role="button" tabindex="0" aria-label="Play the spoken profile"></div>
  <div style="flex:1">
    <div class="vname">${esc(name.split(' ')[0] || name)}'s AI Voice <span class="vtag">EN &middot; Ava</span></div>
    <div class="vrole">A voice walkthrough of this profile.</div>
    <div class="sharebtns">
      <button class="shbtn primary" id="v-play">Play</button>
      <button class="shbtn" id="v-stop" disabled>Stop</button>
    </div>
    <div class="vstatus" id="v-status">Tap the orb, or press play.</div>
  </div>
</div></div>`;
}

function sections(p) {
  let h = '<div class="wrap">';
  let n = 0;
  const sh = (t) => {
    n++;
    return `<div class="sec-head"><span class="k">${String(n).padStart(2, '0')}</span><h2>${esc(t)}</h2><span class="rule"></span></div>`;
  };

  if (p.summary) h += `<section>${sh('Professional Profile')}<p class="prose">${esc(p.summary)}</p></section>`;

  if (p.skills && p.skills.length) {
    h += `<section>${sh('Core Competencies')}<div class="grid">` +
      p.skills.slice(0, 18).map((s) =>
        `<div class="gcard">${esc(typeof s === 'string' ? s : s.name)}</div>`).join('') +
      '</div></section>';
  }

  if (p.experience && p.experience.length) {
    h += `<section>${sh('Professional Experience')}<div class="timeline">` +
      p.experience.map((e) => `<div class="tl">
        <div class="role">${esc(e.title || '')}</div>
        ${e.company ? `<div class="org">${esc(e.company)}</div>` : ''}
        ${(e.start || e.end) ? `<div class="when">${esc(e.start || '')} &mdash; ${esc(e.end || 'Present')}</div>` : ''}
        ${(e.highlights && e.highlights.length)
          ? '<ul>' + e.highlights.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>' : ''}
      </div>`).join('') + '</div></section>';
  }

  if (p.education && p.education.length) {
    h += `<section>${sh('Education')}<div class="timeline">` +
      p.education.map((e) => `<div class="tl">
        <div class="role">${esc(e.institution || '')}</div>
        ${(e.studyType || e.area) ? `<div class="org">${esc([e.studyType, e.area].filter(Boolean).join(', '))}</div>` : ''}
        ${e.end ? `<div class="when">${esc(e.end)}</div>` : ''}
      </div>`).join('') + '</div></section>';
  }

  if (p.certifications && p.certifications.length) {
    h += `<section>${sh('Additional Qualifications')}<div class="tags">` +
      p.certifications.map((c) => `<span class="tag">${esc(typeof c === 'string' ? c : c.name)}</span>`).join('') +
      '</div></section>';
  }

  return h + '</div>';
}

/** Spoken walkthrough, built ONLY from the privacy-projected profile. */
function narrationFor(p, name) {
  const out = [`This is the profile of ${name}.`];
  if (p.headline) out.push(p.headline + '.');
  if (p.summary) out.push(p.summary);
  if (p.experience && p.experience.length) {
    const e = p.experience[0];
    out.push(`Most recently, ${e.title || 'working'}${e.company ? ' at ' + e.company : ''}.`);
  }
  if (p.skills && p.skills.length) {
    out.push('Core skills include ' +
      p.skills.slice(0, 6).map((s) => (typeof s === 'string' ? s : s.name)).join(', ') + '.');
  }
  return out;
}

function scripts(name, url, p, narration) {
  const vcard = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${name}`,
    p.headline ? `TITLE:${p.headline}` : '',
    p.email ? `EMAIL;TYPE=INTERNET:${p.email}` : '',
    p.phone ? `TEL;TYPE=CELL:${p.phone}` : '',
    p.location ? `ADR;TYPE=WORK:;;${p.location};;;;` : '',
    `URL:${url}`, 'END:VCARD'].filter(Boolean).join('\n');

  return `<script>
(function(){
  var U=${JSON.stringify(url)}, N=${JSON.stringify(name)}, VC=${JSON.stringify(vcard)};
  var sh=document.getElementById('sh-share'),vc=document.getElementById('sh-vcard'),cp=document.getElementById('sh-copy');
  if(sh) sh.addEventListener('click',function(){
    if(navigator.share) navigator.share({title:N,url:U}).catch(function(){});
    else if(navigator.clipboard){navigator.clipboard.writeText(U);sh.textContent='Link copied';}
  });
  if(cp) cp.addEventListener('click',function(){
    if(!navigator.clipboard) return;
    navigator.clipboard.writeText(U).then(function(){cp.textContent='Copied';
      setTimeout(function(){cp.textContent='Copy link';},1600);});
  });
  if(vc) vc.addEventListener('click',function(){
    var b=new Blob([VC],{type:'text/vcard'});var a=document.createElement('a');
    a.href=URL.createObjectURL(b);a.download=N.replace(/\\s+/g,'-').toLowerCase()+'.vcf';a.click();
  });
})();
(function(){
  var lines=${JSON.stringify(narration)};
  var orb=document.getElementById('vorb');
  if(!orb||!lines.length) return;
  var play=document.getElementById('v-play'),stopB=document.getElementById('v-stop'),st=document.getElementById('v-status');
  var i=0,tok=0,audio=null,cache={},ok=true,on=false;
  function seg(n){ if(cache[n])return Promise.resolve(cache[n]);
    return fetch('/api/tts/edge',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:lines[n],voice:'ava',lang:'en'})})
      .then(function(r){if(!r.ok)throw 0;return r.blob();})
      .then(function(b){if(!b||b.size<200)throw 0;var u=URL.createObjectURL(b);cache[n]=u;return u;}); }
  function br(n,d){ if(!window.speechSynthesis){d();return;}
    var u=new SpeechSynthesisUtterance(lines[n]);u.lang='en-US';u.onend=d;u.onerror=d;
    orb.classList.add('speaking');speechSynthesis.speak(u); }
  function run(t){ if(t!==tok)return; if(i>=lines.length){stop();return;}
    st.textContent='Speaking \\u2014 '+(i+1)+' of '+lines.length;
    function nx(){ if(t!==tok)return; i++; run(t); }
    if(ok){ if(i+1<lines.length)seg(i+1).catch(function(){});
      seg(i).then(function(u){ if(t!==tok)return; audio=new Audio(u); audio.onended=nx;
        audio.onerror=function(){ok=false;br(i,nx);}; orb.classList.add('speaking');
        audio.play().catch(function(){ok=false;br(i,nx);});
      }).catch(function(){ if(t!==tok)return; ok=false; br(i,nx); });
    } else br(i,nx); }
  function start(){ tok++;i=0;on=true;play.disabled=true;stopB.disabled=false;run(tok); }
  function stop(){ tok++;on=false;i=0;orb.classList.remove('speaking');
    play.disabled=false;stopB.disabled=true;st.textContent='Finished. Press play to hear it again.';
    if(audio){try{audio.pause();}catch(e){}audio=null;}
    if(window.speechSynthesis)speechSynthesis.cancel(); }
  play.addEventListener('click',start); stopB.addEventListener('click',stop);
  orb.addEventListener('click',function(){on?stop():start();});
  orb.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();on?stop():start();}});
  window.addEventListener('beforeunload',stop);
})();
</script></body></html>`;
}

function page(profile, settings, ctx) {
  const p = identity.applyPrivacy(profile, settings);
  const ld = identity.personJsonLd(profile, settings, ctx);
  const name = ctx.name || p.name || 'Professional';
  const desc = (p.summary || p.headline || name).slice(0, 200);
  const roles = settingsSvc.pageRoles(settings);
  const roleLine = p.headline || (roles[0] && roles[0].title) || '';

  let h = head(`${name}${p.headline ? ' — ' + p.headline : ''}`, desc, ld, ctx.url);
  h += nav(name, ctx.url, p);
  h += heroBlock(p, name, ctx.url, roleLine);
  h += voiceBlock(name);
  h += sections(p);

  h += '<div class="wrap">';
  if (roles.length) {
    h += '<section><div class="sec-head"><span class="k">&#9679;</span><h2>Open to</h2>' +
      '<span class="rule"></span></div><div class="tags">' +
      roles.map((r) => `<a class="tag" href="/roles/${attr(r.slug)}">${esc(r.title)}</a>`).join('') +
      '</div></section>';
  }
  h += `<div class="cta-final"><h3>Hiring?</h3><p>${p.email
    ? `Reach ${esc(name)} directly &mdash; every message is read.`
    : 'Contact details are available on request.'}</p>
    ${p.email ? `<a class="sbtn primary" href="mailto:${attr(p.email)}">Email ${esc(name.split(' ')[0])}</a>` : ''}
  </div>`;
  h += `<footer><div>Built and maintained by JobUp &middot;
    <a href="/app">Owner sign in</a></div><div>
    <a href="${attr(ctx.url)}/resume.json">resume.json</a> &middot;
    <a href="${attr(ctx.url)}/.well-known/agent.json">agent card</a> &middot;
    <a href="${attr(ctx.url)}/llms.txt">llms.txt</a></div></footer></div>`;

  return h + scripts(name, ctx.url, p, narrationFor(p, name));
}

function rolePage(profile, settings, ctx, role) {
  const p = identity.applyPrivacy(profile, settings);
  const ld = identity.personJsonLd(profile, settings, { ...ctx, role });
  const name = ctx.name || p.name || 'Professional';
  const title = `${name} — ${role.title}`;
  const desc = `${name} is open to ${role.title} roles. ${(p.summary || '').slice(0, 140)}`;

  let h = head(title, desc, ld, `${ctx.url}/roles/${role.slug}`);
  h += nav(name, ctx.url, p);
  h += heroBlock(p, name, ctx.url, role.title);
  h += sections(p);
  h += `<div class="wrap"><div class="cta-final">
    <h3>Recruiting for ${esc(role.title)}?</h3>
    <p>${p.email ? `Reach ${esc(name)} directly.` : 'Contact details are available on request.'}</p>
    ${p.email ? `<a class="sbtn primary" href="mailto:${attr(p.email)}">Email ${esc(name.split(' ')[0])}</a>` : ''}
    <a class="sbtn" href="/">Full profile</a>
  </div><footer><div>Built and maintained by JobUp</div>
  <div><a href="${attr(ctx.url)}/resume.json">resume.json</a></div></footer></div>`;
  return h + scripts(name, ctx.url, p, narrationFor(p, name));
}

function roleIndex(profile, settings, ctx) {
  const p = identity.applyPrivacy(profile, settings);
  const roles = settingsSvc.pageRoles(settings);
  const ld = identity.personJsonLd(profile, settings, ctx);
  const name = ctx.name || p.name || 'Professional';
  let h = head(`${name} — roles`, `Roles ${name} is open to.`, ld, `${ctx.url}/roles`);
  h += nav(name, ctx.url, p);
  h += `<div class="wrap"><section style="padding-top:56px">
    <div class="sec-head"><span class="k">&#9679;</span><h2>Open to</h2><span class="rule"></span></div>
    <div class="tags">` +
    roles.map((r) => `<a class="tag" href="/roles/${attr(r.slug)}">${esc(r.title)}</a>`).join('') +
    `</div></section><footer><div>Built and maintained by JobUp</div>
    <div><a href="/">Full profile</a></div></footer></div></body></html>`;
  return h;
}

module.exports = { page, rolePage, roleIndex, esc, CSS, narrationFor, initials };
