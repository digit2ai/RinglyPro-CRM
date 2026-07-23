/* Lawn Co-Pilot — the orb controller
 *
 * THE GATE IS THE POINT. Every entry point — orb click, text input focus,
 * prompt chip, send button, any [data-gate] element — is locked until name,
 * phone, and email are captured. There is no side door.
 *
 * Voice is an enhancement. The typed path is fully functional on its own with
 * no keys configured anywhere.
 */
(function () {
  'use strict';

  var API = '/lawncopilot/api/v1';
  var LS_KEY = 'lawncopilot_identity';

  var identity = null;      // {name, phone, email}
  var sessionId = null;
  var pending = null;       // action to run once the gate is satisfied
  var config = {};
  var voiceLive = false;
  var conversation = null;  // ElevenLabs convai session

  var el = {
    gate: document.getElementById('gate'),
    gateForm: document.getElementById('gateForm'),
    gateSubmit: document.getElementById('gateSubmit'),
    orb: document.getElementById('orb'),
    status: document.getElementById('status'),
    transcript: document.getElementById('transcript'),
    msg: document.getElementById('msg'),
    send: document.getElementById('send'),
    result: document.getElementById('result'),
    map: document.getElementById('map'),
    prices: document.getElementById('prices'),
    disclaimer: document.getElementById('disclaimer')
  };

  // ── Identity persistence ────────────────────────────────────────────────
  function loadIdentity() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.identity || !o.session_id) return null;
      if (Date.now() - (o.at || 0) > 30 * 86400000) return null;
      return o;
    } catch (e) { return null; }
  }
  function saveIdentity(id, sid) {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ identity: id, session_id: sid, at: Date.now() })); } catch (e) {}
  }
  function identityComplete() {
    return !!(identity && identity.name && validPhone(identity.phone) && validEmail(identity.email) && sessionId);
  }
  function validEmail(v) { return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(v || '')); }
  function validPhone(v) { return /^\+?[1-9]\d{6,15}$/.test(String(v || '').replace(/[\s()\-.]/g, '')); }
  function normPhone(v) {
    var s = String(v || '').replace(/[\s()\-.]/g, '');
    if (!s) return '';
    if (s.charAt(0) !== '+') s = (s.length === 10 ? '+1' : '+') + s;
    return s;
  }

  // ── The gate ────────────────────────────────────────────────────────────
  function openGate(after) {
    pending = typeof after === 'function' ? after : null;
    el.gate.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { var f = document.getElementById('g-name'); if (f) f.focus(); }, 60);
  }
  function closeGate() {
    el.gate.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  /**
   * The single choke point. Returns true if the caller may proceed; otherwise
   * opens the gate and queues the action. EVERY entry point calls this.
   */
  function gate(after) {
    if (identityComplete()) return true;
    openGate(after);
    return false;
  }
  window.__lawnGate = gate;

  function fieldError(id, bad) {
    var f = document.getElementById(id);
    if (f) f.classList[bad ? 'add' : 'remove']('is-bad');
  }

  el.gateForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('g-name').value.trim();
    var phone = normPhone(document.getElementById('g-phone').value);
    var email = document.getElementById('g-email').value.trim();
    var marketing = document.getElementById('g-marketing').checked;

    var bad = false;
    fieldError('f-name', name.length < 2); if (name.length < 2) bad = true;
    fieldError('f-phone', !validPhone(phone)); if (!validPhone(phone)) bad = true;
    fieldError('f-email', !validEmail(email)); if (!validEmail(email)) bad = true;
    if (bad) return;

    el.gateSubmit.disabled = true;
    el.gateSubmit.textContent = 'One moment...';

    post(API + '/orb/identity', {
      name: name, phone: phone, email: email,
      channel: 'web_orb',
      session_id: sessionId,
      consent: { sms_transactional: true, email_marketing: marketing, sms_marketing: marketing }
    }).then(function (r) {
      el.gateSubmit.disabled = false;
      el.gateSubmit.textContent = 'Continue';
      if (!r || !r.success) {
        setStatus((r && r.error) || 'Something went wrong. Try again.');
        return;
      }
      identity = { name: name, phone: phone, email: email };
      sessionId = r.session_id;
      saveIdentity(identity, sessionId);
      closeGate();
      unlock();

      if (r.greeting) addLine('agent', r.greeting + ' What is the service address?');
      setStatus('Ready. Type your address, or tap the orb to talk.');

      var run = pending; pending = null;
      if (run) run();
    }).catch(function () {
      el.gateSubmit.disabled = false;
      el.gateSubmit.textContent = 'Continue';
      setStatus('Network problem. Try again.');
    });
  });

  // ── Lock every entry point identically ──────────────────────────────────
  function wireGates() {
    // Any element carrying data-gate is locked.
    document.querySelectorAll('[data-gate]').forEach(function (node) {
      var kind = node.getAttribute('data-gate');

      if (kind === 'input') {
        // The text field: block focus AND pointer, not just typing.
        node.addEventListener('mousedown', function (e) {
          if (!identityComplete()) { e.preventDefault(); node.blur(); openGate(function () { node.focus(); }); }
        });
        node.addEventListener('focus', function () {
          if (!identityComplete()) { node.blur(); openGate(function () { node.focus(); }); }
        });
        node.addEventListener('keydown', function (e) {
          if (!identityComplete()) { e.preventDefault(); openGate(); return; }
          if (e.key === 'Enter') { e.preventDefault(); sendTyped(); }
        });
        return;
      }

      node.addEventListener('click', function (e) {
        if (kind === 'chip') {
          var text = node.getAttribute('data-chip');
          e.preventDefault();
          if (!gate(function () { sendTyped(text); })) return;
          sendTyped(text);
          return;
        }
        if (kind === 'orb') {
          e.preventDefault();
          if (!gate(activateVoice)) return;
          activateVoice();
          return;
        }
        if (kind === 'send') {
          e.preventDefault();
          if (!gate(function () { sendTyped(); })) return;
          sendTyped();
          return;
        }
        // hero / nav / footer CTAs
        e.preventDefault();
        if (!gate(startConversation)) return;
        startConversation();
      });
    });
  }

  function unlock() {
    if (el.msg) { el.msg.placeholder = 'Type your address, or ask me anything...'; }
  }

  // ── Transcript ──────────────────────────────────────────────────────────
  function addLine(role, text) {
    if (!text) return;
    el.transcript.classList.add('is-open');
    var d = document.createElement('div');
    d.className = 't-line ' + (role === 'agent' ? 'agent' : 'user');
    var b = document.createElement('b');
    b.textContent = role === 'agent' ? 'Lawn Co-Pilot' : ((identity && identity.name) || 'You');
    var s = document.createElement('span');
    s.textContent = text;
    d.appendChild(b); d.appendChild(s);
    el.transcript.appendChild(d);
    el.transcript.scrollTop = el.transcript.scrollHeight;
  }
  function setStatus(t) { if (el.status) el.status.textContent = t; }

  // ── Conversation (typed path — always works, zero keys) ─────────────────
  function startConversation() {
    setStatus('Connecting...');
    post(API + '/orb/session', { session_id: sessionId, channel: 'web_chat' })
      .then(function (r) {
        if (r && r.reply) addLine('agent', r.reply);
        setStatus('Type your address to get a price.');
        if (el.msg) el.msg.focus();
      })
      .catch(function () { setStatus('Could not connect. Try typing instead.'); });
  }

  function sendTyped(preset) {
    var text = preset || (el.msg ? el.msg.value.trim() : '');
    if (!text) { if (el.msg) el.msg.focus(); return; }
    if (!identityComplete()) { openGate(function () { sendTyped(text); }); return; }

    addLine('user', text);
    if (el.msg && !preset) el.msg.value = '';
    setStatus('Working on it...');
    if (el.send) el.send.disabled = true;

    post(API + '/orb/message', { session_id: sessionId, text: text, channel: 'web_chat' })
      .then(function (r) {
        if (el.send) el.send.disabled = false;
        if (!r || !r.success) {
          if (r && r.gate_required) { openGate(function () { sendTyped(text); }); return; }
          addLine('agent', (r && r.error) || 'Something went wrong on my end.');
          setStatus('');
          return;
        }
        addLine('agent', r.reply);
        setStatus('');
        if (r.data) renderResult(r.data);
        if (voiceLive) speak(r.reply);
      })
      .catch(function () {
        if (el.send) el.send.disabled = false;
        addLine('agent', 'I lost the connection there. Try that again?');
        setStatus('');
      });
  }

  // ── Result rendering: map + measurement + prices ────────────────────────
  function renderResult(data) {
    var m = data.measurement;
    var pricing = data.pricing;
    if (!m && !pricing) return;
    el.result.classList.add('is-open');

    if (m) {
      drawMap(m);
      if (el.disclaimer) {
        el.disclaimer.textContent = m.is_estimate
          ? 'Estimated from property records, not a physical measurement. A person verifies it before your first service.'
          : 'Measured from verified parcel and building records.';
      }
    }

    if (pricing) {
      el.prices.innerHTML = '';
      [['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['one_time', 'One time']]
        .forEach(function (pair) {
          var o = pricing[pair[0]];
          if (!o) return;
          var d = document.createElement('button');
          d.className = 'price' + (pair[0] === 'biweekly' ? ' is-sel' : '');
          d.type = 'button';
          d.innerHTML = '<b>' + o.price_display + '</b><span>' + pair[1] + '</span>';
          d.addEventListener('click', function () { sendTyped(pair[1]); });
          el.prices.appendChild(d);
        });
    }
  }

  function drawMap(m) {
    el.map.innerHTML = '';
    if (m.imagery_url) {
      var img = document.createElement('img');
      img.src = m.imagery_url;
      img.alt = 'Satellite view of ' + (m.normalized_address || 'the property');
      img.loading = 'lazy';
      el.map.appendChild(img);
    } else {
      var e = document.createElement('div');
      e.className = 'map__empty';
      e.textContent = 'Satellite view unavailable — the measurement below still applies.';
      el.map.appendChild(e);
    }

    var g = m.geometry || {};
    if (!g.parcel && !g.building) return;

    var pts = [];
    [g.parcel, g.building].forEach(function (poly) {
      if (poly && poly.coordinates && poly.coordinates[0]) {
        poly.coordinates[0].forEach(function (c) { pts.push(c); });
      }
    });
    if (!pts.length) return;

    var xs = pts.map(function (p) { return p[0]; });
    var ys = pts.map(function (p) { return p[1]; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var padX = (maxX - minX) * 0.18 || 0.0002;
    var padY = (maxY - minY) * 0.18 || 0.0002;
    minX -= padX; maxX += padX; minY -= padY; maxY += padY;

    function project(c) {
      var x = ((c[0] - minX) / (maxX - minX)) * 100;
      var y = 100 - ((c[1] - minY) / (maxY - minY)) * 100;
      return x.toFixed(2) + ',' + y.toFixed(2);
    }

    var svg = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">';
    if (g.parcel && g.parcel.coordinates) {
      svg += '<polygon points="' + g.parcel.coordinates[0].map(project).join(' ') +
        '" fill="rgba(34,197,94,.26)" stroke="#f59e0b" stroke-width="0.7" vector-effect="non-scaling-stroke"/>';
    }
    if (g.building && g.building.coordinates) {
      svg += '<polygon points="' + g.building.coordinates[0].map(project).join(' ') +
        '" fill="rgba(148,163,184,.85)" stroke="#64748b" stroke-width="0.5" vector-effect="non-scaling-stroke"/>';
    }
    svg += '</svg>';
    el.map.insertAdjacentHTML('beforeend', svg);
  }

  // ── Voice (enhancement only) ────────────────────────────────────────────
  function activateVoice() {
    if (voiceLive) { stopVoice(); return; }
    if (!config.voice_available) {
      setStatus('Voice is not switched on here — but typing works exactly the same. Go ahead.');
      el.orb.classList.remove('is-live');
      if (el.msg) el.msg.focus();
      startConversation();
      return;
    }
    setStatus('Starting voice...');
    el.orb.classList.add('is-live');
    loadSdk()
      .then(function (sdk) { return startConvai(sdk); })
      .catch(function (err) {
        voiceLive = false;
        el.orb.classList.remove('is-live');
        setStatus('Voice could not start (' + (err && err.message ? err.message : 'unavailable') + '). Typing works just the same.');
        startConversation();
      });
  }

  var sdkPromise = null;
  function loadSdk() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = import('https://esm.sh/@elevenlabs/client@1.9.0');
    return sdkPromise;
  }

  function startConvai(sdk) {
    return navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function () {
        return sdk.Conversation.startSession({
          agentId: config.convai_agent_en,
          clientTools: buildClientTools(),
          onConnect: function () {
            voiceLive = true;
            setStatus('Listening. Say your address, or ask me anything.');
          },
          onDisconnect: function () {
            voiceLive = false;
            el.orb.classList.remove('is-live');
            setStatus('Voice ended. Your transcript is saved above.');
          },
          onMessage: function (m) {
            if (!m || !m.message) return;
            addLine(m.source === 'user' ? 'user' : 'agent', m.message);
          },
          onError: function (e) {
            setStatus('Voice error. Typing still works.');
          }
        });
      })
      .then(function (c) { conversation = c; });
  }

  function stopVoice() {
    if (conversation && conversation.endSession) { try { conversation.endSession(); } catch (e) {} }
    conversation = null;
    voiceLive = false;
    el.orb.classList.remove('is-live');
    setStatus('Voice off. Keep going by typing.');
  }

  /**
   * The convai client tools bridge straight to the Brain — the voice path
   * never gets its own copy of the pricing or booking logic.
   */
  function buildClientTools() {
    function call(tool) {
      return function (params) {
        return post(API + '/orb/tool', { session_id: sessionId, tool: tool, arguments: params || {} })
          .then(function (r) {
            if (r && r.success) {
              if (tool === 'estimator.measure_property') renderResult({ measurement: r });
              if (tool === 'estimator.price_quote') renderResult({ pricing: r.options });
            }
            return JSON.stringify(r);
          })
          .catch(function (e) { return JSON.stringify({ success: false, error: String(e) }); });
      };
    }
    return {
      measure_property: call('estimator.measure_property'),
      price_quote: call('estimator.price_quote'),
      issue_quote: call('estimator.issue_quote'),
      explain_price: call('estimator.explain_price'),
      check_availability: call('dispatcher.check_availability'),
      book_appointment: call('dispatcher.book_appointment'),
      answer_faq: call('receptionist.answer_faq'),
      take_message: call('receptionist.take_message'),
      create_ticket: call('receptionist.create_ticket')
    };
  }

  // Zero-key speech out for the scripted path.
  function speak(text) {
    if (!text) return;
    fetch('/api/tts/edge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, voice: 'ava' })
    }).then(function (r) {
      if (!r.ok) throw new Error('tts');
      return r.blob();
    }).then(function (b) {
      var a = new Audio(URL.createObjectURL(b));
      a.play().catch(function () {});
    }).catch(function () {
      if (window.speechSynthesis) {
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        window.speechSynthesis.speak(u);
      }
    });
  }

  // ── HTTP ────────────────────────────────────────────────────────────────
  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); });
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  function boot() {
    var saved = loadIdentity();
    if (saved) {
      identity = saved.identity;
      sessionId = saved.session_id;
      unlock();
    }
    wireGates();

    fetch(API + '/orb/config', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (c) {
        config = c || {};
        if (!config.orb_enabled && el.orb) {
          el.orb.style.display = 'none';
          setStatus('Type your address below to get a price.');
        }
      })
      .catch(function () { config = { voice_available: false }; });

    // Close the gate only via Escape when it is not required for a queued action.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.gate.classList.contains('is-open') && !pending) closeGate();
    });
    el.gate.addEventListener('click', function (e) {
      if (e.target === el.gate && !pending) closeGate();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
