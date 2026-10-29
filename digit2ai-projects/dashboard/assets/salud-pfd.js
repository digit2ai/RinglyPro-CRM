/* =====================================================
   Salud Financiera — panel de instrumentos estilo Garmin G1000 (Cessna PFD).
   Every figure comes from /salud (s.pfd + the summary); this file only maps
   numbers to pixels and words. Owner request 2026-10-25: replace the chart and
   the score breakdown with one instrument that gives insights at a glance.

   Mapping (cockpit -> money):
     Altímetro (derecha) ...... SALDO hoy, con marcas del punto más bajo y del cero
     Variómetro (VSI) ......... cambio del saldo en 7 días (sube / baja)
     Cinta de velocidad (izq) . del día 1 a hoy: verde lo que entró, rojo lo que salió
     Horizonte artificial ..... pitch = ángulo de la curva del mapa de hoy a 30 días; sin alabeo
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
  // calendar quarters between two ISO dates: [{nombre:'Q4-26', desde, hasta}]
  function trimestres(desde, hasta) {
    var out = [], y = +desde.slice(0, 4), q = Math.floor((+desde.slice(5, 7) - 1) / 3);
    for (var n = 0; n < 40; n++) {
      var ini = y + '-' + ('0' + (q * 3 + 1)).slice(-2) + '-01';
      if (ini > hasta) break;
      var ny = q === 3 ? y + 1 : y, nq = (q + 1) % 4;
      var fin = ny + '-' + ('0' + (nq * 3 + 1)).slice(-2) + '-01';
      out.push({ nombre: 'Q' + (q + 1) + '-' + String(y).slice(2), desde: ini < desde ? desde : ini, hasta: fin > hasta ? hasta : fin });
      y = ny; q = nq;
    }
    return out;
  }
  function sinMes(c) {
    return String(c || '').replace(/\s*[-\u2013\u2014]?\s*\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b(\s+\d{4})?/ig, '').replace(/\s*[-\u2013\u2014]\s*$/, '').trim() || String(c || '');
  }
  function resumen(s) {
    var p = s.pfd, cm = s.cierre_mes_actual, t = s.tendencia || { malas: [], buenas: [], sube: true }, h = [];
    h.push(tile('Saldo hoy', esc(p.saldo_hoy.t), esc(fl(s.hoy)), '#fff'));
    // payments due today (and overdue ones): each opens "Editar movimiento"
    var ph = p.pagos_hoy || [];
    var tot = ph.reduce(function (x, r) { return x + Math.round(Math.abs(parseFloat(String(r.monto).replace(/[^0-9.\-]/g, ''))) * 100); }, 0);
    h.push(tile('Pagos de hoy', ph.length ? '-$' + (tot / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Nada que pagar',
      ph.length ? ph.map(function (r) {
        return '<a href="#" data-pago-id="' + r.id + '" style="display:block;color:' + (r.vencido ? C.red : C.cyan) + ';text-decoration:underline;padding:3px 0">' +
          esc(fc(r.fecha)) + ' · ' + esc(r.concepto) + ' · ' + esc(r.monto) + (r.vencido ? ' · vencido' : '') + '</a>';
      }).join('') : 'No tienes pagos pendientes para hoy.', ph.length ? C.red : C.green));
    // bills the bank pays by itself: when, how much, and whether the paying account covers them all
    var ap = s.autopagos;
    if (ap && ap.items && ap.items.length) {
      var okAll = ap.cubierto !== false;
      h.push(tile('Cargos automáticos', ap.cubierto == null ? esc(ap.total) : okAll ? 'Cubiertos' : 'Faltan ' + esc(ap.falta),
        (ap.cuenta ? 'Cuenta ••' + esc(ap.cuenta) + ' tiene ' + esc(ap.disponible) + '; próximos cargos ' + esc(ap.total) + '.' : 'Próximos cargos ' + esc(ap.total) + '.') +
        ap.items.map(function (i) {
          var col = i.cubierto === false ? C.red : i.dias <= 3 ? C.amber : '#c9d2de';
          var cuando = i.dias === 0 ? 'hoy' : i.dias === 1 ? 'mañana' : 'en ' + i.dias + ' días';
          return '<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;color:' + col + '"><span>' + esc(fc(i.fecha)) + ' · ' + esc(i.concepto) + ' <span style="color:#9aa4b2">(' + cuando + ')</span></span>' +
            '<span style="white-space:nowrap">' + esc(i.monto) + (i.estimado ? ' est.' : '') + ' · ' + (i.cubierto === false ? 'FALTA' : i.cubierto ? 'OK' : '') + '</span></div>';
        }).join(''), okAll ? C.green : C.red));
    }
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
    // BANK (owner 2026-10-27): same figure as the BANK readout on the left tape; tapping it filters the table below
    var bn = p.gasto_mes_n || 0;
    h.push('<div data-bank role="button" tabindex="0" style="cursor:pointer">' + tile('Gastos del banco · ' + esc(MESES_L[Number(s.hoy.slice(5, 7)) - 1]), esc(p.gasto_mes.t),
      (bn ? bn + (bn === 1 ? ' cargo' : ' cargos') + ' del banco fuera del plan, del 1 al ' + Number(s.hoy.slice(8, 10)) + '. ' : 'Ningún cargo del banco fuera del plan este mes. ') +
      '<span style="color:' + C.cyan + ';text-decoration:underline">Ver en la tabla</span>', C.cyan) + '</div>');
    return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px">' + h.join('') + '</div>';
  }

  // ------------------------------------------------------------ the STALL list: what is wrong, where to look, and "Entendido"
  function alarmasHtml(s) {
    var al = s.alarmas || [];
    if (!al.length) return '<div style="color:' + C.green + ';margin-bottom:6px">Sin anomalías en el banco ni en el plan.</div>';
    return '<div style="margin-bottom:10px">' + al.map(function (a) {
      var col = a.nivel === 'stall' ? C.red : C.amber;
      return '<div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;border-left:4px solid ' + col + ';background:#0b0d12;padding:6px 10px;margin-bottom:6px;border-radius:4px">' +
        '<div style="min-width:0"><div style="color:' + col + ';font-weight:700;letter-spacing:.04em">' + (a.nivel === 'stall' ? 'STALL · ' : 'CAUTION · ') + esc(a.titulo) + '</div>' +
        '<div style="color:#e6edf5">' + esc(a.detalle) + (a.buscar ? ' <a href="#" data-alarma-ver="' + esc(a.buscar) + '" data-alarma-tit="' + esc(a.titulo) + '" style="color:' + C.cyan + ';text-decoration:underline">Ver en la tabla</a>' : '') + '</div></div>' +
        (a.clave !== 'error' ? '<button data-alarma-ok="' + esc(a.clave) + '" style="flex:none;background:#1b2230;color:#fff;border:1px solid #3a4250;border-radius:6px;padding:6px 10px;cursor:pointer;min-height:36px">Entendido</button>' : '') + '</div>';
    }).join('') + '</div>';
  }

  // ------------------------------------------------------------ insights per softkey
  function insights(s, tecla) {
    var p = s.pfd, out = [], t = s.tendencia || { malas: [], buenas: [], sube: true };
    function ln(color, txt) { out.push({ c: color, t: txt }); }
    if (tecla === 'HOY') {
      ln(C.white, 'Saldo hoy ' + p.saldo_hoy.t + ' · salud ' + Math.round(s.score) + '% (' + s.frase + ').');
      ln(C.cyan, 'En 7 días tendrás ' + p.saldo_7d.t + ' (' + (p.cambio_7d.v >= 0 ? 'sube ' : 'baja ') + p.cambio_7d.t.replace('-', '') + ').');
      ln(C.white, 'Gastos del banco fuera del plan este mes: ' + p.gasto_mes.t + '.');
    } else if (tecla === 'MÍNIMO') {
      ln(p.saldo_min.v < 0 ? C.red : C.amber, 'Punto más bajo ' + p.saldo_min.t + ' el ' + fl(p.fecha_min) + '.');
      if (s.zona) ln(C.amber, (s.zona.bajo_colchon ? 'Zona de cuidado' : 'Tramo más justo') + ': del ' + fl(s.zona.desde) + ' al ' + fl(s.zona.hasta) + (s.zona.bajo_colchon ? ' — mejor no gastar.' : '.'));
      if (s.dias_negativos && s.dias_negativos.length) ln(C.red, 'Días en negativo: ' + s.dias_negativos.map(function (d) { return fl(d.fecha) + ' (' + d.saldo + ')'; }).join(', ') + '.');
      else ln(C.green, 'Ningún día queda en negativo.');
      var neg = p.en_negativo || [];
      if (neg.length) ln(C.red, 'Pagos afectados: ' + neg.map(function (r) { return r.concepto + ' (' + fl(r.fecha) + ', ' + r.monto + ' → quedas en ' + r.saldo + ')'; }).join('; ') + '.');
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
  // The nose follows the balance curve drawn in the map: the angle of the curve from today to 30 days out,
  // measured with the SAME scales the map uses (262x154 box, 0 and today always in range), clamped to the ladder.
  function curvePitch(s, p) {
    var pts = (s.serie && s.serie.proyeccion || []).filter(function (d) { return d.fecha >= s.hoy; });
    if (pts.length < 2) return 0;
    var t0 = Date.parse(s.hoy), t1 = Date.parse(pts[pts.length - 1].fecha); if (t1 <= t0) return 0;
    var vals = pts.map(function (d) { return d.saldo; }).concat([0, p.saldo_hoy.v]);
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var dx = 30 * 864e5 / (t1 - t0) * (262 - 20), dy = p.cambio_30d.v / ((hi - lo) || 1) * (154 - 46);
    return clamp(Math.atan2(dy, dx) * 180 / Math.PI, -20, 20);
  }
  window.drawSfPfd = function (el, s) {
    if (!el || !s || !s.pfd) return;
    var p = s.pfd, W = 1000, H = 760, cx = 500, cy = 300;
    var alarmas = s.alarmas || [], stalls = alarmas.filter(function (a) { return a.nivel === 'stall'; });
    var ppd = 7; // pixels per degree of pitch
    // owner 2026-10-25: only up or down, and the nose follows the curve in the map (no banking)
    var pitch = curvePitch(s, p);
    var bank = 0;
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
    // what the pitch means, in dollars: how much the balance changes over the next 30 days
    (function () {
      var v = p.cambio_30d.v, col = v >= 0 ? C.green : C.red;
      var txt = (v >= 0 ? '+' : '-') + '$' + Math.round(Math.abs(v)).toLocaleString('en-US');
      // owner 2026-10-26: say what comes in and goes out over the next 30 days, then the net
      var k0 = function (n) { return '$' + Math.round(Math.abs(n)).toLocaleString('en-US'); };
      o.push('<rect x="' + (cx - 150) + '" y="' + (cy + 86) + '" width="300" height="54" rx="3" fill="#000" stroke="' + col + '" stroke-width="1.5"/>');
      o.push('<text x="' + cx + '" y="' + (cy + 106) + '" fill="#fff" font-size="14" text-anchor="middle">PRÓX. 30D  <tspan fill="' + C.green + '" font-weight="700">ENTRAN ' + esc(k0(p.entra_30.v)) + '</tspan>  <tspan fill="' + C.red + '" font-weight="700">SALEN ' + esc(k0(p.sale_30.v)) + '</tspan></text>');
      o.push('<text x="' + cx + '" y="' + (cy + 130) + '" fill="#fff" font-size="15" text-anchor="middle">SALDO EN 30D <tspan fill="' + (p.saldo_30d.v < 0 ? C.red : C.green) + '" font-size="19" font-weight="700">' + esc(p.saldo_30d.t) + '</tspan></text>');
    })();
    o.push('</g>');

    // ---------------- left tape: this month so far, 1st to today: green = what came in, red = what went out ----------------
    (function () {
      var x = 120, w = 104, y0 = 112, h = 380;
      var inc = (p.ingreso_mes && p.ingreso_mes.v) || 0, out = -((p.costo_mes && p.costo_mes.v) || 0);
      var span = Math.max(inc - out, 1000), step = nice(span / 5), c = (inc + out) / 2;
      var ladder = [1, 2, 2.5, 5], e = Math.pow(10, Math.floor(Math.log10(span / 8))), li = 0;
      step = ladder[0] * e;
      while ((h - 90) / (span / step) < 40) { li++; if (li === ladder.length) { li = 0; e *= 10; } step = ladder[li] * e; }
      var pps = Math.min(60, (h - 90) / (span / step)); // both readouts always fit, labels at least 40px apart
      var Yt = function (t) { return h / 2 - (t - c) / step * pps; };
      o.push('<rect x="' + x + '" y="' + y0 + '" width="' + w + '" height="' + h + '" fill="rgba(0,0,0,.38)"/>');
      o.push('<rect x="' + x + '" y="' + (y0 - 30) + '" width="' + w + '" height="30" fill="#000"/><text x="' + (x + 6) + '" y="' + (y0 - 9) + '" fill="#fff" font-size="13">ENTRA/SALE <tspan font-size="17" font-weight="700">' + esc(MESES[Number(s.hoy.slice(5, 7)) - 1].toUpperCase()) + '</tspan></text>');
      o.push('<svg x="' + x + '" y="' + y0 + '" width="' + w + '" height="' + h + '" overflow="hidden">');
      var first = Math.floor((c - (h / 2) / pps * step) / step) * step;
      for (var t = first; t <= c + (h / 2) / pps * step + step; t += step) {
        var yy = Yt(t);
        o.push('<line x1="' + (w - 22) + '" y1="' + yy + '" x2="' + (w - 8) + '" y2="' + yy + '" stroke="#fff" stroke-width="2"/><text x="' + (w - 28) + '" y="' + (yy + 8) + '" fill="#fff" font-size="22" text-anchor="end">' + k(t) + '</text>');
      }
      var y0z = Yt(0);
      o.push('<rect x="' + (w - 7) + '" y="-1000" width="7" height="' + (1000 + y0z) + '" fill="' + C.green + '"/><rect x="' + (w - 7) + '" y="' + y0z + '" width="7" height="1000" fill="' + C.red + '"/>');
      o.push('</svg>');
      // two readouts, kept apart when the figures are close
      var yi = y0 + Yt(inc), yo = y0 + Yt(out), gap = 54;
      if (yo - yi < gap) { var mm = (yi + yo) / 2; yi = mm - gap / 2; yo = mm + gap / 2; }
      yi = clamp(yi, y0 + 24, y0 + h - 24 - gap); yo = clamp(yo, yi + gap, y0 + h - 24);
      [[yi, inc, C.green, '+'], [yo, out, C.red, '']].forEach(function (b) {
        o.push('<path d="M ' + (x - 8) + ' ' + (b[0] - 22) + ' h 98 l 12 22 l -12 22 h -98 z" fill="#000" stroke="' + b[2] + '" stroke-width="2"/>');
        o.push('<text x="' + (x + 82) + '" y="' + (b[0] + 10) + '" fill="' + b[2] + '" font-size="28" font-weight="700" text-anchor="end">' + (b[1] > 0 ? b[3] : '') + k(b[1]) + '</text>');
      });
      o.push('<rect x="' + x + '" y="' + (y0 + h) + '" width="' + w + '" height="34" fill="#000"/><text x="' + (x + 6) + '" y="' + (y0 + h + 24) + '" fill="#fff" font-size="15">BANK <tspan font-size="19" font-weight="700" fill="' + C.cyan + '">' + esc(k(p.gasto_mes.v)) + '</tspan></text>');
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
      o.push('<path d="M ' + (x - 14) + ' ' + mid + ' l 14 -26 h 104 v 52 h -104 z" fill="#000" stroke="#fff" stroke-width="2"/>');
      o.push('<text x="' + (x + 100) + '" y="' + (mid + 12) + '" fill="' + (v >= 0 ? '#fff' : C.red) + '" font-size="32" font-weight="700" text-anchor="end">' + esc(k(v)) + '</text>');
      // MÍN tape (owner 2026-10-26): same height and SAME SCALE as the SALDO tape, so the needle sits exactly where
      // the minimum falls relative to today's balance (white line = today, red dashed = $0); value inside, date below
      (function () {
        var vx = x + w + 6, vw = 116, mv = p.saldo_min.v;
        var mcol = mv < 0 ? C.red : (s.zona && s.zona.bajo_colchon ? C.amber : C.green);
        o.push('<rect x="' + vx + '" y="' + y0 + '" width="' + vw + '" height="' + h + '" fill="rgba(0,0,0,.38)"/>');
        for (var n = -4; n <= 4; n++) { var ty = mid + n * pps; if (ty > y0 + 4 && ty < y0 + h - 4) o.push('<line x1="' + vx + '" y1="' + ty + '" x2="' + (vx + 10) + '" y2="' + ty + '" stroke="#fff" stroke-width="2"/>'); }
        o.push('<line x1="' + vx + '" y1="' + mid + '" x2="' + (vx + vw) + '" y2="' + mid + '" stroke="#fff" stroke-width="2"/>');
        var yz = mid - (0 - v) / step * pps;
        if (yz > y0 && yz < y0 + h) o.push('<line x1="' + vx + '" y1="' + yz + '" x2="' + (vx + vw) + '" y2="' + yz + '" stroke="' + C.red + '" stroke-width="2.5" stroke-dasharray="6 4"/>');
        var yv = clamp(mid - (mv - v) / step * pps, y0 + 24, y0 + h - 24);
        o.push('<path d="M ' + (vx + 2) + ' ' + yv + ' l 14 -22 h ' + (vw - 18) + ' v 44 h -' + (vw - 18) + ' z" fill="#000" stroke="' + mcol + '" stroke-width="2.5"/>');
        o.push('<text x="' + (vx + 16 + (vw - 18) / 2) + '" y="' + (yv + 10) + '" fill="' + mcol + '" font-size="30" font-weight="700" text-anchor="middle">' + esc(k(mv)) + '</text>');
        o.push('<text x="' + (vx + vw / 2) + '" y="' + (y0 - 9) + '" fill="#fff" font-size="18" font-weight="700" text-anchor="middle">MÍN</text>');
        o.push('<rect x="' + vx + '" y="' + (y0 + h) + '" width="' + vw + '" height="34" fill="#000"/><text x="' + (vx + vw / 2) + '" y="' + (y0 + h + 24) + '" fill="' + mcol + '" font-size="19" font-weight="700" text-anchor="middle">' + esc(fc(p.fecha_min)) + '</text>');
      })();
      // SALUD box (the "baro" box)
      var col = s.color === 'verde' ? C.green : C.amber;
      o.push('<rect x="' + x + '" y="' + (y0 + h) + '" width="' + w + '" height="34" fill="#000"/><text x="' + (x + 6) + '" y="' + (y0 + h + 24) + '" fill="#fff" font-size="15">SALUD <tspan font-size="21" font-weight="700" fill="' + col + '">' + Math.round(s.score) + '%</tspan></text>');
    })();

    // ---------------- HSI: heading = health, course = 100% ----------------
    (function () {
      var hx = cx, hy = 640, r = 150, hdg = clamp(s.score, 0, 100) * 3.6, crs = 360;
      o.push('<g clip-path="url(#pfdClip)">');
      o.push('<circle cx="' + hx + '" cy="' + hy + '" r="' + (r + 6) + '" fill="#2a1d10"/>');
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
      // owner 2026-10-26: balance in 7 days (left) and 14 days (right), from today
      [['7D', p.saldo_7d, hx - 250], ['14D', p.saldo_14d, hx + 100]].forEach(function (b) {
        if (!b[1]) return;
        o.push('<rect x="' + b[2] + '" y="' + (hy - r - 40) + '" width="150" height="36" rx="3" fill="#000" stroke="' + (b[1].v < 0 ? C.red : C.green) + '" stroke-width="1.5"/>' +
          '<text x="' + (b[2] + 75) + '" y="' + (hy - r - 15) + '" fill="#fff" font-size="15" text-anchor="middle">' + b[0] + ' <tspan fill="' + (b[1].v < 0 ? C.red : C.green) + '" font-size="19" font-weight="700">' + esc(b[1].t) + '</tspan></text>');
      });
      o.push('</g>');
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
        var Y = function (v) { return my + 30 + (hi - v) / ((hi - lo) || 1) * (mh - 46); };
        if (s.zona) o.push('<rect x="' + X(s.zona.desde < s.hoy ? s.hoy : s.zona.desde) + '" y="' + (my + 1) + '" width="' + Math.max(3, X(s.zona.hasta) - X(s.zona.desde < s.hoy ? s.hoy : s.zona.desde)) + '" height="' + (mh - 2) + '" fill="rgba(255,204,0,.18)"/>');
        if (lo < 0) o.push('<line x1="' + (mx + 4) + '" x2="' + (mx + mw - 4) + '" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="' + C.red + '" stroke-dasharray="4 3"/>');
        // quarter lines: a dashed rule where each quarter starts, its name centred in its span
        var qs = trimestres(s.hoy, pts[pts.length - 1].fecha);
        qs.forEach(function (q, i) {
          var x0 = Math.max(X(q.desde), mx + 10), x1 = Math.min(X(q.hasta), mx + mw - 10);
          if (i > 0) o.push('<line x1="' + x0.toFixed(1) + '" x2="' + x0.toFixed(1) + '" y1="' + (my + 2) + '" y2="' + (my + mh - 2) + '" stroke="#9aa7b8" stroke-width="1" stroke-dasharray="3 3"/>');
          if (x1 - x0 > 26) o.push('<text x="' + ((x0 + x1) / 2).toFixed(1) + '" y="' + (my + 12) + '" fill="#cfd8e3" font-size="10" text-anchor="middle">' + esc(q.nombre) + '</text>');
          // closing balance of the quarter: last balance before the next quarter starts (or the plan's end)
          var ult = i === qs.length - 1, cq = p.saldo_hoy.v;
          pts.forEach(function (z) { if (z.fecha < q.hasta || (ult && z.fecha <= q.hasta)) cq = z.saldo; });
          if (x1 - x0 > 34) o.push('<text x="' + ((x0 + x1) / 2).toFixed(1) + '" y="' + (my + 24) + '" fill="' + (cq < 0 ? C.red : '#fff') + '" font-size="10" font-weight="700" text-anchor="middle">' + (cq < 0 ? '-' : '') + '$' + Math.round(Math.abs(cq)).toLocaleString('en-US') + '</text>');
        });
        // the balance itself: closing balance of each day, joined, no payment steps
        var cierre = {}; pts.forEach(function (q) { cierre[q.fecha] = q.saldo; });
        var dias = Object.keys(cierre).sort();
        var d = 'M ' + X(s.hoy).toFixed(1) + ',' + Y(p.saldo_hoy.v).toFixed(1);
        dias.forEach(function (k) { d += ' L ' + X(k).toFixed(1) + ',' + Y(cierre[k]).toFixed(1); });
        o.push('<path d="' + d + '" fill="none" stroke="' + C.mag + '" stroke-width="2.5" stroke-linejoin="round"/>');
        o.push('<circle cx="' + X(p.fecha_min) + '" cy="' + Y(p.saldo_min.v) + '" r="5" fill="' + (p.saldo_min.v < 0 ? C.red : C.amber) + '"/><text x="' + clamp(X(p.fecha_min) + 7, mx + 4, mx + mw - 70) + '" y="' + (Y(p.saldo_min.v) + 18 > my + mh - 4 ? Y(p.saldo_min.v) - 8 : Y(p.saldo_min.v) + 18) + '" fill="#fff" font-size="13">MÍN ' + esc(fc(p.fecha_min)) + '</text>');
        // aircraft at today
        var ax = X(s.hoy), ay = Y(p.saldo_hoy.v);
        o.push('<path transform="translate(' + ax + ' ' + ay + ') rotate(' + (90 - pitch).toFixed(1) + ')" d="M 0 -11 l 3 8 h 9 v 3 h -9 l -1 6 h 4 v 3 h -12 v -3 h 4 l -1 -6 h -9 v -3 h 9 z" fill="#fff"/>');
      }
    })();

    // ---------------- bottom right: payments that land below zero (only when there are any) ----------------
    (function () {
      var rows = p.en_negativo || [];
      if (!rows.length) return;
      var bx = 700, by = 540, bw = 282, bh = 154, max = 4;
      var shown = rows.slice(0, max), iMin = -1;
      rows.forEach(function (r, i) { if (r.minimo) iMin = i; });
      if (iMin >= max) shown[max - 1] = rows[iMin];
      o.push('<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" fill="#000" stroke="' + C.red + '" stroke-width="2"/>');
      o.push('<text x="' + (bx + 8) + '" y="' + (by + 17) + '" fill="' + C.red + '" font-size="13" font-weight="700">PAGOS EN NEGATIVO</text>');
      if (rows.length > shown.length) o.push('<text x="' + (bx + bw - 8) + '" y="' + (by + 17) + '" fill="#fff" font-size="12" text-anchor="end">+' + (rows.length - shown.length) + ' más</text>');
      shown.forEach(function (r, i) {
        var y = by + 40 + i * 29;
        if (r.minimo) o.push('<rect x="' + (bx + 2) + '" y="' + (y - 15) + '" width="' + (bw - 4) + '" height="27" fill="rgba(255,176,32,.16)"/>');
        o.push('<text x="' + (bx + 8) + '" y="' + y + '" fill="' + (r.minimo ? C.amber : '#fff') + '" font-size="13">' + esc(fc(r.fecha)) + '</text>');
        if (r.minimo) o.push('<text x="' + (bx + 8) + '" y="' + (y + 10) + '" fill="' + C.amber + '" font-size="8" font-weight="700">PUNTO MÁS BAJO</text>');
        o.push('<text x="' + (bx + 64) + '" y="' + y + '" fill="#fff" font-size="13">' + esc(sinMes(r.concepto).slice(0, 15)) + '</text>');
        o.push('<text x="' + (bx + 210) + '" y="' + y + '" fill="#cfd8e3" font-size="12" text-anchor="end">' + esc(String(r.monto).replace(/\.00$/, '')) + '</text>');
        o.push('<text x="' + (bx + bw - 8) + '" y="' + y + '" fill="' + C.red + '" font-size="13" font-weight="700" text-anchor="end">' + esc(r.saldo) + '</text>');
      });
    })();

    // ---------------- top bar ----------------
    (function () {
      var prox = p.proximo_pago;
      o.push('<rect x="0" y="0" width="' + W + '" height="64" fill="#000"/><line x1="0" y1="64" x2="' + W + '" y2="64" stroke="#555"/>');
      o.push('<text x="14" y="26" fill="#fff" font-size="17">HOY <tspan fill="' + C.cyan + '" font-size="22" font-weight="700">' + esc(p.saldo_hoy.t) + '</tspan></text>');
      o.push('<line x1="250" y1="6" x2="250" y2="58" stroke="#555"/><line x1="720" y1="6" x2="720" y2="58" stroke="#555"/>');
      // annunciators
      var a1 = sube ? ['PLAN OK', C.green] : ['ATENCIÓN', C.amber];
      var a2 = (s.obligaciones_descubiertas || []).length ? ['PAGO SIN CUBRIR', C.red] : ['PAGOS OK', C.green];
      var a3 = (s.dias_negativos || []).length ? ['NEGATIVO ' + fc(s.dias_negativos[0].fecha), C.red] : ['SIN NEGATIVOS', C.green];
      o.push('<text x="270" y="26" fill="' + a1[1] + '" font-size="20" font-weight="700">' + esc(a1[0]) + '</text>');
      var desc = s.obligaciones_descubiertas || [];
      if (p.saldo_min.v < 0) {
        var falta = '$' + Math.ceil(-p.saldo_min.v).toLocaleString('en-US');
        var af = desc.length ? ' <tspan fill="#fff" font-size="11" font-weight="400">AFECTA</tspan> <tspan font-size="12">' + esc(sinMes(desc[0].concepto).toUpperCase().slice(0, 15) + ' ' + fc(desc[0].fecha)) + (desc.length > 1 ? ' +' + (desc.length - 1) : '') + '</tspan>' : '';
        o.push('<text x="430" y="26" fill="' + C.red + '" font-size="18" font-weight="700"><tspan fill="#fff" font-size="12" font-weight="400">FALTAN</tspan> ' + esc(falta) + af + '</text>');
      } else o.push('<text x="430" y="26" fill="' + a2[1] + '" font-size="20" font-weight="700">' + esc(a2[0]) + '</text>');
      o.push('<text x="270" y="54" fill="' + a3[1] + '" font-size="20" font-weight="700">' + esc(a3[0]) + '</text>');
      if (prox) o.push('<text x="470" y="54" fill="' + C.mag + '" font-size="17" font-weight="700">' + esc(sinMes(prox.concepto).toUpperCase().slice(0, 12)) + (prox.dias <= 0 ? ' <tspan fill="#fff" font-size="14">HOY</tspan>' : ' <tspan fill="#fff" font-size="14">EN</tspan> ' + prox.dias + '<tspan font-size="14">D</tspan>') + ' <tspan fill="#fff">' + esc(String(prox.monto).replace(/\.00$/, '')) + '</tspan></text>');
      // MÍN under HOY (owner 2026-10-26)
      o.push('<text x="14" y="54" fill="#fff" font-size="17">MÍN <tspan fill="' + (p.saldo_min.v < 0 ? C.red : C.cyan) + '" font-size="22" font-weight="700">' + esc(p.saldo_min.t) + '</tspan> <tspan font-size="14">' + esc(fc(p.fecha_min)) + '</tspan></text>');
      // closing balance of each quarter of next year, replacing FINAL
      (p.trimestres_prox || []).forEach(function (t, i) {
        var tx = i % 2 === 0 ? 860 : 986, ty = i < 2 ? 26 : 54;
        o.push('<text x="' + tx + '" y="' + ty + '" fill="#fff" font-size="15" text-anchor="end">' + esc(t.q + ' ' + String(t.anio).slice(2)) + ' <tspan fill="' + (t.saldo.v < 0 ? C.red : C.cyan) + '" font-size="20" font-weight="700">' + esc(k(t.saldo.v)) + '</tspan></text>');
      });
    })();

    // ---------------- STALL warning (owner 2026-10-28): any bank anomaly or plan risk, impossible to miss ----------------
    if (alarmas.length) {
      var red = stalls.length > 0, col = red ? C.red : C.amber, bw2 = red ? 300 : 260, bx2 = cx - bw2 / 2, by2 = 72;
      o.push('<g data-alarmas="1" style="cursor:pointer"><rect x="' + bx2 + '" y="' + by2 + '" width="' + bw2 + '" height="54" rx="4" fill="' + (red ? C.red : '#000') + '" stroke="' + col + '" stroke-width="3">' +
        (red ? '<animate attributeName="opacity" values="1;0.45;1" dur="1s" repeatCount="indefinite"/>' : '') + '</rect>' +
        '<text x="' + cx + '" y="' + (by2 + 37) + '" fill="' + (red ? '#fff' : C.amber) + '" font-size="32" font-weight="700" text-anchor="middle" letter-spacing="4">' + (red ? 'STALL' : 'CAUTION') + '</text>' +
        '<text x="' + (bx2 + bw2 - 10) + '" y="' + (by2 + 20) + '" fill="' + (red ? '#fff' : C.amber) + '" font-size="15" font-weight="700" text-anchor="end">' + alarmas.length + '</text></g>');
      o.push('<text x="' + cx + '" y="' + (by2 + 74) + '" fill="#fff" font-size="15" text-anchor="middle" stroke="#000" stroke-width="3" paint-order="stroke">' + esc(String(alarmas[0].titulo).toUpperCase()) + (alarmas.length > 1 ? ' +' + (alarmas.length - 1) : '') + '</text>');
    }

    // ---------------- softkeys ----------------
    var keys = ['RESUMEN', 'HOY', 'MÍNIMO', 'TRIMESTRE', 'PAGOS', 'RITMO', 'ALERTAS'];
    o.push('<rect x="0" y="700" width="' + W + '" height="60" fill="#000"/>');
    keys.forEach(function (kk, i) {
      var kx = 38 + i * 132, on = state.tecla === kk;
      o.push('<g data-tecla="' + kk + '" style="cursor:pointer"><rect x="' + kx + '" y="704" width="128" height="52" fill="' + (on ? '#2b3a55' : '#000') + '"/>' +
        '<line x1="' + kx + '" y1="708" x2="' + kx + '" y2="752" stroke="#666"/><text x="' + (kx + 64) + '" y="738" fill="' + (kk === 'ALERTAS' && alarmas.length ? (stalls.length ? C.red : C.amber) : on ? C.cyan : '#fff') + '" font-size="20" text-anchor="middle"' + (kk === 'ALERTAS' && alarmas.length ? ' font-weight="700"' : '') + '>' + kk + (kk === 'ALERTAS' && alarmas.length ? ' ' + alarmas.length : '') + '</text></g>');
    });
    o.push('</svg>');

    o.push('<div style="background:#000;border-radius:10px;margin-top:8px;padding:12px 14px;font-family:Arial Narrow,Helvetica Neue,Arial,sans-serif;font-size:15px;line-height:1.5">' +
      '<div style="color:#9aa4b2;font-size:12px;letter-spacing:.08em;margin-bottom:6px">' + esc(state.tecla) + '</div>' +
      ((state.tecla === 'ALERTAS' || (state.tecla === 'RESUMEN' && stalls.length)) ? alarmasHtml(s) : '') +
      (state.tecla === 'RESUMEN' ? resumen(s) : insights(s, state.tecla).map(function (l) { return '<div style="color:' + l.c + '">' + esc(l.t) + '</div>'; }).join('')) + '</div>');
    el.innerHTML = o.join('');
    el.querySelectorAll('[data-pago-id]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var id = Number(a.getAttribute('data-pago-id')), r = (p.pagos_hoy || []).filter(function (x) { return x.id === id; })[0];
        if (window.sfOpenEdit) window.sfOpenEdit(id, r && r.row);
      });
    });
    var bk = el.querySelector('[data-bank]');
    if (bk) {
      var goBank = function () { if (window.sfFilterBank) window.sfFilterBank(p.gasto_mes_ids || [], s.hoy); };
      bk.addEventListener('click', goBank);
      bk.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goBank(); } });
    }
    var ab = el.querySelector('[data-alarmas]');
    if (ab) ab.addEventListener('click', function () { state.tecla = 'ALERTAS'; window.drawSfPfd(el, s); });
    el.querySelectorAll('[data-alarma-ok]').forEach(function (b) {
      b.addEventListener('click', function () { b.disabled = true; if (window.sfAlarmaVisto) window.sfAlarmaVisto(b.getAttribute('data-alarma-ok')); });
    });
    el.querySelectorAll('[data-alarma-ver]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); if (window.sfFilterNombres) window.sfFilterNombres([a.getAttribute('data-alarma-ver')], a.getAttribute('data-alarma-tit')); });
    });
    var ms = el.querySelector('[data-minsel]');
    if (ms) ms.addEventListener('change', function () { state.minSel = this.value; window.drawSfPfd(el, s); });
    el.querySelectorAll('[data-tecla]').forEach(function (g) {
      g.addEventListener('click', function () { state.tecla = g.getAttribute('data-tecla'); window.drawSfPfd(el, s); });
    });
  };
})();
