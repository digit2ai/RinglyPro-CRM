/* =====================================================
   Salud Financiera — panel de instrumentos estilo Garmin G1000 (Cessna PFD).
   Every figure comes from /salud (s.pfd + the summary); this file only maps
   numbers to pixels and words. Owner request 2026-10-25: replace the chart and
   the score breakdown with one instrument that gives insights at a glance.

   Mapping (cockpit -> money):
     Altímetro (derecha) ...... SALDO hoy, con marcas del punto más bajo y del cero
     Variómetro (VSI) ......... cambio del saldo en 7 días (sube / baja)
     Cinta de velocidad (izq) . FLUJO neto de los próximos 30 días (entra - sale)
     Horizonte artificial ..... pitch = tendencia a 30 días; alabeo = desvío contra el plan
     HSI / compás ............. rumbo = salud (%); curso magenta = meta 100%
     Mapa (abajo izq) ......... proyección de los próximos meses, hoy, mínimo y zona de cuidado
     Barra superior ........... próximo pago, mínimo, saldo final; anuncios de estado
     Teclas (abajo) ........... HOY · MÍNIMO · TRIMESTRE · PAGOS · RITMO · ALERTAS
   ===================================================== */
(function () {
  'use strict';
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function fc(iso) { var p = iso.split('-'); return Number(p[2]) + ' ' + MESES[Number(p[1]) - 1].toUpperCase(); }
  function fl(iso) { var p = iso.split('-'); return Number(p[2]) + ' de ' + MESES_L[Number(p[1]) - 1]; }
  function k(v) { var a = Math.abs(v); var t = a >= 10000 ? Math.round(a / 1000) + 'K' : a >= 1000 ? (a / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(Math.round(a)); return (v < 0 ? '-' : '') + t; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function nice(range) { var c = [50, 100, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000]; for (var i = 0; i < c.length; i++) if (range / c[i] <= 6) return c[i]; return 50000; }
  var C = { mag: '#ff4fd8', cyan: '#3ee8ff', green: '#2ee86b', amber: '#ffcc00', red: '#ff3b3b', white: '#ffffff', sky1: '#1c5fd6', sky2: '#4f8ff0', gnd1: '#8a5a2b', gnd2: '#5b3a17' };
  var state = { tecla: 'RESUMEN', minSel: '' };

  // ------------------------------------------------------------ RESUMEN: what used to be the KPI cards, as G1000 data boxes
  function tile(label, value, sub, color, extra) {
    return '<div style="border:1px solid #3a4250;border-radius:6px;padding:8px 10px;min-width:0;background:#05070a">' +
      '<div style="color:#9aa4b2;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;display:flex;justify-content:space-between;gap:6px;align-items:center;flex-wrap:wrap">' + label + (extra || '') + '</div>' +
      '<div style="color:' + (color || C.cyan) + ';font-size:22px;font-weight:700;margin-top:2px">' + value + '</div>' +
      (sub ? '<div style="color:#c9d2de;font-size:12.5px;line-height:1.35;margin-top:3px">' + sub + '</div>' : '') + '</div>';
  }
  function sinMes(c) {
    return String(c || '').replace(/\s*[-\u2013\u2014]?\s*\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b(\s+\d{4})?/ig, '').replace(/\s*[-\u2013\u2014]\s*$/, '').trim() || String(c || '');
  }
  function resumen(s) {
    var p = s.pfd, cm = s.cierre_mes_actual, t = s.tendencia || { malas: [], buenas: [], sube: true }, h = [];
    h.push(tile('Saldo hoy', esc(p.saldo_hoy.t), esc(fl(s.hoy)), '#fff'));
    if (cm) h.push(tile('Cierre de ' + esc(cm.nombre.split(' ')[0]), esc(cm.saldo), cm.saldo === cm.saldo_plan ? 'Igual al plan' : 'Plan: ' + esc(cm.saldo_plan), cm.saldo.charAt(0) === '-' ? C.red : '#fff'));
    // minimum with its month/year selector
    var m = state.minSel ? (s.minimos_mes || []).filter(function (x) { return x.mes === state.minSel; })[0] : null;
    var mv = m ? m.minimo : p.saldo_min.t;
    var msub = m ? esc(fl(m.fecha)) + (m.negativo ? ' · queda en negativo' : '')
      : (s.zona ? 'Del ' + esc(fl(s.zona.desde)) + ' al ' + esc(fl(s.zona.hasta)) + (s.zona.bajo_colchon ? ' · mejor no gastar' : '') : esc(fl(p.fecha_min)));
    var sel = '<select data-minsel aria-label="Mes y año" style="font-size:16px;background:#111;color:#fff;border:1px solid #3a4250;border-radius:4px;padding:2px 4px;max-width:100%"><option value="">Todo el plan</option>' +
      (s.minimos_mes || []).map(function (x) { return '<option value="' + x.mes + '"' + (x.mes === state.minSel ? ' selected' : '') + '>' + esc(x.nombre.charAt(0).toUpperCase() + x.nombre.slice(1)) + '</option>'; }).join('') + '</select>';
    h.push(tile('Saldo mínimo proyectado', esc(mv), msub, mv.charAt(0) === '-' ? C.red : C.amber, sel));
    var g = s.gasto_personal_mes;
    if (g) h.push(tile('Gasto personal de ' + esc(g.nombre), esc(g.gastado), g.movimientos ? 'Bajó tu mínimo ' + esc(g.baja_el_minimo) + ': sin estos gastos sería ' + esc(g.saldo_min_sin_gastos) : 'Sin gastos personales registrados este mes', '#fff'));
    var neg = s.dias_negativos && s.dias_negativos.length;
    h.push(tile('Salud financiera', Math.round(s.score) + '% <span style="font-size:14px">' + esc(s.frase) + '</span>',
      neg ? 'Limitada a 49%: tu saldo queda en negativo el ' + esc(fl(s.dias_negativos[0].fecha)) + ' (' + esc(s.dias_negativos[0].saldo) + ').' : 'Ningún día queda en negativo.',
      s.color === 'verde' ? C.green : C.amber));
    var neural = (t.sube ? t.buenas.slice(0, 2) : t.malas).map(function (x) { return esc(x.texto.charAt(0).toUpperCase() + x.texto.slice(1)) + '.'; }).join('<br>') +
      ((s.obligaciones_descubiertas || []).length ? '<br><span style="color:#fff">No quedan cubiertos:</span> ' + s.obligaciones_descubiertas.map(function (o) { return esc(o.concepto) + ' (' + esc(fl(o.fecha)) + ', ' + esc(o.monto) + ' → ' + esc(o.saldo) + ')'; }).join('; ') : '');
    h.push(tile('Neural Intelligence', t.sube ? '▲ Sube' : '▼ Baja', neural, t.sube ? C.green : C.amber));
    return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px">' + h.join('') + '</div>';
  }

  // ------------------------------------------------------------ insights per softkey
  function insights(s, tecla) {
    var p = s.pfd, out = [], t = s.tendencia || { malas: [], buenas: [], sube: true };
    function ln(color, txt) { out.push({ c: color, t: txt }); }
    if (tecla === 'HOY') {
      ln(C.white, 'Saldo hoy ' + p.saldo_hoy.t + ' · salud ' + Math.round(s.score) + '% (' + s.frase + ').');
      ln(C.cyan, 'En 7 días tendrás ' + p.saldo_7d.t + ' (' + (p.cambio_7d.v >= 0 ? 'sube ' : 'baja ') + p.cambio_7d.t.replace('-', '') + ').');
      ln(C.white, 'Gasto personal de este mes: ' + p.gasto_mes.t + '.');
    } else if (tecla === 'MÍNIMO') {
      ln(p.saldo_min.v < 0 ? C.red : C.amber, 'Punto más bajo ' + p.saldo_min.t + ' el ' + fl(p.fecha_min) + '.');
      if (s.zona) ln(C.amber, (s.zona.bajo_colchon ? 'Zona de cuidado' : 'Tramo más justo') + ': del ' + fl(s.zona.desde) + ' al ' + fl(s.zona.hasta) + (s.zona.bajo_colchon ? ' — mejor no gastar.' : '.'));
      if (s.dias_negativos && s.dias_negativos.length) ln(C.red, 'Días en negativo: ' + s.dias_negativos.map(function (d) { return fl(d.fecha) + ' (' + d.saldo + ')'; }).join(', ') + '.');
      else ln(C.green, 'Ningún día queda en negativo.');
    } else if (tecla === 'TRIMESTRE') {
      (s.cierres_trimestre || []).forEach(function (c) { ln(c.saldo.charAt(0) === '-' ? C.red : C.white, 'Cierre de ' + c.nombre + ': ' + c.saldo + (c.saldo !== c.saldo_plan ? ' (plan ' + c.saldo_plan + ')' : '')); });
      ln(C.cyan, 'Saldo final del plan: ' + p.saldo_final.t + ' (' + (p.desvio_plan.v >= 0 ? 'arriba ' : 'abajo ') + 'del plan ' + p.desvio_plan.t.replace('-', '') + ').');
    } else if (tecla === 'PAGOS') {
      var ob = s.obligaciones || { total: 0, cubiertas: 0 };
      ln(ob.cubiertas === ob.total ? C.green : C.amber, ob.cubiertas + ' de ' + ob.total + ' pagos fijos quedan cubiertos' + (ob.hasta ? ' hasta el ' + fl(ob.hasta) : '') + '.');
      (s.obligaciones_descubiertas || []).forEach(function (o) { ln(C.red, o.concepto + ' · ' + fl(o.fecha) + ' · ' + o.monto + ' → quedas en ' + o.saldo); });
      if (p.proximo_pago) ln(C.mag, 'Próximo pago: ' + p.proximo_pago.concepto + ' ' + p.proximo_pago.monto + ' en ' + p.proximo_pago.dias + ' días (' + (p.proximo_pago.cubierto ? 'cubierto' : 'NO cubierto') + ').');
    } else if (tecla === 'RITMO') {
      ln(C.white, 'Próximos 30 días: entran ' + p.entra_30.t + ', salen ' + p.sale_30.t + '.');
      ln(p.flujo_30.v >= 0 ? C.green : C.red, 'Flujo neto ' + p.flujo_30.t + ': tu saldo ' + (p.flujo_30.v >= 0 ? 'sube' : 'baja') + ' a ' + p.saldo_30d.t + ' en 30 días.');
      ln(C.cyan, 'En 7 días: ' + p.saldo_7d.t + '.');
    } else {
      if (t.malas.length) t.malas.forEach(function (m) { ln(C.amber, m.texto.charAt(0).toUpperCase() + m.texto.slice(1) + '.'); });
      else ln(C.green, 'Sin alertas: ' + t.buenas.map(function (b) { return b.texto; }).join('; ') + '.');
    }
    return out;
  }

  // ------------------------------------------------------------ the instrument
  window.drawSfPfd = function (el, s) {
    if (!el || !s || !s.pfd) return;
    var p = s.pfd, W = 1000, H = 760, cx = 500, cy = 300;
    var ppd = 7; // pixels per degree of pitch
    var base = Math.max(Math.abs(p.saldo_hoy.v), 1000);
    var pitch = clamp(p.cambio_30d.v / base * 40, -15, 15);
    var bank = clamp(p.desvio_plan.v / Math.max(Math.abs(p.saldo_final_plan.v), 1000) * 60, -30, 30);
    var sube = s.tendencia ? s.tendencia.sube : true;
    var o = [];
    o.push('<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;border-radius:10px;font-family:Arial Narrow,Helvetica Neue,Arial,sans-serif" role="img" aria-label="Panel de instrumentos de tus finanzas">');
    o.push('<defs><clipPath id="pfdClip"><rect x="0" y="64" width="' + W + '" height="636"/></clipPath>' +
      '<linearGradient id="pfdSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C.sky1 + '"/><stop offset="1" stop-color="' + C.sky2 + '"/></linearGradient>' +
      '<linearGradient id="pfdGnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C.gnd1 + '"/><stop offset="1" stop-color="' + C.gnd2 + '"/></linearGradient></defs>');
    o.push('<rect width="' + W + '" height="' + H + '" fill="#000"/>');

    // attitude (sky / ground) — bank about the center, pitch as a vertical shift
    o.push('<g clip-path="url(#pfdClip)"><g transform="rotate(' + (-bank).toFixed(1) + ' ' + cx + ' ' + cy + ') translate(0 ' + (pitch * ppd).toFixed(1) + ')">');
    o.push('<rect x="-600" y="-900" width="2200" height="' + (900 + cy) + '" fill="url(#pfdSky)"/><rect x="-600" y="' + cy + '" width="2200" height="1200" fill="url(#pfdGnd)"/>');
    o.push('<line x1="-600" y1="' + cy + '" x2="1600" y2="' + cy + '" stroke="#fff" stroke-width="2"/>');
    [-20, -15, -10, -5, 5, 10, 15, 20].forEach(function (d) {
      var y = cy - d * ppd, half = d % 10 === 0 ? 70 : 32;
      o.push('<line x1="' + (cx - half) + '" y1="' + y + '" x2="' + (cx + half) + '" y2="' + y + '" stroke="#fff" stroke-width="2"/>');
      if (d % 10 === 0) o.push('<text x="' + (cx - half - 26) + '" y="' + (y + 7) + '" fill="#fff" font-size="20">' + Math.abs(d) + '</text><text x="' + (cx + half + 6) + '" y="' + (y + 7) + '" fill="#fff" font-size="20">' + Math.abs(d) + '</text>');
    });
    o.push('</g>');
    // roll scale
    o.push('<path d="M ' + (cx - 160) + ' ' + (cy - 105) + ' A 192 192 0 0 1 ' + (cx + 160) + ' ' + (cy - 105) + '" fill="none" stroke="#fff" stroke-width="2.5"/>');
    [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60].forEach(function (a) {
      var r1 = 192, r2 = Math.abs(a) % 30 === 0 ? 214 : 204, rad = (a - 90) * Math.PI / 180;
      o.push('<line x1="' + (cx + r1 * Math.cos(rad)) + '" y1="' + (cy + r1 * Math.sin(rad)) + '" x2="' + (cx + r2 * Math.cos(rad)) + '" y2="' + (cy + r2 * Math.sin(rad)) + '" stroke="#fff" stroke-width="2.5"/>');
    });
    o.push('<path d="M ' + cx + ' ' + (cy - 194) + ' l -12 -20 h 24 z" fill="#fff"/>');
    o.push('<g transform="rotate(' + (-bank).toFixed(1) + ' ' + cx + ' ' + cy + ')"><path d="M ' + cx + ' ' + (cy - 188) + ' l -11 18 h 22 z" fill="#fff"/></g>');
    // aircraft symbol (fixed, yellow)
    o.push('<path d="M ' + (cx - 95) + ' ' + (cy + 28) + ' L ' + cx + ' ' + (cy - 4) + ' L ' + (cx + 95) + ' ' + (cy + 28) + ' L ' + cx + ' ' + (cy + 12) + ' Z" fill="#ffd400" stroke="#6b5a00" stroke-width="1.5"/>');
    o.push('<rect x="' + (cx - 220) + '" y="' + (cy - 5) + '" width="56" height="10" fill="#ffd400" stroke="#6b5a00"/><rect x="' + (cx + 164) + '" y="' + (cy - 5) + '" width="56" height="10" fill="#ffd400" stroke="#6b5a00"/>');
    o.push('</g>');

    // ---------------- left tape: FLUJO 30D ----------------
    (function () {
      var x = 120, w = 104, y0 = 112, h = 380, mid = y0 + h / 2, v = p.flujo_30.v;
      var step = nice(Math.max(Math.abs(v), 1000) * 1.5 / 2), pps = 52;
      o.push('<rect x="' + x + '" y="' + y0 + '" width="' + w + '" height="' + h + '" fill="rgba(0,0,0,.38)"/>');
      o.push('<rect x="' + x + '" y="' + (y0 - 30) + '" width="' + w + '" height="30" fill="#000"/><text x="' + (x + 6) + '" y="' + (y0 - 9) + '" fill="#fff" font-size="17">FLUJO <tspan font-size="21" font-weight="700">30D</tspan></text>');
      o.push('<svg x="' + x + '" y="' + y0 + '" width="' + w + '" height="' + h + '" overflow="hidden">');
      var first = Math.floor((v - (h / 2) / pps * step) / step) * step;
      for (var t = first; t <= v + (h / 2) / pps * step + step; t += step) {
        var yy = h / 2 - (t - v) / step * pps;
        o.push('<line x1="' + (w - 22) + '" y1="' + yy + '" x2="' + (w - 8) + '" y2="' + yy + '" stroke="#fff" stroke-width="2"/><text x="' + (w - 28) + '" y="' + (yy + 8) + '" fill="#fff" font-size="22" text-anchor="end">' + k(t) + '</text>');
      }
      // color band: green above zero, red below
      var y0z = h / 2 - (0 - v) / step * pps;
      o.push('<rect x="' + (w - 7) + '" y="-1000" width="7" height="' + (1000 + y0z) + '" fill="' + C.green + '"/><rect x="' + (w - 7) + '" y="' + y0z + '" width="7" height="1000" fill="' + C.red + '"/>');
      o.push('</svg>');
      o.push('<path d="M ' + (x - 8) + ' ' + (mid - 26) + ' h 98 l 14 26 l -14 26 h -98 z" fill="#000" stroke="#fff" stroke-width="2"/>');
      o.push('<text x="' + (x + 80) + '" y="' + (mid + 12) + '" fill="' + (v >= 0 ? '#fff' : C.red) + '" font-size="34" font-weight="700" text-anchor="end">' + k(v) + '</text>');
      o.push('<rect x="' + x + '" y="' + (y0 + h) + '" width="' + w + '" height="34" fill="#000"/><text x="' + (x + 6) + '" y="' + (y0 + h + 24) + '" fill="#fff" font-size="15">GASTO MES <tspan font-size="19" font-weight="700" fill="' + C.cyan + '">' + esc(k(p.gasto_mes.v)) + '</tspan></text>');
    })();

    // ---------------- right tape: SALDO (altimeter) + VSI ----------------
    (function () {
      var x = 760, w = 112, y0 = 112, h = 380, mid = y0 + h / 2, v = p.saldo_hoy.v;
      var span = Math.max(Math.abs(v - p.saldo_min.v), Math.abs(v), 1000);
      var step = nice(span / 2.2), pps = 52;
      o.push('<rect x="' + x + '" y="' + y0 + '" width="' + w + '" height="' + h + '" fill="rgba(0,0,0,.38)"/>');
      o.push('<rect x="' + x + '" y="' + (y0 - 30) + '" width="' + w + '" height="30" fill="#000"/><text x="' + (x + 6) + '" y="' + (y0 - 9) + '" fill="#fff" font-size="17">SALDO <tspan font-size="21" font-weight="700">' + esc(k(v)) + '</tspan></text>');
      o.push('<svg x="' + x + '" y="' + y0 + '" width="' + w + '" height="' + h + '" overflow="hidden">');
      var first = Math.floor((v - (h / 2) / pps * step) / step) * step;
      for (var t = first; t <= v + (h / 2) / pps * step + step; t += step) {
        var yy = h / 2 - (t - v) / step * pps;
        o.push('<line x1="0" y1="' + yy + '" x2="16" y2="' + yy + '" stroke="#fff" stroke-width="2"/><text x="22" y="' + (yy + 8) + '" fill="' + (t < 0 ? C.red : '#fff') + '" font-size="22">' + k(t) + '</text>');
      }
      var yZero = h / 2 - (0 - v) / step * pps;
      o.push('<line x1="0" y1="' + yZero + '" x2="' + w + '" y2="' + yZero + '" stroke="' + C.red + '" stroke-width="2.5" stroke-dasharray="6 4"/>');
      o.push('</svg>');
      // MIN bug (magenta) — clamped to the tape edge with its value when off scale
      var ym = mid - (p.saldo_min.v - v) / step * pps, off = ym > y0 + h - 8;
      ym = clamp(ym, y0 + 8, y0 + h - 8);
      o.push('<path d="M ' + (x - 2) + ' ' + ym + ' l -14 -10 v 20 z" fill="' + C.mag + '"/>');
      // label: beside the bug while it clears the HSI boxes, otherwise inside the tape bottom
      if (!off && ym < 430) o.push('<text x="' + (x - 18) + '" y="' + (ym + 5) + '" fill="' + C.mag + '" font-size="15" text-anchor="end">MÍN ' + esc(k(p.saldo_min.v)) + '</text>');
      else o.push('<rect x="' + (x + 2) + '" y="' + (y0 + h - 26) + '" width="' + (w - 4) + '" height="22" fill="#000"/><text x="' + (x + w / 2) + '" y="' + (y0 + h - 9) + '" fill="' + C.mag + '" font-size="15" text-anchor="middle">MÍN ' + esc(k(p.saldo_min.v)) + (off ? ' ▼' : '') + '</text>');
      o.push('<path d="M ' + (x - 14) + ' ' + mid + ' l 14 -26 h 104 v 52 h -104 z" fill="#000" stroke="#fff" stroke-width="2"/>');
      o.push('<text x="' + (x + 100) + '" y="' + (mid + 12) + '" fill="' + (v >= 0 ? '#fff' : C.red) + '" font-size="32" font-weight="700" text-anchor="end">' + esc(k(v)) + '</text>');
      // VSI: change in 7 days
      var vx = x + w + 6, vh = 300, vmid = mid, c7 = p.cambio_7d.v, rng = Math.max(Math.abs(c7), 1000);
      o.push('<rect x="' + vx + '" y="' + (vmid - vh / 2) + '" width="44" height="' + vh + '" fill="rgba(0,0,0,.38)"/>');
      [-2, -1, 1, 2].forEach(function (i) { var yy = vmid - i * vh / 5; o.push('<line x1="' + vx + '" y1="' + yy + '" x2="' + (vx + 10) + '" y2="' + yy + '" stroke="#fff" stroke-width="2"/>'); });
      var yv = vmid - clamp(c7 / rng, -1, 1) * vh / 2.4;
      o.push('<path d="M ' + (vx + 6) + ' ' + yv + ' l 14 -11 h 22 v 22 h -22 z" fill="#000" stroke="' + (c7 >= 0 ? C.green : C.amber) + '" stroke-width="2"/>');
      o.push('<text x="' + (vx + 22) + '" y="' + (vmid - vh / 2 - 6) + '" fill="#fff" font-size="13" text-anchor="middle">7D</text><text x="' + (vx + 22) + '" y="' + (vmid + vh / 2 + 18) + '" fill="' + (c7 >= 0 ? C.green : C.amber) + '" font-size="15" text-anchor="middle">' + (c7 >= 0 ? '+' : '') + esc(k(c7)) + '</text>');
      // SALUD box (the "baro" box)
      var col = s.color === 'verde' ? C.green : C.amber;
      o.push('<rect x="' + x + '" y="' + (y0 + h) + '" width="' + w + '" height="34" fill="#000"/><text x="' + (x + 6) + '" y="' + (y0 + h + 24) + '" fill="#fff" font-size="15">SALUD <tspan font-size="21" font-weight="700" fill="' + col + '">' + Math.round(s.score) + '%</tspan></text>');
    })();

    // ---------------- HSI: heading = health, course = 100% ----------------
    (function () {
      var hx = cx, hy = 640, r = 150, hdg = clamp(s.score, 0, 100) * 3.6, crs = 360;
      o.push('<g clip-path="url(#pfdClip)">');
      o.push('<circle cx="' + hx + '" cy="' + hy + '" r="' + (r + 6) + '" fill="rgba(0,0,0,.55)"/>');
      o.push('<g transform="rotate(' + (-hdg).toFixed(1) + ' ' + hx + ' ' + hy + ')">');
      for (var a = 0; a < 360; a += 5) {
        var rad = (a - 90) * Math.PI / 180, len = a % 30 === 0 ? 20 : a % 10 === 0 ? 13 : 8;
        o.push('<line x1="' + (hx + r * Math.cos(rad)) + '" y1="' + (hy + r * Math.sin(rad)) + '" x2="' + (hx + (r - len) * Math.cos(rad)) + '" y2="' + (hy + (r - len) * Math.sin(rad)) + '" stroke="#fff" stroke-width="2"/>');
        if (a % 30 === 0) o.push('<text x="' + (hx + (r - 38) * Math.cos(rad)) + '" y="' + (hy + (r - 38) * Math.sin(rad) + 7) + '" fill="#fff" font-size="19" text-anchor="middle" transform="rotate(' + a + ' ' + (hx + (r - 38) * Math.cos(rad)) + ' ' + (hy + (r - 38) * Math.sin(rad)) + ')">' + Math.round(a / 3.6) + '</text>');
      }
      // course needle (magenta) to the 100% target, CDI deflection = deviation vs plan
      var dev = clamp(p.desvio_plan.v / Math.max(Math.abs(p.saldo_final_plan.v), 1000) * 70, -60, 60);
      o.push('<g transform="rotate(' + crs + ' ' + hx + ' ' + hy + ')"><line x1="' + hx + '" y1="' + (hy - r + 22) + '" x2="' + hx + '" y2="' + (hy - 52) + '" stroke="' + C.mag + '" stroke-width="5"/><path d="M ' + hx + ' ' + (hy - r + 10) + ' l -12 20 h 24 z" fill="' + C.mag + '"/>' +
        '<line x1="' + (hx + dev) + '" y1="' + (hy - 46) + '" x2="' + (hx + dev) + '" y2="' + (hy + 46) + '" stroke="' + C.mag + '" stroke-width="5"/>' +
        '<line x1="' + hx + '" y1="' + (hy + 52) + '" x2="' + hx + '" y2="' + (hy + r - 22) + '" stroke="' + C.mag + '" stroke-width="5"/></g>');
      o.push('</g>');
      o.push('<path d="M ' + hx + ' ' + (hy - 30) + ' l -8 22 h -26 v 8 h 26 l 4 18 h -10 v 6 h 28 v -6 h -10 l 4 -18 h 26 v -8 h -26 z" fill="#fff"/>');
      o.push('<rect x="' + (hx - 44) + '" y="' + (hy - r - 44) + '" width="88" height="36" fill="#000" stroke="#fff" stroke-width="2"/><text x="' + hx + '" y="' + (hy - r - 18) + '" fill="#fff" font-size="26" font-weight="700" text-anchor="middle">' + Math.round(s.score) + '%</text>');
      o.push('</g>');
      o.push('<rect x="' + (hx - 230) + '" y="' + (hy - r - 32) + '" width="130" height="30" fill="#000"/><text x="' + (hx - 222) + '" y="' + (hy - r - 10) + '" fill="#fff" font-size="16">PLAN <tspan fill="' + C.cyan + '" font-size="20" font-weight="700">' + (p.desvio_plan.v >= 0 ? '+' : '') + esc(k(p.desvio_plan.v)) + '</tspan></text>');
      o.push('<rect x="' + (hx + 100) + '" y="' + (hy - r - 32) + '" width="130" height="30" fill="#000"/><text x="' + (hx + 108) + '" y="' + (hy - r - 10) + '" fill="#fff" font-size="16">META <tspan fill="' + C.mag + '" font-size="20" font-weight="700">100%</tspan></text>');
    })();

    // ---------------- inset map: projection with today, min and the care window ----------------
    (function () {
      var mx = 18, my = 540, mw = 262, mh = 154;
      var pts = (s.serie && s.serie.proyeccion || []).filter(function (d) { return d.fecha >= s.hoy; });
      o.push('<rect x="' + mx + '" y="' + my + '" width="' + mw + '" height="' + mh + '" fill="#0b2a18" stroke="#fff" stroke-width="1.5"/>');
      if (pts.length > 1) {
        var t0 = Date.parse(s.hoy), t1 = Date.parse(pts[pts.length - 1].fecha); if (t1 === t0) t1 = t0 + 864e5;
        var vals = pts.map(function (d) { return d.saldo; }).concat([0, p.saldo_hoy.v]);
        var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
        var X = function (iso) { return mx + 10 + (Date.parse(iso) - t0) / (t1 - t0) * (mw - 20); };
        var Y = function (v) { return my + 14 + (hi - v) / ((hi - lo) || 1) * (mh - 34); };
        if (s.zona) o.push('<rect x="' + X(s.zona.desde < s.hoy ? s.hoy : s.zona.desde) + '" y="' + (my + 1) + '" width="' + Math.max(3, X(s.zona.hasta) - X(s.zona.desde < s.hoy ? s.hoy : s.zona.desde)) + '" height="' + (mh - 2) + '" fill="rgba(255,204,0,.18)"/>');
        if (lo < 0) o.push('<line x1="' + (mx + 4) + '" x2="' + (mx + mw - 4) + '" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="' + C.red + '" stroke-dasharray="4 3"/>');
        var d = 'M ' + X(s.hoy).toFixed(1) + ',' + Y(p.saldo_hoy.v).toFixed(1);
        pts.forEach(function (q) { d += 'H' + X(q.fecha).toFixed(1) + 'V' + Y(q.saldo).toFixed(1); });
        o.push('<path d="' + d + '" fill="none" stroke="' + C.mag + '" stroke-width="3"/>');
        o.push('<circle cx="' + X(p.fecha_min) + '" cy="' + Y(p.saldo_min.v) + '" r="5" fill="' + (p.saldo_min.v < 0 ? C.red : C.amber) + '"/><text x="' + clamp(X(p.fecha_min) + 7, mx + 4, mx + mw - 70) + '" y="' + (Y(p.saldo_min.v) + 18 > my + mh - 4 ? Y(p.saldo_min.v) - 8 : Y(p.saldo_min.v) + 18) + '" fill="#fff" font-size="13">MÍN ' + esc(fc(p.fecha_min)) + '</text>');
        // aircraft at today
        var ax = X(s.hoy), ay = Y(p.saldo_hoy.v);
        o.push('<path transform="translate(' + ax + ' ' + ay + ') rotate(90)" d="M 0 -11 l 3 8 h 9 v 3 h -9 l -1 6 h 4 v 3 h -12 v -3 h 4 l -1 -6 h -9 v -3 h 9 z" fill="#fff"/>');
      }
      o.push('<text x="' + (mx + 6) + '" y="' + (my + mh - 6) + '" fill="#fff" font-size="12">PROYECCIÓN</text>');
    })();

    // ---------------- top bar ----------------
    (function () {
      var prox = p.proximo_pago;
      o.push('<rect x="0" y="0" width="' + W + '" height="64" fill="#000"/><line x1="0" y1="64" x2="' + W + '" y2="64" stroke="#555"/>');
      o.push('<text x="14" y="26" fill="#fff" font-size="17">HOY <tspan fill="' + C.cyan + '" font-size="22" font-weight="700">' + esc(p.saldo_hoy.t) + '</tspan></text>');
      o.push('<text x="14" y="54" fill="#fff" font-size="17">7D  <tspan fill="' + C.cyan + '" font-size="22" font-weight="700">' + esc(p.saldo_7d.t) + '</tspan></text>');
      o.push('<line x1="250" y1="6" x2="250" y2="58" stroke="#555"/><line x1="720" y1="6" x2="720" y2="58" stroke="#555"/>');
      // annunciators
      var a1 = sube ? ['PLAN OK', C.green] : ['ATENCIÓN', C.amber];
      var a2 = (s.obligaciones_descubiertas || []).length ? ['PAGO SIN CUBRIR', C.red] : ['PAGOS OK', C.green];
      var a3 = (s.dias_negativos || []).length ? ['NEGATIVO ' + fc(s.dias_negativos[0].fecha), C.red] : ['SIN NEGATIVOS', C.green];
      o.push('<text x="270" y="26" fill="' + a1[1] + '" font-size="20" font-weight="700">' + esc(a1[0]) + '</text>');
      o.push('<text x="430" y="26" fill="' + a2[1] + '" font-size="20" font-weight="700">' + esc(a2[0]) + '</text>');
      o.push('<text x="270" y="54" fill="' + a3[1] + '" font-size="20" font-weight="700">' + esc(a3[0]) + '</text>');
      if (prox) o.push('<text x="470" y="54" fill="' + C.mag + '" font-size="17" font-weight="700">' + esc(sinMes(prox.concepto).toUpperCase().slice(0, 12)) + ' <tspan fill="#fff" font-size="14">EN</tspan> ' + prox.dias + '<tspan font-size="14">D</tspan> <tspan fill="#fff">' + esc(String(prox.monto).replace(/\.00$/, '')) + '</tspan></text>');
      o.push('<text x="986" y="26" fill="#fff" font-size="17" text-anchor="end">MÍN <tspan fill="' + (p.saldo_min.v < 0 ? C.red : C.cyan) + '" font-size="22" font-weight="700">' + esc(p.saldo_min.t) + '</tspan> ' + esc(fc(p.fecha_min)) + '</text>');
      o.push('<text x="986" y="54" fill="#fff" font-size="17" text-anchor="end">FINAL <tspan fill="' + C.cyan + '" font-size="22" font-weight="700">' + esc(p.saldo_final.t) + '</tspan></text>');
    })();

    // ---------------- softkeys ----------------
    var keys = ['RESUMEN', 'HOY', 'MÍNIMO', 'TRIMESTRE', 'PAGOS', 'RITMO', 'ALERTAS'];
    o.push('<rect x="0" y="700" width="' + W + '" height="60" fill="#000"/>');
    keys.forEach(function (kk, i) {
      var kx = 38 + i * 132, on = state.tecla === kk;
      o.push('<g data-tecla="' + kk + '" style="cursor:pointer"><rect x="' + kx + '" y="704" width="128" height="52" fill="' + (on ? '#2b3a55' : '#000') + '"/>' +
        '<line x1="' + kx + '" y1="708" x2="' + kx + '" y2="752" stroke="#666"/><text x="' + (kx + 64) + '" y="738" fill="' + (on ? C.cyan : '#fff') + '" font-size="20" text-anchor="middle">' + kk + '</text></g>');
    });
    o.push('</svg>');

    o.push('<div style="background:#000;border-radius:10px;margin-top:8px;padding:12px 14px;font-family:Arial Narrow,Helvetica Neue,Arial,sans-serif;font-size:15px;line-height:1.5">' +
      '<div style="color:#9aa4b2;font-size:12px;letter-spacing:.08em;margin-bottom:6px">' + esc(state.tecla) + '</div>' +
      (state.tecla === 'RESUMEN' ? resumen(s) : insights(s, state.tecla).map(function (l) { return '<div style="color:' + l.c + '">' + esc(l.t) + '</div>'; }).join('')) + '</div>');
    el.innerHTML = o.join('');
    var ms = el.querySelector('[data-minsel]');
    if (ms) ms.addEventListener('change', function () { state.minSel = this.value; window.drawSfPfd(el, s); });
    el.querySelectorAll('[data-tecla]').forEach(function (g) {
      g.addEventListener('click', function () { state.tecla = g.getAttribute('data-tecla'); window.drawSfPfd(el, s); });
    });
  };
})();
