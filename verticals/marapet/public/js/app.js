/* MaraPet app shell.
   Every figure on screen comes from an API response. There is no sample data
   anywhere in this file: with nothing recorded the screen says so. */
(function () {
  'use strict';
  var BASE = window.MARAPET_BASE || '';
  var $ = function (id) { return document.getElementById(id); };
  var state = { pets: [], pet: null, tab: 'today' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function lang() { return document.documentElement.getAttribute('lang') === 'es' ? 'es' : 'en'; }
  function t(en, es) { return lang() === 'es' ? es : en; }

  async function api(path, opts) {
    var r = await fetch(BASE + '/api/v1' + path, Object.assign({
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }
    }, opts || {}));
    if (r.status === 401) { location.href = BASE + '/login'; throw new Error('signed_out'); }
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw Object.assign(new Error(j.error || 'request_failed'), { payload: j });
    return j;
  }

  var METRIC_LABEL = {
    heart_rate_bpm: { en: 'Resting heart rate', es: 'Frecuencia cardiaca en reposo' },
    resp_rate_bpm:  { en: 'Breathing rate',     es: 'Frecuencia respiratoria' },
    hrv_ms:         { en: 'Heart rate variability', es: 'Variabilidad cardiaca' },
    activity:       { en: 'Activity',           es: 'Actividad' },
    temp_c:         { en: 'Skin temperature',   es: 'Temperatura de la piel' },
    spo2_pct:       { en: 'Oxygen saturation',  es: 'Saturación de oxígeno' }
  };
  function mLabel(m) { return (METRIC_LABEL[m] || {})[lang()] || m; }

  var STATUS_PILL = { ok: 'mp-pill--ok', high: 'mp-pill--warn', low: 'mp-pill--warn' };
  function statusText(s) {
    if (s === 'ok') return t('Inside the reference range', 'Dentro del rango de referencia');
    if (s === 'high') return t('Above the reference range', 'Por encima del rango');
    if (s === 'low') return t('Below the reference range', 'Por debajo del rango');
    return t('No reference range to compare against', 'Sin rango de referencia para comparar');
  }
  /* A figure that is not a sensor reading never renders like one. */
  function provenance(source, confidence) {
    if (source === 'video') {
      return '<span class="mp-prov">' + esc(t('estimate from video', 'estimación por video')) +
        (confidence ? ' &middot; ' + esc(confidence) : '') + '</span>';
    }
    if (source === 'manual') {
      return '<span class="mp-prov">' + esc(t('you entered this', 'lo escribiste tú')) + '</span>';
    }
    return '';
  }

  /* ───────── Today ───────── */
  async function renderToday() {
    var pane = $('pane-today');
    if (!state.pet) { pane.innerHTML = noPets(); return; }
    pane.innerHTML = '<p class="mp-mut">' + esc(t('Loading…', 'Cargando…')) + '</p>';
    var d = await api('/pets/' + state.pet.id + '/today');
    var html = '';
    if (!d.has_data) {
      html += '<div class="mp-empty"><h3 style="margin-top:0">' +
        esc(t('Not connected', 'Sin conexión de datos')) + '</h3><p style="margin:0">' +
        esc(t('No readings for ' + state.pet.name + ' yet. Pair a device, or run a breathing check from the tab above — it needs nothing but your phone.',
              'Aún no hay lecturas de ' + state.pet.name + '. Vincula un dispositivo o haz un chequeo de respiración en la pestaña de arriba: solo necesitas tu teléfono.')) +
        '</p></div>';
    } else {
      html += '<div class="mp-grid mp-grid--2">';
      d.metrics.forEach(function (m) {
        var pill = STATUS_PILL[m.status] || '';
        html += '<div class="mp-card">' +
          '<div class="mp-spread"><span class="mp-label" style="margin:0">' + esc(mLabel(m.metric)) + '</span>' +
          (m.status ? '<span class="mp-pill ' + pill + '">' + esc(statusText(m.status)) + '</span>' : '') +
          '</div>' +
          '<div class="mp-metric" style="margin-top:8px"><span class="mp-metric__v">' + esc(m.value) +
          '</span><span class="mp-metric__u">' + esc(m.unit || '') + '</span></div>' +
          (m.band ? '<p class="mp-note" style="margin:6px 0 0">' +
            esc(t('Reference ', 'Referencia ') + m.band.min + '–' + m.band.max + ' ' + (m.band.unit || '')) + '</p>' : '') +
          '<p style="margin:8px 0 0">' + provenance(m.source, m.confidence) + '</p>' +
          (m.band && m.band.basis ? '<details style="margin-top:8px"><summary class="mp-note" style="cursor:pointer;min-height:44px;display:flex;align-items:center">' +
            esc(t('Where this range comes from', 'De dónde sale este rango')) + '</summary><p class="mp-note">' +
            esc(m.band.basis) + '</p></details>' : '') +
          '</div>';
      });
      html += '</div>';
    }
    html += '<div class="mp-card" style="margin-top:18px"><div class="mp-spread">' +
      '<h3 style="margin:0">' + esc(t("Mara's summary", 'El resumen de Mara')) + '</h3>' +
      '<button class="mp-btn mp-btn--sm" id="repBtn">' + esc(t('Refresh', 'Actualizar')) + '</button></div>' +
      '<div id="rep" style="margin-top:10px"><p class="mp-mut">' + esc(t('Loading…', 'Cargando…')) + '</p></div></div>';
    pane.innerHTML = html;
    $('repBtn').addEventListener('click', function () { loadReport(true); });
    loadReport(false);
  }

  async function loadReport(force) {
    var box = $('rep');
    if (!box) return;
    try {
      var r = await api('/pets/' + state.pet.id + '/report?lang=' + lang() + (force ? '&refresh=1' : ''));
      box.innerHTML = '<p>' + esc(r.body) + '</p>' +
        (r.is_simulated
          ? '<p><span class="mp-prov">' + esc(t('written without a model', 'escrito sin modelo')) + '</span></p>'
          : '');
    } catch (e) {
      box.innerHTML = '<p class="mp-mut">' + esc(t('The summary is not available right now.', 'El resumen no está disponible ahora.')) + '</p>';
    }
  }

  function noPets() {
    return '<div class="mp-empty"><h3 style="margin-top:0">' +
      esc(t('Add your dog first', 'Primero agrega tu perro')) + '</h3><p>' +
      esc(t('MaraPet builds the reference ranges from your dog’s size and age, so it needs those before it can judge a reading.',
            'MaraPet arma los rangos de referencia con el tamaño y la edad de tu perro, así que los necesita antes de poder juzgar una lectura.')) +
      '</p><button class="mp-btn mp-btn--primary" onclick="document.querySelector(\'[data-tab=pets]\').click()">' +
      esc(t('Add a dog', 'Agregar un perro')) + '</button></div>';
  }

  /* ───────── Trends ───────── */
  async function renderTrends() {
    var pane = $('pane-trends');
    if (!state.pet) { pane.innerHTML = noPets(); return; }
    pane.innerHTML =
      '<div class="mp-row" style="margin-bottom:14px">' +
      '<select class="mp-select" id="trMetric" style="width:auto">' +
      Object.keys(METRIC_LABEL).map(function (m) {
        return '<option value="' + m + '">' + esc(mLabel(m)) + '</option>';
      }).join('') + '</select>' +
      '<select class="mp-select" id="trWin" style="width:auto">' +
      '<option value="hour">' + esc(t('1 hour', '1 hora')) + '</option>' +
      '<option value="day" selected>' + esc(t('1 day', '1 día')) + '</option>' +
      '<option value="week">' + esc(t('1 week', '1 semana')) + '</option>' +
      '</select></div><div id="trBox"></div>';
    $('trMetric').addEventListener('change', loadTrend);
    $('trWin').addEventListener('change', loadTrend);
    loadTrend();
  }

  async function loadTrend() {
    var box = $('trBox');
    box.innerHTML = '<p class="mp-mut">' + esc(t('Loading…', 'Cargando…')) + '</p>';
    var metric = $('trMetric').value, win = $('trWin').value;
    var d = await api('/pets/' + state.pet.id + '/trends?metric=' + encodeURIComponent(metric) + '&window=' + encodeURIComponent(win));
    if (!d.points.length) {
      box.innerHTML = '<div class="mp-empty"><p style="margin:0">' +
        esc(t('No readings in this window.', 'No hay lecturas en este periodo.')) + '</p></div>';
      return;
    }
    var vals = d.points.map(function (p) { return p.value; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi === lo) { hi = lo + 1; }
    var w = 600, h = 72;
    var path = d.points.map(function (p, i) {
      var x = d.points.length === 1 ? w / 2 : (i / (d.points.length - 1)) * w;
      var y = h - ((p.value - lo) / (hi - lo)) * (h - 6) - 3;
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
    box.innerHTML = '<div class="mp-card">' +
      '<div class="mp-spread"><span class="mp-label" style="margin:0">' + esc(mLabel(metric)) + '</span>' +
      '<span class="mp-note">' + esc(d.points.length + ' ' + t('points', 'puntos')) + '</span></div>' +
      '<svg class="mp-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="' +
      esc(mLabel(metric)) + '"><path d="' + path + '" fill="none" stroke="var(--mp-accent)" stroke-width="2.5" stroke-linejoin="round"/></svg>' +
      '<p class="mp-note" style="margin:0">' + esc(t('Low ', 'Mín ') + lo + ' &middot; ' + t('high ', 'máx ') + hi + ' ' + (d.unit || '')) + '</p>' +
      (d.band ? '<p class="mp-note" style="margin:4px 0 0">' +
        esc(t('Reference ', 'Referencia ') + d.band.min + '–' + d.band.max) + '</p>' : '') +
      '</div>';
  }

  /* ───────── Breathing check ───────── */
  function renderBreathing() {
    var pane = $('pane-breathing');
    if (!state.pet) { pane.innerHTML = noPets(); return; }
    pane.innerHTML =
      '<div class="mp-card"><h3 style="margin-top:0">' + esc(t('Breathing check', 'Chequeo de respiración')) + '</h3>' +
      '<p class="mp-mut">' + esc(t('Point the camera at your sleeping dog’s chest, hold the phone still, and let it watch for 30 seconds. The video never leaves your phone — only the measurement is sent.',
        'Apunta la cámara al pecho de tu perro dormido, sostén el teléfono quieto y deja que observe 30 segundos. El video nunca sale de tu teléfono: solo se envía la medición.')) + '</p>' +
      '<div id="bcMount"></div></div>';
    if (window.MaraPetCapture) {
      window.MaraPetCapture.mount($('bcMount'), {
        base: BASE, petId: state.pet.id, lang: lang(),
        onStored: function () { if (state.tab === 'today') renderToday(); }
      });
    } else {
      $('bcMount').innerHTML = '<p class="mp-err">' +
        esc(t('The breathing check could not load.', 'El chequeo de respiración no se pudo cargar.')) + '</p>';
    }
  }

  /* ───────── Alerts ───────── */
  async function renderAlerts() {
    var pane = $('pane-alerts');
    if (!state.pet) { pane.innerHTML = noPets(); return; }
    var rules = await api('/pets/' + state.pet.id + '/alert-rules');
    var alerts = await api('/pets/' + state.pet.id + '/alerts');
    var html = '<div class="mp-card"><h3 style="margin-top:0">' + esc(t('Your limits', 'Tus límites')) + '</h3>' +
      '<p class="mp-note">' + esc(t(rules.note, 'Un aviso se evalúa cuando llega una lectura, es decir al intervalo de guardado del dispositivo, no en tiempo real.')) + '</p>';
    html += '<div class="mp-row" style="margin-top:12px">' +
      '<select class="mp-select" id="alMetric" style="width:auto">' +
      Object.keys(METRIC_LABEL).map(function (m) { return '<option value="' + m + '">' + esc(mLabel(m)) + '</option>'; }).join('') +
      '</select>' +
      '<input class="mp-input" id="alMin" style="width:120px" inputmode="decimal" placeholder="' + esc(t('min', 'mín')) + '">' +
      '<input class="mp-input" id="alMax" style="width:120px" inputmode="decimal" placeholder="' + esc(t('max', 'máx')) + '">' +
      '<button class="mp-btn mp-btn--primary" id="alSave">' + esc(t('Save', 'Guardar')) + '</button></div>';
    if (rules.rules.length) {
      html += '<ul style="margin:14px 0 0;padding-left:18px">' + rules.rules.map(function (r) {
        return '<li>' + esc(mLabel(r.metric)) + ': ' +
          esc((r.min_value != null ? t('below ', 'bajo ') + r.min_value : '') +
              (r.min_value != null && r.max_value != null ? ' / ' : '') +
              (r.max_value != null ? t('above ', 'sobre ') + r.max_value : '')) + '</li>';
      }).join('') + '</ul>';
    }
    html += '</div>';
    html += '<div class="mp-card" style="margin-top:16px"><div class="mp-spread"><h3 style="margin:0">' +
      esc(t('What fired', 'Qué se activó')) + '</h3>' +
      (alerts.unread ? '<button class="mp-btn mp-btn--sm" id="alRead">' + esc(t('Mark all read', 'Marcar leídos')) + '</button>' : '') +
      '</div>';
    html += alerts.alerts.length
      ? '<ul style="margin:12px 0 0;padding-left:18px">' + alerts.alerts.slice(0, 30).map(function (a) {
          return '<li>' + esc(mLabel(a.metric) + ' ' + a.value + ' — ' +
            (a.direction === 'above' ? t('above your limit', 'sobre tu límite') : t('below your limit', 'bajo tu límite'))) + '</li>';
        }).join('') + '</ul>'
      : '<p class="mp-mut" style="margin:10px 0 0">' + esc(t('Nothing has crossed a limit.', 'Nada ha cruzado un límite.')) + '</p>';
    html += '</div>';
    pane.innerHTML = html;

    $('alSave').addEventListener('click', async function () {
      try {
        await api('/pets/' + state.pet.id + '/alert-rules', {
          method: 'POST',
          body: JSON.stringify({ metric: $('alMetric').value, min_value: $('alMin').value, max_value: $('alMax').value })
        });
        renderAlerts();
      } catch (e) {
        alert(t('That limit was not accepted: ', 'Ese límite no se aceptó: ') + e.message);
      }
    });
    var rd = $('alRead');
    if (rd) rd.addEventListener('click', async function () { await api('/alerts/read', { method: 'POST' }); renderAlerts(); });
  }

  /* ───────── Pets ───────── */
  var SIZES = ['toy', 'small', 'medium', 'large', 'giant'];
  function renderPets() {
    var pane = $('pane-pets');
    var html = '<div class="mp-card"><h3 style="margin-top:0">' + esc(t('Add a dog', 'Agregar un perro')) + '</h3>' +
      '<div id="petErr" class="mp-err" hidden></div>' +
      '<label class="mp-field"><span class="mp-label">' + esc(t('Name', 'Nombre')) + '</span><input class="mp-input" id="pName" maxlength="80"></label>' +
      '<label class="mp-field"><span class="mp-label">' + esc(t('Breed', 'Raza')) + '</span><input class="mp-input" id="pBreed" maxlength="80"></label>' +
      '<label class="mp-field"><span class="mp-label">' + esc(t('Size', 'Tamaño')) + '</span><select class="mp-select" id="pSize"><option value="">' +
      esc(t('From the weight', 'Según el peso')) + '</option>' + SIZES.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('') + '</select></label>' +
      '<label class="mp-field"><span class="mp-label">' + esc(t('Weight (kg)', 'Peso (kg)')) + '</span><input class="mp-input" id="pWeight" inputmode="decimal"></label>' +
      '<label class="mp-field"><span class="mp-label">' + esc(t('Date of birth', 'Fecha de nacimiento')) + '</span><input class="mp-input" id="pBirth" type="date"></label>' +
      '<p class="mp-note">' + esc(t('Size and age are what make a reading judgeable. Without them MaraPet shows the trend and does not claim a range.',
        'El tamaño y la edad son lo que permite juzgar una lectura. Sin ellos MaraPet muestra la tendencia y no afirma ningún rango.')) + '</p>' +
      '<button class="mp-btn mp-btn--primary" id="pSave">' + esc(t('Save', 'Guardar')) + '</button></div>';
    if (state.pets.length) {
      html += '<div class="mp-card" style="margin-top:16px"><h3 style="margin-top:0">' + esc(t('Your dogs', 'Tus perros')) + '</h3><ul style="padding-left:18px">' +
        state.pets.map(function (p) {
          return '<li><strong>' + esc(p.name) + '</strong>' +
            (p.breed ? ' — ' + esc(p.breed) : '') +
            (p.weight_kg ? ' — ' + esc(p.weight_kg) + ' kg' : '') + '</li>';
        }).join('') + '</ul></div>';
    }
    pane.innerHTML = html;
    $('pSave').addEventListener('click', async function () {
      $('petErr').hidden = true;
      try {
        await api('/pets', {
          method: 'POST',
          body: JSON.stringify({
            name: $('pName').value, breed: $('pBreed').value,
            breed_size: $('pSize').value || undefined,
            weight_kg: $('pWeight').value || undefined,
            birth_date: $('pBirth').value || undefined
          })
        });
        await loadPets();
        renderPets();
      } catch (e) {
        $('petErr').textContent = t('Not saved: ', 'No se guardó: ') + e.message;
        $('petErr').hidden = false;
      }
    });
  }

  /* ───────── Devices ───────── */
  async function renderDevices() {
    var pane = $('pane-devices');
    var d = await api('/devices');
    var html = '<div class="mp-card"><h3 style="margin-top:0">' + esc(t('Pair a device', 'Vincular un dispositivo')) + '</h3>' +
      '<p class="mp-mut">' + esc(t('A device key can send readings and read nothing back. It is shown once, here, and stored only as a hash.',
        'Una clave de dispositivo puede enviar lecturas y no puede leer nada. Se muestra una sola vez, aquí, y se guarda solo como hash.')) + '</p>' +
      '<label class="mp-field"><span class="mp-label">' + esc(t('Label', 'Etiqueta')) + '</span><input class="mp-input" id="dLabel" maxlength="80" placeholder="' + esc(t('Collar', 'Collar')) + '"></label>' +
      '<label class="mp-field"><span class="mp-label">' + esc(t('For which dog', 'Para qué perro')) + '</span><select class="mp-select" id="dPet"><option value="">' +
      esc(t('Not bound yet', 'Sin vincular')) + '</option>' + state.pets.map(function (p) {
        return '<option value="' + p.id + '">' + esc(p.name) + '</option>';
      }).join('') + '</select></label>' +
      '<button class="mp-btn mp-btn--primary" id="dSave">' + esc(t('Create key', 'Crear clave')) + '</button>' +
      '<div id="dKey" style="margin-top:14px"></div></div>';
    html += '<div class="mp-card" style="margin-top:16px"><h3 style="margin-top:0">' + esc(t('Where readings are sent', 'A dónde se envían las lecturas')) + '</h3>' +
      '<p class="mp-note" style="word-break:break-all"><code>POST ' + esc(d.ingest_url) + '</code></p>' +
      '<p class="mp-note">' + esc(t('This address is configuration, not something to compile into firmware.',
        'Esta dirección es configuración, no algo para compilar dentro del firmware.')) + '</p></div>';
    if (d.devices.length) {
      html += '<div class="mp-card" style="margin-top:16px"><h3 style="margin-top:0">' + esc(t('Paired', 'Vinculados')) + '</h3><ul style="padding-left:18px">' +
        d.devices.map(function (x) {
          return '<li><strong>' + esc(x.label) + '</strong> <span class="mp-note">' + esc(x.key_prefix) + '…</span>' +
            (x.pet_name ? ' — ' + esc(x.pet_name) : '') +
            (x.revoked_at ? ' — ' + esc(t('revoked', 'revocada')) : '') +
            (x.last_seen_at ? ' <span class="mp-note">' + esc(t('last seen ', 'visto ') + new Date(x.last_seen_at).toLocaleString()) + '</span>' : ' <span class="mp-note">' + esc(t('never reported', 'nunca ha reportado')) + '</span>') +
            (x.revoked_at ? '' : ' <button class="mp-btn mp-btn--sm" data-revoke="' + x.id + '">' + esc(t('Revoke', 'Revocar')) + '</button>') +
            '</li>';
        }).join('') + '</ul></div>';
    }
    pane.innerHTML = html;
    $('dSave').addEventListener('click', async function () {
      try {
        var r = await api('/devices', {
          method: 'POST',
          body: JSON.stringify({ label: $('dLabel').value || 'Collar', pet_id: $('dPet').value || undefined })
        });
        $('dKey').innerHTML = '<p class="mp-err" style="word-break:break-all"><strong>' +
          esc(t('Copy this now. It cannot be shown again.', 'Cópiala ahora. No se puede volver a mostrar.')) +
          '</strong><br><code>' + esc(r.key) + '</code></p>';
        renderDevicesList();
      } catch (e) {
        alert(t('Not created: ', 'No se creó: ') + e.message);
      }
    });
    pane.addEventListener('click', async function (e) {
      var id = e.target && e.target.getAttribute && e.target.getAttribute('data-revoke');
      if (!id) return;
      await api('/devices/' + id, { method: 'DELETE' });
      renderDevices();
    });
  }
  function renderDevicesList() { /* the key panel stays; the list refreshes on next visit */ }

  /* ───────── shell ───────── */
  var RENDER = {
    today: renderToday, trends: renderTrends, breathing: renderBreathing,
    alerts: renderAlerts, pets: renderPets, devices: renderDevices
  };

  function show(tab) {
    state.tab = tab;
    ['today', 'trends', 'breathing', 'alerts', 'pets', 'devices'].forEach(function (k) {
      $('pane-' + k).hidden = k !== tab;
    });
    var tabs = document.querySelectorAll('[data-tab]');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute('aria-selected', String(tabs[i].getAttribute('data-tab') === tab));
    }
    try { history.replaceState(null, '', BASE + '/app?tab=' + tab); } catch (_) {}
    var fn = RENDER[tab];
    if (fn) Promise.resolve(fn()).catch(function (e) {
      if (e && e.message === 'signed_out') return;
      $('pane-' + tab).innerHTML = '<p class="mp-err">' + esc(t('Something went wrong loading this.', 'Algo falló al cargar esto.')) + '</p>';
    });
  }

  async function loadPets() {
    var d = await api('/pets');
    state.pets = d.pets || [];
    var saved = null;
    try { saved = localStorage.getItem('marapet_pet'); } catch (_) {}
    state.pet = state.pets.filter(function (p) { return String(p.id) === String(saved); })[0] || state.pets[0] || null;
    var opts = state.pets.map(function (p) {
      return '<option value="' + p.id + '"' + (state.pet && p.id === state.pet.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
    [$('petSel'), $('petSelMobile')].forEach(function (sel) { if (sel) sel.innerHTML = opts; });
    $('petPicker').hidden = state.pets.length < 2;
  }

  function onPetChange(v) {
    state.pet = state.pets.filter(function (p) { return String(p.id) === String(v); })[0] || state.pet;
    try { localStorage.setItem('marapet_pet', String(state.pet.id)); } catch (_) {}
    show(state.tab);
  }

  document.addEventListener('DOMContentLoaded', async function () {
    document.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { show(this.getAttribute('data-tab')); });
    });
    [$('petSel'), $('petSelMobile')].forEach(function (sel) {
      if (sel) sel.addEventListener('change', function () { onPetChange(this.value); });
    });
    ['out', 'out2'].forEach(function (id) {
      var b = $(id);
      if (b) b.addEventListener('click', async function () {
        await fetch(BASE + '/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(function () {});
        location.href = BASE + '/';
      });
    });
    try {
      await api('/auth/me');
      await loadPets();
    } catch (e) {
      if (e && e.message === 'signed_out') return;
    }
    var want = new URLSearchParams(location.search).get('tab');
    show(RENDER[want] ? want : 'today');
  });
}());
