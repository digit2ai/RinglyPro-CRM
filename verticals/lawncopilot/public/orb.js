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

  // Every call is scoped to the company whose page this is. The slug comes
  // from the URL, so the same orb code serves every tenant with no per-tenant
  // build and no chance of posting one company's lead to another.
  var SLUG = (document.body && document.body.getAttribute('data-slug')) ||
    (location.pathname.match(/^\/lawncopilot\/([a-z0-9_-]+)/i) || [])[1] || '';
  var API = SLUG ? '/lawncopilot/' + SLUG + '/api/v1' : '/lawncopilot/api/v1';
  var LS_KEY = 'lawncopilot_identity_' + (SLUG || 'default');

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
      [['weekly', 'Weekly', 'per visit'], ['biweekly', 'Every 2 weeks', 'per visit'],
       ['monthly', 'Monthly', 'per visit'], ['one_time', 'One time', 'no plan']]
        .forEach(function (pair) {
          var o = pricing[pair[0]];
          if (!o) return;
          var d = document.createElement('button');
          d.className = 'price' + (pair[0] === 'biweekly' ? ' is-sel' : '');
          d.type = 'button';
          d.setAttribute('aria-label', pair[1] + ' service, ' + o.price_display + ' ' + pair[2]);
          d.innerHTML = '<b>' + o.price_display + '</b><span>' + pair[1] + '</span>' +
            '<em>' + pair[2] + '</em>';
          d.addEventListener('click', function () {
            Array.prototype.forEach.call(el.prices.children, function (c) { c.classList.remove('is-sel'); });
            d.classList.add('is-sel');
            sendTyped(pair[1]);
          });
          el.prices.appendChild(d);
        });
    }
  }

  /**
   * The property view.
   *
   * Satellite imagery is a bonus, not the point. When it is unavailable we draw
   * the property to scale from the measurement itself — lot, house, driveway,
   * and the lawn we service — so the customer always SEES what they are paying
   * for instead of an empty grey box.
   */
  function drawMap(m) {
    el.map.innerHTML = '';
    var hasImagery = !!m.imagery_url;

    if (hasImagery) {
      var img = document.createElement('img');
      img.src = m.imagery_url;
      img.alt = 'Satellite view of ' + (m.normalized_address || 'the property');
      img.loading = 'lazy';
      img.onerror = function () { el.map.innerHTML = ''; drawDiagram(m, false); };
      el.map.appendChild(img);
      drawGeoOverlay(m);
    } else {
      drawDiagram(m, false);
    }

    el.map.insertAdjacentHTML('beforeend',
      '<span class="map__tag">' + (hasImagery ? 'Satellite view' : 'Scaled property diagram') + '</span>' +
      '<div class="map__figure"><b>' + Number(m.serviceable_sqft || 0).toLocaleString() +
      '</b><span>sq ft of lawn</span></div>');
  }

  /* Overlay real parcel/building polygons on satellite imagery. */
  function drawGeoOverlay(m) {
    var g = m.geometry || {};
    if (!g.parcel && !g.building) return;
    var pts = [];
    [g.parcel, g.building].forEach(function (poly) {
      if (poly && poly.coordinates && poly.coordinates[0]) {
        poly.coordinates[0].forEach(function (c) { pts.push(c); });
      }
    });
    if (!pts.length) return;

    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var padX = (maxX - minX) * 0.18 || 0.0002, padY = (maxY - minY) * 0.18 || 0.0002;
    minX -= padX; maxX += padX; minY -= padY; maxY += padY;

    function project(c) {
      return (((c[0] - minX) / (maxX - minX)) * 100).toFixed(2) + ',' +
             (100 - ((c[1] - minY) / (maxY - minY)) * 100).toFixed(2);
    }
    var svg = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">';
    if (g.parcel && g.parcel.coordinates) {
      svg += '<polygon points="' + g.parcel.coordinates[0].map(project).join(' ') +
        '" fill="rgba(61,156,85,.34)" stroke="#f59e0b" stroke-width="2" vector-effect="non-scaling-stroke"/>';
    }
    if (g.building && g.building.coordinates) {
      svg += '<polygon points="' + g.building.coordinates[0].map(project).join(' ') +
        '" fill="rgba(148,163,184,.88)" stroke="#64748b" stroke-width="1.5" vector-effect="non-scaling-stroke"/>';
    }
    el.map.insertAdjacentHTML('beforeend', svg + '</svg>');
  }

  /**
   * Draw the lot to scale from the numbers. Areas are proportionally correct:
   * the house block and driveway occupy their real share of the lot, so the
   * green area genuinely represents the lawn being quoted.
   */
  function drawDiagram(m) {
    var lot = Math.max(Number(m.lot_sqft) || 0, 1);
    var house = Number(m.building_footprint_sqft) || 0;
    var excl = Number(m.excluded_sqft) || 0;

    // Lot drawn as a plot with a ~1.25:1 aspect, inset in the frame.
    var W = 100, H = 100, pad = 9;
    var lw = W - pad * 2, lh = H - pad * 2;
    var lotArea = lw * lh;

    var houseArea = (house / lot) * lotArea;
    var exclArea = (excl / lot) * lotArea;

    // House: a block sitting toward the rear of the lot.
    var hw = Math.min(lw * 0.62, Math.sqrt(houseArea * 1.7));
    var hh = houseArea / Math.max(hw, 1);
    if (hh > lh * 0.55) { hh = lh * 0.55; hw = houseArea / hh; }
    var hx = pad + (lw - hw) / 2, hy = pad + lh * 0.12;

    // Driveway: a strip from the house to the street edge (bottom).
    var dw = Math.min(lw * 0.3, Math.max(exclArea / Math.max(lh * 0.5, 1), lw * 0.13));
    var dh = Math.min(lh - (hy + hh) + 2, Math.max(exclArea / Math.max(dw, 1), lh * 0.2));
    var dx = pad + lw * 0.14, dy = pad + lh - dh;

    var s = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" ' +
      'aria-label="Scaled diagram of the property: lot, house, driveway and the lawn area serviced">';
    // Lawn = the whole lot, green.
    s += '<rect x="' + pad + '" y="' + pad + '" width="' + lw + '" height="' + lh +
      '" rx="1.5" fill="rgba(61,156,85,.42)" stroke="#f59e0b" stroke-width="2" ' +
      'vector-effect="non-scaling-stroke"/>';
    // Mown stripes, so it reads as lawn at a glance.
    for (var i = 0; i < 9; i++) {
      var sy = pad + (lh / 9) * i;
      s += '<rect x="' + pad + '" y="' + sy.toFixed(2) + '" width="' + lw + '" height="' +
        (lh / 18).toFixed(2) + '" fill="rgba(255,255,255,.035)"/>';
    }
    // Driveway.
    if (excl > 0) {
      s += '<rect x="' + dx.toFixed(2) + '" y="' + dy.toFixed(2) + '" width="' + dw.toFixed(2) +
        '" height="' + dh.toFixed(2) + '" rx="0.8" fill="rgba(148,163,184,.55)" ' +
        'stroke="rgba(203,213,225,.5)" stroke-width="1" vector-effect="non-scaling-stroke"/>';
    }
    // House.
    if (house > 0) {
      s += '<rect x="' + hx.toFixed(2) + '" y="' + hy.toFixed(2) + '" width="' + hw.toFixed(2) +
        '" height="' + hh.toFixed(2) + '" rx="1" fill="rgba(148,163,184,.92)" ' +
        'stroke="#64748b" stroke-width="1.5" vector-effect="non-scaling-stroke"/>';
    }
    s += '</svg>';
    el.map.insertAdjacentHTML('beforeend', s);
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
