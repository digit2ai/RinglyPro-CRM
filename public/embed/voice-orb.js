/*!
 * Digit2AI Voice Orb — the own-stack replacement for the ElevenLabs ConvAI widget.
 *
 *   Ear   -> Web Speech API in the browser (on-device, $0)
 *   Brain -> POST /api/voice-agent/chat  (Claude Haiku, grounded in THIS page)
 *   Voice -> POST /api/tts/edge          (Microsoft Edge neural, $0)
 *
 * Drop-in usage — replaces:
 *     <elevenlabs-convai agent-id="..."></elevenlabs-convai>
 *     <script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async></script>
 * with:
 *     <div data-voice-orb data-agent="camaravirtual" data-lang="es"></div>
 *     <script src="/embed/voice-orb.js" defer></script>
 *
 * Attributes (all optional except data-agent):
 *   data-agent    persona id from src/config/voice-agents.js  (default "digit2ai")
 *   data-lang     "es" | "en"                                  (default: the pack's)
 *   data-voice    Edge voice alias or full name, overrides the pack
 *   data-position "bottom-right" | "bottom-left"               (default bottom-right)
 *   data-accent   CSS colour for the orb gradient's core
 *   data-label    launcher caption
 *   data-api      API origin, when the page is served from another host
 *
 * The agent's FACTS come from this page: we extract its visible text and send it
 * as context on every turn, and the server prompt forbids answering from
 * anything else. So the agent is updated by editing the page, and it cannot
 * quote a number the page never printed.
 *
 * No build step, no dependencies, no third-party script. Zero keys in the browser.
 */
