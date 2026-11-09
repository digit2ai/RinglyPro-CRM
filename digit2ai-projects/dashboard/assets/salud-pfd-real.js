/* =====================================================
   Salud Financiera — panel de instrumentos, MODO REAL (owner 2026-11-08):
   "if I fly this plane looking at the panel, I will crash". Only what IS:
   the bank's available balance, real movements, and what is still to be paid.
   No projection, no plan comparison. Every figure comes from /salud -> s.real.

     Altímetro (derecha) ...... SALDO del banco ahora (disponible, ya descuenta lo pendiente)
     Cinta izquierda .......... este mes, del 1 a hoy: lo que entró y lo que salió
     Horizonte ................ nariz arriba/abajo = tu saldo de hoy contra el de hace 30 días (dinero real)
     Mapa (centro) ............ el saldo real del banco hasta hoy
     Caja (abajo izq) ......... cada cuenta con su disponible y los cargos pendientes
     Caja (abajo der) ......... este mes: entró, salió, neto, gastos del banco
   Owner 2026-11-09: "Remove all related to plan ... I just want to see current." Nothing about the
   future or the plan is drawn here; the plan rows stay in the database, untouched.
   ===================================================== */
(function () {
  'use strict';
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var C = { mag: '#ff4fd8', cyan: '#3ee8ff', green: '#2ee86b', amber: '#ffcc00', red: '#ff3b3b', white: '#ffffff', sky1: '#1c5fd6', sky2: '#4f8ff0', gnd1: '#8a5a2b', gnd2: '#5b3a17' };
  var state = { tecla: 'RESUMEN' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function fc(iso) { var p = iso.split('-'); return Number(p[2]) + ' ' + MESES[Number(p[1]) - 1].toUpperCase(); }
  function fl(iso) { var p = iso.split('-'); return Number(p[2]) + ' de ' + MESES_L[Number(p[1]) - 1]; }
  function k(v) { var a = Math.abs(v); var t = a >= 10000 ? Math.round(a / 1000) + 'K' : a >= 1000 ? (a / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(Math.round(a)); return (v < 0 ? '-' : '') + t; }
  function usd(v) { return (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v)).toLocaleString('en-US'); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function nice(range) { var c = [50, 100, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000]; for (var i = 0; i < c.length; i++) if (range / c[i] <= 6) return c[i]; return 50000; }
  function hace(iso) {
    if (!iso) return 'sin dato';
    var m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    return m < 2 ? 'ahora' : m < 60 ? 'hace ' + m + ' min' : m < 1440 ? 'hace ' + Math.round(m / 60) + ' h' : 'hace ' + Math.round(m / 1440) + ' d';
  }
  function cuando(p) { return p.vencido ? 'vencido' : p.dias === 0 ? 'hoy' : p.dias === 1 ? 'mañana' : 'en ' + p.dias + ' días'; }
  function tile(label, value, sub, color) {
    return '<div style="border:1px solid #3a4250;border-radius:6px;padding:8px 10px;min-width:0;background:#05070a">' +
      '<div style="color:#9aa4b2;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase">' + label + '</div>' +
      '<div style="color:' + (color || C.cyan) + ';font-size:22px;font-weight:700;margin-top:2px">' + value + '</div>' +
      (sub ? '<div style="color:#c9d2de;font-size:12.5px;line-height:1.35;margin-top:3px">' + sub + '</div>' : '') + '</div>';
  }

  // ------------------------------------------------------------ details (what to read below the instrument)
  function porPagarHtml(r) {
    var pp = r.por_pagar || [];
    if (!pp.length) return 'Nada por pagar hasta el ' + esc(fl(r.hasta)) + '.';
    return pp.map(function (p, i) {
      var col = p.entrada ? C.green : !p.cubierto ? C.red : p.vencido || p.dias <= 3 ? C.amber : '#c9d2de';
      var name = esc(fc(p.fecha)) + ' · ' + esc(p.concepto) + ' <span style="color:#9aa4b2">(' + cuando(p) + (p.tipo === 'automatico' ? ', lo cobra el banco' : p.entrada ? ', esperado' : '') + ')</span>';
      var left = p.id ? '<a href="#" data-pp="' + i + '" style="color:' + col + ';text-decoration:underline">' + name + '</a>' : '<span>' + name + '</span>';
      return '<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;color:' + col + '">' + left +
        '<span style="white-space:nowrap">' + esc(p.monto) + (p.estimado ? ' est.' : '') + ' · queda ' + esc(p.queda.t) + '</span></div>';
    }).join('');
  }
  function quincenasHtml(r) {
    var qs = r.quincenas || [], pp = r.por_pagar || [];
    if (!qs.length) return porPagarHtml(r);
    return qs.map(function (q, n) {
      var col = q.cubierto ? C.green : C.red;
      var head = (q.dia_pago ? 'Día de pago ' + esc(fl(q.desde)) : 'Hoy') + ' → ' + esc(fl(q.hasta));
      var rowsH = pp.map(function (p, i) {
        var dentro = n === 0 ? p.fecha <= q.hasta : p.fecha >= q.desde && p.fecha <= q.hasta;
        if (!dentro) return '';
        var c = p.entrada ? C.green : !p.cubierto ? C.red : p.vencido ? C.amber : '#c9d2de';
        var name = esc(fc(p.fecha)) + ' · ' + esc(p.concepto) + (p.vencido ? ' <span style="color:#9aa4b2">(vencido)</span>' : p.tipo === 'automatico' ? ' <span style="color:#9aa4b2">(lo cobra el banco)</span>' : '');
        var left = p.id ? '<a href="#" data-pp="' + i + '" style="color:' + c + ';text-decoration:underline">' + name + '</a>' : '<span>' + name + '</span>';
        return '<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0 2px 10px;color:' + c + '">' + left + '<span style="white-space:nowrap">' + esc(p.monto) + (p.estimado ? ' est.' : '') + '</span></div>';
      }).join('');
      return '<div style="border-top:1px solid #2a3240;padding:6px 0">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;color:#fff;font-weight:700"><span>' + head + '</span><span style="color:' + col + ';white-space:nowrap">quedas ' + esc(q.queda.t) + '</span></div>' +
        '<div style="color:#9aa4b2;font-size:13px">Entra <span style="color:' + C.green + '">+' + esc(q.entra.t) + '</span> · sale <span style="color:' + C.red + '">-' + esc(q.sale.t) + '</span>' +
        (q.minimo && q.minimo.v < 0 ? ' · <span style="color:' + C.red + '">llegas a ' + esc(q.minimo.t) + '</span>' : '') + '</div>' + (rowsH || '<div style="color:#9aa4b2;padding-left:10px">Sin movimientos.</div>') + '</div>';
    }).join('');
  }
  function porEntrarHtml(r) {
    var it = (r.mes && r.mes.por_entrar_items) || [];
    return it.length ? ' Por entrar: ' + it.map(function (c) { return esc(c.monto) + ' ' + esc(c.concepto) + ' (' + esc(fl(c.fecha)) + ')'; }).join(', ') + '.' : '';
  }
  function resumen(s) {
    var r = s.real, h = [];
    var mes = MESES_L[Number(s.hoy.slice(5, 7)) - 1];
    h.push(tile('Saldo hoy · ' + (r.fuente === 'banco' ? 'banco' : 'movimientos'), esc(r.saldo.t),
      (r.cuentas || []).map(function (c) { return 'Cuenta ••' + esc(c.mask) + ': ' + esc(c.disponible.t) + ' disponible' + (c.actual && c.actual.v !== c.disponible.v ? ' (' + esc(c.actual.t) + ' sin lo pendiente)' : ''); }).join('<br>') +
      '<br>Banco actualizado ' + esc(hace(r.ultimo_sync)) + '.', r.saldo.v < 0 ? C.red : '#fff'));
    h.push(tile('Este mes · ' + esc(mes), '<span style="color:' + C.green + '">+' + esc(r.mes.entro.t) + '</span> <span style="color:' + C.red + '">-' + esc(r.mes.salio.t) + '</span>',
      'Neto ' + esc(r.mes.neto.t) + ', del 1 al ' + Number(s.hoy.slice(8, 10)) + '. Sin contar pasar dinero entre tus cuentas de BOA.', '#fff'));
    if (r.pendientes && r.pendientes.n) h.push(tile('Pendientes del banco', esc(r.pendientes.neto.t), r.pendientes.n + ' cargos aún pendientes; el saldo disponible ya los descuenta.', C.amber));
    var bn = r.gasto_banco_n || 0;
    h.push('<div data-bank role="button" tabindex="0" style="cursor:pointer">' + tile('Gastos del banco · ' + esc(mes), esc(r.gasto_banco_mes.t),
      bn + (bn === 1 ? ' cargo' : ' cargos') + ' este mes. <span style="color:' + C.cyan + ';text-decoration:underline">Ver en la tabla</span>', C.cyan) + '</div>');
    return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px">' + h.join('') + '</div>';
  }
  function alarmasHtml(s) {
    var al = s.alarmas || [];
    if (!al.length) return '<div style="color:' + C.green + ';margin-bottom:6px">Sin alertas.</div>';
    return '<div style="margin-bottom:10px">' + al.map(function (a) {
      var col = a.nivel === 'stall' ? C.red : C.amber;
      return '<div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;border-left:4px solid ' + col + ';background:#0b0d12;padding:6px 10px;margin-bottom:6px;border-radius:4px">' +
        '<div style="min-width:0"><div style="color:' + col + ';font-weight:700;letter-spacing:.04em">' + (a.nivel === 'stall' ? 'STALL · ' : 'CAUTION · ') + esc(a.titulo) + '</div>' +
        '<div style="color:#e6edf5">' + esc(a.detalle) + (a.buscar ? ' <a href="#" data-alarma-ver="' + esc(a.buscar) + '" data-alarma-tit="' + esc(a.titulo) + '" style="color:' + C.cyan + ';text-decoration:underline">Ver en la tabla</a>' : '') + '</div></div>' +
        (a.clave !== 'error' ? '<button data-alarma-ok="' + esc(a.clave) + '" style="flex:none;background:#1b2230;color:#fff;border:1px solid #3a4250;border-radius:6px;padding:6px 10px;cursor:pointer;min-height:36px">Entendido</button>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function detalle(s) {
    var r = s.real, t = state.tecla;
    if (t === 'RESUMEN') return resumen(s);
    if (t === 'BANCO') return (r.cuentas || []).map(function (c) { return '<div style="color:#fff">Cuenta ••' + esc(c.mask) + (c.rol ? ' (' + esc(c.rol) + ')' : '') + ': <b style="color:' + C.cyan + '">' + esc(c.disponible.t) + '</b> disponible' + (c.actual ? ' · ' + esc(c.actual.t) + ' sin lo pendiente' : '') + '</div>'; }).join('') +
      '<div style="color:#c9d2de">Actualizado ' + esc(hace(r.ultimo_sync)) + '.' + (r.pendientes && r.pendientes.n ? ' ' + r.pendientes.n + ' cargos pendientes (' + esc(r.pendientes.neto.t) + '), ya descontados del disponible.' : ' Sin cargos pendientes.') + '</div>';
    if (t === 'MES') return '<div style="color:' + C.green + '">Entró ' + esc(r.mes.entro.t) + '</div><div style="color:' + C.red + '">Salió ' + esc(r.mes.salio.t) + '</div><div style="color:#fff">Neto ' + esc(r.mes.neto.t) + '</div>';
    return '';
  }

  // ------------------------------------------------------------ the instrument
  window.drawSfPfdReal = function (el, s) {
    if (!el || !s || !s.real) return;
    var r = s.real, W = 1000, H = 760, cx = 500, cy = 300, v = r.saldo.v;
    var alarmas = s.alarmas || [], stalls = alarmas.filter(function (a) { return a.nivel === 'stall'; });
    var ppd = 7;
    // nose up/down = how today's balance compares with 30 days ago, from real bank money only (no future, no plan)
    var c30 = r.cambio_30d && typeof r.cambio_30d.v === 'number' ? r.cambio_30d.v : 0;
    var pitch = clamp(c30 / Math.max(Math.abs(v), 1000) * 20, -20, 20);
    var o = [];
    o.push('<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;border-radius:10px;font-family:Arial Narrow,Helvetica Neue,Arial,sans-serif" role="img" aria-label="Panel de instrumentos: saldo real ' + esc(r.saldo.t) + '">');
    o.push('<defs><clipPath id="pfrClip"><rect x="0" y="64" width="' + W + '" height="636"/></clipPath>' +
      '<linearGradient id="pfrSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C.sky1 + '"/><stop offset="1" stop-color="' + C.sky2 + '"/></linearGradient>' +
      '<linearGradient id="pfrGnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + C.gnd1 + '"/><stop offset="1" stop-color="' + C.gnd2 + '"/></linearGradient></defs>');
    o.push('<rect width="' + W + '" height="' + H + '" fill="#000"/>');
    o.push('<g clip-path="url(#pfrClip)"><g transform="translate(0 ' + (pitch * ppd).toFixed(1) + ')">');
    o.push('<rect x="-600" y="-900" width="2200" height="' + (900 + cy) + '" fill="url(#pfrSky)"/><rect x="-600" y="' + cy + '" width="2200" height="1200" fill="url(#pfrGnd)"/>');
    o.push('<line x1="-600" y1="' + cy + '" x2="1600" y2="' + cy + '" stroke="#fff" stroke-width="2"/>');
    [-20, -15, -10, -5, 5, 10, 15, 20].forEach(function (dg) {
      var y = cy - dg * ppd, half = dg % 10 === 0 ? 70 : 32;
      o.push('<line x1="' + (cx - half) + '" y1="' + y + '" x2="' + (cx + half) + '" y2="' + y + '" stroke="#fff" stroke-width="2"/>');
    });
    o.push('</g>');
    o.push('<path d="M ' + (cx - 95) + ' ' + (cy + 28) + ' L ' + cx + ' ' + (cy - 4) + ' L ' + (cx + 95) + ' ' + (cy + 28) + ' L ' + cx + ' ' + (cy + 12) + ' Z" fill="#ffd400" stroke="#6b5a00" stroke-width="1.5"/>');
    o.push('<rect x="' + (cx - 220) + '" y="' + (cy - 5) + '" width="56" height="10" fill="#ffd400" stroke="#6b5a00"/><rect x="' + (cx + 164) + '" y="' + (cy - 5) + '" width="56" height="10" fill="#ffd400" stroke="#6b5a00"/>');
    o.push('</g>');

    // ---------------- left tape: this month, income pointer on the left (green), debits pointer on the right (red) ----------------
    (function () {
      var x = 112, w = 96, y0 = 112, h = 380, inc = r.mes.entro.v, out = r.mes.salio.v, pe = 0;  // current only: nothing still to come
      var step = nice(Math.max(inc, out, 1000)), top = Math.ceil(Math.max(inc, out, 1000) * 1.1 / step) * step;
      var Y = function (val) { return y0 + h - (pe > 0 ? 44 : 16) - clamp(val / top, 0, 1) * (h - (pe > 0 ? 62 : 34)); };
      o.push('<rect x="' + x + '" y="' + y0 + '" width="' + w + '" height="' + h + '" fill="rgba(0,0,0,.45)"/>');
      o.push('<rect x="' + x + '" y="' + (y0 - 30) + '" width="' + w + '" height="30" fill="#000"/><text x="' + (x + w / 2) + '" y="' + (y0 - 9) + '" fill="#fff" font-size="15" text-anchor="middle">MES <tspan font-size="18" font-weight="700">' + esc(MESES[Number(s.hoy.slice(5, 7)) - 1].toUpperCase()) + '</tspan></text>');
      for (var t = 0; t <= top + 1e-6; t += step / 4) {
        var yy = Y(t), big = Math.abs(t / step - Math.round(t / step)) < 1e-6, tl = big ? 14 : 7;
        o.push('<line x1="' + x + '" y1="' + yy + '" x2="' + (x + tl) + '" y2="' + yy + '" stroke="#fff" stroke-width="2"/><line x1="' + (x + w - tl) + '" y1="' + yy + '" x2="' + (x + w) + '" y2="' + yy + '" stroke="#fff" stroke-width="2"/>');
        if (big) o.push('<text x="' + (x + w / 2) + '" y="' + (yy + 7) + '" fill="#fff" font-size="19" text-anchor="middle">' + esc(k(t)) + '</text>');
      }
      // green pointer on the left: what came in
      var yi = Y(inc), yo = Y(out);
      o.push('<path d="M ' + (x + 4) + ' ' + yi + ' l -14 -22 h -84 v 44 h 84 z" fill="#000" stroke="' + C.green + '" stroke-width="2.5"/>');
      o.push('<text x="' + (x - 56) + '" y="' + (yi - 4) + '" fill="' + C.green + '" font-size="11" text-anchor="middle">ENTRADA</text><text x="' + (x - 56) + '" y="' + (yi + 15) + '" fill="' + C.green + '" font-size="21" font-weight="700" text-anchor="middle">' + esc(k(inc)) + '</text>');
      // red pointer on the right: what went out
      o.push('<path d="M ' + (x + w - 4) + ' ' + yo + ' l 14 -22 h 84 v 44 h -84 z" fill="#000" stroke="' + C.red + '" stroke-width="2.5"/>');
      o.push('<text x="' + (x + w + 56) + '" y="' + (yo - 4) + '" fill="' + C.red + '" font-size="11" text-anchor="middle">SALIDA</text><text x="' + (x + w + 56) + '" y="' + (yo + 15) + '" fill="' + C.red + '" font-size="21" font-weight="700" text-anchor="middle">' + esc(k(out)) + '</text>');
      var n = r.mes.neto.v;
      o.push('<rect x="' + x + '" y="' + (y0 + h) + '" width="' + w + '" height="34" fill="#000"/><text x="' + (x + w / 2) + '" y="' + (y0 + h + 24) + '" fill="#fff" font-size="13" text-anchor="middle">NETO <tspan font-size="18" font-weight="700" fill="' + (n >= 0 ? C.green : C.red) + '">' + (n > 0 ? '+' : '') + esc(k(n)) + '</tspan></text>');
    })();

    // ---------------- right tape: SALDO (altimeter) ----------------
    (function () {
      var x = 870, w = 112, y0 = 112, h = 380, mid = y0 + h / 2;
      var step = nice(Math.max(Math.abs(v), 1000) / 2.2), pps = 52;
      o.push('<rect x="' + x + '" y="' + y0 + '" width="' + w + '" height="' + h + '" fill="rgba(0,0,0,.45)"/>');
      o.push('<rect x="' + x + '" y="' + (y0 - 30) + '" width="' + w + '" height="30" fill="#000"/><text x="' + (x + 6) + '" y="' + (y0 - 9) + '" fill="#fff" font-size="16">SALDO <tspan font-size="13">REAL</tspan></text>');
      o.push('<svg x="' + x + '" y="' + y0 + '" width="' + w + '" height="' + h + '" overflow="hidden">');
      var first = Math.floor((v - (h / 2) / pps * step) / step) * step;
      for (var t = first; t <= v + (h / 2) / pps * step + step; t += step) {
        var yy = h / 2 - (t - v) / step * pps;
        o.push('<line x1="0" y1="' + yy + '" x2="16" y2="' + yy + '" stroke="#fff" stroke-width="2"/><text x="22" y="' + (yy + 8) + '" fill="' + (t < 0 ? C.red : '#fff') + '" font-size="22">' + k(t) + '</text>');
      }
      var yZero = h / 2 + v / step * pps;
      o.push('<line x1="0" y1="' + yZero + '" x2="' + w + '" y2="' + yZero + '" stroke="' + C.red + '" stroke-width="2.5" stroke-dasharray="6 4"/>');
      o.push('</svg>');
      o.push('<path d="M ' + (x - 14) + ' ' + mid + ' l 14 -26 h 104 v 52 h -104 z" fill="#000" stroke="#fff" stroke-width="2"/>');
      o.push('<text x="' + (x + 100) + '" y="' + (mid + 12) + '" fill="' + (v >= 0 ? '#fff' : C.red) + '" font-size="32" font-weight="700" text-anchor="end">' + esc(k(v)) + '</text>');
      o.push('<rect x="' + x + '" y="' + (y0 + h) + '" width="' + w + '" height="34" fill="#000"/><text x="' + (x + 6) + '" y="' + (y0 + h + 24) + '" fill="' + C.green + '" font-size="15" font-weight="700">' + (r.fuente === 'banco' ? 'BANCO' : 'REGISTRO') + '</text>');
    })();

    // ---------------- inset map: real balance only, up to today ----------------
    (function () {
      var mx = 330, my = 364, mw = 340, mh = 160, pts = (r.hist || []).filter(function (p) { return p.fecha <= s.hoy; });
      o.push('<rect x="' + mx + '" y="' + my + '" width="' + mw + '" height="' + mh + '" fill="#0b2a18" stroke="#fff" stroke-width="1.5"/>');
      o.push('<text x="' + (mx + 8) + '" y="' + (my + 15) + '" fill="#cfd8e3" font-size="11">SALDO REAL · BANCO</text>');
      var past = pts.slice();
      if (!past.length || past[past.length - 1].fecha !== s.hoy) past.push({ fecha: s.hoy, saldo: v });
      if (past.length < 2) { o.push('<text x="' + (mx + mw / 2) + '" y="' + (my + mh / 2 + 5) + '" fill="#cfd8e3" font-size="13" text-anchor="middle">Aún no hay historial</text>'); return; }
      var t0 = Date.parse(past[0].fecha), t1 = Date.parse(s.hoy);
      var vals = past.map(function (d, i) { return i === past.length - 1 ? v : d.saldo; }).concat([0]);
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      var X = function (f) { return mx + 10 + (Date.parse(f) - t0) / ((t1 - t0) || 1) * (mw - 20); };
      var Y = function (val) { return my + 26 + (hi - val) / ((hi - lo) || 1) * (mh - 50); };
      if (lo < 0) o.push('<line x1="' + (mx + 4) + '" x2="' + (mx + mw - 4) + '" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="' + C.red + '" stroke-dasharray="4 3"/>');
      var dd = '';
      past.forEach(function (p, i) { dd += (i ? ' L ' : 'M ') + X(p.fecha).toFixed(1) + ',' + Y(i === past.length - 1 ? v : p.saldo).toFixed(1); });
      o.push('<path d="' + dd + '" fill="none" stroke="' + C.mag + '" stroke-width="2.5" stroke-linejoin="round"/>');
      o.push('<circle cx="' + X(s.hoy).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="5" fill="#fff"/>');
      o.push('<text x="' + (mx + 10) + '" y="' + (my + mh - 6) + '" fill="#cfd8e3" font-size="10">' + esc(fc(past[0].fecha)) + '</text>');
      o.push('<text x="' + (mx + mw - 10) + '" y="' + (my + mh - 6) + '" fill="#fff" font-size="10" text-anchor="end">HOY</text>');
    })();

    // ---------------- bottom left: the accounts, as the bank has them now ----------------
    (function () {
      var bx = 18, by = 540, bw = 262, bh = 154, cs = (r.cuentas || []).slice(0, 3);
      o.push('<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="4" fill="#000" stroke="' + C.cyan + '" stroke-width="2"/>');
      o.push('<text x="' + (bx + bw / 2) + '" y="' + (by + 24) + '" fill="' + C.cyan + '" font-size="14" font-weight="700" text-anchor="middle">CUENTAS · DISPONIBLE</text>');
      cs.forEach(function (c, i) {
        var y = by + 56 + i * 28;
        o.push('<text x="' + (bx + 14) + '" y="' + y + '" fill="#fff" font-size="16">••' + esc(c.mask) + '</text>');
        o.push('<text x="' + (bx + bw - 14) + '" y="' + y + '" fill="' + (c.disponible.v < 0 ? C.red : '#fff') + '" font-size="19" font-weight="700" text-anchor="end">' + esc(usd(c.disponible.v)) + '</text>');
      });
      if (!cs.length) o.push('<text x="' + (bx + bw / 2) + '" y="' + (by + 70) + '" fill="#fff" font-size="15" text-anchor="middle">Banco no conectado</text>');
      var pn = r.pendientes && r.pendientes.n ? r.pendientes.n : 0;
      o.push('<text x="' + (bx + bw / 2) + '" y="' + (by + bh - 14) + '" fill="' + (pn ? C.amber : '#9aa4b2') + '" font-size="13" text-anchor="middle">' + (pn ? pn + ' PENDIENTES ' + esc(r.pendientes.neto.t) : 'SIN CARGOS PENDIENTES') + '</text>');
    })();

    // ---------------- bottom right: this month so far ----------------
    (function () {
      var bx = 700, by = 540, bw = 282, bh = 154, mes = MESES[Number(s.hoy.slice(5, 7)) - 1].toUpperCase();
      o.push('<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" fill="#000" stroke="#fff" stroke-width="1.5"/>');
      o.push('<text x="' + (bx + 10) + '" y="' + (by + 22) + '" fill="#fff" font-size="14" font-weight="700">' + esc(mes) + ' · DEL 1 A HOY</text>');
      var rows = [['ENTRÓ', '+' + usd(r.mes.entro.v), C.green], ['SALIÓ', '-' + usd(r.mes.salio.v), C.red], ['NETO', (r.mes.neto.v > 0 ? '+' : '') + usd(r.mes.neto.v), r.mes.neto.v >= 0 ? C.green : C.red], ['GASTOS DEL BANCO', usd(r.gasto_banco_mes.v), C.cyan]];
      rows.forEach(function (rw, i) {
        var y = by + 52 + i * 27;
        o.push('<text x="' + (bx + 10) + '" y="' + y + '" fill="#c9d2de" font-size="14">' + rw[0] + '</text><text x="' + (bx + bw - 10) + '" y="' + y + '" fill="' + rw[2] + '" font-size="17" font-weight="700" text-anchor="end">' + esc(rw[1]) + '</text>');
      });
    })();

    // ---------------- top bar ----------------
    (function () {
      o.push('<rect x="0" y="0" width="' + W + '" height="64" fill="#000"/><line x1="0" y1="64" x2="' + W + '" y2="64" stroke="#555"/>');
      o.push('<text x="14" y="28" fill="#fff" font-size="16">HOY <tspan fill="' + (v < 0 ? C.red : C.cyan) + '" font-size="25" font-weight="700">' + esc(r.saldo.t) + '</tspan></text>');
      o.push('<text x="14" y="54" fill="#9aa4b2" font-size="14">BANCO ' + esc(hace(r.ultimo_sync).toUpperCase()) + '</text>');
      o.push('<line x1="250" y1="6" x2="250" y2="58" stroke="#555"/><line x1="720" y1="6" x2="720" y2="58" stroke="#555"/>');
      var sync = r.ultimo_sync && Date.now() - Date.parse(r.ultimo_sync) <= 36 * 3600e3;
      var a1 = v < 0 ? ['SALDO NEGATIVO', C.red] : ['SALDO OK', C.green];
      var pn = r.pendientes && r.pendientes.n ? r.pendientes.n : 0;
      var a2 = pn ? [pn + (pn === 1 ? ' CARGO PENDIENTE' : ' CARGOS PENDIENTES'), C.amber] : ['SIN PENDIENTES', C.green];
      var a3 = sync ? ['BANCO AL DÍA', C.green] : ['BANCO SIN ACTUALIZAR', C.amber];
      o.push('<text x="270" y="27" fill="' + a1[1] + '" font-size="19" font-weight="700">' + esc(a1[0]) + '</text>');
      o.push('<text x="470" y="27" fill="' + a2[1] + '" font-size="19" font-weight="700">' + esc(a2[0]) + '</text>');
      o.push('<text x="270" y="54" fill="' + a3[1] + '" font-size="19" font-weight="700">' + esc(a3[0]) + '</text>');
      (r.cuentas || []).slice(0, 2).forEach(function (c, i) {
        o.push('<text x="986" y="' + (i ? 54 : 27) + '" fill="#fff" font-size="15" text-anchor="end">••' + esc(c.mask) + ' <tspan fill="' + (c.disponible.v < 0 ? C.red : C.cyan) + '" font-size="20" font-weight="700">' + esc(usd(c.disponible.v)) + '</tspan></text>');
      });
    })();

    // ---------------- STALL / CAUTION ----------------
    if (alarmas.length) {
      var red = stalls.length > 0, col = red ? C.red : C.amber, bw2 = red ? 300 : 260, bx2 = cx - bw2 / 2, by2 = 72;
      o.push('<g data-alarmas="1" style="cursor:pointer"><rect x="' + bx2 + '" y="' + by2 + '" width="' + bw2 + '" height="54" rx="4" fill="' + (red ? C.red : '#000') + '" stroke="' + col + '" stroke-width="3">' +
        (red ? '<animate attributeName="opacity" values="1;0.45;1" dur="1s" repeatCount="indefinite"/>' : '') + '</rect>' +
        '<text x="' + cx + '" y="' + (by2 + 37) + '" fill="' + (red ? '#fff' : C.amber) + '" font-size="32" font-weight="700" text-anchor="middle" letter-spacing="4">' + (red ? 'STALL' : 'CAUTION') + '</text>' +
        '<text x="' + (bx2 + bw2 - 10) + '" y="' + (by2 + 20) + '" fill="' + (red ? '#fff' : C.amber) + '" font-size="15" font-weight="700" text-anchor="end">' + alarmas.length + '</text></g>');
      o.push('<text x="' + cx + '" y="' + (by2 + 74) + '" fill="#fff" font-size="15" text-anchor="middle" stroke="#000" stroke-width="3" paint-order="stroke">' + esc(String(alarmas[0].titulo).toUpperCase()) + (alarmas.length > 1 ? ' +' + (alarmas.length - 1) : '') + '</text>');
    }

    // ---------------- softkeys ----------------
    var keys = ['RESUMEN', 'BANCO', 'MES', 'ALERTAS'];
    o.push('<rect x="0" y="700" width="' + W + '" height="60" fill="#000"/>');
    keys.forEach(function (kk, i) {
      var kx = 20 + i * 240, on = state.tecla === kk;
      o.push('<g data-tecla="' + kk + '" style="cursor:pointer"><rect x="' + kx + '" y="704" width="236" height="52" fill="' + (on ? '#2b3a55' : '#000') + '"/>' +
        '<line x1="' + kx + '" y1="708" x2="' + kx + '" y2="752" stroke="#666"/><text x="' + (kx + 118) + '" y="738" fill="' + (kk === 'ALERTAS' && alarmas.length ? (stalls.length ? C.red : C.amber) : on ? C.cyan : '#fff') + '" font-size="20" text-anchor="middle"' + (kk === 'ALERTAS' && alarmas.length ? ' font-weight="700"' : '') + '>' + kk + (kk === 'ALERTAS' && alarmas.length ? ' ' + alarmas.length : '') + '</text></g>');
    });
    o.push('</svg>');

    o.push('<div style="background:#000;border-radius:10px;margin-top:8px;padding:12px 14px;font-family:Arial Narrow,Helvetica Neue,Arial,sans-serif;font-size:15px;line-height:1.5">' +
      '<div style="color:#9aa4b2;font-size:12px;letter-spacing:.08em;margin-bottom:6px">' + esc(state.tecla) + ' · SOLO DINERO REAL</div>' +
      ((state.tecla === 'ALERTAS' || (state.tecla === 'RESUMEN' && stalls.length)) ? alarmasHtml(s) : '') + detalle(s) + '</div>');
    el.innerHTML = o.join('');

    el.querySelectorAll('[data-pp]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var p = (r.por_pagar || [])[Number(a.getAttribute('data-pp'))];
        if (p && p.id && window.sfOpenEdit) window.sfOpenEdit(p.id, p.row);
      });
    });
    var bk = el.querySelector('[data-bank]');
    if (bk) {
      var goBank = function () { if (window.sfFilterBank) window.sfFilterBank(r.gasto_banco_ids || [], s.hoy); };
      bk.addEventListener('click', goBank);
      bk.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goBank(); } });
    }
    var ab = el.querySelector('[data-alarmas]');
    if (ab) ab.addEventListener('click', function () { state.tecla = 'ALERTAS'; window.drawSfPfdReal(el, s); });
    el.querySelectorAll('[data-alarma-ok]').forEach(function (b) {
      b.addEventListener('click', function () { b.disabled = true; if (window.sfAlarmaVisto) window.sfAlarmaVisto(b.getAttribute('data-alarma-ok')); });
    });
    el.querySelectorAll('[data-alarma-ver]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); if (window.sfFilterNombres) window.sfFilterNombres([a.getAttribute('data-alarma-ver')], a.getAttribute('data-alarma-tit')); });
    });
    el.querySelectorAll('[data-tecla]').forEach(function (g) {
      g.addEventListener('click', function () { state.tecla = g.getAttribute('data-tecla'); window.drawSfPfdReal(el, s); });
    });
  };
})();
