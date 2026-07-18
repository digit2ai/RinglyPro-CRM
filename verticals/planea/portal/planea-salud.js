/* PLANEA — Salud Financiera dashboard.
   Fetches /me/salud (overall + per-bucket scores, traffic lights, metrics, history)
   and renders a KPI dashboard: overall gauge + traffic light, score-over-time chart,
   and one detail card per bucket (Ingresos/Gastos/Ahorro/Deuda/Inversión/Seguros/Retiro).
   Auth = httpOnly JWT; 401 → login. */
(function () {
  'use strict';

  var COLORS = { green: '#3fc06a', yellow: '#e0a020', red: '#e5533c', gray: '#6b7c78' };
  var LIGHT_LABEL = { green: 'Saludable', yellow: 'Atención', red: 'Crítico', gray: 'Sin datos' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); }); }
  function col(light) { return COLORS[light] || COLORS.gray; }

  function overallCard(d) {
    var C = 2 * Math.PI * 74, c = col(d.light);
    var lights = ['red', 'yellow', 'green'].map(function (l) {
      var on = l === d.light;
      return '<span class="lt"><span class="dot" style="background:' + COLORS[l] + ';opacity:' + (on ? 1 : .28) + '"></span>' +
        (on ? '<b style="color:' + COLORS[l] + '">' + LIGHT_LABEL[l] + '</b>' : LIGHT_LABEL[l]) + '</span>';
    }).join('');
    return '<div class="sf-hero">' +
      '<div class="sf-gauge"><svg viewBox="0 0 168 168"><circle cx="84" cy="84" r="74" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="13"/>' +
      '<circle id="sf-ring" cx="84" cy="84" r="74" fill="none" stroke="' + c + '" stroke-width="13" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '" transform="rotate(-90 84 84)"/></svg>' +
      '<div class="n"><b id="sf-score" style="color:' + c + '">0</b><small>SALUD / 100</small></div></div>' +
      '<div class="sf-hero-info">' +
      '<div class="sf-badge" style="background:' + c + '22;color:' + c + '">' + esc(d.rango) + '</div>' +
      '<div class="sf-lights">' + lights + '</div>' +
      '<div class="sf-sub">Compuesta de tus 7 áreas financieras, ponderadas. Cada tarjeta abajo muestra su cálculo y semáforo. La gráfica registra tu evolución cada día que revisas.</div>' +
      '</div></div>';
  }

  function historyChart(hist) {
    hist = (hist || []).filter(function (h) { return h.overall != null; });
    var body;
    if (hist.length < 2) {
      body = '<div class="sf-empty" style="margin-top:0;border:none;padding:10px 0">Tu evolución aparecerá aquí a medida que revises tu Salud Financiera en distintos días.' +
        (hist.length === 1 ? ' Hoy: <b style="color:var(--txt)">' + hist[0].overall + '</b>.' : '') + '</div>';
    } else {
      var W = 640, Hh = 150, pad = 8, n = hist.length;
      var x = function (i) { return pad + i * (W - 2 * pad) / (n - 1); };
      var y = function (v) { return pad + (100 - v) / 100 * (Hh - 2 * pad); };
      var pts = hist.map(function (h, i) { return x(i) + ',' + y(h.overall); }).join(' ');
      var last = hist[hist.length - 1];
      var lc = last.overall >= 70 ? COLORS.green : last.overall >= 40 ? COLORS.yellow : COLORS.red;
      var area = 'M' + x(0) + ',' + (Hh - pad) + ' L' + pts.replace(/ /g, ' L') + ' L' + x(n - 1) + ',' + (Hh - pad) + ' Z';
      body = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" style="width:100%;height:auto;margin-top:8px">' +
        '<defs><linearGradient id="sfg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + lc + '" stop-opacity=".28"/><stop offset="1" stop-color="' + lc + '" stop-opacity="0"/></linearGradient></defs>' +
        [70, 40].map(function (g) { return '<line x1="' + pad + '" y1="' + y(g) + '" x2="' + (W - pad) + '" y2="' + y(g) + '" stroke="rgba(255,255,255,.07)" stroke-dasharray="3 4"/>'; }).join('') +
        '<path d="' + area + '" fill="url(#sfg)"/>' +
        '<polyline points="' + pts + '" fill="none" stroke="' + lc + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<circle cx="' + x(n - 1) + '" cy="' + y(last.overall) + '" r="4" fill="' + lc + '"/></svg>';
    }
    return '<div class="sf-card"><h2>Evolución en el tiempo</h2><div class="sub">Tu puntaje de Salud Financiera por fecha</div>' + body + '</div>';
  }

  function bucketCard(b) {
    var c = col(b.light);
    var sc = b.score == null ? '—' : b.score;
    var metrics = (b.metrics || []).map(function (m) {
      var vc = m.good === true ? COLORS.green : m.good === false ? COLORS.red : 'var(--txt)';
      return '<div class="row"><span class="k">' + esc(m.label) + '</span><span class="v" style="color:' + vc + '">' + esc(m.value) + '</span></div>';
    }).join('');
    return '<div class="sf-b"><div class="top"><div style="display:flex;align-items:center;gap:9px">' +
      '<span class="sf-tl" style="background:' + c + '"></span><span class="nm">' + esc(b.label) + '</span></div>' +
      '<span class="sc" style="color:' + c + '">' + sc + '</span></div>' +
      '<div class="track"><div class="fill" style="width:' + (b.score || 0) + '%;background:' + c + '"></div></div>' +
      '<div class="sf-m">' + metrics + '</div>' +
      '<div class="tgt">Meta: ' + esc(b.target || '') + ' · Peso ' + Math.round((b.weight || 0) * 100) + '%</div></div>';
  }

  function render(d) {
    var root = document.getElementById('salud-root');
    if (!root) return;
    if (d.overall == null) {
      root.innerHTML = '<div class="sf-empty">Aún no podemos calcular tu Salud Financiera.<br>Agrega al menos tus <b>ingresos</b> en el módulo Ingresos y vuelve aquí.' +
        '<div style="margin-top:14px"><a class="btn primary" href="/planea/portal/ingreso">Agregar ingresos →</a></div></div>';
      return;
    }
    root.innerHTML = overallCard(d) + historyChart(d.history) +
      '<div class="sf-card" style="padding:0;border:none;background:none"><h2 style="padding:4px 2px">Detalle por área</h2></div>' +
      '<div class="sf-grid">' + d.buckets.map(bucketCard).join('') + '</div>';
    // animate the gauge ring + number
    var C = 2 * Math.PI * 74, ring = document.getElementById('sf-ring'), numEl = document.getElementById('sf-score');
    setTimeout(function () { if (ring) ring.setAttribute('stroke-dashoffset', C - (d.overall / 100) * C); }, 120);
    var t0 = performance.now(), dur = 1200;
    (function tick(now) { var p = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3); if (numEl) numEl.textContent = Math.round(d.overall * e); if (p < 1) requestAnimationFrame(tick); })(performance.now());
  }

  function boot() {
    if (!window.PlaneaSB) { setTimeout(boot, 60); return; }
    fetch('/planea/api/v1/me/salud', { credentials: 'include' })
      .then(function (r) {
        if (r.status === 401) { location.replace('/planea/login'); throw new Error('401'); }
        if (!r.ok) throw new Error('salud ' + r.status);
        return r.json();
      })
      .then(render)
      .catch(function (e) {
        if (e && /401/.test(e.message)) return;
        var root = document.getElementById('salud-root');
        if (root) root.innerHTML = '<div class="sf-empty">No se pudo cargar tu Salud Financiera. Recarga la página.</div>';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