(function () {
  'use strict';
  if (window.__d2aiVoiceOrbLoaded) return;
  window.__d2aiVoiceOrbLoaded = true;

  // API origin = wherever this script was served from, so the orb keeps working
  // when the page is iframed into GHL, WordPress or a partner domain.
  var SELF = document.currentScript && document.currentScript.src;
  var SCRIPT_ORIGIN = '';
  try { if (SELF) SCRIPT_ORIGIN = new URL(SELF, location.href).origin; } catch (e) {}

  var STRINGS = {
    es: {
      idle: 'Toca para hablar',
      connecting: 'Conectando…',
      listening: 'Te escucho — habla',
      thinking: 'Pensando…',
      speaking: 'Hablando',
      denied: 'Permite el micrófono para hablar',
      error: 'No se pudo iniciar. Inténtalo de nuevo.',
      typed: 'Escribe tu pregunta…',
      send: 'Enviar',
      close: 'Cerrar',
      hangup: 'Terminar',
      typeHint: 'Escribe abajo para continuar.',
      bye: 'Me quedo por aquí. Toca el botón cuando quieras seguir.',
      trouble: 'Tuve un problema de conexión. ¿Me repites la pregunta?'
    },
    en: {
      idle: 'Tap to talk',
      connecting: 'Connecting…',
      listening: "I'm listening — go ahead",
      thinking: 'Thinking…',
      speaking: 'Speaking',
      denied: 'Allow the microphone to talk',
      error: "Couldn't start. Please try again.",
      typed: 'Type your question…',
      send: 'Send',
      close: 'Close',
      hangup: 'End',
      typeHint: 'Type below to continue.',
      bye: "I'll stop here. Tap the button whenever you want to keep going.",
      trouble: 'I hit a connection problem. Could you repeat that?'
    }
  };

  var CSS = [
    '.d2orb-root{position:fixed;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;display:flex;flex-direction:column;align-items:flex-end;gap:10px}',
    '.d2orb-root[data-pos="bottom-right"]{right:20px;bottom:20px;align-items:flex-end}',
    '.d2orb-root[data-pos="bottom-left"]{left:20px;bottom:20px;align-items:flex-start}',
    '.d2orb-launch{display:flex;align-items:center;gap:12px;background:rgba(12,16,28,.92);border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:8px 18px 8px 8px;cursor:pointer;box-shadow:0 12px 34px rgba(0,0,0,.34);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:transform .18s ease,box-shadow .18s ease}',
    '.d2orb-launch:hover{transform:translateY(-2px);box-shadow:0 18px 42px rgba(0,0,0,.42)}',
    '.d2orb-launch:focus-visible{outline:2px solid var(--d2orb-accent,#22d3ee);outline-offset:3px}',
    '.d2orb-ball{position:relative;width:44px;height:44px;flex:0 0 44px;border-radius:50%;background:radial-gradient(circle at 34% 30%,#dffbff,var(--d2orb-accent,#22d3ee) 42%,#8b5cf6 100%);box-shadow:0 0 18px rgba(34,211,238,.45)}',
    '.d2orb-ball::after{content:"";position:absolute;inset:-5px;border-radius:50%;border:2px solid rgba(139,92,246,.4)}',
    '.d2orb-txt{color:#fff;font-size:14px;font-weight:600;letter-spacing:.2px;white-space:nowrap}',
    '.d2orb-panel{width:min(360px,calc(100vw - 32px));background:rgba(12,16,28,.96);border:1px solid rgba(255,255,255,.16);border-radius:20px;box-shadow:0 24px 60px rgba(0,0,0,.5);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);overflow:hidden;color:#fff;display:none}',
    '.d2orb-root.is-open .d2orb-panel{display:block}',
    '.d2orb-root.is-open .d2orb-launch{display:none}',
    '.d2orb-head{display:flex;align-items:center;gap:12px;padding:16px 16px 12px}',
    '.d2orb-head .d2orb-ball{width:52px;height:52px;flex:0 0 52px;cursor:pointer}',
    '.d2orb-ball.is-speaking{animation:d2orb-pulse 1.15s ease-in-out infinite}',
    '.d2orb-ball.is-listening{animation:d2orb-breathe 2.2s ease-in-out infinite}',
    '.d2orb-ball.is-thinking{animation:d2orb-spin 1.1s linear infinite}',
    '@keyframes d2orb-pulse{0%,100%{transform:scale(1);box-shadow:0 0 18px rgba(34,211,238,.45)}50%{transform:scale(1.1);box-shadow:0 0 34px rgba(139,92,246,.7)}}',
    '@keyframes d2orb-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}',
    '@keyframes d2orb-spin{to{transform:rotate(360deg)}}',
    '@media (prefers-reduced-motion:reduce){.d2orb-ball{animation:none!important}}',
    '.d2orb-name{font-size:15px;font-weight:700;line-height:1.2}',
    '.d2orb-role{font-size:12px;color:rgba(255,255,255,.62);line-height:1.35;margin-top:2px}',
    '.d2orb-x{margin-left:auto;background:none;border:0;color:rgba(255,255,255,.6);font-size:22px;line-height:1;cursor:pointer;padding:4px 6px;border-radius:8px}',
    '.d2orb-x:hover{color:#fff;background:rgba(255,255,255,.1)}',
    '.d2orb-status{padding:0 16px;font-size:12px;font-weight:600;color:var(--d2orb-accent,#22d3ee);text-transform:uppercase;letter-spacing:.6px}',
    '.d2orb-cap{margin:10px 16px 0;min-height:44px;max-height:170px;overflow-y:auto;font-size:14px;line-height:1.5;color:rgba(255,255,255,.9)}',
    '.d2orb-cap .u{color:var(--d2orb-accent,#22d3ee);font-style:italic}',
    '.d2orb-row{display:flex;gap:8px;padding:12px 16px 14px}',
    '.d2orb-row input{flex:1;min-width:0;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:10px 14px;color:#fff;font-size:14px;font-family:inherit}',
    '.d2orb-row input::placeholder{color:rgba(255,255,255,.45)}',
    '.d2orb-row input:focus{outline:none;border-color:var(--d2orb-accent,#22d3ee)}',
    '.d2orb-row button{background:var(--d2orb-accent,#22d3ee);border:0;border-radius:999px;padding:10px 16px;color:#04121a;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}',
    '.d2orb-end{width:calc(100% - 32px);margin:0 16px 14px;background:rgba(239,68,68,.16);border:1px solid rgba(239,68,68,.5);color:#fca5a5;border-radius:999px;padding:9px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:none}',
    '.d2orb-root.is-live .d2orb-end{display:block}',
    '.d2orb-foot{padding:0 16px 14px;font-size:10px;letter-spacing:.4px;color:rgba(255,255,255,.35);text-transform:uppercase}',
    '@media print{.d2orb-root{display:none!important}}'
  ].join('');

  function injectCss() {
    if (document.getElementById('d2orb-css')) return;
    var s = document.createElement('style');
    s.id = 'd2orb-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ── Page grounding ──────────────────────────────────────────────────────
   * The agent's only source of facts. Take the visible text of the page,
   * minus our own UI and anything invisible, capped so the prompt stays cheap.
   */
  function extractPageText() {
    var root = document.querySelector('main') || document.body;
    if (!root) return '';
    var skip = /^(script|style|noscript|svg|canvas|iframe|template|nav|footer)$/i;
    var out = [];
    var seen = Object.create(null);
    var title = (document.title || '').trim();
    if (title) out.push(title);
    var meta = document.querySelector('meta[name="description"]');
    if (meta && meta.content) out.push(meta.content.trim());

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (el) {
        if (skip.test(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (el.closest && el.closest('.d2orb-root')) return NodeFilter.FILTER_REJECT;
        if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return NodeFilter.FILTER_REJECT;
        return /^(h1|h2|h3|h4|p|li|td|th|dt|dd|summary|figcaption|blockquote)$/i.test(el.tagName)
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var el, total = 0;
    while ((el = walker.nextNode()) && total < 12000) {
      // Hidden branches (inactive slides, collapsed panels) are not what the
      // visitor is looking at, so they are not what the agent should quote.
      if (!el.offsetParent && el.tagName !== 'LI' && el.tagName !== 'TD') continue;
      var t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length < 12 || t.length > 600) continue;
      if (seen[t]) continue;
      seen[t] = 1;
      out.push(t);
      total += t.length;
    }
    return out.join('\n').slice(0, 12000);
  }

  /* ── One orb instance ────────────────────────────────────────────────── */
  function createOrb(host) {
    var d = host.dataset || {};
    var API = (d.api || SCRIPT_ORIGIN || '').replace(/\/$/, '');
    var AGENT = d.agent || 'digit2ai';
    var accent = d.accent || '#22d3ee';
    var pos = d.position === 'bottom-left' ? 'bottom-left' : 'bottom-right';

    var lang = (d.lang || document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
    if (lang !== 'es') lang = 'en';
    var T = STRINGS[lang];

    var cfg = { name: 'AI', role: '', voice: d.voice || (lang === 'es' ? 'lina' : 'ava'), greeting: '', lang: lang };

    // ── DOM ──
    injectCss();
    var root = document.createElement('div');
    root.className = 'd2orb-root';
    root.setAttribute('data-pos', pos);
    root.style.setProperty('--d2orb-accent', accent);
    root.innerHTML =
      '<div class="d2orb-panel" role="dialog" aria-live="polite">' +
        '<div class="d2orb-head">' +
          '<div class="d2orb-ball" data-el="ball" role="button" tabindex="0"></div>' +
          '<div><div class="d2orb-name" data-el="name"></div><div class="d2orb-role" data-el="role"></div></div>' +
          '<button class="d2orb-x" data-el="close" type="button">&times;</button>' +
        '</div>' +
        '<div class="d2orb-status" data-el="status"></div>' +
        '<div class="d2orb-cap" data-el="cap"></div>' +
        '<div class="d2orb-row"><input data-el="input" type="text" autocomplete="off"><button data-el="send" type="button"></button></div>' +
        '<button class="d2orb-end" data-el="end" type="button"></button>' +
        '<div class="d2orb-foot">Powered by Digit2AI</div>' +
      '</div>' +
      '<button class="d2orb-launch" data-el="launch" type="button">' +
        '<span class="d2orb-ball"></span><span class="d2orb-txt" data-el="launchTxt"></span>' +
      '</button>';
    document.body.appendChild(root);

    var $ = function (n) { return root.querySelector('[data-el="' + n + '"]'); };
    var ball = $('ball'), statusEl = $('status'), capEl = $('cap');
    var input = $('input'), sendBtn = $('send'), endBtn = $('end');

    $('launchTxt').textContent = d.label || T.idle;
    input.placeholder = T.typed;
    sendBtn.textContent = T.send;
    endBtn.textContent = T.hangup;
    $('close').setAttribute('aria-label', T.close);

    // ── State ──
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var live = false, micStream = null, recog = null, recognizing = false;
    var silences = 0, MAX_SILENCES = 3;
    var history = [];
    var pageContext = '';

    function setState(s) {
      ball.classList.remove('is-listening', 'is-speaking', 'is-thinking');
      statusEl.textContent = T[s] || T.idle;
      if (s === 'listening' || s === 'speaking' || s === 'thinking') ball.classList.add('is-' + s);
      root.classList.toggle('is-live', s !== 'idle' && s !== 'denied' && s !== 'error');
    }
    function setCap(text, isUser) {
      capEl.innerHTML = '';
      if (!text) return;
      var span = document.createElement('span');
      if (isUser) span.className = 'u';
      span.textContent = text;
      capEl.appendChild(span);
      capEl.scrollTop = capEl.scrollHeight;
    }

    // ── Voice: Edge neural, sentence-chunked so it starts speaking fast ──
    var actx = null, curSource = null, speakToken = 0;
    function ensureCtx() {
      if (!actx) { var C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); }
      return actx;
    }
    function unlockAudio() {
      var c = ensureCtx();
      if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} }
    }
    function stopAudio() {
      speakToken++;
      if (curSource) { try { curSource.onended = null; curSource.stop(); } catch (e) {} curSource = null; }
    }
    function cleanForTTS(t) {
      return String(t)
        .replace(/\*\*|\*|__|_|#+|>/g, ' ')
        .replace(/^\s*[-•]\s+/gm, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\s+/g, ' ').trim();
    }
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
      return fetch(API + '/api/tts/edge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, voice: cfg.voice })
      })
        .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
        .then(function (buf) {
          if (!buf) return null;
          return new Promise(function (res) {
            c.decodeAudioData(buf.slice(0), function (dd) { res(dd); }, function () { res(null); });
          });
        })
        .catch(function () { return null; });
    }
    function speak(text, onEnd) {
      stopAudio();
      var myToken = speakToken;
      var c = ensureCtx();
      var chunks = splitChunks(text);
      if (!c || !chunks.length) { if (onEnd) onEnd(); return; }
      var i = 0;
      var nextP = fetchDecoded(chunks[0]);
      (function playNext() {
        var step = playNext;
        if (myToken !== speakToken) return;
        if (i >= chunks.length) { if (onEnd) onEnd(); return; }
        var p = nextP;
        nextP = (i + 1 < chunks.length) ? fetchDecoded(chunks[i + 1]) : null;
        p.then(function (buf) {
          if (myToken !== speakToken) return;
          if (!buf) { i++; step(); return; }
          var src = c.createBufferSource();
          src.buffer = buf; src.connect(c.destination);
          src.onended = function () {
            if (myToken !== speakToken) return;
            if (curSource === src) curSource = null;
            i++; step();
          };
          curSource = src;
          try { src.start(0); } catch (e) { i++; step(); }
        });
      })();
    }

    // ── Brain ──
    function ask(text, onReply) {
      history.push({ role: 'user', content: text });
      setState('thinking');
      fetch(API + '/api/voice-agent/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: AGENT, lang: cfg.lang, context: pageContext, messages: history.slice(-12) })
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var reply = (data && data.reply) || T.trouble;
          history.push({ role: 'assistant', content: reply });
          onReply(reply);
        })
        .catch(function () { onReply(T.trouble); });
    }

    // ── Hands-free loop: speak -> listen -> think -> speak ──
    function sayThenListen(text) {
      if (!live) return;
      setState('speaking'); setCap(text, false);
      speak(text, function () { if (live) listen(); });
    }
    function listen() {
      if (!live) return;
      if (!SR) { setState('listening'); setCap(T.typeHint, false); return; }
      setState('listening'); setCap('', true);

      recog = new SR();
      recog.lang = cfg.lang === 'es' ? 'es-419' : 'en-US';
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
        setCap((finalText + interim).trim(), true);
      };
      recog.onerror = function (e) {
        recognizing = false;
        if (e && e.error === 'not-allowed') { live = false; setState('denied'); }
      };
      recog.onend = function () {
        recognizing = false;
        if (!live) return;
        var t = finalText.trim();
        if (t) {
          silences = 0; setCap(t, true);
          ask(t, function (reply) { sayThenListen(reply); });
        } else {
          silences++;
          if (silences >= MAX_SILENCES) {
            setState('speaking'); setCap(T.bye, false);
            speak(T.bye, function () { endCall(); });
          } else { listen(); }
        }
      };
      try { recog.start(); }
      catch (e) { setTimeout(function () { if (live) listen(); }, 400); }
    }

    function releaseMic() {
      if (micStream) {
        try { micStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        micStream = null;
      }
    }
    function endCall() {
      live = false;
      stopAudio();
      if (recognizing && recog) { try { recog.abort(); } catch (e) {} }
      recognizing = false;
      releaseMic();
      silences = 0;
      setState('idle');
      setCap('', false);
    }
    function startCall() {
      if (live) return;
      live = true; silences = 0; history = [];
      pageContext = extractPageText();
      unlockAudio();
      setState('connecting');

      var greet = cfg.greeting;
      history.push({ role: 'assistant', content: greet });

      // No speech recognition (Firefox, some in-app browsers): the agent still
      // greets and speaks; the visitor types. Voice out, keyboard in.
      if (!SR || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setState('speaking'); setCap(greet, false);
        speak(greet, function () {
          if (live) { setState('listening'); setCap(T.typeHint, false); input.focus(); }
        });
        return;
      }

      navigator.mediaDevices.getUserMedia({
        // Browser DSP: cancels the speaker echo (the agent stops hearing
        // itself), suppresses room noise, normalises level.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
      })
        .then(function (stream) {
          micStream = stream;
          if (!live) { releaseMic(); return; }
          sayThenListen(greet);
        })
        .catch(function (err) {
          live = false; releaseMic();
          setState(err && err.name === 'NotAllowedError' ? 'denied' : 'error');
          setCap(greet, false);
          speak(greet);
        });
    }

    function sendTyped() {
      var t = (input.value || '').trim();
      if (!t) return;
      input.value = '';
      if (!pageContext) pageContext = extractPageText();
      unlockAudio();
      setCap(t, true);
      ask(t, function (reply) {
        setState('speaking'); setCap(reply, false);
        speak(reply, function () {
          if (live && SR && micStream) listen();
          else setState(live ? 'listening' : 'idle');
        });
      });
    }

    // ── Wiring ──
    function open() {
      root.classList.add('is-open');
      setState('idle');
      if (!live) startCall();
    }
    function close() { endCall(); root.classList.remove('is-open'); }

    $('launch').addEventListener('click', open);
    $('close').addEventListener('click', close);
    endBtn.addEventListener('click', endCall);
    ball.addEventListener('click', function () { if (live) endCall(); else startCall(); });
    ball.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (live) endCall(); else startCall(); }
    });
    sendBtn.addEventListener('click', sendTyped);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); sendTyped(); }
    });
    window.addEventListener('pagehide', endCall);

    // Boot: fetch the persona (name, Edge voice, greeting) from the registry.
    function applyCfg(c) {
      cfg.name = c.name || cfg.name;
      cfg.role = c.role || '';
      cfg.voice = d.voice || c.voice || cfg.voice;
      cfg.greeting = c.greeting || cfg.greeting;
      cfg.lang = c.lang || cfg.lang;
      T = STRINGS[cfg.lang] || T;
      $('name').textContent = cfg.name;
      $('role').textContent = cfg.role;
      if (!d.label) $('launchTxt').textContent = T.idle;
      input.placeholder = T.typed; sendBtn.textContent = T.send; endBtn.textContent = T.hangup;
      setState('idle');
    }
    fetch(API + '/api/voice-agent/config?agent=' + encodeURIComponent(AGENT) + '&lang=' + encodeURIComponent(lang))
      .then(function (r) { return r.json(); })
      .then(applyCfg)
      .catch(function () {
        applyCfg({ name: 'AI', role: '', greeting: lang === 'es'
          ? 'Hola, ¿en qué le puedo ayudar con esta página?'
          : 'Hi, how can I help you with this page?' });
      });

    // Public handle so a host page can open the orb from its own button.
    return {
      open: open, close: close,
      setLang: function (l) {
        l = (l || '').slice(0, 2).toLowerCase(); if (l !== 'es') l = 'en';
        endCall();
        fetch(API + '/api/voice-agent/config?agent=' + encodeURIComponent(AGENT) + '&lang=' + l)
          .then(function (r) { return r.json(); }).then(applyCfg).catch(function () {});
      }
    };
  }

  function boot() {
    var hosts = document.querySelectorAll('[data-voice-orb]');
    var made = [];
    for (var i = 0; i < hosts.length; i++) {
      if (hosts[i].__d2orb) continue;
      hosts[i].__d2orb = true;
      made.push(createOrb(hosts[i]));
    }
    if (made.length) {
      window.D2AIVoiceOrb = made[0];
      window.D2AIVoiceOrbs = made;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
