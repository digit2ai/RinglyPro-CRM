/* PLANEA — Maya conversational chat widget.
   Text OR voice input (Web Speech API, es-CO), spoken replies (zero-key /api/tts/edge),
   grounded on the user's financial profile. Talks to POST /planea/api/v1/maya/chat.

   Reusable in the real app: set window.PLANEA_PROFILE before this script loads to pass
   the authenticated user's real data. If unset, it uses the demo profile (Eduardo). */
(function () {
  'use strict';

  // ── Demo profile (mockup data) — overridden by window.PLANEA_PROFILE in the real app ──
  var DEMO_PROFILE = {
    nombre: 'Eduardo',
    planea_score: 97,
    rango: 'Planeado',
    ingreso_mensual_cop: 6500000,
    gasto_mensual_cop: 3800000,
    pilares_planeacion_pct: { ahorro: 74, deuda: 38, inversion: 55, seguros: 61, impuestos: 80, pension: 45, legado: 20 },
    score_pilares_pct: { fondo_emergencia: 95, flujo_caja: 98, salud_deuda: 96, estabilidad: 92 },
    patrimonio_neto_cop: 100000000,
    activos_total_cop: 135000000,
    pasivos_total_cop: 35000000,
    activos: [
      { nombre: 'Liquidez', valor_cop: 12000000 }, { nombre: 'Ahorro (CDT y fondos)', valor_cop: 18000000 },
      { nombre: 'Inversiones', valor_cop: 22000000 }, { nombre: 'Sociedades', valor_cop: 15000000 },
      { nombre: 'Vivienda', valor_cop: 55000000 }, { nombre: 'Vehículos', valor_cop: 9000000 },
      { nombre: 'Activos no financieros', valor_cop: 4000000 }
    ],
    pasivos: [
      { nombre: 'Hipoteca', valor_cop: 25000000 }, { nombre: 'Crédito de consumo', valor_cop: 7600000 },
      { nombre: 'Tarjeta de crédito', valor_cop: 2400000, tasa_ea: 0.29 }
    ],
    fondo_emergencia_meses: 3.2,
    meta_prioritaria: { nombre: 'Fondo de emergencia', objetivo_cop: 18000000, actual_cop: 11200000, progreso_pct: 62, meses_restantes: 3 },
    metas: [
      { nombre: 'Vivienda (cuota inicial)', objetivo_cop: 60000000, actual_cop: 28000000, pct: 47, meses_restantes: 16, prioridad: 'alta' },
      { nombre: 'Viajes (Europa 2027)', objetivo_cop: 15000000, actual_cop: 4500000, pct: 30, meses_restantes: 14, prioridad: 'alta' },
      { nombre: 'Retiro (pensión voluntaria)', objetivo_cop: 200000000, actual_cop: 12000000, pct: 6, prioridad: 'alta' },
      { nombre: 'Educación (maestría)', objetivo_cop: 30000000, actual_cop: 9000000, pct: 30, meses_restantes: 21, prioridad: 'alta' },
      { nombre: 'Pagar deuda (tarjeta)', objetivo_cop: 6000000, actual_cop: 2400000, pct: 40, meses_restantes: 9, prioridad: 'baja' }
    ]
  };

  var API = '/planea/api/v1/maya/chat';
  var TTS = '/api/tts/edge';
  var TTS_VOICE = 'salome'; // es-CO
  var SUGERENCIAS = [
    'Hola Maya, dame un resumen de mi salud financiera hoy',
    '¿Qué debo hacer primero?',
    '¿Cómo voy con mi fondo de emergencia?',
    '¿Estoy listo para mi meta de vivienda?'
  ];

  var history = []; // {role, content}
  var speaking = true; // auto-speak Maya replies
  var recognizing = false;
  var recog = null;
  var handsFree = false; // hands-free conversation mode
  var hfEmpty = 0; // consecutive silent listens
  var els = {};

  function profile() { return window.PLANEA_PROFILE || DEMO_PROFILE; }

  function css() {
    var s = document.createElement('style');
    s.textContent = [
      '.maya-panel{position:fixed;right:24px;bottom:96px;width:380px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 130px);background:#fff;border:1px solid #E6E9E8;border-radius:18px;box-shadow:0 24px 60px rgba(22,55,58,.28);display:none;flex-direction:column;overflow:hidden;z-index:60;font-family:"DM Sans",system-ui,sans-serif}',
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
      '.maya-fab{position:fixed;right:24px;bottom:24px;z-index:55;display:flex;align-items:center;gap:11px;background:#16373A;color:#fff;border:none;cursor:pointer;padding:13px 20px 13px 15px;border-radius:99px;box-shadow:0 10px 30px rgba(22,55,58,.32);font-family:"DM Sans",system-ui,sans-serif;transition:transform .18s,box-shadow .18s}',
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
      '@media (max-width:520px){.maya-panel{right:8px;left:8px;bottom:88px;width:auto;height:calc(100vh - 120px)}.maya-fab .txt{display:none}.maya-fab{padding:14px;border-radius:50%}}'
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

  function addMsg(role, text) {
    var d = document.createElement('div');
    d.className = 'maya-msg ' + (role === 'user' ? 'u' : 'm');
    d.textContent = text;
    els.body.appendChild(d);
    els.body.scrollTop = els.body.scrollHeight;
    return d;
  }

  function greet() {
    if (els.body.childElementCount === 0) {
      addMsg('maya', 'Hola ' + (profile().nombre || '') + ', soy Maya. Puedo explicarte tu Planea Score, revisar tus metas y decirte qué hacer primero. Escríbeme o toca el micrófono.');
    }
  }

  // Core ask: append user msg, call Maya, append reply. opts.onReply(reply) lets the
  // hands-free loop chain speak→listen; opts.silentTyping hides the "pensando" bubble.
  function ask(text, opts) {
    opts = opts || {};
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

  // ── Voice output (Web Audio — precise onended for the hands-free loop) ──
  var actx = null, curSource = null;
  function ensureCtx() { if (!actx) { var C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); } return actx; }
  function unlockAudio() { var c = ensureCtx(); if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} } }
  function stopAudio() { if (curSource) { try { curSource.onended = null; curSource.stop(); } catch (e) {} curSource = null; } }
  function speak(text, onEnd) {
    stopAudio();
    var c = ensureCtx();
    fetch(TTS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, voice: TTS_VOICE }) })
      .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
      .then(function (buf) {
        if (!buf || !c) { if (onEnd) onEnd(); return; }
        c.decodeAudioData(buf.slice(0), function (decoded) {
          var src = c.createBufferSource();
          src.buffer = decoded;
          src.connect(c.destination);
          src.onended = function () { if (curSource === src) curSource = null; if (onEnd) onEnd(); };
          curSource = src;
          try { src.start(0); } catch (e) { if (onEnd) onEnd(); }
        }, function () { if (onEnd) onEnd(); });
      })
      .catch(function () { if (onEnd) onEnd(); });
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
    var g = 'Hola ' + (profile().nombre || '') + '. Soy Maya. Cuéntame, ¿qué quieres saber sobre tus finanzas?';
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

  function init() {
    css();
    build();
    // Bind any existing floating chatbot buttons; if none, inject our own launcher
    // so this script works standalone on ANY page (landing, etc.).
    var btns = document.querySelectorAll('.chatbot');
    if (btns.length) {
      btns.forEach(function (b) { b.removeAttribute('onclick'); b.addEventListener('click', toggle); });
    } else {
      makeFab();
    }
    window.MayaChat = { open: open, close: close, toggle: toggle };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
