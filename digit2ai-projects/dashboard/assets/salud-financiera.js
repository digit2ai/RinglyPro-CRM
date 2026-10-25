/* =====================================================
   Salud Financiera — owner-only view of the Projects Hub.
   Every figure on this screen comes from /projects/api/salud-financiera;
   nothing is computed here except chart pixel positions.
   Reuses the Hub's .card / .card-stat / .btn / .data-table / modal and the
   Home orb's .lina-v2 styles (index.html).
   ===================================================== */
(function () {
  'use strict';
  var SF_API = '/projects/api/salud-financiera';
  var CATS = [
    ['gasto_personal', 'Gasto personal'], ['otro', 'Otro'], ['ingreso_extra', 'Ingreso extra'], ['salario', 'Salario'],
    ['ahorro', 'Ahorro'], ['inversion', 'Inversión'], ['corte', 'Corte'], ['pago_lina', 'Pago Lina'], ['hija', 'Casa de mi hija'], ['gasto_semanal', 'Gastos semana']
  ];
  var CAT_LABEL = {}; CATS.forEach(function (c) { CAT_LABEL[c[0]] = c[1]; });
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var state = { salud: null, movs: [], meses: [], mes: '', historial: [], audio: null, paused: false, rec: null };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function tok() { try { return localStorage.getItem('d2ai_token') || localStorage.getItem('token') || ''; } catch (e) { return ''; } }
  function sf(path, opts) {
    opts = opts || {};
    var h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok() };
    return fetch(SF_API + path, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }); });
  }
  function fechaCorta(iso) { if (!iso) return ''; var p = iso.split('-'); return Number(p[2]) + ' ' + MESES[Number(p[1]) - 1].slice(0, 3) + ' ' + p[0].slice(2); }
  function fechaLarga(iso) { if (!iso) return ''; var p = iso.split('-'); return Number(p[2]) + ' de ' + MESES[Number(p[1]) - 1]; }
  function todayNY() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  function colorVar(c) { return c === 'verde' ? 'var(--success)' : c === 'amarillo' ? 'var(--warning)' : 'var(--danger)'; }

  // ---------- nav: only the owner ever sees the item ----------
  window.sfInitNav = function () {
    var li = document.getElementById('nav-salud-financiera');
    if (!li) return;
    sf('/acceso').then(function (j) { if (j && j.ok) li.style.display = ''; else li.remove(); }).catch(function () { li.remove(); });
  };

  // ---------- orb markup (same component as Home, its own ids) ----------
  function orbHtml() {
    return '<style>#sf-lina .orb-svg g,#sf-lina .orb-svg circle{transform-box:view-box}</style>' +
      '<div class="lina lina-v2" id="sf-lina" style="margin:0 0 16px">' +
      '<div class="lina-name">Lina &middot; Tu asesora financiera</div>' +
      '<div class="lina-role">Pregúntame por voz o por texto. Solo hablo de tus finanzas.</div>' +
      '<div class="orb-wrap" id="sfOrbWrap" role="button" tabindex="0" data-state="idle" aria-label="Tocar y hablar con Lina">' +
      '<svg class="orb-svg" viewBox="0 0 240 240" aria-hidden="true"><defs>' +
      '<radialGradient id="sfOrbCore" cx="0.5" cy="0.45"><stop offset="0" stop-color="#a5f3fc"/><stop offset="0.25" stop-color="#22d3ee" stop-opacity="0.95"/><stop offset="0.55" stop-color="#3b82f6" stop-opacity="0.85"/><stop offset="0.82" stop-color="#8b5cf6" stop-opacity="0.7"/><stop offset="1" stop-color="#ec4899" stop-opacity="0.5"/></radialGradient>' +
      '<radialGradient id="sfOrbGlow" cx="0.5" cy="0.5"><stop offset="0" stop-color="#22d3ee" stop-opacity="0.4"/><stop offset="0.45" stop-color="#8b5cf6" stop-opacity="0.22"/><stop offset="1" stop-color="#ec4899" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="sfOrbInner" cx="0.5" cy="0.45"><stop offset="0" stop-color="#fff"/><stop offset="0.35" stop-color="#a5f3fc" stop-opacity="0.95"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0.4"/></radialGradient>' +
      '<linearGradient id="sfOrbRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="0.4" stop-color="#3b82f6"/><stop offset="0.75" stop-color="#8b5cf6"/><stop offset="1" stop-color="#ec4899"/></linearGradient>' +
      '</defs>' +
      '<circle class="orb-glow" cx="120" cy="120" r="112" fill="url(#sfOrbGlow)"><animate attributeName="r" values="104;120;104" dur="5s" repeatCount="indefinite"/></circle>' +
      '<g class="orb-ring-outer"><circle cx="120" cy="120" r="108" fill="none" stroke="url(#sfOrbRing)" stroke-width="0.6" stroke-dasharray="2 4" opacity="0.55"/></g>' +
      '<g class="orb-ring-mid"><circle cx="120" cy="120" r="96" fill="none" stroke="url(#sfOrbRing)" stroke-width="0.8" stroke-dasharray="6 3" opacity="0.7"/></g>' +
      '<circle class="orb-ring-inner" cx="120" cy="120" r="84" fill="none" stroke="url(#sfOrbRing)" stroke-width="1" stroke-dasharray="10 2 2 2" opacity="0.85"/>' +
      '<g class="orb-particles"><circle class="orb-particle" cx="120" cy="36" r="2.5" fill="#22d3ee"/><circle class="orb-particle" cx="120" cy="36" r="2" fill="#8b5cf6" style="animation-delay:-1.2s"/><circle class="orb-particle" cx="120" cy="36" r="2.5" fill="#ec4899" style="animation-delay:-2.4s"/></g>' +
      '<circle class="orb-iris-segs" cx="120" cy="120" r="56" fill="none" stroke="#22d3ee" stroke-width="2" stroke-dasharray="14 18" stroke-linecap="round" opacity="0.75"/>' +
      '<circle class="orb-core" cx="120" cy="120" r="48" fill="url(#sfOrbCore)"><animate attributeName="r" values="44;52;44" dur="4.5s" repeatCount="indefinite"/></circle>' +
      '<circle cx="120" cy="120" r="14" fill="url(#sfOrbInner)"><animate attributeName="r" values="12;18;12" dur="2.2s" repeatCount="indefinite"/></circle>' +
      '</svg>' +
      '<div class="orb-caption"><span class="orb-cap-idle">Toca el orbe y habla</span><span class="orb-cap-active" id="sfCapActive">Escuchando</span></div>' +
      '</div>' +
      '<div class="status" id="sfStatus" style="text-align:center"></div>' +
      '<div id="sfChat" style="width:100%;max-height:260px;overflow-y:auto;text-align:left;margin:10px 0"></div>' +
      '<div style="display:flex;gap:8px;width:100%">' +
      '<input id="sfAsk" type="text" placeholder="Pregúntale a Lina: ¿Cómo estoy hoy?" style="flex:1;min-width:0;padding:10px 12px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:16px">' +
      '<button class="btn btn-primary" id="sfAskBtn">Preguntar</button></div>' +
      '<div class="controls" style="justify-content:center;margin-top:10px">' +
      '<button id="sfPause" disabled>&#10074;&#10074; Pausar</button><button id="sfStop" disabled>&#9632; Detener</button></div>' +
      '</div>';
  }

  // ---------- render ----------
  window.renderSaludFinanciera = function (container) {
    try { if (location.pathname !== '/projects/salud-financiera') history.replaceState(null, '', '/projects/salud-financiera'); } catch (e) {}
    container.innerHTML =
      '<div id="sf-root" style="max-width:1100px;margin:0 auto">' +
      '<div class="card" id="sf-kpi" style="margin-bottom:16px;text-align:center;padding:24px"><div class="spinner"></div></div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">' +
      '<button class="btn btn-primary" id="sf-add" style="flex:1 1 220px;padding:14px 16px;font-size:16px;font-weight:600">+ Agregar movimiento</button>' +
      '<button class="btn btn-ghost" id="sf-extend">Extender plan</button></div>' +
      '<div class="card-grid" id="sf-cards" style="margin-bottom:16px"></div>' +
      orbHtml() +
      '<div class="card card-accent-blue" style="margin-bottom:16px"><div class="section-header"><h3>Saldo en el tiempo</h3></div>' +
      '<p class="section-hint">Línea punteada: plan base. Línea azul: proyección con lo que realmente pasa.</p><div id="sf-chart"></div></div>' +
      '<div class="card card-accent-blue" style="margin-bottom:16px"><div class="section-header"><h3>Por qué tu salud está así</h3></div><div id="sf-desglose"></div></div>' +
      '<div class="card card-accent-blue" style="margin-bottom:24px"><div class="section-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h3>Movimientos</h3>' +
      '<select id="sf-mes" style="padding:6px 10px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:16px"></select></div>' +
      '<p class="section-hint">Gris: plan pendiente. Azul: real. Verde: cumplido. Fondo resaltado: tu punto más bajo.</p>' +
      '<div id="sf-table" style="overflow-x:auto"></div></div>' +
      '</div>';
    document.getElementById('sf-add').onclick = openAdd;
    document.getElementById('sf-extend').onclick = extendPlan;
    document.getElementById('sf-mes').onchange = function () { state.mes = this.value; loadMovs(); };
    wireLina();
    return refresh();
  };

  function refresh() { return Promise.all([loadSalud(), loadMovs()]); }

  function loadSalud() {
    return sf('/salud').then(function (s) {
      if (!s.success) { document.getElementById('sf-kpi').innerHTML = '<p>' + (s._status === 404 ? 'Este módulo no está disponible para tu usuario.' : esc(s.error || 'No disponible')) + '</p>'; return; }
      state.salud = s; drawKpi(s); drawCards(s); drawChart(s); drawDesglose(s);
    });
  }

  function drawKpi(s) {
    var c = colorVar(s.color);
    var neg = s.dias_negativos && s.dias_negativos.length
      ? '<div style="margin-top:10px;color:var(--danger);font-weight:600">Tu saldo queda en negativo el ' + esc(fechaLarga(s.dias_negativos[0].fecha)) + ' (' + esc(s.dias_negativos[0].saldo) + '). La salud se limita a 49%.</div>' : '';
    document.getElementById('sf-kpi').style.borderTop = '4px solid ' + c;
    document.getElementById('sf-kpi').innerHTML =
      '<div class="stat-label" style="color:var(--text-secondary);font-size:13px;text-transform:uppercase;letter-spacing:.06em">Salud financiera</div>' +
      '<div style="font-size:64px;font-weight:800;line-height:1.1;color:' + c + '">' + Math.round(s.score) + '%</div>' +
      '<div style="font-size:20px;font-weight:700;color:' + c + '">' + esc(s.frase) + '</div>' +
      '<div style="color:var(--text-secondary);margin-top:6px;font-size:14px">Tu punto más bajo: ' + esc(s.saldo_min) + ' el ' + esc(fechaLarga(s.fecha_min)) + '</div>' + neg;
  }

  function card(label, value, sub, accent, subClass) {
    return '<div class="card card-stat card-accent-' + accent + '"><div class="stat-label">' + label + '</div>' +
      '<div class="stat-value" style="font-size:26px">' + esc(value) + '</div>' +
      (sub ? '<div class="stat-change ' + (subClass || 'stat-neutral') + '">' + sub + '</div>' : '') + '</div>';
  }

  function drawCards(s) {
    var p = s.proximo_pago;
    var restNeg = s.semana.restante.charAt(0) === '-';
    document.getElementById('sf-cards').innerHTML =
      card('Saldo hoy', s.saldo_hoy, esc(fechaLarga(s.hoy)), 'blue') +
      card('Saldo final proyectado', s.saldo_final, 'Plan: ' + esc(s.saldo_final_plan), 'blue') +
      card('Saldo mínimo proyectado', s.saldo_min, esc(fechaLarga(s.fecha_min)), s.saldo_min.charAt(0) === '-' ? 'red' : 'yellow', s.saldo_min.charAt(0) === '-' ? 'stat-down' : 'stat-neutral') +
      card('Gasto de esta semana', s.semana.gastado + ' / ' + s.semana.presupuesto, restNeg ? 'Te pasaste ' + esc(s.semana.restante.replace('-', '')) : 'Te quedan ' + esc(s.semana.restante), restNeg ? 'red' : 'green', restNeg ? 'stat-down' : 'stat-up') +
      (p ? card('Próximo pago grande', p.monto, esc(p.concepto) + ' &middot; ' + esc(fechaLarga(p.fecha)) + ' &middot; ' + (p.cubierto ? 'Cubierto' : 'No cubierto'), p.cubierto ? 'green' : 'red', p.cubierto ? 'stat-up' : 'stat-down')
        : card('Próximo pago grande', 'Ninguno', 'Sin pagos grandes pendientes', 'green'));
  }

  // Plain SVG line chart: plan base vs projection (step lines, end-of-day balances).
  function drawChart(s) {
    var el = document.getElementById('sf-chart');
    var plan = s.serie.plan, pro = s.serie.proyeccion;
    var all = plan.concat(pro);
    if (!all.length) { el.innerHTML = '<p class="section-hint">Sin datos.</p>'; return; }
    var dates = all.map(function (d) { return d.fecha; }).sort();
    var t0 = Date.parse(dates[0]), t1 = Date.parse(dates[dates.length - 1]) || t0 + 1;
    if (t1 === t0) t1 = t0 + 864e5;
    var vals = all.map(function (d) { return d.saldo; }).concat([0]);
    var vmin = Math.min.apply(null, vals), vmax = Math.max.apply(null, vals);
    var W = 900, H = 260, L = 64, R = 12, T = 12, B = 30;
    var x = function (iso) { return L + (Date.parse(iso) - t0) / (t1 - t0) * (W - L - R); };
    var y = function (v) { return T + (vmax - v) / ((vmax - vmin) || 1) * (H - T - B); };
    var path = function (ser) {
      var d = ''; ser.forEach(function (p, i) { d += (i ? 'H' + x(p.fecha).toFixed(1) + 'V' : 'M' + x(p.fecha).toFixed(1) + ',') + y(p.saldo).toFixed(1); }); return d;
    };
    var ticks = [vmin, (vmin + vmax) / 2, vmax].map(function (v) {
      return '<text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="11" fill="var(--text-muted)">$' + Math.round(v).toLocaleString('en-US') + '</text>' +
        '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--border)" stroke-width="1"/>';
    }).join('');
    var months = []; var seen = {};
    dates.forEach(function (d) { var k = d.slice(0, 7); if (!seen[k]) { seen[k] = 1; months.push(k); } });
    var mlab = months.map(function (k) { var iso = k + '-01'; var xx = Math.max(L, x(iso)); return '<text x="' + xx + '" y="' + (H - 8) + '" font-size="11" fill="var(--text-muted)">' + MESES[Number(k.slice(5, 7)) - 1].slice(0, 3) + '</text>'; }).join('');
    var minP = pro.filter(function (d) { return d.fecha === s.fecha_min; })[0];
    var zero = vmin < 0 ? '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="var(--danger)" stroke-dasharray="3 3"/>' : '';
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block" role="img" aria-label="Saldo proyectado contra plan base">' +
      ticks + zero + mlab +
      '<path d="' + path(plan) + '" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-dasharray="6 4"/>' +
      '<path d="' + path(pro) + '" fill="none" stroke="var(--accent)" stroke-width="2.5"/>' +
      (minP ? '<circle cx="' + x(minP.fecha) + '" cy="' + y(minP.saldo) + '" r="5" fill="' + colorVar(s.color) + '"/><text x="' + Math.min(W - 120, x(minP.fecha) + 8) + '" y="' + (y(minP.saldo) - 8) + '" font-size="12" fill="var(--text-primary)">Mínimo ' + esc(s.saldo_min) + '</text>' : '') +
      '</svg>' +
      '<div style="display:flex;gap:16px;font-size:12.5px;color:var(--text-secondary);margin-top:6px"><span><span style="display:inline-block;width:18px;border-top:2px dashed var(--text-muted);vertical-align:middle"></span> Plan base</span><span><span style="display:inline-block;width:18px;border-top:3px solid var(--accent);vertical-align:middle"></span> Proyección real</span></div>';
  }

  function drawDesglose(s) {
    var parts = [
      ['A', 'Colchón', s.A, 40, 'Saldo mínimo ' + s.saldo_min + ' contra la meta de ' + s.colchon_meta],
      ['B', 'Apego al plan', s.B, 30, 'Saldo final ' + s.saldo_final + ' contra el plan ' + s.saldo_final_plan],
      ['C', 'Presupuesto de la semana', s.C, 20, 'Gastado ' + s.semana.gastado + ' de ' + s.semana.presupuesto],
      ['D', 'Obligaciones cubiertas', s.D, 10, s.obligaciones_descubiertas.length ? 'Hay pagos que quedan en negativo' : 'Corte, pago Lina y casa de tu hija cubiertos']
    ];
    document.getElementById('sf-desglose').innerHTML = parts.map(function (p) {
      var pct = Math.max(0, Math.min(100, p[2] / p[3] * 100));
      return '<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;font-size:14px"><span><strong>' + p[0] + '.</strong> ' + p[1] + '</span><span><strong>' + p[2] + '</strong> / ' + p[3] + ' pts</span></div>' +
        '<div style="height:8px;background:var(--bg-tertiary);border-radius:6px;margin:6px 0 4px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + (pct >= 75 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)') + '"></div></div>' +
        '<div style="font-size:12.5px;color:var(--text-secondary)">' + esc(p[4]) + '</div></div>';
    }).join('') + (s.limitado_por_negativo ? '<p style="color:var(--danger);font-size:13px">Regla dura: algún día queda en negativo, así que la salud no pasa de 49%.</p>' : '');
  }

  function loadMovs() {
    var q = state.mes ? '?mes=' + encodeURIComponent(state.mes) : '';
    return sf('/movimientos' + q).then(function (j) {
      if (!j.success) return;
      state.movs = j.data; state.meses = j.meses;
      var sel = document.getElementById('sf-mes');
      if (sel) sel.innerHTML = '<option value="">Todos los meses</option>' + j.meses.map(function (m) { return '<option value="' + m + '"' + (m === state.mes ? ' selected' : '') + '>' + MESES[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4) + '</option>'; }).join('');
      drawTable(j.data, j.fecha_min);
    });
  }

  function drawTable(rows, fmin) {
    var el = document.getElementById('sf-table');
    if (!rows.length) { el.innerHTML = '<p class="section-hint">No hay movimientos en este mes.</p>'; return; }
    var color = { plan: 'var(--text-muted)', real: 'var(--info)', cumplido: 'var(--success)' };
    var label = { plan: 'Plan', real: 'Real', cumplido: 'Cumplido' };
    el.innerHTML = '<table class="data-table" style="width:100%;min-width:640px"><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th style="text-align:right">Monto</th><th style="text-align:right">Saldo</th><th>Estado</th><th></th></tr></thead><tbody>' +
      rows.map(function (r) {
        var v = r.estado_visual; var neg = r.saldo && r.saldo.charAt(0) === '-';
        var bg = r.es_minimo ? 'background:rgba(245,158,11,.14);' : '';
        var monto = (r.tipo === 'ingreso' ? '+' : '-') + (r.efectivo || r.monto);
        var planned = (v === 'cumplido' && r.monto_real && r.monto_real !== r.monto) ? '<div style="font-size:11px;color:var(--text-muted)">plan $' + esc(r.monto) + '</div>' : '';
        var act = v === 'plan' ? '<button class="btn btn-sm btn-ghost" data-done="' + r.id + '">Cumplido</button>'
          : v === 'cumplido' ? '<button class="btn btn-sm btn-ghost" data-undo="' + r.id + '">Deshacer</button>'
            : '<button class="btn btn-sm btn-ghost" data-del="' + r.id + '">Borrar</button>';
        return '<tr style="' + bg + 'border-left:3px solid ' + color[v] + '">' +
          '<td style="white-space:nowrap">' + esc(fechaCorta(r.fecha)) + (r.es_minimo ? '<div style="font-size:11px;color:var(--warning);font-weight:700">PUNTO MÁS BAJO</div>' : '') + '</td>' +
          '<td>' + esc(r.concepto) + '</td><td style="color:var(--text-secondary)">' + esc(CAT_LABEL[r.categoria] || r.categoria) + '</td>' +
          '<td style="text-align:right;white-space:nowrap;color:' + (r.tipo === 'ingreso' ? 'var(--success)' : 'var(--text-primary)') + '">' + esc(monto) + planned + '</td>' +
          '<td style="text-align:right;white-space:nowrap;font-weight:600;color:' + (neg ? 'var(--danger)' : 'var(--text-primary)') + '">' + esc(r.saldo) + '</td>' +
          '<td><span style="font-size:12px;color:' + color[v] + ';font-weight:600">' + label[v] + '</span></td><td style="white-space:nowrap">' + act + '</td></tr>';
      }).join('') + '</tbody></table>';
    el.querySelectorAll('[data-done]').forEach(function (b) { b.onclick = function () { openDone(Number(b.getAttribute('data-done'))); }; });
    el.querySelectorAll('[data-undo]').forEach(function (b) { b.onclick = function () { sf('/movimientos/' + b.getAttribute('data-undo'), { method: 'PATCH', body: { estado: 'pendiente' } }).then(refresh); }; });
    el.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { if (confirm('¿Borrar este movimiento?')) sf('/movimientos/' + b.getAttribute('data-del'), { method: 'DELETE' }).then(refresh); }; });
  }

  // ---------- forms ----------
  function field(label, html) { return '<div class="form-group"><label>' + label + '</label>' + html + '</div>'; }
  function openAdd(prefill) {
    prefill = prefill && prefill.fecha ? prefill : {};
    var tipo = prefill.tipo || 'egreso';
    openModal('Agregar movimiento',
      '<div class="form-row">' + field('Fecha', '<input type="date" id="sf-f-fecha" value="' + (prefill.fecha || todayNY()) + '" style="font-size:16px">') +
      field('Monto', '<input type="text" inputmode="decimal" id="sf-f-monto" placeholder="45.00" value="' + esc(prefill.monto || '') + '" style="font-size:16px">') + '</div>' +
      field('Concepto', '<input type="text" id="sf-f-concepto" placeholder="Comida" value="' + esc(prefill.concepto || '') + '" style="font-size:16px">') +
      '<div class="form-row">' + field('Tipo', '<select id="sf-f-tipo" style="font-size:16px"><option value="egreso"' + (tipo === 'egreso' ? ' selected' : '') + '>Egreso</option><option value="ingreso"' + (tipo === 'ingreso' ? ' selected' : '') + '>Ingreso</option></select>') +
      field('Categoría', '<select id="sf-f-cat" style="font-size:16px">' + CATS.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === (prefill.categoria || 'gasto_personal') ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select>') + '</div>' +
      '<p id="sf-f-err" style="color:var(--danger);font-size:13px"></p>',
      function () {
        var body = { fecha: val('sf-f-fecha'), monto: val('sf-f-monto'), concepto: val('sf-f-concepto') || (val('sf-f-tipo') === 'ingreso' ? 'Ingreso' : 'Gasto'), tipo: val('sf-f-tipo'), categoria: val('sf-f-cat') };
        return sf('/movimientos', { method: 'POST', body: body }).then(function (j) {
          if (!j.success) { document.getElementById('sf-f-err').textContent = j.error || 'No se pudo guardar'; return; }
          closeModal(); refresh();
        });
      });
    var m = document.getElementById('sf-f-monto'); if (m) setTimeout(function () { m.focus(); }, 50);
  }
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }

  function openDone(id) {
    var r = state.movs.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    openModal('Marcar como cumplido',
      '<p style="margin-bottom:12px">' + esc(r.concepto) + ' &middot; ' + esc(fechaLarga(r.fecha)) + '</p>' +
      field('Monto real pagado o recibido', '<input type="text" inputmode="decimal" id="sf-d-monto" value="' + esc(r.monto) + '" style="font-size:16px">') +
      '<p id="sf-d-err" style="color:var(--danger);font-size:13px"></p>',
      function () {
        return sf('/movimientos/' + id, { method: 'PATCH', body: { estado: 'cumplido', monto_real: val('sf-d-monto') } }).then(function (j) {
          if (!j.success) { document.getElementById('sf-d-err').textContent = j.error || 'No se pudo guardar'; return; }
          closeModal(); refresh();
        });
      });
  }

  function extendPlan() {
    if (!confirm('¿Extender el plan un mes más con las reglas (salario cada dos viernes, corte el día 6, pago Lina con el primer salario, $100 por semana)?')) return;
    sf('/plan/extender', { method: 'POST', body: { meses: 1 } }).then(function (j) {
      alert(j.success ? ('Listo: ' + j.creados + ' movimientos nuevos del ' + fechaLarga(j.desde) + ' al ' + fechaLarga(j.hasta) + '.') : (j.error || 'No se pudo extender'));
      refresh();
    });
  }

  // ---------- Lina ----------
  function setOrb(st) { var w = document.getElementById('sfOrbWrap'); if (w) w.setAttribute('data-state', st); var c = document.getElementById('sfCapActive'); if (c) c.textContent = st === 'listening' ? 'Escuchando' : st === 'thinking' ? 'Pensando' : 'Hablando'; }
  function status(t) { var e = document.getElementById('sfStatus'); if (e) e.textContent = t || ''; }
  function bubble(who, html) {
    var c = document.getElementById('sfChat'); if (!c) return null;
    var d = document.createElement('div');
    d.style.cssText = 'margin:6px 0;padding:9px 12px;border-radius:10px;font-size:14px;line-height:1.45;' + (who === 'yo' ? 'background:var(--accent-muted);margin-left:15%;' : 'background:var(--bg-tertiary);margin-right:10%;');
    d.innerHTML = html; c.appendChild(d); c.scrollTop = c.scrollHeight; return d;
  }

  function wireLina() {
    var input = document.getElementById('sfAsk');
    document.getElementById('sfAskBtn').onclick = function () { ask(input.value, 'texto'); };
    input.onkeydown = function (e) { if (e.key === 'Enter') ask(input.value, 'texto'); };
    var orb = document.getElementById('sfOrbWrap');
    orb.onclick = function () { if (state.audio && !state.audio.paused) return stopAudio(); listen(); };
    orb.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); orb.onclick(); } };
    document.getElementById('sfPause').onclick = function () {
      if (!state.audio) return;
      if (state.audio.paused) { state.audio.play(); this.innerHTML = '&#10074;&#10074; Pausar'; setOrb('speaking'); }
      else { state.audio.pause(); this.innerHTML = '&#9654; Reanudar'; setOrb('idle'); }
    };
    document.getElementById('sfStop').onclick = stopAudio;
    sf('/lina/historial?limit=6').then(function (j) {
      if (!j.success) return;
      j.data.forEach(function (h) { bubble('yo', esc(h.pregunta)); bubble('lina', esc(h.respuesta)); state.historial.push({ rol: 'yo', texto: h.pregunta }, { rol: 'lina', texto: h.respuesta }); });
      if (!j.data.length) status('Toca el orbe y pregúntame "¿Cómo estoy hoy?"');
    });
  }

  function listen() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { status('Este navegador no reconoce voz. Escribe tu pregunta abajo.'); document.getElementById('sfAsk').focus(); return; }
    try { if (state.rec) state.rec.abort(); } catch (e) {}
    var rec = new SR(); state.rec = rec; rec.lang = 'es-MX'; rec.interimResults = true; rec.maxAlternatives = 1;
    var finalText = '';
    rec.onresult = function (e) {
      var t = ''; for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      document.getElementById('sfAsk').value = t;
      if (e.results[e.results.length - 1].isFinal) finalText = t;
    };
    rec.onerror = function () { setOrb('idle'); status('No te escuché bien. Intenta de nuevo o escribe.'); };
    rec.onend = function () { setOrb('idle'); var t = finalText || document.getElementById('sfAsk').value; if (t && t.trim()) ask(t, 'voz'); };
    setOrb('listening'); status('Te escucho...');
    rec.start();
  }

  function ask(text, canal) {
    text = String(text || '').trim(); if (!text) return;
    document.getElementById('sfAsk').value = '';
    bubble('yo', esc(text));
    setOrb('thinking'); status('Lina está revisando tus números...');
    sf('/lina', { method: 'POST', body: { pregunta: text, canal: canal, historial: state.historial.slice(-6) } }).then(function (j) {
      setOrb('idle'); status('');
      if (!j.success) { bubble('lina', esc(j.error || 'No pude responder.')); return; }
      state.historial.push({ rol: 'yo', texto: text }, { rol: 'lina', texto: j.texto });
      var b = bubble('lina', esc(j.texto) + (j.composed_by === 'heuristic' ? '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Respuesta calculada sin modelo de IA</div>' : ''));
      if (j.propuesta) proposal(b, j.propuesta);
      speak(j.texto);
    }).catch(function () { setOrb('idle'); bubble('lina', 'No hay conexión. Intenta otra vez.'); });
  }

  // Lina never saves: a proposal becomes a write only on this tap.
  function proposal(b, p) {
    var box = document.createElement('div'); box.style.cssText = 'display:flex;gap:8px;margin-top:8px';
    box.innerHTML = '<button class="btn btn-sm btn-primary">Sí, regístralo</button><button class="btn btn-sm btn-ghost">No</button>';
    b.appendChild(box);
    var yes = box.children[0], no = box.children[1];
    no.onclick = function () { box.innerHTML = '<span style="font-size:12.5px;color:var(--text-muted)">No registré nada.</span>'; };
    yes.onclick = function () {
      yes.disabled = true;
      var req = p.accion === 'agregar_movimiento' ? sf('/movimientos', { method: 'POST', body: p.datos })
        : sf('/movimientos/' + p.id, { method: 'PATCH', body: p.datos });
      req.then(function (j) {
        box.innerHTML = '<span style="font-size:12.5px;color:' + (j.success ? 'var(--success)' : 'var(--danger)') + '">' + (j.success ? 'Listo, registrado. Tu salud ya se recalculó.' : esc(j.error || 'No se pudo registrar')) + '</span>';
        if (j.success) refresh();
      });
    };
  }

  function stopAudio() {
    if (state.audio) { try { state.audio.pause(); } catch (e) {} state.audio = null; }
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    setOrb('idle'); document.getElementById('sfPause').disabled = true; document.getElementById('sfStop').disabled = true;
    document.getElementById('sfPause').innerHTML = '&#10074;&#10074; Pausar';
  }

  function speak(text) {
    stopAudio();
    fetch('/api/tts/edge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: String(text).slice(0, 1900), voice: 'lina' }) })
      .then(function (r) { if (!r.ok) throw new Error('tts'); return r.blob(); })
      .then(function (blob) {
        if (!blob || blob.size < 200) throw new Error('empty');
        var a = new Audio(URL.createObjectURL(blob)); state.audio = a;
        a.onended = function () { state.audio = null; stopAudio(); };
        document.getElementById('sfPause').disabled = false; document.getElementById('sfStop').disabled = false;
        setOrb('speaking'); return a.play();
      })
      .catch(function () {
        if (!window.speechSynthesis) return;
        var u = new SpeechSynthesisUtterance(text); u.lang = 'es-MX';
        u.onstart = function () { setOrb('speaking'); document.getElementById('sfStop').disabled = false; };
        u.onend = function () { setOrb('idle'); };
        window.speechSynthesis.speak(u);
      });
  }
})();
