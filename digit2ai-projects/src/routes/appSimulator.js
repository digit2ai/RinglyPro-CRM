'use strict';

// =============================================================
// appSimulator — public magic-link viewer for the interactive app
// mockup the prospect requested. Renders the stored blueprint inside
// a phone (mobile) or browser (web) frame with a working bottom/side
// nav, clickable navigation between screens, and a "Book a call &
// ship" CTA that deep-links back to the OrbUp booking flow.
//
//   publicRouter (mounted BEFORE auth at /simulator):
//     GET /:token            -> full standalone interactive simulator page
//     GET /:token/blueprint  -> raw blueprint JSON
// =============================================================

const express = require('express');
const { sequelize } = require('../models');

const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadSim(token) {
  if (!UUID_RE.test(String(token || ''))) return null;  // avoid uuid-cast errors on junk tokens
  const [rows] = await sequelize.query(
    'SELECT * FROM d2_project_simulators WHERE token = :token LIMIT 1',
    { replacements: { token } }
  );
  return rows && rows[0] ? rows[0] : null;
}
function blueprintOf(row) {
  if (!row) return null;
  const c = row.content_json;
  return typeof c === 'string' ? JSON.parse(c) : c;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const publicRouter = express.Router();

publicRouter.get('/:token/blueprint', async (req, res) => {
  try {
    const row = await loadSim(req.params.token);
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, blueprint: blueprintOf(row) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

publicRouter.get('/:token', async (req, res) => {
  try {
    const row = await loadSim(req.params.token);
    if (!row) return res.status(404).type('html').send('<h1 style="font-family:system-ui;padding:40px">Simulator not found</h1>');
    const bp = blueprintOf(row);
    const embed = req.query.embed === '1' || req.query.embed === 'true';
    res.type('html').send(renderSimulatorPage(bp, { token: req.params.token, projectId: row.project_id, embed }));
  } catch (err) {
    console.error('[AppSimulator] render error:', err);
    res.status(500).type('html').send('<h1 style="font-family:system-ui;padding:40px">Could not load simulator</h1>');
  }
});

// ---------------------------------------------------------------
// RENDERER — deterministic; paints the blueprint the LLM produced.
// ---------------------------------------------------------------
function renderSimulatorPage(bp, meta = {}) {
  bp = bp || {};
  const es = bp.lang === 'es';
  const embed = !!meta.embed;   // embedded inside the teaser page (drop outer chrome/CTA)
  const hue = Number.isFinite(Number(bp.brand_hue)) ? Number(bp.brand_hue) : 210;
  const isMobile = bp.platform !== 'web';
  const tabs = Array.isArray(bp.tabs) && bp.tabs.length ? bp.tabs : [{ id: 'home', label: 'Home', icon: 'home' }];
  const screens = Array.isArray(bp.screens) && bp.screens.length ? bp.screens : [{ id: 'home', tab: tabs[0].id, title: bp.app_name || 'Home', blocks: [] }];

  const orbupPath = es ? '/orbup-es' : '/orbup';
  const bookHref = `${PUBLIC_BASE}${orbupPath}?book=1&sim=${encodeURIComponent(meta.token || '')}${meta.projectId ? '&pid=' + encodeURIComponent(meta.projectId) : ''}`;
  const T = es
    ? { disclaimer: 'Simulación interactiva — así se vería la app que estás pidiendo. No es el producto final.', book: 'Agendar llamada y construir', built: 'Construido con', preview: 'Vista previa del producto' }
    : { disclaimer: 'Interactive simulation — a preview of the app you are requesting. Not the final product.', book: 'Book a call & ship', built: 'Built with', preview: 'Product preview' };

  const firstScreenByTab = {};
  for (const t of tabs) {
    const s = screens.find(x => x.tab === t.id) || screens[0];
    firstScreenByTab[t.id] = s.id;
  }

  const screensHtml = screens.map(s => `
    <section class="screen" data-screen="${esc(s.id)}" data-tab="${esc(s.tab)}" hidden>
      <div class="topbar"><span>${esc(s.title || '')}</span></div>
      <div class="scroll">${(s.blocks || []).map(function (bl) { return renderBlock(bl, es); }).join('')}</div>
    </section>`).join('');

  const navHtml = tabs.map(t => `
    <button class="navbtn" data-goto-tab="${esc(t.id)}">
      ${navIcon(t.icon)}<span>${esc(t.label)}</span>
    </button>`).join('');

  return `<!doctype html><html lang="${es ? 'es' : 'en'}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(bp.app_name || 'App Simulator')} — ${esc(T.preview)}</title>
<style>
:root{--hue:${hue};--accent:hsl(var(--hue) 82% 56%);--accent-2:hsl(calc(var(--hue) + 28) 82% 60%);
  --bg:#0b0f17;--panel:#0f1524;--card:#141c2e;--line:#233149;--ink:#e9eef7;--mut:#8ea0bd;--good:#34d399;}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;
  background:${embed ? 'transparent' : 'radial-gradient(1200px 700px at 20% -10%,hsl(var(--hue) 60% 18% / .5),transparent 60%),var(--bg)'};color:var(--ink);
  min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:${embed ? '10px 8px 14px' : '26px 16px 40px'}}
.wrap{width:100%;max-width:940px;display:flex;flex-direction:column;align-items:center;gap:8px}
.brandbar{display:flex;align-items:center;gap:10px;margin-bottom:4px}
.dot{width:11px;height:11px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-2));box-shadow:0 0 14px var(--accent)}
.brandbar b{font-size:15px;letter-spacing:.3px}.brandbar .tg{color:var(--mut);font-size:13px}
.stage{display:flex;justify-content:center;width:100%;margin-top:8px}

/* phone frame */
.device{position:relative;background:#05070c;border:1px solid var(--line);box-shadow:0 40px 90px rgba(0,0,0,.6),inset 0 0 0 6px #0a0e16;
  overflow:hidden;display:flex;flex-direction:column}
.device.mobile{width:360px;height:720px;border-radius:44px;padding:12px}
.device.web{width:100%;max-width:900px;height:620px;border-radius:16px;padding:0}
.device.mobile .notch{position:absolute;top:12px;left:50%;transform:translateX(-50%);width:120px;height:26px;background:#05070c;border-radius:0 0 16px 16px;z-index:5}
.app{position:relative;flex:1;background:var(--panel);border-radius:34px;overflow:hidden;display:flex;flex-direction:column}
.device.web .app{border-radius:0 0 16px 16px}
.device.web .chrome{height:38px;background:#0a1120;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:7px;padding:0 14px;flex:0 0 38px}
.device.web .chrome i{width:11px;height:11px;border-radius:50%;background:#33405c;display:inline-block}
.device.web .chrome .url{margin-left:12px;font-size:12px;color:var(--mut);background:#111a2c;padding:4px 12px;border-radius:8px}
.screenhost{position:relative;flex:1;overflow:hidden}   /* contain absolute screens (was only set for web -> mobile screens covered the nav) */
.device.mobile .screenhost{order:1}
.device.mobile .nav{order:2}                            /* bottom tab bar on mobile */
.screen{position:absolute;inset:0;display:flex;flex-direction:column}
.screen[hidden]{display:none}                           /* fix: [hidden] was overridden by display:flex -> every screen rendered at once */
.screen:not([hidden]){animation:scrIn .3s cubic-bezier(.22,.61,.36,1)}
@keyframes scrIn{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:none}}
.device.web .screenhost{flex:1}
.topbar{flex:0 0 auto;padding:${'18px 18px 12px'};font-weight:700;font-size:18px;
  background:linear-gradient(180deg,hsl(var(--hue) 40% 14%),transparent);}
.device.mobile .topbar{padding-top:34px}
.scroll{flex:1;overflow-y:auto;padding:4px 16px 20px;display:flex;flex-direction:column;gap:12px}
.scroll::-webkit-scrollbar{width:0}

/* blocks */
.b-hero{background:linear-gradient(135deg,hsl(var(--hue) 70% 26%),hsl(calc(var(--hue) + 30) 70% 22%));border:1px solid var(--line);
  border-radius:18px;padding:20px}
.b-hero h2{margin:0 0 6px;font-size:20px}.b-hero p{margin:0;color:#dbe6fb;font-size:13.5px;line-height:1.5}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:10px}
.metric{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:13px}
.metric .v{font-size:22px;font-weight:750}.metric .l{color:var(--mut);font-size:11.5px;margin-top:2px}
.metric .d{font-size:11px;color:var(--good);margin-top:4px}
.sec-t{font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);margin:4px 2px -2px}
.row{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:13px 14px;display:flex;align-items:center;gap:12px;cursor:default;transition:transform .08s ease,border-color .15s ease,background .15s ease}
.row.tap,.row.check{cursor:pointer}
.row.tap:hover,.row.check:hover{border-color:hsl(var(--hue) 50% 45%)}
.row.tap:active,.row.check:active{transform:scale(.985)}
.row .rt{font-weight:650;font-size:14.5px;transition:opacity .2s}.row .rs{color:var(--mut);font-size:12.5px;margin-top:2px}
.row .badge{margin-left:auto;background:hsl(var(--hue) 60% 30%);color:#eaf1ff;font-size:11px;padding:3px 9px;border-radius:999px;white-space:nowrap}
.row .av{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-2));flex:0 0 34px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#06101f}
.row .chev{margin-left:auto;color:var(--mut);font-size:20px;line-height:1;flex:0 0 auto}
.row .chk{margin-left:auto;width:26px;height:26px;flex:0 0 26px;border-radius:50%;border:2px solid #3a4a66;display:flex;align-items:center;justify-content:center;color:#06101f;font-size:14px;font-weight:800;transition:all .18s ease}
.row.checked .chk{background:var(--good);border-color:var(--good)}
.row.checked .chk::after{content:"\\2713"}
.row.checked .rt{text-decoration:line-through;opacity:.5}
.row.checked{opacity:.92}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:15px;transition:transform .08s ease,border-color .15s ease}
.card.tap{cursor:pointer}.card.tap:hover{border-color:hsl(var(--hue) 50% 45%)}.card.tap:active{transform:scale(.99)}
.card h3{margin:0 0 6px;font-size:15px}.card p{margin:0;color:#c7d3ea;font-size:13px;line-height:1.55}
.card .tag{display:inline-block;margin-bottom:8px;font-size:11px;color:var(--accent);border:1px solid var(--line);padding:2px 9px;border-radius:999px}
.metric{transition:transform .08s ease}.metric:active{transform:scale(.97)}
.btn{display:block;width:100%;text-align:center;border:0;border-radius:13px;padding:13px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;transition:transform .08s ease,filter .15s ease;position:relative;overflow:hidden}
.btn:hover{filter:brightness(1.06)}.btn:active{transform:scale(.98)}
.btn.primary{background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#06101f}
.btn.ghost{background:transparent;border:1px solid var(--line);color:var(--ink)}
.ripple{position:absolute;border-radius:50%;background:rgba(255,255,255,.45);transform:scale(0);animation:rip .5s ease-out;pointer-events:none}
@keyframes rip{to{transform:scale(2.4);opacity:0}}
.form label{display:block;font-size:12px;color:var(--mut);margin:10px 2px 5px}
.form input,.form select,.form textarea{width:100%;background:#0c1322;border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:11px;font:inherit;transition:border-color .15s ease}
.form input:focus,.form select:focus,.form textarea:focus{outline:none;border-color:var(--accent)}
.form textarea{min-height:64px;resize:none}
.chatbar{display:flex;gap:8px;margin-top:10px}
.chatbar input{flex:1;background:#0c1322;border:1px solid var(--line);color:var(--ink);border-radius:999px;padding:11px 15px;font:inherit}
.chatbar input:focus{outline:none;border-color:var(--accent)}
.chatbar button{flex:0 0 auto;border:0;border-radius:999px;padding:0 16px;background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#06101f;font-weight:800;cursor:pointer;font-family:inherit}
.typing{display:inline-flex;gap:3px;align-items:center}
.typing i{width:6px;height:6px;border-radius:50%;background:var(--mut);animation:ty 1s infinite}
.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}
@keyframes ty{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
.sim-toast{position:absolute;left:50%;bottom:78px;transform:translateX(-50%) translateY(12px);background:rgba(8,14,24,.96);border:1px solid var(--line);color:var(--ink);font-size:13px;font-weight:600;padding:10px 16px;border-radius:12px;opacity:0;transition:all .25s ease;pointer-events:none;z-index:20;box-shadow:0 12px 30px rgba(0,0,0,.5);white-space:nowrap}
.sim-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.chart{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:15px}
.chart h3{margin:0 0 12px;font-size:14px}
.bars{display:flex;align-items:flex-end;gap:8px;height:110px}
.bars .bar{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end}
.bars .bar i{width:100%;background:linear-gradient(180deg,var(--accent),var(--accent-2));border-radius:6px 6px 0 0;display:block}
.bars .bar span{font-size:10px;color:var(--mut)}
.chat{display:flex;flex-direction:column;gap:9px}
.msg{max-width:82%;padding:10px 13px;border-radius:15px;font-size:13.5px;line-height:1.45}
.msg.ai{background:var(--card);border:1px solid var(--line);border-bottom-left-radius:5px;align-self:flex-start}
.msg.user{background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#06101f;border-bottom-right-radius:5px;align-self:flex-end}
.note{color:var(--mut);font-size:12.5px;text-align:center;padding:10px}
.feed .row{align-items:flex-start}

/* nav */
.nav{flex:0 0 auto;display:flex;background:#0a1120;border-top:1px solid var(--line)}
.navbtn{flex:1;background:transparent;border:0;color:var(--mut);font:inherit;font-size:10.5px;padding:9px 2px 10px;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer}
.navbtn svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.navbtn.active{color:var(--accent)}
.device.web .nav{flex-direction:column;position:absolute;left:0;top:38px;bottom:0;width:76px;border-top:0;border-right:1px solid var(--line);justify-content:flex-start;gap:2px;padding-top:8px}
.device.web .app{flex-direction:row}
.device.web .screenhost{margin-left:76px}
.device.web .navbtn{flex:0 0 auto;padding:12px 2px}

/* footer / book */
.foot{width:100%;max-width:420px;margin-top:22px;text-align:center}
.disclaimer{color:var(--mut);font-size:11.5px;line-height:1.5;margin:0 0 14px}
.bookbtn{display:block;width:100%;text-decoration:none;text-align:center;border-radius:14px;padding:15px;font-weight:800;font-size:15px;
  background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#06101f;box-shadow:0 14px 40px hsl(var(--hue) 82% 56% / .35)}
.credit{margin-top:14px;color:var(--mut);font-size:11px}.credit b{color:var(--ink)}
.credit .up{color:var(--accent)}
@media(max-width:420px){.device.mobile{width:100%;height:640px}}
</style></head>
<body>
<div class="wrap">
  ${embed ? '' : `<div class="brandbar"><span class="dot"></span><b>${esc(bp.app_name || 'App')}</b><span class="tg">${esc(bp.tagline || T.preview)}</span></div>`}
  <div class="stage">
    <div class="device ${isMobile ? 'mobile' : 'web'}">
      ${isMobile ? '<div class="notch"></div>' : '<div class="chrome"><i></i><i></i><i></i><span class="url">' + esc((bp.app_name || 'app').toLowerCase().replace(/[^a-z0-9]/g, '')) + '.app</span></div>'}
      <div class="app">
        <div class="nav">${navHtml}</div>
        <div class="screenhost">${screensHtml}</div>
      </div>
    </div>
  </div>
  ${embed
    ? `<div class="foot"><p class="disclaimer">${esc(T.disclaimer)}</p></div>`
    : `<div class="foot">
    <p class="disclaimer">${esc(T.disclaimer)}</p>
    <a class="bookbtn" href="${esc(bookHref)}">${esc(T.book)} &rarr;</a>
    <div class="credit">${esc(T.built)} <b>Orb<span class="up">Up</span></b> &middot; 83-agent AI workforce</div>
  </div>`}
</div>
<script>
(function(){
  var FIRST = ${JSON.stringify(firstScreenByTab)};
  var ES = ${JSON.stringify(!!es)};
  var app = document.querySelector('.app');
  var screens = Array.prototype.slice.call(document.querySelectorAll('.screen'));
  var navs = Array.prototype.slice.call(document.querySelectorAll('.navbtn'));

  // lightweight toast for tap feedback
  var toast = document.createElement('div'); toast.className='sim-toast'; if(app) app.appendChild(toast);
  var toastT;
  function showToast(msg){ if(!toast) return; toast.textContent=msg; toast.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(function(){ toast.classList.remove('show'); }, 1500); }

  function show(id){
    var target = screens.filter(function(s){return s.getAttribute('data-screen')===id;})[0];
    if(!target) target = screens[0];
    if(!target) return;
    var tab = target.getAttribute('data-tab');
    screens.forEach(function(s){ s.hidden = (s!==target); });
    navs.forEach(function(n){ n.classList.toggle('active', n.getAttribute('data-goto-tab')===tab); });
    var sc = target.querySelector('.scroll'); if(sc) sc.scrollTop = 0;
  }
  navs.forEach(function(n){ n.addEventListener('click', function(){ show(FIRST[n.getAttribute('data-goto-tab')]); }); });

  function ripple(e, el){
    try{
      var r=el.getBoundingClientRect(), d=Math.max(r.width,r.height);
      var sp=document.createElement('span'); sp.className='ripple';
      sp.style.width=sp.style.height=d+'px';
      sp.style.left=(((e.clientX||r.left+r.width/2)-r.left)-d/2)+'px';
      sp.style.top=(((e.clientY||r.top+r.height/2)-r.top)-d/2)+'px';
      el.appendChild(sp); setTimeout(function(){ if(sp.parentNode) sp.parentNode.removeChild(sp); }, 500);
    }catch(x){}
  }

  function chatSend(chatEl){
    if(!chatEl) return;
    var input=chatEl.querySelector('[data-chat-input]'), log=chatEl.querySelector('.chat-log');
    if(!input||!log) return;
    var v=(input.value||'').trim(); if(!v) return; input.value='';
    var u=document.createElement('div'); u.className='msg user'; u.textContent=v; log.appendChild(u);
    var t=document.createElement('div'); t.className='msg ai typing'; t.innerHTML='<i></i><i></i><i></i>'; log.appendChild(t);
    var sc=chatEl.closest('.scroll'); if(sc) sc.scrollTop=sc.scrollHeight;
    var replies = ES ? ['Claro, lo tengo en cuenta.','Perfecto, aquí tienes la información.','Hecho. ¿Algo más?','Buena idea — lo agrego.']
                     : ['Got it — noted.','Sure, here you go.','Done. Anything else?','Great idea — adding that.'];
    setTimeout(function(){
      t.classList.remove('typing');
      t.textContent = replies[Math.floor(Math.random()*replies.length)];
      if(sc) sc.scrollTop=sc.scrollHeight;
    }, 850);
  }

  // one delegated click handler for the whole app
  document.addEventListener('click', function(e){
    var t = e.target;
    var send = t.closest && t.closest('[data-chat-send]');
    if(send){ chatSend(send.closest('.chat')); return; }
    var goto = t.closest && t.closest('[data-goto]');
    if(goto){ var g=goto.getAttribute('data-goto'); if(g){ ripple(e, goto); show(g); return; } }
    var chk = t.closest && t.closest('[data-check]');
    if(chk){ chk.classList.toggle('checked'); showToast(chk.classList.contains('checked') ? (ES?'Marcado ✓':'Checked ✓') : (ES?'Desmarcado':'Unchecked')); return; }
    var btn = t.closest && t.closest('.btn');
    if(btn){ ripple(e, btn); if(!btn.getAttribute('data-goto')){ var inForm=btn.closest('.form'); showToast(inForm ? (ES?'Guardado ✓':'Saved ✓') : (ES?'¡Listo! ✓':'Done! ✓')); } return; }
  });
  document.addEventListener('keydown', function(e){
    if(e.key==='Enter'){ var i=e.target.closest && e.target.closest('[data-chat-input]'); if(i){ e.preventDefault(); chatSend(i.closest('.chat')); } }
  });

  // start on the first tab
  show(FIRST[navs[0] && navs[0].getAttribute('data-goto-tab')] || (screens[0] && screens[0].getAttribute('data-screen')));
})();
</script>
</body></html>`;
}

function renderBlock(b, es) {
  if (!b || !b.type) return '';
  switch (b.type) {
    case 'hero': {
      const cta = b.cta && b.cta.label
        ? `<button class="btn primary" style="margin-top:14px" ${b.cta.goto ? `data-goto="${esc(b.cta.goto)}"` : ''}>${esc(b.cta.label)}</button>` : '';
      return `<div class="b-hero"><h2>${esc(b.title || '')}</h2><p>${esc(b.subtitle || '')}</p>${cta}</div>`;
    }
    case 'metric_row': {
      const m = (b.metrics || []).map(x => `<div class="metric"><div class="v">${esc(x.value || '')}</div><div class="l">${esc(x.label || '')}</div>${x.delta ? `<div class="d">${esc(x.delta)}</div>` : ''}</div>`).join('');
      return `<div class="metrics">${m}</div>`;
    }
    case 'list': {
      const isCheck = s => /[✅✓✔☑☒☐✅]/.test(String(s || '')) || /^(done|packed|complete|listo|hecho|ok)$/i.test(String(s || '').trim());
      const items = (b.items || []).map(it => {
        const body = `<div><div class="rt">${esc(it.title || '')}</div>${it.subtitle ? `<div class="rs">${esc(it.subtitle)}</div>` : ''}</div>`;
        // Navigational row -> chevron, taps through to another screen.
        if (it.goto) return `<div class="row tap" data-goto="${esc(it.goto)}">${body}<span class="chev">&rsaquo;</span></div>`;
        // Text status badge (e.g. "Top", "Overdue") -> keep as a static pill.
        if (it.badge && !isCheck(it.badge)) return `<div class="row tap">${body}<span class="badge">${esc(it.badge)}</span></div>`;
        // Otherwise an interactive checkbox row (starts checked if the badge was a check glyph).
        const checked = it.badge && isCheck(it.badge) ? ' checked' : '';
        return `<div class="row check${checked}" data-check="1">${body}<span class="chk"></span></div>`;
      }).join('');
      return `${b.title ? `<div class="sec-t">${esc(b.title)}</div>` : ''}${items}`;
    }
    case 'card':
      return `<div class="card ${b.goto ? 'tap' : ''}" ${b.goto ? `data-goto="${esc(b.goto)}"` : ''}>${b.tag ? `<span class="tag">${esc(b.tag)}</span>` : ''}<h3>${esc(b.title || '')}</h3>${b.body ? `<p>${esc(b.body)}</p>` : ''}</div>`;
    case 'cta':
      return `<button class="btn ${b.style === 'ghost' ? 'ghost' : 'primary'}" ${b.goto ? `data-goto="${esc(b.goto)}"` : ''}>${esc(b.label || 'Continue')}</button>`;
    case 'form': {
      const f = (b.fields || []).map(fl => {
        const lab = `<label>${esc(fl.label || '')}</label>`;
        if (fl.kind === 'textarea') return lab + '<textarea placeholder="' + esc(fl.label || '') + '"></textarea>';
        if (fl.kind === 'select') return lab + '<select>' + (fl.options || ['—']).map(o => `<option>${esc(o)}</option>`).join('') + '</select>';
        return lab + `<input type="${['email', 'number'].includes(fl.kind) ? fl.kind : 'text'}" placeholder="${esc(fl.label || '')}">`;
      }).join('');
      return `<div class="card form">${b.title ? `<h3>${esc(b.title)}</h3>` : ''}${f}<button class="btn primary" style="margin-top:14px">${esc(b.submit || 'Submit')}</button></div>`;
    }
    case 'feed': {
      const items = (b.items || []).map(it => `<div class="row"><div class="av">${esc((it.who || '?').slice(0, 1).toUpperCase())}</div><div><div class="rt">${esc(it.who || '')} <span class="rs" style="display:inline">· ${esc(it.when || '')}</span></div><div class="rs">${esc(it.text || '')}</div></div></div>`).join('');
      return `<div class="feed">${items}</div>`;
    }
    case 'chart': {
      const vals = (b.series || []).map(s => Math.max(0, Math.min(100, Number(s.value) || 0)));
      const max = Math.max(1, ...vals);
      const bars = (b.series || []).map((s, i) => `<div class="bar"><i style="height:${Math.round((vals[i] / max) * 100)}%"></i><span>${esc(s.label || '')}</span></div>`).join('');
      return `<div class="chart"><h3>${esc(b.title || '')}</h3><div class="bars">${bars}</div></div>`;
    }
    case 'chat': {
      const m = (b.messages || []).map(x => `<div class="msg ${x.from === 'user' ? 'user' : 'ai'}">${esc(x.text || '')}</div>`).join('');
      const ph = es ? 'Escribe un mensaje…' : 'Type a message…';
      const send = es ? 'Enviar' : 'Send';
      return `<div class="chat"><div class="chat-log">${m}</div><div class="chatbar"><input type="text" placeholder="${ph}" data-chat-input><button type="button" data-chat-send>${esc(send)}</button></div></div>`;
    }
    case 'note':
      return `<div class="note">${esc(b.text || '')}</div>`;
    default:
      return '';
  }
}

function navIcon(name) {
  const p = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14 2h-4l-.8 2.9a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L3.1 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1L10 22h4l.8-2.9a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6a7 7 0 0 0 .1-1z"/>'
  };
  return `<svg viewBox="0 0 24 24">${p[name] || p.home}</svg>`;
}

module.exports = { publicRouter, renderSimulatorPage };
