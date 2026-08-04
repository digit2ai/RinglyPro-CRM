/* PLANEA — Maya conversational chat widget.
   Text OR voice input (Web Speech API, es-CO), spoken replies (zero-key /api/tts/edge),
   grounded on the user's financial profile. Talks to POST /planea/api/v1/maya/chat.

   Reusable in the real app: set window.PLANEA_PROFILE before this script loads to pass
   the authenticated user's real data. If unset, it uses the demo profile (Eduardo). */
(function () {
  'use strict';

  // Neutral empty profile — NO demo/mockup financials. Overridden by
  // window.PLANEA_PROFILE (real user) when logged in; otherwise Maya speaks
  // generically and invites the user to do their diagnóstico.
  var DEMO_PROFILE = { nombre: '', sin_diagnostico: true };

  var API = '/planea/api/v1/maya/chat';
  var TTS = '/api/tts/edge';
  // Voz de Maya: Dalia (es-MX-DaliaNeural) para español, Ava (en-US-AvaNeural) para
  // inglés. Ambas por el motor neural sin llave /api/tts/edge. Planea es español,
  // así que Dalia es la activa; Ava queda lista si la app agrega inglés.
  var TTS_VOICE_ES = 'dalia';   // es-MX-DaliaNeural
  var TTS_VOICE_EN = 'ava';     // en-US-AvaNeural
  function ttsVoice() { return (document.documentElement.lang || 'es').slice(0, 2) === 'en' ? TTS_VOICE_EN : TTS_VOICE_ES; }
  var SUGERENCIAS = [
    'Quiero registrar mis ingresos',
    'Tengo una deuda que anotar',
    'Cuánto tengo ahorrado',
    '¿Qué datos me faltan por registrar?'
  ];

  // Maya habla: dictado por micrófono, modo manos libres y respuestas habladas.
  var VOICE_ENABLED = true;

  var history = []; // {role, content}
  var speaking = VOICE_ENABLED; // auto-speak Maya replies (off while voice disabled)
  var recognizing = false;
  var recog = null;
  var handsFree = false; // hands-free conversation mode
  var hfEmpty = 0; // consecutive silent listens
  var els = {};

  function profile() { return window.PLANEA_PROFILE || DEMO_PROFILE; }

  // ── Real logged-in user (Supabase) ─────────────────────────────────────────
  // On the authenticated app, read the user's session + data so Maya talks about
  // the REAL user (not the Eduardo demo). On the portal preview (no session), the
  // demo profile stays. Public Supabase URL + publishable key (safe in the client).
  var SB_URL = 'https://mfxujzvvrnsbiqcefvtg.supabase.co';
  var SB_KEY = 'sb_publishable_0dMP5Pof56t9H4fyCNJn9Q_NKGuorXc';

  function sbSession() {
    try {
      var key = null;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) { key = k; break; }
      }
      if (!key) return null;
      var o = JSON.parse(localStorage.getItem(key));
      var s = o && o.access_token ? o : (o && o.currentSession) ? o.currentSession : null;
      return s && s.access_token ? s : null;
    } catch (e) { return null; }
  }
  function rangoDe(s) {
    return s <= 30 ? 'Punto de partida' : s <= 50 ? 'Construyendo' : s <= 70 ? 'En camino' : s <= 85 ? 'Sólido' : 'Planeado';
  }
  function firstName(full, email) {
    var n = (full || '').trim().split(/\s+/)[0];
    if (n) return n;
    return email ? email.split('@')[0] : '';
  }
  function sbGet(pathQuery, token) {
    return fetch(SB_URL + '/rest/v1/' + pathQuery, {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token, Accept: 'application/json' }
    }).then(function (r) { return r.ok ? r.json() : null; });
  }

  // Sync: set the name immediately from the session so Maya never greets "Eduardo"
  // to a logged-in user. Async: enrich with their real financial data.
  function bootstrapProfile() {
    // planea-data.js (dashboard loader) owns window.PLANEA_PROFILE when present —
    // it fetches the same user. Don't double-fetch.
    if (window.__planeaDataLoader) return;

    // Prefer OUR backend (Postgres) via the readable session cookie.
    try {
      var mc = (document.cookie || '').match(/(?:^|;\s*)planea_user=([^;]+)/);
      if (mc) {
        var cu = JSON.parse(decodeURIComponent(mc[1]));
        window.PLANEA_PROFILE = { nombre: firstName(cu.full_name, cu.email), email: cu.email || '', sin_diagnostico: true };
        fetch('/planea/api/v1/me/profile', { credentials: 'include' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            if (!d) return;
            var prof = { nombre: firstName(d.full_name, d.email), email: d.email || '' };
            var sd = d.score_data || {};
            if (sd && sd.score != null) { prof.planea_score = sd.score; prof.rango = rangoDe(sd.score); prof.score_pilares_pct = sd.pillars || null; }
            else prof.sin_diagnostico = true;
            // HU-2: qué pilares siguen en PROXY del survey (sin dato real) para que
            // Maya priorice sus preguntas guiadas y cierre esos vacíos primero.
            if (sd && sd.dimensions) {
              prof.dimensiones = sd.dimensions.map(function (x) { return { pilar: x.label, key: x.key, fuente: x.source, puntaje: x.score }; });
              prof.pilares_en_proxy = (sd.proxy_pillars || []).slice();
            }
            var sum = d.summary || {};
            prof.modulos_con_datos = ['ingreso', 'gasto', 'ahorro', 'inversion', 'deuda', 'seguros', 'retiro']
              .filter(function (k) { return (sum[k] || 0) > 0; });
            var assets = d.assets_data || [], liab = d.liabilities_data || [];
            if (assets.length || liab.length) {
              var at = assets.reduce(function (a, x) { return a + (+x.value || 0); }, 0);
              var lt = liab.reduce(function (a, x) { return a + (+x.value || 0); }, 0);
              prof.activos_total_cop = at; prof.pasivos_total_cop = lt; prof.patrimonio_neto_cop = at - lt;
            }
            if (d.goals && d.goals.length) prof.metas = d.goals.map(function (g) { return { nombre: g.name, objetivo_cop: g.target_amount, actual_cop: g.current_savings, aporte_mensual_cop: g.monthly_saving }; });
            window.PLANEA_PROFILE = prof;
          }).catch(function () {});
        return;
      }
    } catch (e) {}

    var sess = sbSession();
    if (!sess) return; // portal preview / not logged in → keep demo
    var user = sess.user || {};
    var meta = user.user_metadata || {};
    var base = {
      nombre: firstName(meta.full_name, user.email),
      email: user.email || '',
      sin_diagnostico: true
    };
    window.PLANEA_PROFILE = base;
    var token = sess.access_token;
    sbGet('persons?select=full_name,score_data,progress_data', token).then(function (rows) {
      var p = (rows && rows[0]) || {};
      var prof = { nombre: firstName(p.full_name || meta.full_name, user.email), email: user.email || '' };
      var sd = p.score_data || {};
      if (sd && sd.score != null) {
        prof.planea_score = sd.score;
        prof.rango = rangoDe(sd.score);
        prof.escenario = sd.scenario || null;
        prof.score_pilares_pct = sd.pillars || null;
      } else {
        prof.sin_diagnostico = true;
      }
      window.PLANEA_PROFILE = prof;
      // patrimony (RLS returns only this user's row)
      sbGet('persons_patrimony?select=assets_data,liabilities_data', token).then(function (pat) {
        var pp = (pat && pat[0]) || {};
        var assets = pp.assets_data || [], liab = pp.liabilities_data || [];
        if (assets.length || liab.length) {
          var at = assets.reduce(function (a, x) { return a + (+x.value || 0); }, 0);
          var lt = liab.reduce(function (a, x) { return a + (+x.value || 0); }, 0);
          prof.activos_total_cop = at; prof.pasivos_total_cop = lt; prof.patrimonio_neto_cop = at - lt;
          prof.activos = assets.map(function (x) { return { nombre: x.name, valor_cop: x.value }; });
          prof.pasivos = liab.map(function (x) { return { nombre: x.name, valor_cop: x.value }; });
        }
        window.PLANEA_PROFILE = prof;
      }).catch(function () {});
      // long-term goals
      sbGet('persons_long_term_goals?select=name,type,target_amount,current_savings,monthly_saving', token).then(function (goals) {
        if (goals && goals.length) {
          prof.metas = goals.map(function (g) {
            return { nombre: g.name, tipo: g.type, objetivo_cop: g.target_amount, actual_cop: g.current_savings, aporte_mensual_cop: g.monthly_saving };
          });
        }
        window.PLANEA_PROFILE = prof;
      }).catch(function () {});
    }).catch(function () {});
  }

  function css() {
    var s = document.createElement('style');
    s.textContent = [
      '.maya-panel{position:fixed;right:24px;top:130px;width:380px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 160px);background:#fff;border:1px solid #E6E9E8;border-radius:18px;box-shadow:0 24px 60px rgba(22,55,58,.28);display:none;flex-direction:column;overflow:hidden;z-index:60;font-family:"DM Sans",system-ui,sans-serif}',
      '.maya-panel.abierto{display:flex}',
      '.maya-head{background:#16373A;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}',
      '.maya-head .orb{width:30px;height:30px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '.maya-head .t1{font-weight:700;font-size:14.5px;line-height:1.15}',
      '.maya-head .t2{font-size:11px;color:rgba(255,255,255,.7)}',
      '.maya-head .sp{flex:1}',
      '.maya-head button{background:rgba(255,255,255,.14);color:#fff;border:none;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center}',
      '.maya-head button.on{background:#2E7D5B}',
      '.maya-body{flex:1;overflow-y:auto;padding:16px;background:#F7F9F8;display:flex;flex-direction:column;gap:10px}',
      '.maya-msg{max-width:85%;padding:10px 13px;border-radius:14px;font-size:13.5px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}',
      '.maya-msg.u{align-self:flex-end;background:#16373A;color:#fff;border-bottom-right-radius:5px}',
      '.maya-msg.m{align-self:flex-start;background:#fff;color:#1E2B2C;border:1px solid #E6E9E8;border-bottom-left-radius:5px}',
      '.maya-msg.typing{color:#6E7D7B;font-style:italic}',
      '.maya-confirm{border-color:#bfe3cf;background:#f2fbf6}',
      '.maya-confirm .mc-item{font-size:13px;margin-bottom:4px}',
      '.maya-confirm .mc-btns{display:flex;gap:8px;margin-top:9px}',
      '.maya-confirm .mc-yes,.maya-confirm .mc-no{border:0;border-radius:9px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer}',
      '.maya-confirm .mc-yes{background:#2f9e63;color:#fff}',
      '.maya-confirm .mc-no{background:#e6ece9;color:#33413c}',
      '.maya-sug{display:flex;flex-wrap:wrap;gap:7px;padding:0 16px 10px;background:#F7F9F8}',
      '.maya-sug button{font-family:inherit;font-size:12px;color:#16373A;background:#E7F2EC;border:1px solid #d3e6db;border-radius:99px;padding:7px 11px;cursor:pointer;text-align:left}',
      '.maya-sug button:hover{background:#d9ecdf}',
      '.maya-input{display:flex;align-items:center;gap:8px;padding:12px;border-top:1px solid #E6E9E8;background:#fff}',
      '.maya-input textarea{flex:1;resize:none;border:1px solid #E6E9E8;border-radius:12px;padding:10px 12px;font-family:inherit;font-size:13.5px;max-height:90px;line-height:1.4;color:#1E2B2C}',
      '.maya-input textarea:focus{outline:2px solid #2E7D5B;border-color:transparent}',
      '.maya-ic{width:40px;height:40px;flex-shrink:0;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center}',
      '.maya-mic{background:#EEF1F0;color:#16373A}',
      '.maya-mic.rec{background:#B5533C;color:#fff;animation:mayaPulse 1.2s infinite}',
      '.maya-send{background:#16373A;color:#fff}',
      '.maya-ic svg{width:18px;height:18px}',
      '@keyframes mayaPulse{0%,100%{box-shadow:0 0 0 0 rgba(181,83,60,.5)}50%{box-shadow:0 0 0 7px rgba(181,83,60,0)}}',
      // Self-injected floating launcher (used on pages that have no .chatbot button)
      // Sits ABOVE the app bottom tab bar (this launcher only appears on the app, which
      // always has the nav). Raised at all widths so it never covers Perfil.
      '.maya-fab{position:fixed;right:20px;top:calc(72px + env(safe-area-inset-top,0px));z-index:55;display:flex;align-items:center;gap:11px;background:#16373A;color:#fff;border:none;cursor:pointer;padding:13px 20px 13px 15px;border-radius:99px;box-shadow:0 10px 30px rgba(22,55,58,.32);font-family:"DM Sans",system-ui,sans-serif;transition:transform .18s,box-shadow .18s}',
      '.maya-fab:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(22,55,58,.4)}',
      '.maya-fab:focus-visible{outline:3px solid #2E7D5B;outline-offset:3px}',
      '.maya-fab .orb{width:34px;height:34px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;animation:mayaPulse 3s ease-in-out infinite}',
      '.maya-fab .l1{font-weight:700;font-size:14px;line-height:1.15}',
      '.maya-fab .l2{font-size:11.5px;color:rgba(255,255,255,.65)}',
      '@media (prefers-reduced-motion:reduce){.maya-fab .orb{animation:none}}',
      // Hands-free header button
      '.maya-head button.hf.on{background:#2E7D5B}',
      // Hands-free conversation stage (overlay)
      '.maya-stage{position:absolute;left:0;right:0;top:58px;bottom:0;background:#0f2a2c;color:#fff;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;z-index:5}',
      '.maya-stage.activo{display:flex}',
      '.stage-orb{width:124px;height:124px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#8FE3B5,#2E7D5B 55%,#16373A 100%);box-shadow:0 0 0 0 rgba(143,227,181,.5)}',
      '.stage-orb.speaking{animation:hfSpeak 1s ease-in-out infinite}',
      '.stage-orb.listening{animation:hfListen 1.5s ease-in-out infinite}',
      '.stage-orb.thinking{opacity:.75;animation:hfThink 1.1s ease-in-out infinite}',
      '@keyframes hfSpeak{0%,100%{box-shadow:0 0 0 0 rgba(143,227,181,.55);transform:scale(1)}50%{box-shadow:0 0 0 20px rgba(143,227,181,0);transform:scale(1.05)}}',
      '@keyframes hfListen{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,.4)}50%{box-shadow:0 0 0 16px rgba(255,255,255,0)}}',
      '@keyframes hfThink{0%,100%{transform:scale(1)}50%{transform:scale(.94)}}',
      '.stage-status{font-family:"Inter",system-ui,sans-serif;font-weight:700;font-size:16px}',
      '.stage-cap{font-size:13.5px;color:rgba(255,255,255,.72);min-height:20px;max-width:280px;line-height:1.4}',
      '.stage-stop{margin-top:6px;background:#B5533C;color:#fff;border:none;border-radius:99px;padding:11px 24px;font-family:inherit;font-weight:700;font-size:14px;cursor:pointer}',
      '.stage-stop:hover{filter:brightness(1.06)}',
      '@media (prefers-reduced-motion:reduce){.stage-orb{animation:none!important}}',
      // Mobile: lift the launcher ABOVE the app bottom tab bar so it never covers it.
      '@media (max-width:520px){.maya-panel{right:8px;left:8px;top:calc(132px + env(safe-area-inset-top,0px));bottom:auto;width:auto;height:calc(100vh - 210px)}.maya-fab .txt{display:none}.maya-fab{right:auto;left:50%;top:calc(66px + env(safe-area-inset-top,0px));transform:translateX(-50%);padding:14px;border-radius:50%}.maya-fab:hover{transform:translateX(-50%)}}'
    ].join('');
    document.head.appendChild(s);
  }

  function makeFab() {
    var b = document.createElement('button');
    b.className = 'maya-fab';
    b.setAttribute('aria-label', 'Abrir chat con Maya, tu guía financiera IA');
    b.innerHTML =
      '<span class="orb"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" fill="#16373A"/><circle cx="18.5" cy="17.5" r="2" fill="#16373A"/></svg></span>' +
      '<span class="txt"><span class="l1">Pregúntale a Maya</span><br><span class="l2">Tu guía financiera IA</span></span>';
    b.addEventListener('click', toggle);
    document.body.appendChild(b);
    return b;
  }

  function build() {
    var wrap = document.createElement('div');
    wrap.className = 'maya-panel';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Chat con Maya');
    wrap.innerHTML =
      '<div class="maya-head">' +
        '<span class="orb"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" fill="#16373A"/><circle cx="18.5" cy="17.5" r="2" fill="#16373A"/></svg></span>' +
        '<div><div class="t1">Maya</div><div class="t2">Tu guía financiera IA</div></div>' +
        '<span class="sp"></span>' +
        '<button class="hf" title="Conversar en manos libres" aria-label="Hablar con Maya en manos libres" aria-pressed="false"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h2M6 8v8M10 5v14M14 8v8M18 10v4M22 12h0"/></svg></button>' +
        '<button class="voz on" title="Voz de Maya" aria-label="Activar o silenciar la voz de Maya">&#128266;</button>' +
        '<button class="cerrar" title="Cerrar" aria-label="Cerrar chat">&times;</button>' +
      '</div>' +
      '<div class="maya-stage">' +
        '<div class="stage-orb"></div>' +
        '<div class="stage-status">Toca el orbe para hablar con Maya</div>' +
        '<div class="stage-cap"></div>' +
        '<button class="stage-stop">Terminar</button>' +
      '</div>' +
      '<div class="maya-body"></div>' +
      '<div class="maya-sug"></div>' +
      '<div class="maya-input">' +
        '<button class="maya-ic maya-mic" title="Hablar" aria-label="Hablar con Maya"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>' +
        '<textarea rows="1" placeholder="Escríbele a Maya o toca el micrófono..." aria-label="Mensaje para Maya"></textarea>' +
        '<button class="maya-ic maya-send" title="Enviar" aria-label="Enviar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg></button>' +
      '</div>';
    document.body.appendChild(wrap);
    els.panel = wrap;
    els.body = wrap.querySelector('.maya-body');
    els.sug = wrap.querySelector('.maya-sug');
    els.input = wrap.querySelector('textarea');
    els.mic = wrap.querySelector('.maya-mic');
    els.send = wrap.querySelector('.maya-send');
    els.voz = wrap.querySelector('.voz');
    els.cerrar = wrap.querySelector('.cerrar');
    els.hf = wrap.querySelector('.hf');
    els.stage = wrap.querySelector('.maya-stage');
    els.stageOrb = wrap.querySelector('.stage-orb');
    els.stageStatus = wrap.querySelector('.stage-status');
    els.stageCap = wrap.querySelector('.stage-cap');
    els.stageStop = wrap.querySelector('.stage-stop');

    els.send.addEventListener('click', function () { sendText(els.input.value); });
    els.input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(els.input.value); } });
    els.input.addEventListener('input', function () { els.input.style.height = 'auto'; els.input.style.height = Math.min(els.input.scrollHeight, 90) + 'px'; });
    els.cerrar.addEventListener('click', close);
    els.voz.addEventListener('click', function () { speaking = !speaking; els.voz.classList.toggle('on', speaking); els.voz.innerHTML = speaking ? '&#128266;' : '&#128263;'; if (!speaking) stopAudio(); });
    els.mic.addEventListener('click', toggleMic);
    els.hf.addEventListener('click', function () { handsFree ? stopHF() : startHF(); });
    els.stageOrb.addEventListener('click', function () { if (!handsFree) startHF(); });
    els.stageStop.addEventListener('click', stopHF);

    // TEMPORARY: voice off → hide mic, hands-free and speaker toggle; text-only UI.
    if (!VOICE_ENABLED) {
      [els.mic, els.hf, els.voz].forEach(function (b) { if (b) b.style.display = 'none'; });
      if (els.input) els.input.setAttribute('placeholder', 'Escríbele a Maya…');
    }
    renderSug();
  }

  function renderSug() {
    els.sug.innerHTML = '';
    SUGERENCIAS.forEach(function (s) {
      var b = document.createElement('button');
      b.textContent = s;
      b.addEventListener('click', function () { sendText(s); });
      els.sug.appendChild(b);
    });
  }

  function stripMd(t) {
    return String(t)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/^\s*[-•]\s+/gm, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .trim();
  }
  function addMsg(role, text) {
    var d = document.createElement('div');
    d.className = 'maya-msg ' + (role === 'user' ? 'u' : 'm');
    d.textContent = role === 'user' ? text : stripMd(text);
    els.body.appendChild(d);
    els.body.scrollTop = els.body.scrollHeight;
    return d;
  }

  function greet() {
    if (els.body.childElementCount === 0) {
      var p = profile();
      var nom = p.nombre ? ' ' + p.nombre : '';
      var comoHablar = VOICE_ENABLED ? 'Escríbeme o toca el micrófono y hablamos.' : 'Escríbeme por aquí.';
      var msg = p.sin_diagnostico
        ? 'Hola' + nom + ', soy Maya, tu asistente. Te ayudo a registrar tu información: ingresos, gastos, ahorros, deudas, inversiones, seguros y retiro. Empecemos por lo más fácil: ¿cuánto ganas al mes? ' + comoHablar
        : 'Hola' + nom + ', soy Maya, tu asistente. Te ayudo a mantener tu información al día. ¿Qué quieres registrar hoy: un ingreso, un gasto, un ahorro o una deuda? ' + comoHablar;
      addMsg('maya', msg);
    }
  }

  // Maya puede registrar datos por chat: ejecuta las acciones que devuelve el
  // backend contra los endpoints ya autenticados (sesión httpOnly), y confirma.
  var MOD_LABEL = { ingreso: 'Ingresos', gasto: 'Gastos', ahorro: 'Ahorro', deuda: 'Deuda', inversion: 'Inversión', seguros: 'Seguros', retiro: 'Retiro', meta: 'Mis metas' };
  function copMx(n) { return '$' + Number(n || 0).toLocaleString('es-CO'); }
  function saveGoal(a) {
    return fetch('/planea/api/v1/me/profile', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var goals = (d && Array.isArray(d.goals)) ? d.goals.slice() : [];
        goals.push({ name: a.nombre, target: a.objetivo || a.monto, current: a.objetivo ? a.monto : 0, created_at: new Date().toISOString() });
        return fetch('/planea/api/v1/me/profile', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goals: goals }) });
      });
  }
  function runActions(actions) {
    var jobs = actions.map(function (a) {
      if (a.modulo === 'meta') return saveGoal(a).then(function () { return a; });
      return fetch('/planea/api/v1/me/items', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: a.modulo, name: a.nombre, type: a.nombre, value: a.monto, monthly: a.cuota || 0 })
      }).then(function (r) { if (!r.ok) throw new Error('save'); return a; });
    });
    return Promise.all(jobs).then(function (done) {
      var txt = done.map(function (a) { return a.nombre + ' ' + copMx(a.monto) + ' en ' + (MOD_LABEL[a.modulo] || a.modulo); }).join('; ');
      addMsg('maya', 'Registrado: ' + txt + '. Ya quedó guardado en tu cuenta.');
      if (window.PlaneaData && typeof window.PlaneaData.reload === 'function') window.PlaneaData.reload();
    }).catch(function () {
      addMsg('maya', 'No pude guardar ese dato. Inicia sesión e inténtalo de nuevo.');
    });
  }

  // HU-2 · Confirmación antes de guardar. Maya PROPONE; el usuario aprueba con
  // botones (Sí/No) o de viva voz ("sí"/"no"). Nada se guarda sin confirmación.
  var pendingProposals = [];
  function clearProposalCard() {
    var c = els.body && els.body.querySelector('.maya-confirm');
    if (c) c.remove();
    pendingProposals = [];
  }
  function confirmProposals() {
    var list = pendingProposals.slice();
    clearProposalCard();
    if (list.length) runActions(list);
  }
  function rejectProposals() {
    clearProposalCard();
    addMsg('maya', 'Listo, no lo registro. Dime cómo lo corrijo.');
  }
  function renderProposals(proposals) {
    pendingProposals = proposals.slice();
    var wrap = document.createElement('div');
    wrap.className = 'maya-msg m maya-confirm';
    var resumen = proposals.map(function (p) {
      return '<div class="mc-item"><b>' + esc(p.nombre) + '</b> ' + copMx(p.monto) + ' en ' + esc(MOD_LABEL[p.modulo] || p.modulo) +
        (p.cuota ? ' (cuota ' + copMx(p.cuota) + ')' : '') + '</div>';
    }).join('');
    wrap.innerHTML = resumen +
      '<div class="mc-btns"><button type="button" class="mc-yes">Sí, registrar</button>' +
      '<button type="button" class="mc-no">No</button></div>';
    wrap.querySelector('.mc-yes').addEventListener('click', confirmProposals);
    wrap.querySelector('.mc-no').addEventListener('click', rejectProposals);
    els.body.appendChild(wrap);
    els.body.scrollTop = els.body.scrollHeight;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  // ¿El texto del usuario es un sí/no a una propuesta pendiente?
  var YES_RE = /^\s*(s[ií]|s[ií]\s|claro|dale|hazlo|reg[ií]stralo|reg[ií]stra|confirmo|correcto|as[ií] es|ok|okay|de una)\b/i;
  var NO_RE = /^\s*(no|nop|cancela|espera|mejor no|as[ií] no|est[aá] mal)\b/i;
  function handleConfirmReply(text) {
    if (!pendingProposals.length) return false;
    if (YES_RE.test(text)) { addMsg('user', text); confirmProposals(); return true; }
    if (NO_RE.test(text)) { addMsg('user', text); rejectProposals(); return true; }
    return false; // no es sí/no claro → deja que Maya lo maneje (aclaración)
  }

  // Core ask: append user msg, call Maya, append reply. opts.onReply(reply) lets the
  // hands-free loop chain speak→listen; opts.silentTyping hides the "pensando" bubble.
  function ask(text, opts) {
    opts = opts || {};
    // HU-2: si hay una propuesta pendiente y el usuario dice sí/no, resuélvelo
    // localmente sin llamar a Maya (funciona igual por chat y por voz).
    if (handleConfirmReply((text || '').trim())) { if (opts.onReply) opts.onReply(''); return; }
    text = (text || '').trim();
    if (!text) return;
    addMsg('user', text);
    history.push({ role: 'user', content: text });
    var typing = opts.silentTyping ? null : addMsg('maya', 'Maya está pensando...');
    if (typing) typing.classList.add('typing');

    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history.slice(-12), profile: profile() })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (typing) typing.remove();
        var reply = (data && data.reply) || 'No pude responder en este momento.';
        history.push({ role: 'assistant', content: reply });
        addMsg('maya', reply);
        if (data && data.actions && data.actions.length) runActions(data.actions);
        // HU-2: propuestas requieren confirmación Sí/No (no guarda todavía).
        if (data && data.proposals && data.proposals.length) renderProposals(data.proposals);
        if (opts.onReply) opts.onReply(reply);
        else if (speaking) speak(reply);
      })
      .catch(function () {
        if (typing) typing.remove();
        addMsg('maya', 'Tuve un problema de conexión. Intenta de nuevo.');
        if (opts.onError) opts.onError();
      });
  }

  function sendText(text) {
    text = (text || '').trim();
    if (!text) return;
    els.input.value = '';
    els.input.style.height = 'auto';
    if (els.sug) els.sug.style.display = 'none';
    ask(text);
  }

  // ── Voice output (Web Audio, sentence-chunked so Maya starts talking fast) ──
  var actx = null, curSource = null, speakToken = 0;
  function ensureCtx() { if (!actx) { var C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); } return actx; }
  function unlockAudio() { var c = ensureCtx(); if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} } }
  function stopAudio() { speakToken++; if (curSource) { try { curSource.onended = null; curSource.stop(); } catch (e) {} curSource = null; } }

  // Strip markdown/symbols so the TTS never reads "asterisco" etc.
  function cleanForTTS(t) {
    return String(t)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*|\*|__|_|#+|>/g, ' ')
      .replace(/^\s*[-•]\s+/gm, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }
  // Split into speakable chunks (merge tiny fragments) so the first sentence plays ~1s in.
  function splitChunks(t) {
    var clean = cleanForTTS(t);
    var parts = clean.match(/[^.!?;\n]+[.!?;]?/g) || [clean];
    var out = [], cur = '';
    parts.forEach(function (p) {
      p = p.trim(); if (!p) return;
      cur = cur ? cur + ' ' + p : p;
      if (cur.length >= 45) { out.push(cur); cur = ''; }
    });
    if (cur) out.push(cur);
    return out.length ? out : [clean];
  }
  function fetchDecoded(text) {
    var c = ensureCtx(); if (!c) return Promise.resolve(null);
    return fetch(TTS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, voice: ttsVoice() }) })
      .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
      .then(function (buf) {
        if (!buf) return null;
        return new Promise(function (res) { c.decodeAudioData(buf.slice(0), function (d) { res(d); }, function () { res(null); }); });
      })
      .catch(function () { return null; });
  }
  function speak(text, onEnd) {
    stopAudio();
    var myToken = speakToken; // stopAudio already bumped it
    var c = ensureCtx();
    var chunks = splitChunks(text);
    if (!c || !chunks.length) { if (onEnd) onEnd(); return; }
    var i = 0;
    var nextP = fetchDecoded(chunks[0]); // start synthesizing the first sentence now
    function playNext() {
      if (myToken !== speakToken) return; // interrupted
      if (i >= chunks.length) { if (onEnd) onEnd(); return; }
      var p = nextP;
      nextP = (i + 1 < chunks.length) ? fetchDecoded(chunks[i + 1]) : null; // prefetch next
      p.then(function (buf) {
        if (myToken !== speakToken) return;
        if (!buf) { i++; playNext(); return; }
        var src = c.createBufferSource();
        src.buffer = buf; src.connect(c.destination);
        src.onended = function () { if (myToken !== speakToken) return; if (curSource === src) curSource = null; i++; playNext(); };
        curSource = src;
        try { src.start(0); } catch (e) { i++; playNext(); }
      });
    }
    playNext();
  }

  // ── One-shot voice input (mic button — fills the textbox, then sends) ──
  function toggleMic() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { addMsg('maya', 'Tu navegador no permite dictado por voz. Usa Chrome o Safari, o escríbeme.'); return; }
    if (recognizing) { try { recog.stop(); } catch (e) {} return; }
    recog = new SR();
    recog.lang = 'es-CO';
    recog.interimResults = true;
    recog.continuous = false;
    recognizing = true;
    els.mic.classList.add('rec');
    var finalText = '';
    recog.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      els.input.value = (finalText + interim).trim();
    };
    recog.onerror = function () { stopMic(); };
    recog.onend = function () { stopMic(); var t = els.input.value.trim(); if (t) sendText(t); };
    try { recog.start(); } catch (e) { stopMic(); }
  }
  function stopMic() { recognizing = false; els.mic.classList.remove('rec'); }

  // ── Hands-free conversation mode (call-with-Maya) ──
  function updateHF() {
    els.hf.classList.toggle('on', handsFree);
    els.hf.setAttribute('aria-pressed', handsFree ? 'true' : 'false');
    els.stage.classList.toggle('activo', handsFree);
  }
  function setStage(state, caption) {
    els.stageOrb.className = 'stage-orb' + (state ? ' ' + state : '');
    var t = state === 'speaking' ? 'Maya está hablando…'
      : state === 'listening' ? 'Te escucho…'
      : state === 'thinking' ? 'Pensando…'
      : 'Toca el orbe para hablar con Maya';
    els.stageStatus.textContent = t;
    if (caption !== undefined) els.stageCap.textContent = caption || '';
  }
  function startHF() {
    if (!els.panel.classList.contains('abierto')) open();
    handsFree = true; hfEmpty = 0; updateHF(); unlockAudio();
    if (els.sug) els.sug.style.display = 'none';
    var g = 'Hola ' + (profile().nombre || '') + '. Soy Maya, tu asistente. Cuéntame qué dato quieres registrar: un ingreso, un gasto, un ahorro o una deuda.';
    addMsg('maya', g); history.push({ role: 'assistant', content: g });
    hfSpeakThenListen(g);
  }
  function stopHF() {
    handsFree = false; updateHF();
    stopAudio();
    if (recognizing) { try { recog.stop(); } catch (e) {} }
    setStage('', '');
  }
  function hfSpeakThenListen(text) {
    if (!handsFree) return;
    setStage('speaking', '');
    speak(text, function () { if (handsFree) hfListen(); });
  }
  function hfSpeakThenStop(text) {
    addMsg('maya', text);
    setStage('speaking', '');
    speak(text, function () { stopHF(); });
  }
  function hfListen() {
    if (!handsFree) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { addMsg('maya', 'Tu navegador no permite voz. Usa Chrome o Safari.'); stopHF(); return; }
    setStage('listening', '');
    recog = new SR();
    recog.lang = 'es-CO';
    recog.interimResults = true;
    recog.continuous = false;
    recognizing = true;
    var finalText = '';
    recog.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setStage('listening', (finalText + interim).trim());
    };
    recog.onerror = function () { recognizing = false; };
    recog.onend = function () {
      recognizing = false;
      if (!handsFree) return;
      var t = finalText.trim();
      if (t) {
        hfEmpty = 0;
        setStage('thinking', t);
        ask(t, {
          silentTyping: true,
          onReply: function (reply) { hfSpeakThenListen(reply); },
          onError: function () { if (handsFree) hfListen(); }
        });
      } else {
        hfEmpty++;
        if (hfEmpty >= 3) hfSpeakThenStop('Me quedo por aquí. Toca el orbe cuando quieras seguir.');
        else hfListen();
      }
    };
    try { recog.start(); } catch (e) { setTimeout(function () { if (handsFree) hfListen(); }, 400); }
  }

  function open() { els.panel.classList.add('abierto'); greet(); setTimeout(function () { els.input.focus(); }, 60); }
  function close() { els.panel.classList.remove('abierto'); stopHF(); stopAudio(); if (recognizing) try { recog.stop(); } catch (e) {} }
  function toggle() { els.panel.classList.contains('abierto') ? close() : open(); }

  // ── Route gating ────────────────────────────────────────────────────────────
  // Maya must NOT appear on the login/signup screens. The SPA serves those from the
  // same index.html (Maya injected once), so gate by route — and re-check on client
  // navigation (SPA pushState/popstate) so it hides/shows without a full reload.
  function isAuthPage() {
    var p = (location.pathname || '').toLowerCase();
    return /(^|\/)(login|register|signup|sign-up|start)(\/|$)/.test(p);
  }
  function applyRouteVisibility() {
    var hide = isAuthPage();
    if (els.fab) els.fab.style.display = hide ? 'none' : '';
    document.querySelectorAll('.chatbot').forEach(function (b) { b.style.display = hide ? 'none' : ''; });
    if (hide && els.panel && els.panel.classList.contains('abierto')) close();
  }
  function watchRoute() {
    ['pushState', 'replaceState'].forEach(function (m) {
      var orig = history[m];
      if (typeof orig !== 'function' || orig.__mayaWrapped) return;
      var wrapped = function () { var r = orig.apply(this, arguments); try { applyRouteVisibility(); } catch (e) {} return r; };
      wrapped.__mayaWrapped = true;
      history[m] = wrapped;
    });
    window.addEventListener('popstate', applyRouteVisibility);
    window.addEventListener('hashchange', applyRouteVisibility);
  }

  function init() {
    bootstrapProfile(); // load the real logged-in user (if any) before the greeting
    css();
    build();
    // Bind any existing floating chatbot buttons; if none, inject our own launcher
    // so this script works standalone on ANY page (landing, etc.).
    var btns = document.querySelectorAll('.chatbot');
    if (btns.length) {
      btns.forEach(function (b) { b.removeAttribute('onclick'); b.addEventListener('click', toggle); });
    } else {
      els.fab = makeFab();
    }
    window.MayaChat = { open: open, close: close, toggle: toggle };

    // Hide Maya on login/signup; keep it everywhere else. Re-checks on SPA navigation.
    applyRouteVisibility();
    watchRoute();

    // Global delegate: ANY element with data-action="maya" (nav drawer link, Más tiles,
    // "Habla con Planea IA", etc.) opens the Maya overlay — never navigates away.
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-action="maya"]');
      if (!t) return;
      e.preventDefault();
      var dr = document.getElementById('pl-drawer'), sc = document.getElementById('pl-scrim');
      if (dr) dr.classList.remove('open');
      if (sc) sc.classList.remove('open');
      open();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
