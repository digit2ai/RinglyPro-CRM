'use strict';

// =============================================================
// teasers — one-click voice POC teasers for project requests.
//
//   adminRouter  (mounted under authenticateToken):
//     POST /teaser-admin/projects/:id/generate   -> AI-generate + store, returns share URL
//     GET  /teaser-admin/projects/:id/list        -> recent teasers for a project
//     GET  /teaser-admin/:token                    -> one teaser (for preview/regenerate)
//     POST /teaser-admin/:token/send               -> email | sms | whatsapp + ready links
//
//   publicRouter (mounted BEFORE auth at /teaser):
//     GET  /:token            -> full standalone teaser page (Lina voice orb + POC)
//     GET  /:token/segments   -> JSON narration (voice, lang, segments)
// =============================================================

const express = require('express');
const crypto = require('crypto');
const { sequelize, Project, Company } = require('../models');
const generator = require('../services/voiceTeaserGenerator');
const teaserSend = require('../services/teaserSend');

const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');

function teaserUrl(token) { return `${PUBLIC_BASE}/projects/teaser/${token}`; }

async function loadTeaser(token) {
  const [rows] = await sequelize.query(
    'SELECT * FROM d2_project_teasers WHERE token = :token LIMIT 1',
    { replacements: { token } }
  );
  return rows && rows[0] ? rows[0] : null;
}

function contentOf(row) {
  if (!row) return null;
  return typeof row.content_json === 'string' ? JSON.parse(row.content_json) : row.content_json;
}

// =====================================================
// ADMIN ROUTER
// =====================================================
const adminRouter = express.Router();
adminRouter.use(express.json({ limit: '2mb' }));

