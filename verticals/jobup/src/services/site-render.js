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
.nbtn.manage{border-color:rgba(255,255,255,.14);opacity:.75}
.nbtn.manage:hover{opacity:1}
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
.sharecard{display:flex;align-items:center;gap:16px}
.qrthumb{width:96px;height:96px;flex:0 0 96px;border-radius:10px;background:#fff;padding:6px;
cursor:pointer;transition:transform .2s;box-shadow:0 6px 20px rgba(0,0,0,.25)}
.qrthumb:hover{transform:scale(1.04)}
.sharemeta{flex:1;min-width:0}
.qrmodal{position:fixed;inset:0;z-index:2000;display:none;align-items:center;justify-content:center;
padding:24px;background:rgba(3,5,12,.72);backdrop-filter:blur(6px)}
.qrmodal.open{display:flex}
.qrbox{position:relative;background:var(--card);border:1px solid var(--line2);border-radius:22px;
padding:28px;max-width:340px;width:100%;text-align:center;box-shadow:0 30px 90px rgba(0,0,0,.6)}
.qrclose{position:absolute;top:12px;right:14px;background:none;border:none;color:var(--mut);
font-size:26px;line-height:1;cursor:pointer}
.qrclose:hover{color:var(--ink)}
.qrbig{width:240px;max-width:100%;height:auto;background:#fff;padding:12px;border-radius:14px;
box-shadow:0 10px 30px rgba(0,0,0,.3)}
.qrurl{font-family:var(--mono);font-size:15px;font-weight:700;margin-top:14px;background:var(--grad);
-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.qrhint{color:var(--faint);font-size:12.5px;margin-top:8px}
@media(max-width:420px){.sharecard{flex-direction:column;text-align:center}
.sharebtns{justify-content:center}}
.cform{margin-top:20px;text-align:left;max-width:560px;margin-left:auto;margin-right:auto}
.crow{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.cform input,.cform textarea{width:100%;background:rgba(0,0,0,.35);border:1px solid var(--line2);
border-radius:11px;padding:12px 13px;color:var(--ink);font:inherit;font-size:16px;outline:none}
.cform input:focus,.cform textarea:focus{border-color:var(--cyan)}
.cform textarea{margin-bottom:12px;resize:vertical}
.cform .hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.cform .sbtn{width:100%;justify-content:center;min-height:48px}
.cmsg{margin-top:11px;font-size:14px;min-height:20px}
.cmsg.ok{color:#3ad07f}.cmsg.bad{color:#f87171}
.cnote{color:var(--faint);font-size:12.5px;font-family:var(--mono);margin-top:9px}
@media(max-width:560px){.crow{grid-template-columns:1fr}}
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

function head(title, desc, ld, url, lang) {
  return `<!doctype html><html lang="${lang === 'es' ? 'es' : 'en'}"><head><meta charset="utf-8">
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

// =============================================================
// The site speaks the subscriber's language. Someone whose profile and voice
// are Spanish should not land on English chrome.
// =============================================================
const STR = {
  en: {
    resume_json: 'Résumé JSON', contact: 'Contact', email_me: 'Email me',
    share: 'Share', save_contact: 'Save contact', copy_link: 'Copy link',
    link_copied: 'Link copied', copied: 'Copied',
    share_hint: 'Share this profile, or save the contact card.',
    ai_voice: "%s's AI Voice", voice_sub: 'A voice walkthrough of this profile.',
    voice_hint: 'Tap the orb, or press play.', play: 'Play', stop: 'Stop',
    profile: 'Professional Profile', skills: 'Core Competencies',
    experience: 'Professional Experience', education: 'Education',
    extras: 'Additional Qualifications', open_to: 'Open to',
    hiring: 'Hiring?', reach_direct: 'Reach %s directly — every message is read.',
    send_msg: 'Send %s a message. It goes straight to their dashboard.',
    your_name: 'Your name', your_email: 'Your email (required)',
    company: 'Company', role_hiring: 'Role you are hiring for',
    what_talk: 'What would you like to talk about?', send: 'Send message',
    sending: 'Sending...', delivered_to: 'Delivered to %s through JobUp. Their address is never shared.',
    bad_email: 'Please enter a valid email so they can reply.',
    short_msg: 'Please write a short message.',
    sent_ok: 'Mensaje enviado. Ya está en su panel y podrán responderte directamente.',
    no_send: 'Could not send that.', no_server: 'Could not reach the server.',
    built_by: 'Built and maintained by JobUp', owner_signin: 'Owner sign in', manage: 'Manage',
    agent_card: 'agent card', full_profile: 'Full profile',
    core_skills: 'Core skills include ', voice_tag: 'EN · Ava',
    show_qr: 'Show QR', close: 'Close', qr_alt: 'QR code for this profile',
    qr_hint: 'Point a phone camera at this to open the profile.',
  },
  es: {
    resume_json: 'Currículum JSON', contact: 'Contacto', email_me: 'Escríbeme',
    share: 'Compartir', save_contact: 'Guardar contacto', copy_link: 'Copiar enlace',
    link_copied: 'Enlace copiado', copied: 'Copiado',
    share_hint: 'Comparte este perfil o guarda la tarjeta de contacto.',
    ai_voice: 'La voz IA de %s', voice_sub: 'Un recorrido por este perfil.',
    voice_hint: 'Toca la esfera o pulsa reproducir.', play: 'Reproducir', stop: 'Detener',
    profile: 'Perfil profesional', skills: 'Competencias principales',
    experience: 'Experiencia profesional', education: 'Formación',
    extras: 'Cualificaciones adicionales', open_to: 'Abierto a',
    hiring: '¿Contratando?', reach_direct: 'Contacta con %s directamente — lee cada mensaje.',
    send_msg: 'Envía un mensaje a %s. Llega directo a su panel.',
    your_name: 'Tu nombre', your_email: 'Tu correo (obligatorio)',
    company: 'Empresa', role_hiring: 'Puesto que ofreces',
    what_talk: '¿De qué te gustaría hablar?', send: 'Enviar mensaje',
    sending: 'Enviando...', delivered_to: 'Se entrega a %s a través de JobUp. Su dirección nunca se comparte.',
    bad_email: 'Escribe un correo válido para que puedan responderte.',
    short_msg: 'Escribe un mensaje breve.',
    sent_ok: 'Mensaje enviado. Ya está en su panel y podrán responderte directamente.',
    no_send: 'No se pudo enviar.', no_server: 'No se pudo conectar con el servidor.',
    built_by: 'Creado y mantenido por JobUp', owner_signin: 'Acceso del titular', manage: 'Gestionar',
    agent_card: 'tarjeta de agente', full_profile: 'Perfil completo',
    core_skills: 'Sus competencias principales incluyen ', voice_tag: 'ES · Dalia',
    show_qr: 'Ver QR', close: 'Cerrar', qr_alt: 'Código QR de este perfil',
    qr_hint: 'Apunta la cámara del teléfono para abrir el perfil.',
  },
};
function L(lang) { return STR[lang === 'es' ? 'es' : 'en']; }
function fmt(str, v) { return String(str).replace('%s', v); }

function initials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (((p[0] || '')[0] || '') + ((p[p.length - 1] || '')[0] || '')).toUpperCase();
}

function nav(name, url, p, lang) {
  const t = L(lang);
  return `<div class="nav"><div class="wrap">
  <a class="who" href="/"><span class="dot"></span><span>${esc(name)}</span><span class="tag2">CV</span></a>
  <div class="acts">
    <a class="nbtn" href="${attr(url)}/resume.json">${esc(t.resume_json)}</a>
    ${p.email ? `<a class="nbtn primary" href="mailto:${attr(p.email)}">${esc(t.contact)}</a>` : ''}
    <a class="nbtn manage" href="/app" title="${esc(t.owner_signin)}">${esc(t.manage)}</a>
  </div>
</div></div>`;
}

function heroBlock(p, name, url, roleLine, lang) {
  const t = L(lang);
  // photo_url is set by the site handler when an asset exists; p.photo covers a
  // URL carried in the resume itself. Initials remain the honest fallback.
  const src = p.photo_url || p.photo;
  const photo = src
    ? `<img class="photo" src="${attr(src)}" alt="${attr(name)}" width="210" height="210">`
    : `<div class="photo-fallback">${esc(initials(name))}</div>`;

  const qr = p.qr_data_uri || '';
  const chips = [];
  if (p.location) chips.push(`<span class="chip">${esc(p.location)}</span>`);
  if (p.phone) chips.push(`<span class="chip"><a href="tel:${attr(p.phone)}">${esc(p.phone)}</a></span>`);
  if (p.email) chips.push(`<span class="chip"><a href="mailto:${attr(p.email)}">${esc(p.email)}</a></span>`);

  const social = [];
  if (p.linkedin) social.push(`<a class="sbtn primary" href="${attr(p.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>`);
  if (p.email) social.push(`<a class="sbtn${p.linkedin ? '' : ' primary'}" href="mailto:${attr(p.email)}">${esc(t.email_me)}</a>`);
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
    <div class="sharecard">
      ${qr ? `<img class="qrthumb" id="qrThumb" src="${attr(qr)}" alt="${attr(t.qr_alt)}"
             role="button" tabindex="0" title="${attr(t.show_qr)}">` : ''}
      <div class="sharemeta">
      <div class="sharehint">${esc(t.share_hint)}</div>
      <div class="sharebtns">
        <button class="shbtn primary" id="sh-share">${esc(t.share)}</button>
        <button class="shbtn" id="sh-vcard">${esc(t.save_contact)}</button>
        <button class="shbtn" id="sh-copy">${esc(t.copy_link)}</button>
        ${qr ? `<button class="shbtn" id="qrBtn">${esc(t.show_qr)}</button>` : ''}
      </div>
    </div></div>
  </div>
</div></header>`;
}

function voiceBlock(name, lang) {
  const t = L(lang);
  const first = name.split(' ')[0] || name;
  return `<div class="voicebar"><div class="voicecard">
  <div class="vorb" id="vorb" role="button" tabindex="0" aria-label="${attr(t.play)}"></div>
  <div style="flex:1">
    <div class="vname">${esc(fmt(t.ai_voice, first))} <span class="vtag">${esc(t.voice_tag)}</span></div>
    <div class="vrole">${esc(t.voice_sub)}</div>
    <div class="sharebtns">
      <button class="shbtn primary" id="v-play">${esc(t.play)}</button>
      <button class="shbtn" id="v-stop" disabled>${esc(t.stop)}</button>
    </div>
    <div class="vstatus" id="v-status">${esc(t.voice_hint)}</div>
  </div>
</div></div>`;
}

function sections(p, lang) {
  const t = L(lang);
  let h = '<div class="wrap">';
  let n = 0;
  const sh = (t) => {
    n++;
    return `<div class="sec-head"><span class="k">${String(n).padStart(2, '0')}</span><h2>${esc(t)}</h2><span class="rule"></span></div>`;
  };

  if (p.summary) h += `<section>${sh(t.profile)}<p class="prose">${esc(p.summary)}</p></section>`;

  if (p.skills && p.skills.length) {
    h += `<section>${sh(t.skills)}<div class="grid">` +
      p.skills.slice(0, 18).map((s) =>
        `<div class="gcard">${esc(typeof s === 'string' ? s : s.name)}</div>`).join('') +
      '</div></section>';
  }

  if (p.experience && p.experience.length) {
    h += `<section>${sh(t.experience)}<div class="timeline">` +
      p.experience.map((e) => `<div class="tl">
        <div class="role">${esc(e.title || '')}</div>
        ${e.company ? `<div class="org">${esc(e.company)}</div>` : ''}
        ${(e.start || e.end) ? `<div class="when">${esc(e.start || '')} &mdash; ${esc(e.end || 'Present')}</div>` : ''}
        ${(e.highlights && e.highlights.length)
          ? '<ul>' + e.highlights.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>' : ''}
      </div>`).join('') + '</div></section>';
  }

  if (p.education && p.education.length) {
    h += `<section>${sh(t.education)}<div class="timeline">` +
      p.education.map((e) => `<div class="tl">
        <div class="role">${esc(e.institution || '')}</div>
        ${(e.studyType || e.area) ? `<div class="org">${esc([e.studyType, e.area].filter(Boolean).join(', '))}</div>` : ''}
        ${e.end ? `<div class="when">${esc(e.end)}</div>` : ''}
      </div>`).join('') + '</div></section>';
  }

  if (p.certifications && p.certifications.length) {
    h += `<section>${sh(t.extras)}<div class="tags">` +
      p.certifications.map((c) => `<span class="tag">${esc(typeof c === 'string' ? c : c.name)}</span>`).join('') +
      '</div></section>';
  }

  return h + '</div>';
}

/** Spoken walkthrough, built ONLY from the privacy-projected profile. */
function narrationFor(p, name, lang) {
  const t = L(lang);
  const out = [`This is the profile of ${name}.`];
  if (p.headline) out.push(p.headline + '.');
  if (p.summary) out.push(p.summary);
  if (p.experience && p.experience.length) {
    const e = p.experience[0];
    out.push(`Most recently, ${e.title || 'working'}${e.company ? ' at ' + e.company : ''}.`);
  }
  if (p.skills && p.skills.length) {
    out.push(t.core_skills +
      p.skills.slice(0, 6).map((s) => (typeof s === 'string' ? s : s.name)).join(', ') + '.');
  }
  return out;
}

function scripts(name, url, p, narration, lang) {
  const t = L(lang);
  const voice = lang === 'es' ? 'dalia' : 'ava';
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
    else if(navigator.clipboard){navigator.clipboard.writeText(U);sh.textContent=${JSON.stringify(t.link_copied)};}
  });
  if(cp) cp.addEventListener('click',function(){
    if(!navigator.clipboard) return;
    navigator.clipboard.writeText(U).then(function(){cp.textContent=${JSON.stringify(t.copied)};
      setTimeout(function(){cp.textContent=${JSON.stringify(t.copy_link)};},1600);});
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

/* QR modal — thumbnail and button both open it; Esc and the backdrop close it. */
(function(){
  var modal=document.getElementById('qrModal'); if(!modal) return;
  function open(){modal.classList.add('open');}
  function close(){modal.classList.remove('open');}
  var th=document.getElementById('qrThumb');
  if(th){th.addEventListener('click',open);
    th.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});}
  var qb=document.getElementById('qrBtn'); if(qb) qb.addEventListener('click',open);
  var qc=document.getElementById('qrClose'); if(qc) qc.addEventListener('click',close);
  modal.addEventListener('click',function(e){if(e.target===modal)close();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
})();

/* Inbound contact. The subscriber's address is never in this page — the
   message is routed through JobUp and appears in their Opportunities tab. */
(function(){
  var f=document.getElementById('cform'); if(!f) return;
  var msg=document.getElementById('c-msg'),go=document.getElementById('c-go');
  var SLUG=location.hostname.split('.')[0];
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var email=(document.getElementById('c-email').value||'').trim();
    var note=(document.getElementById('c-note').value||'').trim();
    if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)){
      msg.className='cmsg bad';msg.textContent=${JSON.stringify(t.bad_email)};return;}
    if(note.length<10){msg.className='cmsg bad';msg.textContent=${JSON.stringify(t.short_msg)};return;}
    go.disabled=true;go.textContent=${JSON.stringify(t.sending)};msg.className='cmsg';msg.textContent='';
    fetch('/api/v1/intake/contact/'+encodeURIComponent(SLUG),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        from_name:document.getElementById('c-name').value,
        from_email:email,
        company:document.getElementById('c-company').value,
        role:document.getElementById('c-role').value,
        note:note,
        website:document.getElementById('c-website').value})})
      .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
      .then(function(r){
        if(!r.ok){go.disabled=false;go.textContent=${JSON.stringify(t.send)};
          msg.className='cmsg bad';msg.textContent=r.j.error||${JSON.stringify(t.no_send)};return;}
        f.innerHTML='<div class="cmsg ok" style="font-size:15px">'+
          'Message sent. It is in their dashboard now, and they can reply to you directly.</div>';
      }).catch(function(){go.disabled=false;go.textContent=${JSON.stringify(t.send)};
        msg.className='cmsg bad';msg.textContent=${JSON.stringify(t.no_server)};});
  });
})();
</script></body></html>`;
}

function page(profile, settings, ctx) {
  const lang = (ctx && ctx.lang) === 'es' ? 'es' : 'en';
  const t = L(lang);
  const p = identity.applyPrivacy(profile, settings);
  const ld = identity.personJsonLd(profile, settings, ctx);
  const name = ctx.name || p.name || 'Professional';
  const desc = (p.summary || p.headline || name).slice(0, 200);
  const roles = settingsSvc.pageRoles(settings);
  const roleLine = p.headline || (roles[0] && roles[0].title) || '';

  let h = head(`${name}${p.headline ? ' — ' + p.headline : ''}`, desc, ld, ctx.url, lang);
  h += nav(name, ctx.url, p, lang);
  h += heroBlock(p, name, ctx.url, roleLine, lang);
  h += voiceBlock(name, lang);
  h += sections(p, lang);

  h += '<div class="wrap">';
  if (roles.length) {
    h += '<section><div class="sec-head"><span class="k">&#9679;</span><h2>' + esc(t.open_to) + '</h2>' +
      '<span class="rule"></span></div><div class="tags">' +
      roles.map((r) => `<a class="tag" href="/roles/${attr(r.slug)}">${esc(r.title)}</a>`).join('') +
      '</div></section>';
  }
  // "Contact details are available on request" was a dead end — there was no
  // way to make the request. This routes THROUGH us, so the subscriber's
  // address stays private and the message lands in their Opportunities tab.
  const firstName = esc(String(name || '').split(' ')[0] || 'them');
  h += `<div class="cta-final"><h3>${esc(t.hiring)}</h3>
    <p>${p.email
      ? esc(fmt(t.reach_direct, name))
      : esc(fmt(t.send_msg, firstName))}</p>
    ${p.email ? `<a class="sbtn primary" href="mailto:${attr(p.email)}">${esc(t.email_me)}</a>` : ''}
    <form class="cform" id="cform" novalidate>
      <div class="crow">
        <input id="c-name" type="text" placeholder="${attr(t.your_name)}" autocomplete="name" maxlength="120">
        <input id="c-email" type="email" placeholder="${attr(t.your_email)}" autocomplete="email" maxlength="200">
      </div>
      <div class="crow">
        <input id="c-company" type="text" placeholder="${attr(t.company)}" autocomplete="organization" maxlength="160">
        <input id="c-role" type="text" placeholder="${attr(t.role_hiring)}" maxlength="160">
      </div>
      <textarea id="c-note" rows="4" placeholder="${attr(t.what_talk)}" maxlength="4000"></textarea>
      <input id="c-website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" class="hp">
      <button class="sbtn primary" id="c-go" type="submit">${esc(t.send)}</button>
      <div class="cmsg" id="c-msg"></div>
      <div class="cnote">${esc(fmt(t.delivered_to, firstName))}</div>
    </form>
  </div>`;
  // Full-size QR, mirroring manuelstagg.com: a thumbnail in the share card
  // that opens a modal. Generated per subscriber, served from our own origin —
  // no third-party QR service ever sees a subscriber's address.
  if (p.qr_data_uri) {
    h += `<div class="qrmodal" id="qrModal" role="dialog" aria-modal="true" aria-label="${attr(t.show_qr)}">
      <div class="qrbox">
        <button class="qrclose" id="qrClose" aria-label="${attr(t.close)}">&times;</button>
        <img class="qrbig" src="${attr(p.qr_data_uri)}" alt="${attr(t.qr_alt)}">
        <div class="qrurl">${esc(String(ctx.url).replace(/^https?:\/\//, ''))}</div>
        <div class="qrhint">${esc(t.qr_hint)}</div>
      </div></div>`;
  }

  h += `<footer><div>${esc(t.built_by)} &middot;
    <a href="/app">${esc(t.owner_signin)}</a></div><div>
    <a href="${attr(ctx.url)}/resume.json">resume.json</a> &middot;
    <a href="${attr(ctx.url)}/.well-known/agent.json">${esc(t.agent_card)}</a> &middot;
    <a href="${attr(ctx.url)}/llms.txt">llms.txt</a></div></footer></div>`;

  return h + scripts(name, ctx.url, p, narrationFor(p, name, lang), lang);
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
