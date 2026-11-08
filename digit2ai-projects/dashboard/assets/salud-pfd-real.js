/* =====================================================
   Salud Financiera — panel de instrumentos, MODO REAL (owner 2026-11-08):
   "if I fly this plane looking at the panel, I will crash". Only what IS:
   the bank's available balance, real movements, and what is still to be paid.
   No projection, no plan comparison. Every figure comes from /salud -> s.real.

     Altímetro (derecha) ...... SALDO del banco ahora (disponible, ya descuenta lo pendiente)
     Variómetro ............... cambio real de los últimos 7 días
     Cinta izquierda .......... este mes: lo que entró y lo que salió (sin pasar plata entre tus cuentas)
     Horizonte ................ nariz arriba/abajo = cómo cambió tu saldo en los últimos 30 días
     Mapa (abajo izq) ......... tu saldo real de los últimos 60 días
     Caja (abajo der) ......... POR PAGAR: próximos pagos y cuánto te queda del dinero de hoy
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
    h.push(tile('Hasta el ' + esc(fl(r.hasta)) + ' · quedarías en', '<span style="color:' + (r.alcanza.v < 0 ? C.red : C.green) + '">' + esc(r.alcanza.t) + '</span>',
      'Pagos ' + esc(r.total_por_pagar.t) + ' · ingresos esperados +' + esc(r.total_entradas.t) + '. ' + (r.sin_cubrir ? '<span style="color:' + C.red + '">No alcanza para ' + esc(r.sin_cubrir.concepto) + ' (' + esc(fl(r.sin_cubrir.fecha)) + ')</span>' : 'Alcanza para todo') +
      (r.punto_bajo ? '. Punto más bajo: ' + esc(r.punto_bajo.queda.t) + ' el ' + esc(fl(r.punto_bajo.fecha)) : '') + '.<div style="margin-top:4px">' + porPagarHtml(r) + '</div>', r.sin_cubrir ? C.amber : C.green));
    h.push(tile('Este mes · ' + esc(mes), '<span style="color:' + C.green + '">+' + esc(r.mes.entro.t) + '</span> <span style="color:' + C.red + '">-' + esc(r.mes.salio.t) + '</span>',
      'Neto ' + esc(r.mes.neto.t) + ', del 1 al ' + Number(s.hoy.slice(8, 10)) + '.' + porEntrarHtml(r) + ' Sin contar pasar dinero entre tus cuentas de BOA.', '#fff'));
    h.push(tile('Cambio reciente', '<span style="color:' + (r.cambio_7d.v >= 0 ? C.green : C.red) + '">' + (r.cambio_7d.v >= 0 ? '▲ ' : '▼ ') + esc(r.cambio_7d.t) + '</span>',
      'Últimos 7 días. Últimos ' + (r.cambio_30d.dias || 30) + ' días: ' + esc(r.cambio_30d.t) + (r.cambio_30d.desde ? ' (tus registros empiezan el ' + esc(fl(r.cambio_30d.desde)) + ')' : '') + '.', '#fff'));
    if (r.pendientes && r.pendientes.n) h.push(tile('Pendientes del banco', esc(r.pendientes.neto.t), r.pendientes.n + ' cargos aún pendientes; el saldo disponible ya los descuenta.', C.amber));
    var bn = r.gasto_banco_n || 0;
    h.push('<div data-bank role="button" tabindex="0" style="cursor:pointer">' + tile('Gastos del banco · ' + esc(mes), esc(r.gasto_banco_mes.t),
      bn + (bn === 1 ? ' cargo' : ' cargos') + ' este mes. <span style="color:' + C.cyan + ';text-decoration:underline">Ver en la tabla</span>', C.cyan) + '</div>');
    if ((r.por_cobrar || []).length) h.push(tile('Por cobrar (anotado)', esc(r.por_cobrar.length + (r.por_cobrar.length === 1 ? ' ingreso' : ' ingresos')),
      r.por_cobrar.map(function (c) { return esc(fc(c.fecha)) + ' · ' + esc(c.concepto) + ' · ' + esc(c.monto); }).join('<br>') + '<br>No cuenta en el saldo hasta que llegue.', '#c9d2de'));
    if (!r.cuadra) h.push(tile('Cuadre', 'No cuadra', 'Tus movimientos suman ' + esc(r.libro.t) + ' y el banco tiene ' + esc(r.saldo.t) + '. El panel usa el banco.', C.amber));
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
    if (t === 'POR PAGAR') return '<div style="color:#fff;margin-bottom:6px">Hasta el ' + esc(fl(r.hasta)) + ': pagos ' + esc(r.total_por_pagar.t) + ', ingresos esperados +' + esc(r.total_entradas.t) + ' · quedarías en <span style="color:' + (r.alcanza.v < 0 ? C.red : C.green) + '">' + esc(r.alcanza.t) + '</span>.</div>' + porPagarHtml(r);
    if (t === 'BANCO') return (r.cuentas || []).map(function (c) { return '<div style="color:#fff">Cuenta ••' + esc(c.mask) + (c.rol ? ' (' + esc(c.rol) + ')' : '') + ': <b style="color:' + C.cyan + '">' + esc(c.disponible.t) + '</b> disponible' + (c.actual ? ' · ' + esc(c.actual.t) + ' sin lo pendiente' : '') + '</div>'; }).join('') +
      '<div style="color:#c9d2de">Actualizado ' + esc(hace(r.ultimo_sync)) + '. Movimientos registrados: ' + esc(r.libro.t) + (r.cuadra ? ' (cuadra).' : ' (no cuadra; diferencia ' + esc(r.diferencia.t) + ').') + '</div>';
    if (t === 'MES') return '<div style="color:' + C.green + '">Entró ' + esc(r.mes.entro.t) + porEntrarHtml(r) + '</div><div style="color:' + C.red + '">Salió ' + esc(r.mes.salio.t) + '</div><div style="color:#fff">Neto ' + esc(r.mes.neto.t) + ' · últimos 7 días ' + esc(r.cambio_7d.t) + ' · últimos ' + (r.cambio_30d.dias || 30) + ' días ' + esc(r.cambio_30d.t) + '</div>';
    return '';
  }

  // ------------------------------------------------------------ the instrument
  window.drawSfPfdReal = function (el, s) {
    if (!el || !s || !s.real) return;
    var r = s.real, W = 1000, H = 760, cx = 500, cy = 300, v = r.saldo.v;
    var alarmas = s.alarmas || [], stalls = alarmas.filter(function (a) { return a.nivel === 'stall'; });
    var ppd = 7;
    // nose up/down = how the balance moved over the last 30 days, relative to the balance itself
    var pitch = clamp(r.cambio_30d.v / Math.max(Math.abs(v), 1000) * 20, -20, 20);
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
    (function () {
      var c30 = r.cambio_30d.v, c7 = r.cambio_7d.v, col = c30 >= 0 ? C.green : C.red;
      o.push('<rect x="' + (cx - 160) + '" y="' + (cy + 86) + '" width="320" height="54" rx="3" fill="#000" stroke="' + col + '" stroke-width="1.5"/>');
      o.push('<text x="' + cx + '" y="' + (cy + 108) + '" fill="#fff" font-size="15" text-anchor="middle">ÚLT. ' + (r.cambio_30d.dias || 30) + ' DÍAS <tspan fill="' + col + '" font-size="19" font-weight="700">' + (c30 >= 0 ? '+' : '') + esc(usd(c30)) + '</tspan></text>');
      o.push('<text x="' + cx + '" y="' + (cy + 130) + '" fill="#fff" font-size="15" text-anchor="middle">ÚLT. 7 DÍAS <tspan fill="' + (c7 >= 0 ? C.green : C.red) + '" font-size="19" font-weight="700">' + (c7 >= 0 ? '+' : '') + esc(usd(c7)) + '</tspan></text>');
    })();
    o.push('</g>');

    // ---------------- left tape: this month, what came in and what went out ----------------
    (function () {
      var x = 120, w = 104, y0 = 112, h = 380, inc = r.mes.entro.v, pe = (r.mes.por_entrar && r.mes.por_entrar.v) || 0, out = r.mes.salio.v, top = Math.max(inc + pe, out, 100);
      o.push('<rect x="' + x + '" y="' + y0 + '" width="' + w + '" height="' + h + '" fill="rgba(0,0,0,.45)"/>');
      o.push('<rect x="' + x + '" y="' + (y0 - 30) + '" width="' + w + '" height="30" fill="#000"/><text x="' + (x + 6) + '" y="' + (y0 - 9) + '" fill="#fff" font-size="15">MES <tspan font-size="18" font-weight="700">' + esc(MESES[Number(s.hoy.slice(5, 7)) - 1].toUpperCase()) + '</tspan></text>');
      var bh = h - 120, bw = 34;
      [[x + 14, inc, C.green, 'ENTRÓ'], [x + 56, out, C.red, 'SALIÓ']].forEach(function (b) {
        var hh = Math.max(2, b[1] / top * bh);
        o.push('<rect x="' + b[0] + '" y="' + (y0 + 20 + bh - hh) + '" width="' + bw + '" height="' + hh + '" fill="' + b[2] + '"/>');
        o.push('<text x="' + (b[0] + bw / 2) + '" y="' + (y0 + 40 + bh) + '" fill="' + b[2] + '" font-size="11" text-anchor="middle">' + b[3] + '</text>');
        o.push('<text x="' + (b[0] + bw / 2) + '" y="' + (y0 + 58 + bh) + '" fill="' + b[2] + '" font-size="15" font-weight="700" text-anchor="middle">' + esc(k(b[1])) + '</text>');
      });
      if (pe > 0) { // still to come in this month: outlined on top of what came in
        var hi = Math.max(2, inc / top * bh), hp = Math.max(2, pe / top * bh), xx = x + 14;
        o.push('<rect x="' + (xx + 1) + '" y="' + (y0 + 21 + bh - hi - hp) + '" width="' + (bw - 2) + '" height="' + (hp - 2) + '" fill="rgba(110,231,122,.18)" stroke="' + C.green + '" stroke-width="2" stroke-dasharray="5 3"/>');
        o.push('<text x="' + (xx + bw / 2) + '" y="' + (y0 + 14 + bh - hi - hp) + '" fill="' + C.green + '" font-size="12" font-weight="700" text-anchor="middle">+' + esc(k(pe)) + '</text>');
      }
      var n = r.mes.neto.v;
      if (pe > 0) o.push('<text x="' + (x + w / 2) + '" y="' + (y0 + h - 12) + '" fill="' + C.green + '" font-size="11" text-anchor="middle">+' + esc(k(pe)) + ' POR ENTRAR</text>');
      o.push('<rect x="' + x + '" y="' + (y0 + h) + '" width="' + w + '" height="34" fill="#000"/><text x="' + (x + 6) + '" y="' + (y0 + h + 24) + '" fill="#fff" font-size="14">NETO <tspan font-size="19" font-weight="700" fill="' + (n >= 0 ? C.green : C.red) + '">' + (n > 0 ? '+' : '') + esc(k(n)) + '</tspan></text>');
    })();

    // ---------------- right tape: SALDO (altimeter) + 7-day change (VSI) ----------------
    (function () {
      var x = 760, w = 112, y0 = 112, h = 380, mid = y0 + h / 2;
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
      // VSI: 7-day change
      var vx = x + w + 6, vw = 116, c7 = r.cambio_7d.v, col = c7 >= 0 ? C.green : C.red;
      o.push('<rect x="' + vx + '" y="' + y0 + '" width="' + vw + '" height="' + h + '" fill="rgba(0,0,0,.45)"/>');
      o.push('<text x="' + (vx + vw / 2) + '" y="' + (y0 - 9) + '" fill="#fff" font-size="16" font-weight="700" text-anchor="middle">7 DÍAS</text>');
      o.push('<line x1="' + vx + '" y1="' + mid + '" x2="' + (vx + vw) + '" y2="' + mid + '" stroke="#fff" stroke-width="2"/>');
      var len = clamp(Math.abs(c7) / Math.max(Math.abs(v), 1000) * 300, 8, h / 2 - 30), dir = c7 >= 0 ? -1 : 1;
      o.push('<line x1="' + (vx + vw / 2) + '" y1="' + mid + '" x2="' + (vx + vw / 2) + '" y2="' + (mid + dir * len) + '" stroke="' + col + '" stroke-width="8"/>');
      o.push('<path d="M ' + (vx + vw / 2 - 16) + ' ' + (mid + dir * len) + ' l 16 ' + (dir * 20) + ' l 16 ' + (-dir * 20) + ' z" fill="' + col + '"/>');
      o.push('<rect x="' + vx + '" y="' + (y0 + h) + '" width="' + vw + '" height="34" fill="#000"/><text x="' + (vx + vw / 2) + '" y="' + (y0 + h + 24) + '" fill="' + col + '" font-size="19" font-weight="700" text-anchor="middle">' + (c7 >= 0 ? '+' : '') + esc(k(c7)) + '</text>');
      o.push('<rect x="' + x + '" y="' + (y0 + h) + '" width="' + w + '" height="34" fill="#000"/><text x="' + (x + 6) + '" y="' + (y0 + h + 24) + '" fill="' + (r.cuadra ? C.green : C.amber) + '" font-size="15" font-weight="700">' + (r.fuente === 'banco' ? 'BANCO' : 'REGISTRO') + '</text>');
    })();

    // ---------------- inset map: real balance, last 60 days ----------------
    (function () {
      var mx = 18, my = 540, mw = 262, mh = 154, pts = r.hist || [];
      o.push('<rect x="' + mx + '" y="' + my + '" width="' + mw + '" height="' + mh + '" fill="#0b2a18" stroke="#fff" stroke-width="1.5"/>');
      o.push('<text x="' + (mx + 8) + '" y="' + (my + 15) + '" fill="#cfd8e3" font-size="11">SALDO REAL · ' + (pts.length > 1 ? pts.length - 1 : 0) + ' DÍAS</text>');
      if (pts.length < 2) return;
      var vals = pts.map(function (d) { return d.saldo; }).concat([0, v]);
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      var X = function (i) { return mx + 10 + i / (pts.length - 1) * (mw - 20); };
      var Y = function (val) { return my + 26 + (hi - val) / ((hi - lo) || 1) * (mh - 40); };
      if (lo < 0) o.push('<line x1="' + (mx + 4) + '" x2="' + (mx + mw - 4) + '" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="' + C.red + '" stroke-dasharray="4 3"/>');
      var dd = '';
      pts.forEach(function (p, i) { dd += (i ? ' L ' : 'M ') + X(i).toFixed(1) + ',' + Y(i === pts.length - 1 ? v : p.saldo).toFixed(1); });
      o.push('<path d="' + dd + '" fill="none" stroke="' + C.mag + '" stroke-width="2.5" stroke-linejoin="round"/>');
      o.push('<text x="' + (mx + 10) + '" y="' + (my + mh - 6) + '" fill="#cfd8e3" font-size="10">' + esc(fc(pts[0].fecha)) + '</text><text x="' + (mx + mw - 10) + '" y="' + (my + mh - 6) + '" fill="#fff" font-size="10" text-anchor="end">HOY</text>');
      o.push('<circle cx="' + X(pts.length - 1) + '" cy="' + Y(v) + '" r="5" fill="#fff"/>');
    })();

    // ---------------- bottom center: next thing to pay ----------------
    (function () {
      var p = (r.por_pagar || []).filter(function (x) { return !x.entrada; })[0], bx = 330, by = 560, bw = 340, bh = 110;
      o.push('<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="4" fill="#000" stroke="' + (p && !p.cubierto ? C.red : C.mag) + '" stroke-width="2"/>');
      o.push('<text x="' + (bx + bw / 2) + '" y="' + (by + 22) + '" fill="' + C.mag + '" font-size="14" font-weight="700" text-anchor="middle">PRÓXIMO PAGO</text>');
      if (!p) { o.push('<text x="' + (bx + bw / 2) + '" y="' + (by + 66) + '" fill="' + C.green + '" font-size="20" text-anchor="middle">Nada por pagar</text>'); return; }
      o.push('<text x="' + (bx + bw / 2) + '" y="' + (by + 52) + '" fill="#fff" font-size="21" font-weight="700" text-anchor="middle">' + esc(String(p.concepto).toUpperCase().slice(0, 24)) + '</text>');
      o.push('<text x="' + (bx + bw / 2) + '" y="' + (by + 78) + '" fill="' + (p.vencido ? C.amber : '#fff') + '" font-size="18" text-anchor="middle">' + esc(p.monto) + ' · ' + esc(cuando(p).toUpperCase()) + '</text>');
      o.push('<text x="' + (bx + bw / 2) + '" y="' + (by + 100) + '" fill="' + (p.cubierto ? C.green : C.red) + '" font-size="15" text-anchor="middle">' + (p.cubierto ? 'CUBIERTO · QUEDA ' : 'NO ALCANZA · FALTAN ') + esc(p.cubierto ? p.queda.t : p.queda.t.replace('-', '')) + '</text>');
    })();

    // ---------------- bottom right: POR PAGAR (next 30 days) ----------------
    (function () {
      var rows = (r.por_pagar || []).filter(function (x) { return !x.entrada; }), bx = 700, by = 540, bw = 282, bh = 154, shown = rows.slice(0, 4);
      o.push('<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" fill="#000" stroke="' + (r.sin_cubrir ? C.amber : '#fff') + '" stroke-width="1.5"/>');
      o.push('<text x="' + (bx + 8) + '" y="' + (by + 17) + '" fill="#fff" font-size="13" font-weight="700">POR PAGAR → ' + esc(fc(r.hasta)) + ' <tspan fill="' + C.cyan + '">' + esc(r.total_por_pagar.t) + '</tspan></text>');
      if (rows.length > shown.length) o.push('<text x="' + (bx + bw - 8) + '" y="' + (by + 17) + '" fill="#fff" font-size="12" text-anchor="end">+' + (rows.length - shown.length) + ' más</text>');
      if (!rows.length) o.push('<text x="' + (bx + 8) + '" y="' + (by + 50) + '" fill="' + C.green + '" font-size="14">Nada por pagar</text>');
      shown.forEach(function (p, i) {
        var y = by + 42 + i * 28, col = p.cubierto ? '#fff' : C.red;
        o.push('<text x="' + (bx + 8) + '" y="' + y + '" fill="' + (p.vencido ? C.amber : col) + '" font-size="13">' + esc(fc(p.fecha)) + '</text>');
        o.push('<text x="' + (bx + 62) + '" y="' + y + '" fill="' + col + '" font-size="13">' + esc(String(p.concepto).slice(0, 15)) + '</text>');
        o.push('<text x="' + (bx + bw - 8) + '" y="' + y + '" fill="' + col + '" font-size="13" font-weight="700" text-anchor="end">' + esc(String(p.monto).replace(/\.00$/, '')) + '</text>');
      });
      o.push('<text x="' + (bx + 8) + '" y="' + (by + bh - 8) + '" fill="#9aa4b2" font-size="11">Al ' + esc(fc(r.hasta)) + ' quedarías en ' + esc(r.alcanza.t) + '</text>');
    })();

    // ---------------- top bar ----------------
    (function () {
      o.push('<rect x="0" y="0" width="' + W + '" height="64" fill="#000"/><line x1="0" y1="64" x2="' + W + '" y2="64" stroke="#555"/>');
      o.push('<text x="14" y="28" fill="#fff" font-size="16">HOY <tspan fill="' + (v < 0 ? C.red : C.cyan) + '" font-size="25" font-weight="700">' + esc(r.saldo.t) + '</tspan></text>');
      o.push('<text x="14" y="54" fill="#9aa4b2" font-size="14">BANCO ' + esc(hace(r.ultimo_sync).toUpperCase()) + '</text>');
      o.push('<line x1="250" y1="6" x2="250" y2="58" stroke="#555"/><line x1="720" y1="6" x2="720" y2="58" stroke="#555"/>');
      var sync = r.ultimo_sync && Date.now() - Date.parse(r.ultimo_sync) <= 36 * 3600e3;
      var a1 = v < 0 ? ['SALDO NEGATIVO', C.red] : ['SALDO OK', C.green];
      var p7 = (r.por_pagar || []).filter(function (p) { return p.dias <= 7 && !p.cubierto; })[0];
      var a2 = p7 ? ['NO ALCANZA ' + String(p7.concepto).toUpperCase().slice(0, 12), C.red] : ['PAGOS 7D OK', C.green];
      var a3 = sync ? ['BANCO AL DÍA', C.green] : ['BANCO SIN ACTUALIZAR', C.amber];
      var a4 = r.cuadra ? ['CUADRA', C.green] : ['NO CUADRA', C.amber];
      o.push('<text x="270" y="27" fill="' + a1[1] + '" font-size="19" font-weight="700">' + esc(a1[0]) + '</text>');
      o.push('<text x="470" y="27" fill="' + a2[1] + '" font-size="19" font-weight="700">' + esc(a2[0]) + '</text>');
      o.push('<text x="270" y="54" fill="' + a3[1] + '" font-size="19" font-weight="700">' + esc(a3[0]) + '</text>');
      o.push('<text x="570" y="54" fill="' + a4[1] + '" font-size="19" font-weight="700">' + esc(a4[0]) + '</text>');
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
    var keys = ['RESUMEN', 'POR PAGAR', 'BANCO', 'MES', 'ALERTAS'];
    o.push('<rect x="0" y="700" width="' + W + '" height="60" fill="#000"/>');
    keys.forEach(function (kk, i) {
      var kx = 20 + i * 192, on = state.tecla === kk;
      o.push('<g data-tecla="' + kk + '" style="cursor:pointer"><rect x="' + kx + '" y="704" width="188" height="52" fill="' + (on ? '#2b3a55' : '#000') + '"/>' +
        '<line x1="' + kx + '" y1="708" x2="' + kx + '" y2="752" stroke="#666"/><text x="' + (kx + 94) + '" y="738" fill="' + (kk === 'ALERTAS' && alarmas.length ? (stalls.length ? C.red : C.amber) : on ? C.cyan : '#fff') + '" font-size="20" text-anchor="middle"' + (kk === 'ALERTAS' && alarmas.length ? ' font-weight="700"' : '') + '>' + kk + (kk === 'ALERTAS' && alarmas.length ? ' ' + alarmas.length : '') + '</text></g>');
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
