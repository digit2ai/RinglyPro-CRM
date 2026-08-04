/* PLANEA — Salud Financiera "glass cockpit" (Garmin G1000-inspired).
   Primary airspeed-style score gauge + net-worth altimeter + a six-pack of
   flight instruments (emergency-fund fuel gauge, savings-rate VSI, DTI engine
   temp, retirement compass). Chart.js radar of the 7 buckets + net-worth trend.
   Expandable bucket cards with neural "Hallazgos" (from /me/salud/findings, with
   fallback). Live "¿Qué pasa si...?" simulator recomputes the exact S1-S6 score
   client-side. Auth = httpOnly JWT; 401 -> login. ?demo=1 = sample cockpit. */
(function () {
  'use strict';

  var GRN = '#3fc06a', AMB = '#e0a020', RED = '#e5533c', GRAY = '#6b7c78';
  var COLORS = { green: GRN, yellow: AMB, red: RED, gray: GRAY };
  var LIGHT_LABEL = { green: 'Saludable', yellow: 'Atención', red: 'Crítico', gray: 'Sin datos' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); }); }
  function col(l) { return COLORS[l] || GRAY; }
  function lightOf(s) { return s == null ? 'gray' : s >= 70 ? 'green' : s >= 40 ? 'yellow' : 'red'; }
  function scoreColor(s) { return s == null ? GRAY : s >= 70 ? GRN : s >= 40 ? AMB : RED; }
  function cop(n) { n = Math.round(+n || 0); var neg = n < 0; n = Math.abs(n); return (neg ? '-' : '') + '$' + n.toLocaleString('es-CO'); }
  function copShort(n) {
    var neg = n < 0; var a = Math.abs(+n || 0);
    var s = a >= 1e9 ? (a / 1e9).toFixed(a >= 1e10 ? 0 : 1) + ' MM' : a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + ' M' : a >= 1e3 ? (a / 1e3).toFixed(0) + ' K' : String(Math.round(a));
    return (neg ? '-' : '') + '$' + s;
  }
  function pct(f) { return Math.round(f * 100) + '%'; }

  // ---- SVG gauge geometry (top-0, clockwise degrees) ----
  function polar(cx, cy, r, deg) { var a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  // 270° dial: value 0 -> 225° (lower-left), 100 -> 135° (lower-right), 90° gap at bottom.
  function ang270(v) { return 225 + (Math.max(0, Math.min(100, v)) / 100) * 270; }
  // 180° half dial over the top: f 0..1 -> 270°(left) .. 90°(right)
  function ang180(f) { return 270 + Math.max(0, Math.min(1, f)) * 180; }
  function arcPath(cx, cy, r, a0, a1) {
    var p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1), large = (a1 - a0) % 360 > 180 ? 1 : 0;
    return 'M' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1);
  }

  // Primary airspeed-indicator style score gauge.
  function primaryGauge(score) {
    var cx = 130, cy = 130, R = 104, w = 18;
    var c = scoreColor(score);
    var bands = [
      { a: ang270(0), b: ang270(39.5), col: RED },
      { a: ang270(39.5), b: ang270(69.5), col: AMB },
      { a: ang270(69.5), b: ang270(100), col: GRN },
    ].map(function (s) { return '<path d="' + arcPath(cx, cy, R, s.a, s.b) + '" fill="none" stroke="' + s.col + '" stroke-width="' + w + '" stroke-linecap="butt" opacity=".92"/>'; }).join('');
    var ticks = '';
    for (var v = 0; v <= 100; v += 10) {
      var a = ang270(v), o = polar(cx, cy, R - w - 2, a), i = polar(cx, cy, R - w - (v % 20 === 0 ? 13 : 8), a);
      ticks += '<line x1="' + o[0].toFixed(1) + '" y1="' + o[1].toFixed(1) + '" x2="' + i[0].toFixed(1) + '" y2="' + i[1].toFixed(1) + '" stroke="rgba(255,255,255,.45)" stroke-width="' + (v % 20 === 0 ? 2 : 1) + '"/>';
      if (v % 20 === 0) { var lp = polar(cx, cy, R - w - 24, a); ticks += '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 4).toFixed(1) + '" fill="rgba(255,255,255,.55)" font-size="11" font-family="Inter" text-anchor="middle">' + v + '</text>'; }
    }
    // Needle drawn at value 0 (lower-left); animatePrimary rotates it around the
    // gauge center to the score angle. transform-box:view-box => origin in viewBox units.
    var na0 = ang270(0);
    var tip = polar(cx, cy, R - w + 3, na0), tail = polar(cx, cy, 20, na0 + 180), tipTip = polar(cx, cy, R - w + 11, na0);
    var needle = '<g id="sf-needle" style="transform-box:view-box;transform-origin:' + cx + 'px ' + cy + 'px;transform:rotate(0deg);transition:transform 1.1s cubic-bezier(.2,.9,.2,1)">' +
      '<line x1="' + tail[0].toFixed(1) + '" y1="' + tail[1].toFixed(1) + '" x2="' + tip[0].toFixed(1) + '" y2="' + tip[1].toFixed(1) + '" stroke="#fff" stroke-width="4" stroke-linecap="round"/>' +
      '<circle cx="' + tipTip[0].toFixed(1) + '" cy="' + tipTip[1].toFixed(1) + '" r="4.5" fill="' + c + '"/></g>';
    return '<svg viewBox="0 0 260 250">' + bands + ticks + needle +
      '<circle cx="' + cx + '" cy="' + cy + '" r="12" fill="#0a1a16" stroke="#fff" stroke-width="2"/>' +
      '<text id="sf-score" x="' + cx + '" y="' + (cy + 58) + '" fill="' + c + '" font-size="52" font-weight="800" font-family="Inter" text-anchor="middle">' + (score == null ? '--' : 0) + '</text>' +
      '<text x="' + cx + '" y="' + (cy + 76) + '" fill="rgba(255,255,255,.45)" font-size="11" letter-spacing="3" font-family="Inter" text-anchor="middle">SALUD / 100</text>' +
      '</svg>';
  }

  // Compact half-dial instrument for the six-pack.
  function miniGauge(o) {
    // o: {frac(0..1 needle), bands:[{from,to,color}], color, ticks:[labels left,right]}
    var cx = 66, cy = 66, R = 52, w = 9;
    var bands = (o.bands || [{ from: 0, to: 1, color: o.color || GRN }]).map(function (b) {
      return '<path d="' + arcPath(cx, cy, R, ang180(b.from), ang180(b.to)) + '" fill="none" stroke="' + b.color + '" stroke-width="' + w + '" opacity=".9"/>';
    }).join('');
    var na = ang180(o.frac);
    var tip = polar(cx, cy, R - 3, na), tail = polar(cx, cy, -10, na);
    var needle = '<line x1="' + tail[0].toFixed(1) + '" y1="' + tail[1].toFixed(1) + '" x2="' + tip[0].toFixed(1) + '" y2="' + tip[1].toFixed(1) + '" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>';
    var lbl = '';
    if (o.ends) {
      lbl = '<text x="12" y="72" fill="rgba(255,255,255,.5)" font-size="10" font-family="Inter">' + o.ends[0] + '</text>' +
        '<text x="120" y="72" fill="rgba(255,255,255,.5)" font-size="10" font-family="Inter" text-anchor="end">' + o.ends[1] + '</text>';
    }
    return '<svg viewBox="0 0 132 80">' + bands + needle + lbl +
      '<circle cx="' + cx + '" cy="' + cy + '" r="6" fill="#0a1a16" stroke="#fff" stroke-width="1.5"/></svg>';
  }

  function sixPack(inst) {
    var em = inst.emergency, sv = inst.savings, dt = inst.dti, rt = inst.retirement;
    var emCol = em.frac >= .5 ? GRN : em.frac >= .17 ? AMB : RED;
    var svCol = sv.rate >= .1 ? GRN : sv.rate >= 0 ? AMB : RED;
    var svFrac = Math.max(0, Math.min(1, (sv.rate + 0.2) / 0.6)); // -20%..+40% mapped 0..1, 0.33=flat
    var dtCol = dt.ratio <= .35 ? GRN : dt.ratio <= .8 ? AMB : RED;
    var dtFrac = Math.max(0, Math.min(1, dt.frac));
    var rtCol = rt.frac >= .6 ? GRN : rt.frac >= .3 ? AMB : RED;
    var items = [
      { t: 'FONDO EMERG.', goto: 'savings', g: miniGauge({ frac: Math.min(1, em.frac), color: emCol, ends: ['E', 'F'], bands: [{ from: 0, to: .17, color: RED }, { from: .17, to: .5, color: AMB }, { from: .5, to: 1, color: GRN }] }), rv: em.meses >= 99 ? '6+ m' : em.meses.toFixed(1) + ' m', rs: 'meta 6 meses', c: emCol },
      { t: 'TASA AHORRO', goto: 'income', g: miniGauge({ frac: svFrac, color: svCol, ends: ['-', '+'], bands: [{ from: 0, to: .33, color: RED }, { from: .33, to: .5, color: AMB }, { from: .5, to: 1, color: GRN }] }), rv: (sv.rate >= 0 ? '+' : '') + Math.round(sv.rate * 100) + '%', rs: 'meta 20%', c: svCol },
      { t: 'DEUDA / ING', goto: 'debt', g: miniGauge({ frac: dtFrac, color: dtCol, ends: ['0', '1'], bands: [{ from: 0, to: .35, color: GRN }, { from: .35, to: .8, color: AMB }, { from: .8, to: 1, color: RED }] }), rv: Math.round(dt.ratio * 100) + '%', rs: 'del ingreso anual', c: dtCol },
      { t: 'RETIRO', goto: 'retirement', g: miniGauge({ frac: rt.frac, color: rtCol, ends: ['0', 'Meta'], bands: [{ from: 0, to: .3, color: RED }, { from: .3, to: .6, color: AMB }, { from: .6, to: 1, color: GRN }] }), rv: rt.pct + '%', rs: 'de tu meta por edad', c: rtCol },
    ];
    // Cada instrumento es CLICABLE: lleva al pilar, muestra el consejo de Maya para
    // ese KPI y abre la edición para subir el puntaje total.
    return '<div class="six">' + items.map(function (it) {
      return '<div class="inst clickable" data-goto="' + it.goto + '" role="button" tabindex="0" aria-label="' + esc(it.t) + ': abrir consejo y editar">' +
        '<div class="t">' + it.t + '</div>' + it.g + '<div class="rv" style="color:' + it.c + '">' + it.rv + '</div><div class="rs">' + it.rs + '</div>' +
        '<div class="inst-cta">Tocar para mejorar</div></div>';
    }).join('') + '</div>';
  }

  function altimeter(d) {
    var hist = (d.history || []).filter(function (h) { return h.net_worth != null; });
    var prev = hist.length >= 2 ? hist[hist.length - 2].net_worth : null;
    var delta = prev != null ? d.net_worth - prev : null;
    var trend = delta == null ? '<span style="color:var(--mut)">Primer registro — la tendencia aparecerá con el tiempo</span>'
      : '<span style="color:' + (delta >= 0 ? GRN : RED) + '">' + (delta >= 0 ? '▲' : '▼') + ' ' + cop(Math.abs(delta)) + ' desde tu último registro</span>';
    return '<div class="alt">' +
      '<div class="lbl">PATRIMONIO NETO</div>' +
      '<div class="val" style="color:' + (d.net_worth >= 0 ? '#fff' : RED) + '">' + cop(d.net_worth) + '</div>' +
      '<div class="trend">' + trend + '</div>' +
      '<div class="split">' +
      '<div class="c"><div class="k">ACTIVOS</div><div class="v" style="color:' + GRN + '">' + cop(d.total_assets) + '</div><small>ahorro + inversión + retiro</small></div>' +
      '<div class="c"><div class="k">PASIVOS</div><div class="v" style="color:' + RED + '">' + cop(d.total_liabilities) + '</div><small>deuda total</small></div>' +
      '</div></div>';
  }

  function cockpit(d) {
    var c = scoreColor(d.overall);
    var lights = ['red', 'yellow', 'green'].map(function (l) { return '<span style="opacity:' + (l === d.light ? 1 : .3) + ';color:' + COLORS[l] + ';font-weight:' + (l === d.light ? 800 : 500) + '">● ' + LIGHT_LABEL[l] + '</span>'; }).join('&nbsp;&nbsp;');
    return '<div class="cok"><div class="cok-top">' +
      '<div class="cok-primary">' + primaryGauge(d.overall) +
      '<div class="cap"><span class="badge" style="background:' + c + '22;color:' + c + '">' + esc(d.rango) + '</span>' +
      '<div class="rng" style="margin-top:9px">' + lights + '</div></div></div>' +
      altimeter(d) +
      '</div>' + sixPack(d.instruments) + '</div>';
  }

  function chartsBlock() {
    return '<div class="charts">' +
      '<div class="chartbox"><h2>Perfil por área</h2><div class="sub">Tus 7 áreas financieras (0–100)</div><div class="cwrap"><canvas id="sf-radar"></canvas></div></div>' +
      '<div class="chartbox"><h2>Patrimonio y flujo</h2><div class="sub">Patrimonio neto e ingreso vs. gasto en el tiempo</div><div class="cwrap"><canvas id="sf-trend"></canvas></div></div>' +
      '</div>';
  }

  // Cada pilar es ACCIONABLE: al abrir la tarjeta el usuario puede registrar plata
  // en ese pilar (aportar al fondo, a retiro, etc.), se guarda en /me/items y el
  // tablero se recalcula al instante — así usa los indicadores para subir su
  // puntaje hacia verde. Mapa pilar -> módulo + textos.
  var CAT = { income: 'ingreso', expenses: 'gasto', savings: 'ahorro', debt: 'deuda', investments: 'inversion', insurance: 'seguros', retirement: 'retiro' };
  var ACT_LABEL = { income: 'Registrar un ingreso', expenses: 'Registrar un gasto', savings: 'Aportar a mi fondo de emergencia', debt: 'Registrar una deuda', investments: 'Agregar una inversión', insurance: 'Registrar un seguro', retirement: 'Aportar a mi retiro' };
  var ACT_NAME = { income: 'Ingreso', expenses: 'Gasto', savings: 'Aporte a fondo', debt: 'Deuda', investments: 'Inversión', insurance: 'Seguro', retirement: 'Aporte a retiro' };
  var ACT_HINT = {
    income: 'Súmalo a tus ingresos del mes.', expenses: 'Se suma a tus gastos del mes.',
    savings: 'Sube tu fondo de emergencia y tu solvencia.', debt: 'Registra el saldo que debes.',
    investments: 'Suma a tu patrimonio invertido.', insurance: 'Registra el valor asegurado (cobertura).',
    retirement: 'Aporta a tu ahorro de retiro.',
  };

  function bucketCard(b) {
    var c = col(b.light), sc = b.score == null ? '—' : b.score;
    var act = CAT[b.key] ? (
      '<div class="sf-act">' +
        '<button type="button" class="sf-act-btn" data-add="' + b.key + '">＋ ' + esc(ACT_LABEL[b.key]) + '</button>' +
        '<div class="sf-act-form" hidden>' +
          '<input class="sf-act-amt" type="text" inputmode="numeric" placeholder="Monto en pesos (ej. 100000)">' +
          '<div class="sf-act-btns"><button type="button" class="sf-act-save" data-save="' + b.key + '">Guardar</button>' +
          '<button type="button" class="sf-act-cancel">Cancelar</button></div>' +
          '<div class="sf-act-hint">' + esc(ACT_HINT[b.key]) + '</div>' +
        '</div>' +
        '<div class="sf-act-msg" hidden></div>' +
      '</div>'
    ) : '';
    return '<div class="sf-b" data-k="' + b.key + '">' +
      '<div class="hd"><span class="nm"><span class="sf-tl" style="background:' + c + '"></span>' + esc(b.label) + '</span>' +
      '<span class="sc" style="color:' + c + '">' + sc + '<span class="chev">▶</span></span></div>' +
      '<div class="track"><div class="fill" style="width:' + (b.score || 0) + '%;background:' + c + '"></div></div>' +
      '<div class="body"><div class="inner">' +
      '<div class="formula">' + esc(b.formula) + '</div>' +
      '<div class="tgt">Meta: ' + esc(b.target || '') + '</div>' +
      act +
      '<div class="find load" data-find="' + b.key + '"><span class="fh">HALLAZGOS DE MAYA</span>Analizando tus datos…</div>' +
      '</div></div></div>';
  }

  function neuralFindings(d) {
    var rows = d.buckets.map(function (b) {
      return '<div class="nf-row"><span class="nf-dot" style="background:' + col(b.light) + '"></span>' +
        '<div><div class="nf-area">' + esc(b.label) + ' · ' + b.score + '/100</div>' +
        '<div class="nf-txt load" data-nftxt="' + b.key + '">Analizando tus datos…</div></div></div>';
    }).join('');
    return '<div class="nf" id="sf-neural">' +
      '<div class="nf-hd"><div class="nf-mark"><span class="nf-diamond">◈</span> NEURAL FINDINGS</div>' +
      '<div class="nf-meta"><span class="nf-chip" id="nf-src">Analizando…</span><span class="nf-chip alt" id="nf-scn" style="display:none"></span></div></div>' +
      '<div class="nf-sub">Análisis de tu situación por el motor neural de Digit2AI — priorizado según la pirámide de prioridades del CFP y consciente de todas tus áreas a la vez.</div>' +
      '<div class="nf-lead"><div class="av">M</div><div style="flex:1">' +
      '<div class="who">Maya · recomendación principal</div>' +
      '<div class="msg" id="nf-fx-msg">Analizando tus datos para darte la recomendación principal…</div>' +
      '<div class="goal" id="nf-fx-goal"></div></div></div>' +
      '<div class="nf-grid">' + rows + '</div>' +
      '<div class="nf-foot"><button class="nf-refresh" id="nf-refresh">Actualizar análisis</button></div>' +
      '</div>';
  }

  function simulator(d) {
    var i = d.inputs;
    return '<div class="sim"><h2>¿Qué pasa si…?</h2><div class="sub">Mueve los controles y mira cómo cambia tu puntaje al instante.</div>' +
      '<div class="sim-grid"><div class="sim-controls">' +
      '<div class="ctl"><div class="cl"><span>Ahorro extra al mes</span><span class="cv" id="sv-extra">' + cop(0) + '</span></div><input type="range" id="sim-extra" min="0" max="' + Math.max(500000, Math.round(i.I * 0.4)) + '" step="10000" value="0"></div>' +
      '<div class="ctl"><div class="cl"><span>Recorte de gasto mensual</span><span class="cv" id="sv-cut">' + cop(0) + '</span></div><input type="range" id="sim-cut" min="0" max="' + Math.max(300000, Math.round(i.G * 0.5)) + '" step="10000" value="0"></div>' +
      '<div class="ctl"><div class="cl"><span>Abono a la deuda</span><span class="cv" id="sv-abono">' + cop(0) + '</span></div><input type="range" id="sim-abono" min="0" max="' + Math.max(500000, Math.round(i.D)) + '" step="50000" value="0"></div>' +
      '</div>' +
      '<div class="sim-out"><div class="now">PUNTAJE PROYECTADO</div><div class="big" id="sim-score" style="color:' + scoreColor(d.overall) + '">' + d.overall + '</div>' +
      '<div class="delta" id="sim-delta">Sin cambios</div><div class="base">Puntaje actual: ' + d.overall + '</div>' +
      '<button class="reset" id="sim-reset">Restablecer</button></div>' +
      '</div></div>';
  }

  // ---- exact S1..S6 score (mirror of salud.cjs) for the simulator ----
  function retFactor(age) {
    var pts = [[30, 1], [40, 3], [50, 6], [60, 8]];
    if (age <= 30) return 1; if (age >= 60) return 8;
    for (var k = 0; k < pts.length - 1; k++) { if (age >= pts[k][0] && age <= pts[k + 1][0]) { var a0 = pts[k][0], f0 = pts[k][1], a1 = pts[k + 1][0], f1 = pts[k + 1][1]; return f0 + (f1 - f0) * (age - a0) / (a1 - a0); } }
    return 3;
  }
  function cl01(x) { return Math.max(0, Math.min(1, x)); }
  function calcScore(t) {
    var I = t.I, G = t.G, A = t.A, V = t.V, R = t.R, D = t.D, S = t.S, age = t.age || 35;
    var annual = I * 12, totalAssets = A + V + R, netWorth = totalAssets - D, goalRet = annual * retFactor(age);
    if (I <= 0) return null;
    var S1 = cl01(A / (6 * I)), S2 = cl01(((I - G) / I) / 0.2), S3 = Math.max(1 - D / annual, 0);
    var S4 = totalAssets > 0 ? cl01(netWorth / totalAssets) : (D > 0 ? 0 : 1);
    var S5 = goalRet > 0 ? cl01(R / goalRet) : 0, S6 = annual > 0 ? cl01(S / (10 * annual)) : 0;
    return Math.max(1, Math.min(99, Math.round(20 * S1 + 15 * S2 + 20 * S3 + 10 * S4 + 20 * S5 + 15 * S6)));
  }

  function wireSimulator(d) {
    var i = d.inputs, base = d.overall;
    var extra = document.getElementById('sim-extra'), cut = document.getElementById('sim-cut'), abono = document.getElementById('sim-abono');
    var out = document.getElementById('sim-score'), delta = document.getElementById('sim-delta');
    if (!extra) return;
    function recompute() {
      var xe = +extra.value, xc = +cut.value, xa = +abono.value;
      document.getElementById('sv-extra').textContent = cop(xe);
      document.getElementById('sv-cut').textContent = cop(xc);
      document.getElementById('sv-abono').textContent = cop(xa);
      var t = {
        I: i.I, G: Math.max(0, i.G - xc), A: i.A + (xe + xc) * 12, V: i.V, R: i.R,
        D: Math.max(0, i.D - xa), S: i.S, age: i.age,
      };
      var ns = calcScore(t); if (ns == null) return;
      out.textContent = ns; out.style.color = scoreColor(ns);
      var dd = ns - base;
      delta.textContent = dd === 0 ? 'Sin cambios' : (dd > 0 ? '+' + dd + ' puntos' : dd + ' puntos');
      delta.style.color = dd > 0 ? GRN : dd < 0 ? RED : 'var(--mut)';
    }
    [extra, cut, abono].forEach(function (el) { el.addEventListener('input', recompute); });
    document.getElementById('sim-reset').addEventListener('click', function () { extra.value = 0; cut.value = 0; abono.value = 0; recompute(); });
  }

  var CHARTS = {};
  function drawCharts(d) {
    if (typeof Chart === 'undefined') return;
    var tick = 'rgba(255,255,255,.55)', grid = 'rgba(255,255,255,.08)';
    var radar = document.getElementById('sf-radar');
    if (radar) {
      CHARTS.radar && CHARTS.radar.destroy();
      CHARTS.radar = new Chart(radar, {
        type: 'radar',
        data: { labels: d.buckets.map(function (b) { return b.label; }), datasets: [{ label: 'Puntaje', data: d.buckets.map(function (b) { return b.score; }), fill: true, backgroundColor: 'rgba(63,192,106,.18)', borderColor: GRN, pointBackgroundColor: d.buckets.map(function (b) { return col(b.light); }), pointRadius: 4, borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, color: tick, backdropColor: 'transparent', font: { size: 10 } }, grid: { color: grid }, angleLines: { color: grid }, pointLabels: { color: '#dff3ea', font: { size: 11, weight: '600' } } } } },
      });
    }
    var trend = document.getElementById('sf-trend');
    if (trend) {
      var hist = (d.history || []).filter(function (h) { return h.net_worth != null || h.income != null; });
      if (hist.length < 1 && d.net_worth != null) hist = [{ date: 'hoy', net_worth: d.net_worth, income: d.inputs.I, expense: d.inputs.G }];
      var labels = hist.map(function (h) { return String(h.date).slice(5) || 'hoy'; });
      CHARTS.trend && CHARTS.trend.destroy();
      CHARTS.trend = new Chart(trend, {
        data: {
          labels: labels,
          datasets: [
            { type: 'line', label: 'Patrimonio', data: hist.map(function (h) { return h.net_worth; }), borderColor: GRN, backgroundColor: 'rgba(63,192,106,.12)', fill: true, tension: .3, yAxisID: 'y', borderWidth: 2.5, pointRadius: 3 },
            { type: 'bar', label: 'Ingreso', data: hist.map(function (h) { return h.income; }), backgroundColor: 'rgba(96,165,250,.55)', yAxisID: 'y1', borderRadius: 4 },
            { type: 'bar', label: 'Gasto', data: hist.map(function (h) { return h.expense; }), backgroundColor: 'rgba(229,83,60,.55)', yAxisID: 'y1', borderRadius: 4 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { labels: { color: tick, font: { size: 11 }, boxWidth: 12 } }, tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + cop(c.parsed.y); } } } },
          scales: {
            x: { grid: { color: grid }, ticks: { color: tick, font: { size: 10 } } },
            y: { position: 'left', grid: { color: grid }, ticks: { color: tick, font: { size: 10 }, callback: function (v) { return copShort(v); } } },
            y1: { position: 'right', grid: { display: false }, ticks: { color: tick, font: { size: 10 }, callback: function (v) { return copShort(v); } } },
          },
        },
      });
    }
  }

  function animatePrimary(score) {
    if (score == null) return;
    var needle = document.getElementById('sf-needle'), numEl = document.getElementById('sf-score');
    var deg = (score / 100) * 270; // needle drawn at 0 -> rotate to score
    setTimeout(function () { if (needle) needle.style.transform = 'rotate(' + deg + 'deg)'; }, 140);
    var t0 = performance.now(), dur = 1100;
    (function tick(now) { var p = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3); if (numEl) numEl.textContent = Math.round(score * e); if (p < 1) requestAnimationFrame(tick); })(performance.now());
  }

  // Abre el pilar (KPI): expande su tarjeta, la resalta, muestra el consejo de Maya
  // y despliega la edición para aportar. Llamado desde los medidores de arriba.
  function openPillar(key) {
    var card = document.querySelector('.sf-b[data-k="' + key + '"]');
    if (!card) return;
    card.classList.add('open');
    var form = card.querySelector('.sf-act-form'); if (form) form.removeAttribute('hidden');
    if (card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('flash'); setTimeout(function () { card.classList.remove('flash'); }, 1400);
    var amt = card.querySelector('.sf-act-amt'); if (amt) setTimeout(function () { try { amt.focus({ preventScroll: true }); } catch (e) { amt.focus(); } }, 500);
  }

  function bindCards(demo) {
    document.querySelectorAll('.sf-b .hd').forEach(function (hd) {
      hd.addEventListener('click', function () { hd.parentElement.classList.toggle('open'); });
    });
    // Medidores de arriba (FONDO, TASA AHORRO, DEUDA, RETIRO) -> abren su pilar.
    document.querySelectorAll('.inst.clickable[data-goto]').forEach(function (inst) {
      var go = function () { openPillar(inst.getAttribute('data-goto')); };
      inst.addEventListener('click', go);
      inst.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    // Acción por pilar: abrir el mini-formulario y guardar el aporte.
    document.querySelectorAll('.sf-act-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var form = btn.parentElement.querySelector('.sf-act-form');
        var open = form.hasAttribute('hidden');
        if (open) { form.removeAttribute('hidden'); var i = form.querySelector('.sf-act-amt'); if (i) i.focus(); }
        else form.setAttribute('hidden', '');
      });
    });
    document.querySelectorAll('.sf-act-cancel').forEach(function (b) {
      b.addEventListener('click', function () { b.closest('.sf-act-form').setAttribute('hidden', ''); });
    });
    document.querySelectorAll('.sf-act-amt').forEach(function (inp) {
      // Formatea con separadores de miles mientras escribe (COP).
      inp.addEventListener('input', function () {
        var d = inp.value.replace(/\D/g, '');
        inp.value = d ? Number(d).toLocaleString('es-CO') : '';
      });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var s = inp.closest('.sf-act').querySelector('.sf-act-save'); if (s) s.click(); } });
    });
    document.querySelectorAll('.sf-act-save').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-save');
        var wrap = btn.closest('.sf-act');
        var amt = parseInt((wrap.querySelector('.sf-act-amt').value || '').replace(/\D/g, ''), 10);
        var msg = wrap.querySelector('.sf-act-msg');
        if (!amt || amt <= 0) { wrap.querySelector('.sf-act-amt').focus(); return; }
        if (demo) { msg.removeAttribute('hidden'); msg.textContent = 'En modo ejemplo no se guarda. Inicia sesión para registrar tus datos.'; return; }
        btn.disabled = true; var old = btn.textContent; btn.textContent = 'Guardando…';
        fetch('/planea/api/v1/me/items', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: CAT[key], name: ACT_NAME[key], type: ACT_NAME[key], value: amt, monthly: 0 })
        }).then(function (r) { if (!r.ok) throw new Error('save'); return r.json(); })
          .then(function () { reloadSalud(true); })
          .catch(function () { btn.disabled = false; btn.textContent = old; msg.removeAttribute('hidden'); msg.textContent = 'No se pudo guardar. Intenta de nuevo.'; });
      });
    });
  }

  // Re-lee la Salud y re-renderiza para que el gauge y los pilares se muevan solos.
  // scroll=true sube al medidor para que el usuario vea el cambio.
  function reloadSalud(scroll) {
    fetch('/planea/api/v1/me/salud', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        render(d, false);
        if (scroll) { var root = document.getElementById('salud-root'); if (root && root.scrollIntoView) root.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      })
      .catch(function () {});
  }

  function loadFindings(demo) {
    var apply = function (f) {
      f = f || {};
      var fallbackTxt = 'Registra o actualiza los datos de esta área para recibir una recomendación.';
      // Neural Findings — featured recommendation
      var msg = document.getElementById('nf-fx-msg'), goal = document.getElementById('nf-fx-goal');
      if (msg) msg.textContent = (f.featured && f.featured.text) || 'Aún no hay una recomendación principal. Completa tus datos para activar el análisis.';
      if (goal) goal.textContent = (f.featured && f.featured.goal) ? 'Meta sugerida: ' + f.featured.goal : '';
      // source + scenario chips
      var src = document.getElementById('nf-src'), scn = document.getElementById('nf-scn');
      if (src) {
        if (f.source === 'neural') { src.textContent = 'Análisis neural en vivo'; src.className = 'nf-chip live'; }
        else if (f.source === 'fallback') { src.textContent = 'Guía basada en reglas'; src.className = 'nf-chip'; }
        else { src.textContent = 'Sin análisis'; src.className = 'nf-chip alt'; }
      }
      if (scn) { if (f.scenario) { scn.textContent = 'Escenario ' + f.scenario; scn.style.display = ''; } else scn.style.display = 'none'; }
      // Neural Findings — per-área rows
      document.querySelectorAll('[data-nftxt]').forEach(function (el) {
        var k = el.getAttribute('data-nftxt'), txt = f.buckets && f.buckets[k];
        el.classList.remove('load'); el.textContent = txt || fallbackTxt;
      });
      // bucket cards (drill-down hallazgos)
      document.querySelectorAll('[data-find]').forEach(function (el) {
        var k = el.getAttribute('data-find'), txt = f.buckets && f.buckets[k];
        el.classList.remove('load');
        el.innerHTML = '<span class="fh">HALLAZGOS DE MAYA</span>' + esc(txt || fallbackTxt);
      });
    };
    var setLoading = function () {
      document.querySelectorAll('[data-nftxt]').forEach(function (el) { el.classList.add('load'); el.textContent = 'Analizando tus datos…'; });
      var src = document.getElementById('nf-src'); if (src) { src.textContent = 'Analizando…'; src.className = 'nf-chip'; }
    };
    var wireRefresh = function () {
      var rb = document.getElementById('nf-refresh');
      if (rb && !rb.__wired) {
        rb.__wired = true;
        rb.addEventListener('click', function () { rb.disabled = true; setLoading(); run(function () { rb.disabled = false; }); });
      }
    };
    var run = function (done) {
      if (demo) { apply(DEMO_FINDINGS); done && done(); return; }
      fetch('/planea/api/v1/me/salud/findings', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (f) { apply(f || {}); done && done(); })
        .catch(function () { apply({}); done && done(); });
    };
    wireRefresh();
    run();
  }

  function render(d, demo) {
    var root = document.getElementById('salud-root');
    if (!root) return;
    if (d.overall == null) {
      root.innerHTML = '<div class="sf-empty">Aún no podemos calcular tu Salud Financiera.<br>Agrega al menos tus <b>ingresos</b> en el módulo Ingresos y vuelve aquí.' +
        '<div style="margin-top:14px"><a class="btn primary" href="/planea/portal/ingreso">Agregar ingresos →</a></div>' +
        '<div style="margin-top:10px"><a href="?demo=1" style="color:var(--mut);font-size:12.5px">Ver el tablero con datos de ejemplo →</a></div></div>';
      return;
    }
    root.innerHTML = cockpit(d) + chartsBlock() +
      '<div class="sf-card" style="border:none;background:none;padding:6px 2px"><h2>Detalle por área</h2><div class="sub">Toca una tarjeta para ver su fórmula, los hallazgos de Maya y registrar plata en ese pilar. Cada aporte actualiza tu puntaje al instante.</div></div>' +
      '<div class="sf-grid">' + d.buckets.map(bucketCard).join('') + '</div>' +
      simulator(d) + neuralFindings(d);
    animatePrimary(d.overall);
    drawCharts(d);
    bindCards(demo);
    wireSimulator(d);
    loadFindings(demo);
  }

  // ---- demo data ----
  function buildDemo() {
    var items = [
      { category: 'ingreso', value: 6000000 }, { category: 'gasto', value: 3900000 },
      { category: 'ahorro', value: 14000000 }, { category: 'inversion', value: 9000000 },
      { category: 'retiro', value: 22000000 }, { category: 'deuda', value: 18000000, monthly: 650000 },
      { category: 'seguros', value: 120000000 },
    ];
    // compute using the same math as the backend
    var t = { I: 6000000, G: 3900000, A: 14000000, V: 9000000, R: 22000000, D: 18000000, S: 120000000, age: 38 };
    var annual = t.I * 12, totalAssets = t.A + t.V + t.R, netWorth = totalAssets - t.D, goalRet = annual * retFactor(t.age);
    var S1 = cl01(t.A / (6 * t.I)), S2 = cl01(((t.I - t.G) / t.I) / .2), S3 = Math.max(1 - t.D / annual, 0), S4 = cl01(netWorth / totalAssets), S5 = cl01(t.R / goalRet), S6 = cl01(t.S / (10 * annual));
    var overall = Math.round(20 * S1 + 15 * S2 + 20 * S3 + 10 * S4 + 20 * S5 + 15 * S6);
    var mk = function (key, label, score, formula, target) { return { key: key, label: label, score: Math.round(score), light: lightOf(Math.round(score)), formula: formula, target: target }; };
    var expScore = cl01((0.9 - t.G / t.I) / .4) * 100;
    return {
      overall: overall, rango: overall <= 30 ? 'Punto de partida' : overall <= 50 ? 'Construyendo' : overall <= 70 ? 'En camino' : overall <= 85 ? 'Sólido' : 'Planeado', light: lightOf(overall), age: t.age,
      net_worth: netWorth, total_assets: totalAssets, total_liabilities: t.D,
      instruments: {
        score: { value: overall },
        emergency: { frac: cl01(t.A / (6 * t.I)), meses: Math.round(t.A / t.I * 10) / 10, target: 6 },
        savings: { rate: (t.I - t.G) / t.I, frac: cl01(((t.I - t.G) / t.I) / .2) },
        dti: { frac: Math.min(t.D / annual, 1.3), ratio: t.D / annual },
        retirement: { frac: cl01(S5), pct: Math.round(S5 * 100) },
      },
      buckets: [
        mk('income', 'Ingresos', S2 * 100, 'Capacidad de ahorro = (ingreso − gasto) ÷ ingreso, meta 20%.', '≥ 20% de superávit'),
        mk('expenses', 'Gastos', expScore, 'Control del gasto: gastar ≤ 50% del ingreso es saludable.', '≤ 50% del ingreso'),
        mk('savings', 'Ahorro', S1 * 100, 'Fondo de emergencia = ahorro ÷ (6 × ingreso mensual).', '6 meses de ingreso'),
        mk('debt', 'Deuda', S3 * 100, 'Salud de deuda = 1 − (deuda total ÷ ingreso anual).', 'Deuda ≤ ingreso anual'),
        mk('investments', 'Inversiones', S4 * 100, 'Solvencia = patrimonio neto ÷ activos totales.', 'Patrimonio positivo'),
        mk('insurance', 'Seguros', S6 * 100, 'Protección = cobertura ÷ (10 × ingreso anual).', '10× ingreso anual'),
        mk('retirement', 'Retiro', S5 * 100, 'Retiro = ahorro de retiro ÷ meta por edad (edad 38).', '2.6× ingreso anual'),
      ],
      inputs: { I: t.I, G: t.G, A: t.A, V: t.V, R: t.R, D: t.D, S: t.S, C: 650000, annual: annual, goalRet: goalRet, age: t.age },
      history: [
        { date: '2026-04-30', net_worth: netWorth - 6000000, income: 5600000, expense: 4100000, overall: overall - 6 },
        { date: '2026-05-31', net_worth: netWorth - 3500000, income: 5800000, expense: 4000000, overall: overall - 4 },
        { date: '2026-06-30', net_worth: netWorth - 1500000, income: 6000000, expense: 3950000, overall: overall - 2 },
        { date: '2026-07-18', net_worth: netWorth, income: t.I, expense: t.G, overall: overall },
      ],
    };
  }
  var DEMO_FINDINGS = {
    source: 'fallback',
    featured: { bucket: 'retirement', text: 'Vas muy bien en lo esencial: fondo de emergencia sólido y deuda bajo control. Tu mayor palanca ahora es el retiro — con aportes voluntarios de $300.000 al mes acercarías tu meta por edad en un par de años.', goal: '$18.720.000 (2.6× tu ingreso anual)' },
    buckets: {
      income: 'Tu ingreso deja un superávit del 35%, muy por encima del 20% recomendado. Excelente base para invertir.',
      expenses: 'Gastas el 65% de tu ingreso; hay margen para optimizar y dirigir más al retiro.',
      savings: 'Tu fondo de emergencia cubre más de 3 meses de gasto. Estás protegido ante imprevistos.',
      debt: 'Tu deuda equivale a apenas una fracción de tu ingreso anual. Bien gestionada.',
      investments: 'Tu patrimonio neto es positivo y creciente. Considera diversificar para acelerar el crecimiento.',
      insurance: 'Tu cobertura ronda 1.7× tu ingreso anual; para protección plena apunta a 10×.',
      retirement: 'Estás en camino pero corto para tu edad. Los aportes voluntarios hoy rinden mucho por el interés compuesto.',
    },
  };

  function boot() {
    if (!window.PlaneaSB && !/[?&]demo=1/.test(location.search)) { setTimeout(boot, 60); return; }
    if (/[?&]demo=1/.test(location.search)) {
      var demoEl = document.getElementById('sf-demo'); if (demoEl) demoEl.style.display = 'inline-block';
      try { render(buildDemo(), true); } catch (e) { console.error(e); }
      return;
    }
    fetch('/planea/api/v1/me/salud', { credentials: 'include' })
      .then(function (r) {
        if (r.status === 401) { location.replace('/planea/login'); throw new Error('401'); }
        if (!r.ok) throw new Error('salud ' + r.status);
        return r.json();
      })
      .then(function (d) { render(d, false); })
      .catch(function (e) {
        if (e && /401/.test(e.message)) return;
        var root = document.getElementById('salud-root');
        if (root) root.innerHTML = '<div class="sf-empty">No se pudo cargar tu Salud Financiera. Recarga la página.<div style="margin-top:10px"><a href="?demo=1" style="color:var(--mut)">Ver datos de ejemplo →</a></div></div>';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