adminRouter.post('/projects/:id/generate', async (req, res) => {
  try {
    const project = await Project.findByPk(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    let company_name = '';
    if (project.company_id && Company) {
      const c = await Company.findByPk(project.company_id).catch(() => null);
      company_name = c ? c.name : '';
    }
    const projObj = { ...project.toJSON(), company_name };

    const teaser = await generator.generate(projObj, { lang: req.body && req.body.lang });
    const token = crypto.randomUUID();
    await sequelize.query(
      `INSERT INTO d2_project_teasers (workspace_id, project_id, token, title, lang, voice, content_json, status, model, created_at, updated_at)
       VALUES (:workspace_id, :project_id, :token, :title, :lang, :voice, CAST(:content AS JSONB), 'ready', :model, NOW(), NOW())`,
      { replacements: {
        workspace_id: project.workspace_id || 1,
        project_id: project.id,
        token,
        title: teaser.title,
        lang: teaser.lang,
        voice: teaser.voice,
        content: JSON.stringify(teaser),
        model: teaser.model
      } }
    );
    res.json({ success: true, token, url: teaserUrl(token), teaser });
  } catch (err) {
    console.error('[teasers] generate failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Regenerate a teaser IN PLACE — same token/URL, fresh content. Lets an
// already-sent magic link be refreshed (e.g. apply new copy rules) without
// breaking the link the client already has.
adminRouter.post('/:token/regenerate', async (req, res) => {
  try {
    const row = await loadTeaser(req.params.token);
    if (!row) return res.status(404).json({ success: false, error: 'Teaser not found' });
    const project = await Project.findByPk(row.project_id);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    let company_name = '';
    if (project.company_id && Company) {
      const c = await Company.findByPk(project.company_id).catch(() => null);
      company_name = c ? c.name : '';
    }
    const projObj = { ...project.toJSON(), company_name };
    const lang = (req.body && req.body.lang) || row.lang;
    const teaser = await generator.generate(projObj, { lang });

    await sequelize.query(
      `UPDATE d2_project_teasers
         SET title = :title, lang = :lang, voice = :voice, content_json = CAST(:content AS JSONB),
             model = :model, status = 'ready', updated_at = NOW()
       WHERE token = :token`,
      { replacements: {
        token: row.token, title: teaser.title, lang: teaser.lang, voice: teaser.voice,
        content: JSON.stringify(teaser), model: teaser.model
      } }
    );
    res.json({ success: true, token: row.token, url: teaserUrl(row.token), teaser });
  } catch (err) {
    console.error('[teasers] regenerate failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

adminRouter.get('/projects/:id/list', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT token, title, lang, status, created_at FROM d2_project_teasers
       WHERE project_id = :pid ORDER BY created_at DESC LIMIT 20`,
      { replacements: { pid: req.params.id } }
    );
    res.json({ success: true, data: rows.map(r => ({ ...r, url: teaserUrl(r.token) })) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

adminRouter.get('/:token', async (req, res) => {
  try {
    const row = await loadTeaser(req.params.token);
    if (!row) return res.status(404).json({ success: false, error: 'Teaser not found' });
    res.json({ success: true, token: row.token, url: teaserUrl(row.token), teaser: contentOf(row) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

adminRouter.post('/:token/send', async (req, res) => {
  try {
    const row = await loadTeaser(req.params.token);
    if (!row) return res.status(404).json({ success: false, error: 'Teaser not found' });
    const { channel, to } = req.body || {};
    if (!['email', 'sms', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ success: false, error: 'channel must be email | sms | whatsapp' });
    }
    const teaser = contentOf(row);
    const result = await teaserSend.send({ channel, to, teaser, url: teaserUrl(row.token), lang: row.lang });
    res.json({ success: true, result });
  } catch (err) {
    console.error('[teasers] send failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// PUBLIC ROUTER
// =====================================================
const publicRouter = express.Router();

publicRouter.get('/:token/segments', async (req, res) => {
  try {
    const row = await loadTeaser(req.params.token);
    if (!row) return res.status(404).json({ error: 'not found' });
    const t = contentOf(row);
    res.json({ voice: t.voice, lang: t.lang, segments: t.segments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

publicRouter.get('/:token', async (req, res) => {
  try {
    const row = await loadTeaser(req.params.token);
    if (!row) return res.status(404).type('html').send('<h1>Teaser not found</h1>');
    res.type('html').send(renderTeaserPage(contentOf(row)));
  } catch (err) {
    console.error('[teasers] viewer failed:', err);
    res.status(500).type('html').send('<h1>Error</h1><pre>' + esc(err.message) + '</pre>');
  }
});

// =====================================================
// HTML RENDER
// =====================================================
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderTeaserPage(t) {
  const es = t.lang === 'es';
  const segs = JSON.stringify(t.segments || []);
  // Brand default: the teaser voice is always México (Dalia) = Lina, regardless of
  // the teaser's narration language. The listener can switch via the accent picker.
  const voice = t.voice || 'lina';
  const ui = es
    ? { play: '▶ Que Lina lo explique todo', pause: '❚❚ Pausar', stop: '■ Detener', idle: 'Pulsa el botón para que Lina te lo explique.', neural: 'Voz neural HD', accent: 'Acento', role: 'Tu adelanto, narrado por la voz de IA de Digit2AI', poweredBy: 'Generado por el AI Architect de Digit2AI', cta: 'Hablar con el equipo' }
    : { play: '▶ Let Lina explain it all', pause: '❚❚ Pause', stop: '■ Stop', idle: 'Tap the button and let Lina walk you through it.', neural: 'HD neural voice', accent: 'Accent', role: 'Your teaser, narrated by the Digit2AI AI voice', poweredBy: 'Generated by the Digit2AI AI Architect', cta: 'Talk to the team' };

  const section = (id, heading, inner) => `
    <section id="${id}" class="sec">
      <h2>${esc(heading)}</h2>
      ${inner}
    </section>`;

  const bullets = (arr) => arr && arr.length ? `<ul class="bullets">${arr.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : '';
  const phases = (arr) => arr && arr.length ? `<div class="phases">${arr.map(p => `<div class="phase"><div class="phase-name">${esc(p.name)}</div><div class="phase-detail">${esc(p.detail)}</div></div>`).join('')}</div>` : '';

  // body_html fields come from the generator already-sanitized via normalize(); re-sanitize defensively.
  const safe = (html) => generator.sanitizePocHtml(html || '');

  const ctaEmail = 'mstagg@digit2ai.com';
  const ctaSubject = encodeURIComponent((es ? 'Adelanto: ' : 'Teaser: ') + (t.title || ''));

  return `<!DOCTYPE html>
<html lang="${es ? 'es' : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(t.title)} — Digit2AI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#070b16;--bg2:#0b1224;--card:#101a32;--line:rgba(255,255,255,.08);--txt:#e6eefc;--mut:#8aa0c6;--cyan:#22d3ee;--violet:#7c5cff}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:radial-gradient(1200px 600px at 50% -10%,#16224a,var(--bg));color:var(--txt);line-height:1.7}
.wrap{max-width:880px;margin:0 auto;padding:40px 22px 80px}
.brand{font-size:12px;letter-spacing:4px;text-transform:uppercase;color:var(--violet);font-weight:800}
.hero{padding:18px 0 10px}
.hero h1{font-size:clamp(2rem,5vw,3.2rem);font-weight:800;line-height:1.1;margin:10px 0 8px;background:linear-gradient(135deg,#fff,#9bc7ff);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.hero .tag{color:var(--cyan);font-size:1.05rem;font-weight:600}
.hero .sub{color:var(--mut);margin-top:10px;font-size:1.05rem;max-width:640px}
/* Lina orb */
.lina{margin:30px 0;background:linear-gradient(180deg,var(--card),var(--bg2));border:1px solid var(--line);border-radius:20px;padding:24px;display:flex;gap:20px;align-items:center;box-shadow:0 20px 60px rgba(0,0,0,.45)}
.orb{position:relative;width:88px;height:88px;flex:0 0 88px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#bda4ff,#6a4bff 45%,#2a1f6b 100%);box-shadow:0 0 0 0 rgba(155,123,255,.5)}
.orb::after{content:"";position:absolute;inset:-8px;border-radius:50%;border:2px solid rgba(155,123,255,.35)}
.orb.speaking{animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(155,123,255,.45)}70%{box-shadow:0 0 0 22px rgba(155,123,255,0)}100%{box-shadow:0 0 0 0 rgba(155,123,255,0)}}
.lina-meta{flex:1;min-width:0}
.lina-name{font-weight:700;font-size:17px}
.lina-role{color:var(--mut);font-size:13px;margin-bottom:12px}
.controls{display:flex;gap:10px;flex-wrap:wrap}
button{font:inherit;cursor:pointer;border-radius:9px;padding:9px 15px;font-size:13px;font-weight:600;border:1px solid var(--line);background:rgba(255,255,255,.06);color:#dbe6ff}
button.primary{background:linear-gradient(135deg,var(--cyan),var(--violet));color:#06122b;border:none;font-weight:700}
button:disabled{opacity:.45;cursor:default}
.status{font-size:12.5px;color:var(--mut);margin-top:11px;min-height:18px}
.voicepick{margin-top:11px;font-size:12.5px;color:var(--mut);display:flex;align-items:center;flex-wrap:wrap;gap:4px}
.voicepick select{font:inherit;background:#16203a;color:var(--txt);border:1px solid var(--line);border-radius:8px;padding:5px 8px;margin-left:6px}
.voicemode{margin-left:8px;color:#7cf2c0}
.sec{margin:34px 0;padding:24px;background:rgba(255,255,255,.025);border:1px solid var(--line);border-radius:16px;scroll-margin-top:20px}
.sec.active{border-color:rgba(124,92,255,.55);box-shadow:0 0 0 1px rgba(124,92,255,.25)}
.sec h2{font-size:1.45rem;margin-bottom:12px}
.sec p{color:#cdd9f2;margin:0 0 10px}
.bullets{list-style:none;display:grid;gap:8px;margin-top:6px}
.bullets li{padding-left:26px;position:relative;color:#cdd9f2}
.bullets li::before{content:"";position:absolute;left:0;top:9px;width:12px;height:12px;border-radius:3px;background:linear-gradient(135deg,var(--cyan),var(--violet))}
.poc-intro{color:var(--mut);font-size:13.5px;margin-bottom:14px}
.poc-frame{background:#0a122a;border:1px solid var(--line);border-radius:14px;padding:18px;overflow-x:auto}
.poc-frame *{max-width:100%}
.phases{display:grid;gap:12px;margin-top:8px}
.phase{background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.phase-name{font-weight:700;color:#cfe0ff}
.phase-detail{color:var(--mut);font-size:13.5px}
.cta{margin-top:34px;text-align:center;padding:34px 24px;background:linear-gradient(135deg,rgba(34,211,238,.12),rgba(124,92,255,.12));border:1px solid var(--line);border-radius:18px}
.cta h2{font-size:1.6rem;margin-bottom:8px}
.cta p{color:var(--mut);max-width:520px;margin:0 auto 18px}
.cta a{display:inline-block;background:linear-gradient(135deg,var(--cyan),var(--violet));color:#06122b;font-weight:700;text-decoration:none;padding:14px 30px;border-radius:10px}
.foot{margin-top:34px;text-align:center;color:#5f7197;font-size:12px}
@media(max-width:560px){.lina{flex-direction:column;text-align:center}.controls{justify-content:center}.voicepick{justify-content:center}}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">Digit2AI</div>

  <div class="hero" id="top">
    <h1>${esc(t.hero.headline)}</h1>
    <div class="tag">${esc(t.tagline)}</div>
    <div class="sub">${esc(t.hero.subhead)}</div>
  </div>

  <!-- Lina voice orb -->
  <div class="lina" id="lina">
    <div class="orb" id="orb"></div>
    <div class="lina-meta">
      <div class="lina-name">Lina · Digit2AI</div>
      <div class="lina-role">${ui.role}</div>
      <div class="controls">
        <button class="primary" id="playAll">${ui.play}</button>
        <button id="pause" disabled>${ui.pause}</button>
        <button id="stop" disabled>${ui.stop}</button>
      </div>
      <div class="status" id="status">${ui.idle}</div>
      <div class="voicepick">
        <label><input type="checkbox" id="neuralToggle" checked> ${ui.neural}</label>
        <span class="voicemode" id="voiceMode"></span>
        &nbsp;·&nbsp; ${ui.accent}:
        <select id="voiceSel">
          <option value="lina" selected>México (Dalia)</option>
          <option value="paloma">EE. UU. (Paloma)</option>
          <option value="salome">Colombia (Salomé)</option>
          <option value="elvira">España (Elvira)</option>
          <option value="ava">${es ? 'Inglés (Ava)' : 'English (Ava)'}</option>
        </select>
      </div>
    </div>
  </div>

  ${section('challenge', t.challenge.heading, safe(t.challenge.body_html))}
  ${section('solution', t.solution.heading, safe(t.solution.body_html))}
  ${section('poc', t.poc.heading, `<div class="poc-intro">${esc(t.poc.intro)}</div><div class="poc-frame">${t.poc.html}</div>`)}
  ${section('value', t.value.heading, bullets(t.value.bullets))}
  ${t.deliverables.items && t.deliverables.items.length ? section('deliverables', t.deliverables.heading, bullets(t.deliverables.items)) : ''}
  ${section('plan', t.plan.heading, `${t.plan.summary ? `<p>${esc(t.plan.summary)}</p>` : ''}${phases(t.plan.phases)}`)}

  <div class="cta" id="cta">
    <h2>${esc(t.cta.heading)}</h2>
    <p>${esc(t.cta.body)}</p>
    <a href="mailto:${ctaEmail}?subject=${ctaSubject}">${ui.cta} &rarr;</a>
  </div>

  <div class="foot">${ui.poweredBy}</div>
</div>

<script>
(function(){
  var segments = ${segs};
  var VOICE = ${JSON.stringify(voice)};
  var FALLBACK_LANG = ${JSON.stringify(es ? 'es-MX' : 'en-US')};
  var SECTION_IDS = [null,'challenge','solution','poc','plan','cta'];
  var NEURAL_URL = '/api/tts/edge';
  var synth = window.speechSynthesis;
  var orb=document.getElementById('orb'), status=document.getElementById('status');
  var playAll=document.getElementById('playAll'), pauseBtn=document.getElementById('pause'), stopBtn=document.getElementById('stop');
  var voiceSel=document.getElementById('voiceSel'), neuralToggle=document.getElementById('neuralToggle'), voiceMode=document.getElementById('voiceMode');
  var queue=[],qi=0,mode=null,runToken=0,paused=false,currentAudio=null,playbackMode=null,neuralOK=true,cache={},browserVoice=null;
  var voiceName = voiceSel ? voiceSel.value : VOICE;

  function pickBrowserVoice(){ if(!synth) return; var vs=synth.getVoices(); var p=vs.filter(function(v){return v.lang&&v.lang.toLowerCase().indexOf(FALLBACK_LANG.slice(0,2))===0;}); browserVoice=p[0]||vs[0]||null; }
  if(synth){ pickBrowserVoice(); synth.onvoiceschanged=pickBrowserVoice; }
  function useNeural(){ return neuralToggle.checked && neuralOK; }
  function setMode(){ voiceMode.textContent = useNeural()?'● HD':'○ '+(${JSON.stringify(es)}?'navegador':'browser'); }
  setMode();
  if(voiceSel) voiceSel.addEventListener('change',function(){ voiceName=this.value; clearCache(); });
  neuralToggle.addEventListener('change',setMode);
  function clearCache(){ Object.keys(cache).forEach(function(k){try{URL.revokeObjectURL(cache[k]);}catch(e){}}); cache={}; }

  function fetchNeural(idx){
    var key=voiceName+'|'+idx;
    if(cache[key]) return Promise.resolve(cache[key]);
    return fetch(NEURAL_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:segments[idx],voice:voiceName})})
      .then(function(r){if(!r.ok)throw new Error('http '+r.status);return r.blob();})
      .then(function(b){if(!b||b.size<200)throw new Error('empty');var u=URL.createObjectURL(b);cache[key]=u;return u;});
  }
  function setActive(idx){ document.querySelectorAll('.sec').forEach(function(s){s.classList.remove('active');}); var id=SECTION_IDS[idx]; if(id){var el=document.getElementById(id); if(el){el.classList.add('active'); el.scrollIntoView({behavior:'smooth',block:'start'});}} }
  function statusSpeaking(){ status.textContent = mode==='all' ? ((${JSON.stringify(es)}?'Lina está hablando… (':'Lina is speaking… (')+(qi+1)+(${JSON.stringify(es)}?' de ':' of ')+queue.length+')') : '…'; }

  function runQueue(token){
    if(token!==runToken) return;
    if(qi>=queue.length){ finish(); return; }
    var idx=queue[qi];
    setActive(idx);
    function advance(){ if(token!==runToken)return; qi++; runQueue(token); }
    if(useNeural()){
      status.textContent = ${JSON.stringify(es)}?'Preparando voz neural…':'Preparing neural voice…';
      if(qi+1<queue.length) fetchNeural(queue[qi+1]).catch(function(){});
      fetchNeural(idx).then(function(url){
        if(token!==runToken)return;
        playbackMode='neural'; currentAudio=new Audio(url);
        currentAudio.onended=advance;
        currentAudio.onerror=function(){neuralOK=false;setMode();advance();};
        orb.classList.add('speaking'); statusSpeaking();
        currentAudio.play().catch(function(){neuralOK=false;setMode();browserSpeak(idx,advance);});
      }).catch(function(){ if(token!==runToken)return; neuralOK=false; setMode(); browserSpeak(idx,advance); });
    } else { browserSpeak(idx,advance); }
  }
  function browserSpeak(idx,onEnd){
    if(!synth){ onEnd(); return; }
    playbackMode='browser';
    var u=new SpeechSynthesisUtterance(segments[idx]);
    if(browserVoice) u.voice=browserVoice;
    u.lang=browserVoice?browserVoice.lang:FALLBACK_LANG; u.rate=0.98; u.pitch=1.04;
    u.onstart=function(){orb.classList.add('speaking');statusSpeaking();};
    u.onend=onEnd; u.onerror=onEnd; synth.speak(u);
  }
  function start(q,m){
    if(synth) synth.cancel();
    if(currentAudio){try{currentAudio.pause();}catch(e){}currentAudio=null;}
    queue=q; qi=0; mode=m; paused=false; runToken++;
    pauseBtn.disabled=false; stopBtn.disabled=false; playAll.disabled=true; pauseBtn.textContent=${JSON.stringify(ui.pause)};
    runQueue(runToken);
  }
  function finish(){
    runToken++; orb.classList.remove('speaking'); document.querySelectorAll('.sec').forEach(function(s){s.classList.remove('active');});
    if(currentAudio){try{currentAudio.pause();}catch(e){}currentAudio=null;}
    pauseBtn.disabled=true; stopBtn.disabled=true; playAll.disabled=false;
    status.textContent=${JSON.stringify(es)}?'Listo. Pulsa de nuevo para repetir.':'Done. Tap again to replay.';
  }
  playAll.addEventListener('click',function(){ start(segments.map(function(_,i){return i;}),'all'); });
  pauseBtn.addEventListener('click',function(){
    if(!paused){ paused=true; pauseBtn.textContent=${JSON.stringify(es ? '▶ Reanudar' : '▶ Resume')}; orb.classList.remove('speaking'); status.textContent=${JSON.stringify(es?'En pausa.':'Paused.')};
      if(playbackMode==='neural'&&currentAudio) currentAudio.pause(); else if(synth) synth.pause(); }
    else { paused=false; pauseBtn.textContent=${JSON.stringify(ui.pause)}; orb.classList.add('speaking'); statusSpeaking();
      if(playbackMode==='neural'&&currentAudio) currentAudio.play(); else if(synth) synth.resume(); }
  });
  stopBtn.addEventListener('click',finish);
  window.addEventListener('beforeunload',function(){ if(synth) synth.cancel(); if(currentAudio){try{currentAudio.pause();}catch(e){}} });
})();
</script>
</body>
</html>`;
}

module.exports = { adminRouter, publicRouter, renderTeaserPage };
