/* Presentación + simulador. Todas las cifras salen de engine.js; aquí solo se dibujan. */
(function () {
  'use strict';
  var E = window.FzEngine;
  var KEY = 'fz_sim_v1';
  var $ = function (id) { return document.getElementById(id); };
  var NF = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  function money(n) { n = Math.round(n || 0); return (n < 0 ? '−' : '') + '$' + NF.format(Math.abs(n)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function todayISO() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }

  // ---------- estado ----------
  var S, draft, ui = { view: 'deck', slide: 0, start: todayISO(), cname: 'Empresa de Rafael', notes: false, stmtClient: 'Cliente A', calc: { h: 10, p: 40, r: 150 } };
  function load() {
    S = E.fresh(); draft = Object.assign({}, E.DEFAULT_ORDER);
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.S && Array.isArray(o.S.movements)) S = o.S;
        if (o && o.draft) draft = Object.assign({}, E.DEFAULT_ORDER, o.draft);
        if (o && o.ui) { ['start', 'cname', 'stmtClient', 'calc', 'slide'].forEach(function (k) { if (o.ui[k] != null) ui[k] = o.ui[k]; }); }
      }
    } catch (e) { /* almacenamiento no disponible: se usa el escenario inicial */ }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ S: S, draft: draft, ui: { start: ui.start, cname: ui.cname, stmtClient: ui.stmtClient, calc: ui.calc, slide: ui.slide } })); } catch (e) {}
  }
  function baseline() { var b = E.fresh(); b.horizon = S.horizon; b.reserve = S.reserve; b.evalDay = S.evalDay; return b; }

  function dateOf(d) {
    var p = (ui.start || todayISO()).split('-');
    var dt = new Date(+p[0], +p[1] - 1, +p[2] + d);
    return dt.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '');
  }
  function dayLbl(d) { return 'Día ' + d + ' · ' + dateOf(d); }
  var CAT = { cliente: 'Cliente', anticipo: 'Anticipo', proveedor: 'Proveedor', nomina: 'Nómina', vehiculo: 'Vehículo', gasto: 'Gasto', entrega: 'Entrega' };
  var STL = { pendiente: 'Pendiente', parcial: 'Abono parcial', vencido: 'Vencido', realizado: 'Realizado', fuera: 'Fuera del horizonte' };

  // ---------- narración (Dalia) y notas ----------
  var SLIDES = [
    { notes: 'Abrir con lo que Rafael contó en la reunión: clientes que construyen o mejoran su casa, crédito, factura o efectivo, y los malabares para pagar a proveedores y contratistas. Decir que la presentación usa datos simulados.',
      narr: 'Hola, soy Dalia, y te voy a explicar esta propuesta, actualizada con lo que conversamos en la reunión. La presentación usa datos simulados. La empresa de Rafael vende varilla, arena, cemento y otros materiales a crédito, en su mayoría a personas que construyen o mejoran su propia casa. Unos pagan con factura y otros en efectivo. Como nos dijiste, el dinero existe, pero hay que hacer malabares para que alcance a pagar a proveedores y contratistas a tiempo. La operación mueve unos cuatro millones de pesos al mes, con un equipo de cuatro personas y camiones propios. El ciclo es este: compra de materiales, venta a crédito, cuenta por cobrar, cobro, y capital disponible para volver a operar.' },
    { notes: 'Señalar el hueco entre los pagos de los días 7 a 15 y el primer cobro del día 20. Tres ideas: crédito no es efectivo, margen no es efectivo, comparar fechas anticipa faltantes.',
      narr: 'El reto está entre vender y cobrar. En este ejemplo, el día siete vence el pago a un proveedor, el día diez la mensualidad del vehículo y el día quince otro proveedor y la nómina. Pero el primer cliente paga hasta el día veinte. Durante esos días el dinero ya salió y todavía no regresa. Una venta a crédito genera una cuenta por cobrar, no efectivo. Y un buen margen no garantiza tener dinero para pagar la nómina a tiempo.' },
    { notes: 'Las cuatro respuestas se calculan con el escenario del simulador. Si se cambió algo en el simulador, las cifras ya lo reflejan.',
      narr: 'Para controlar el capital hay cuatro preguntas. ¿Cuánto tengo disponible hoy? ¿Cuánto me deben y cuándo cobraré? ¿Cuánto debo pagar y cuándo? Y ¿cuánto quedaría si hago otra venta a crédito? Comparar las fechas de cobro y de pago es lo que permite ver un faltante antes de que llegue.' },
    { notes: 'Distinguir efectivo real, entradas esperadas y proyección. Lo que deben los clientes no es dinero disponible.',
      narr: 'Toda la operación en un tablero. En el escenario inicial simulado hay ciento cincuenta mil pesos en efectivo, doscientos mil pesos por cobrar y doscientos veinticinco mil pesos de obligaciones. Separamos tres cosas: el efectivo real, las entradas esperadas y la proyección. Lo que le deben a la empresa todavía no es dinero disponible: lo será cuando se cobre.' },
    { notes: 'Cambiar de cliente en el selector. Explicar estados: pendiente, vence pronto, vencida, abono parcial, pagada. El abono reduce el saldo y el resto conserva su vencimiento.',
      narr: 'Cada cliente tiene su estado de cuenta: ventas, vencimientos, abonos y saldo pendiente, con un estado claro. Cuando se registra un abono, sube el efectivo y baja el saldo del cliente, y lo que falta conserva su fecha de vencimiento. Así se sabe a quién llamar y por cuánto, sin buscar en varias hojas de Excel.' },
    { notes: 'Mensaje clave: cerrar el periodo en positivo no evita un faltante durante el mes. Un saldo negativo es una necesidad de fondos, no un sobregiro autorizado.',
      narr: 'Este es el punto más importante. En el escenario inicial, al final de los sesenta días el saldo proyectado es positivo: ciento veinticinco mil pesos. Pero el día quince, cuando coinciden el pago al proveedor y la nómina, el saldo cae a menos cincuenta y siete mil pesos, y se queda así hasta el cobro del día veinte. Para mantener una reserva de treinta mil pesos harían falta ochenta y siete mil pesos. Un saldo negativo no es un sobregiro autorizado: es dinero que hay que conseguir con tiempo.' },
    { notes: 'Cambiar el anticipo a 30 % en vivo. Margen ilustrativo antes de impuestos y otros gastos. No es aprobación de crédito, solo el efecto bajo los supuestos capturados.',
      narr: 'Antes de aceptar un pedido grande se puede simular. Una venta de cien mil pesos, con setenta y cinco mil de materiales y cinco mil de entrega, deja un margen ilustrativo de veinte mil pesos, antes de impuestos y otros gastos. Pero el día cinco salen ochenta mil pesos que regresan hasta el día treinta y cinco. Con un anticipo del treinta por ciento, la salida inicial baja a cincuenta mil pesos. No es una aprobación de crédito: es el efecto sobre el capital bajo los supuestos que se capturan.' },
    { notes: 'Todo es demostración: no hay banco ni WhatsApp conectados. Una persona revisa cada registro y cada mensaje antes de guardarlo o enviarlo.',
      narr: 'Menos captura y mejor seguimiento. Una factura o un mensaje se convierte en un registro propuesto, y una persona revisa cliente, importe, fechas y tipo antes de guardarlo. También se puede preparar un recordatorio de cobranza por WhatsApp que alguien aprueba antes de enviarlo. En esta demostración no se envía ningún mensaje ni se conecta ningún banco.' },
    { notes: 'Repasar el flujo que describió Rafael: pedido, despacho, entrega con foto, factura y cobro. Tocar el dolor de los pedidos que tardan en liberarse. Costo por camión y horas de nómina salen de los mismos registros.',
      narr: 'Del pedido a la entrega, un solo flujo. El pedido llega por llamada o por WhatsApp y se redacta en el sistema. El despachador lo recibe y lo libera, sin esperas ni llamadas para preguntar cuándo sale. El chofer toma una foto de entrega y queda registrada la hora. Se sube la foto de la factura y se asocia al pedido, y el saldo del cliente entra a la cobranza. Con los mismos registros sabes cuánto te cuesta cada camión en gasolina y mantenimiento, y cuántas horas de nómina se trabajaron. La mayoría de los datos entra con fotos, y una persona revisa antes de guardar.' },
    { notes: 'La analogía de la avioneta Cessna: altitud, velocidad, inclinación y horizonte, pero financieros. Los cuatro instrumentos se calculan con el escenario del simulador. La conexión bancaria es parte de la implementación; en la demostración no hay banco conectado.',
      narr: 'Este es el tablero tipo cabina. Como en una avioneta, en dos segundos ves la altitud, la velocidad, la inclinación y el horizonte, pero de tus finanzas. La altitud es el efectivo de hoy. La velocidad es la cartera por cobrar. La inclinación es si el efectivo y la cartera alcanzan para cubrir lo que debes. Y el horizonte es el saldo más bajo que viene. Cada instrumento se pone en verde, amarillo o rojo cuando te sales de la línea. En la implementación se conecta el banco, para que el número que ves sea el real. En esta demostración no hay ningún banco conectado.' },
    { notes: 'El modelo de predicción depende de calificar a cada cliente. No prometer un porcentaje de precisión: se mide con los datos reales. La ruta de cuatro a ocho millones y el treinta por ciento son metas, no garantías.',
      narr: 'Con tu cartera de clientes calificada según cómo paga cada uno, el modelo de predicción estima cuándo vas a cobrar y qué reserva de efectivo conviene mantener. También cruza los pedidos, las cargas que vienen en camino y los cobros de la semana. Su precisión se mide con tus datos reales durante la prueba. Con tu propia estadística armamos el mapa para pasar de unos cuatro millones a ocho millones al mes, con una meta intermedia de crecer un treinta por ciento, y una brújula que cada mes te dice si vas en la línea. Son metas, no promesas.' },
    { notes: 'Lo acordado: Rafael envía su información y en una semana se presenta el primer modelo con sus datos. Los ajustes menores toman una o dos semanas. Todo corre en paralelo con el proceso actual.',
      narr: 'La propuesta es una prueba de concepto de cuatro semanas, en paralelo con el proceso actual. Semana uno: recibir tu información y presentarte el primer modelo ya cargado con tus datos. Semana dos: hacer los ajustes y configurar las funciones prioritarias. Semana tres: usar la herramienta junto con el proceso de siempre. Semana cuatro: ajustar y evaluar. Si los ajustes son menores, toman una o dos semanas.' },
    { notes: 'Pedir la información por el medio que Rafael prefiera: correo, acceso al sistema o Google Drive. Puede cambiar los nombres. Agendar la siguiente reunión para mostrar el modelo con sus datos.',
      narr: 'El siguiente paso es que nos envíes tu información, por correo electrónico, con acceso a tu sistema o en una carpeta de Google Drive, como te resulte más fácil. No hace falta compartir nombres: puedes cambiarlos. Nos ayudan los estados de cuenta del banco, las ventas a crédito y los saldos, las compras de material, los pagos a proveedores y contratistas, la nómina, los gastos de los camiones y las hojas de Excel que usan hoy. En la próxima reunión te mostramos el modelo con tus datos y hacemos los ajustes. Gracias.' }
  ];

  // ---------- gráfica ----------
  function drawChart(el, o) {
    var W = el.clientWidth - 20, Hh = el.clientHeight - 20;
    if (W < 200) W = 1000; if (Hh < 60) Hh = 380;
    var s = o.series, H = s.length - 1, base = o.base;
    var all = s.concat(base || [], [0, o.reserve]);
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var span = (hi - lo) || 1; lo -= span * 0.08; hi += span * 0.1;
    var fs = W < 500 ? 11 : 13;
    var pl = W < 500 ? 58 : 80, pr = 14, pt = 18, pb = 30;
    var x = function (d) { return pl + (d / Math.max(1, H)) * (W - pl - pr); };
    var y = function (v) { return pt + (hi - v) / (hi - lo) * (Hh - pt - pb); };
    function step(arr) {
      var p = 'M' + x(0) + ',' + y(arr[0]);
      for (var d = 1; d <= H; d++) p += 'L' + x(d) + ',' + y(arr[d - 1]) + 'L' + x(d) + ',' + y(arr[d]);
      return p;
    }
    var g = '';
    // ejes y cuadrícula
    var ticks = 5, tstep = niceStep((hi - lo) / ticks);
    for (var t = Math.ceil(lo / tstep) * tstep; t <= hi; t += tstep) {
      g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="rgba(160,190,230,.12)"/>';
      g += '<text x="' + (pl - 8) + '" y="' + (y(t) + 4) + '" fill="#8ea3bf" font-size="' + fs + '" text-anchor="end">' + esc(short(t)) + '</text>';
    }
    var xt = H <= 30 ? 5 : 10;
    for (var d = 0; d <= H; d += xt) g += '<text x="' + x(d) + '" y="' + (Hh - 8) + '" fill="#8ea3bf" font-size="' + fs + '" text-anchor="' + (d === 0 ? 'start' : d === H ? 'end' : 'middle') + '">' + (d === 0 ? 'día 0' : d) + '</text>';
    var id = 'c' + Math.random().toString(36).slice(2, 8);
    var area = step(s) + 'L' + x(H) + ',' + y(0) + 'L' + x(0) + ',' + y(0) + 'Z';
    var areaR = step(s) + 'L' + x(H) + ',' + y(o.reserve) + 'L' + x(0) + ',' + y(o.reserve) + 'Z';
    g += '<defs><clipPath id="' + id + 'n"><rect x="0" y="' + y(0) + '" width="' + W + '" height="' + Math.max(0, Hh - y(0)) + '"/></clipPath>' +
      '<clipPath id="' + id + 'r"><rect x="0" y="' + y(o.reserve) + '" width="' + W + '" height="' + Math.max(0, y(0) - y(o.reserve)) + '"/></clipPath></defs>';
    g += '<path d="' + areaR + '" fill="rgba(255,195,90,.18)" clip-path="url(#' + id + 'r)"/>';
    g += '<path d="' + area + '" fill="rgba(255,122,122,.28)" clip-path="url(#' + id + 'n)"/>';
    g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="#ff7a7a" stroke-width="1"/>';
    g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(o.reserve) + '" y2="' + y(o.reserve) + '" stroke="#ffc35a" stroke-dasharray="6 5" stroke-width="2"/>';
    g += '<text x="' + (W - pr) + '" y="' + (y(o.reserve) - 6) + '" fill="#ffc35a" font-size="' + fs + '" text-anchor="end">Reserva ' + esc(money(o.reserve)) + '</text>';
    if (o.evalDay > 0 && o.evalDay <= H) g += '<line x1="' + x(o.evalDay) + '" x2="' + x(o.evalDay) + '" y1="' + pt + '" y2="' + (Hh - pb) + '" stroke="#7fe6da" stroke-dasharray="3 4"/><text x="' + (x(o.evalDay) + 4) + '" y="' + (pt + 10) + '" fill="#7fe6da" font-size="' + fs + '">evaluación</text>';
    if (base && base.join() !== s.join()) g += '<path d="' + step(base) + '" fill="none" stroke="#7f8ea6" stroke-width="2" stroke-dasharray="7 6"/>';
    g += '<path d="' + step(s) + '" fill="none" stroke="#19c3b1" stroke-width="3"/>';
    if (o.min != null) {
      var mx = (x(o.minDay) + x(Math.min(H, o.minEnd + 1))) / 2, my = y(o.min);
      g += '<circle cx="' + x(o.minDay) + '" cy="' + my + '" r="5" fill="#ff7a7a"/>';
      var lbl = 'Mínimo ' + money(o.min) + (o.minEnd > o.minDay ? ' · días ' + o.minDay + '–' + o.minEnd : ' · día ' + o.minDay);
      var ty = my + 22 > Hh - pb ? my - 12 : my + 22;
      g += '<text x="' + Math.min(W - pr - 4, Math.max(pl + 4, mx)) + '" y="' + ty + '" fill="#ffd0d0" font-size="' + (fs + 1) + '" font-weight="700" text-anchor="middle">' + esc(lbl) + '</text>';
    }
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Saldo diario proyectado">' + g + '</svg>';
  }
  function niceStep(raw) { var p = Math.pow(10, Math.floor(Math.log10(raw || 1))); var n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function short(v) { var a = Math.abs(v); var s = a >= 1000 ? NF.format(Math.round(a / 1000)) + ' mil' : NF.format(a); return (v < 0 ? '−$' : '$') + s; }

  // ---------- piezas compartidas ----------
  function kpi(label, value, sub, cls, neg) {
    return '<div class="kpi ' + (cls || '') + '"><div class="kl">' + esc(label) + '</div><div class="kv' + (neg ? ' neg' : '') + '">' + esc(value) + '</div>' + (sub ? '<div class="ks">' + esc(sub) + '</div>' : '') + '</div>';
  }
  function minText(p) { return p.minEnd > p.minDay ? 'Días ' + p.minDay + ' a ' + p.minEnd + ' (' + dateOf(p.minDay) + ' a ' + dateOf(p.minEnd) + ')' : dayLbl(p.minDay); }
  function nextOf(p, kind) {
    return p.items.filter(function (m) { return m.kind === kind && m.pending > 0 && m.day >= S.evalDay && (kind === 'out' || m.cat !== 'anticipo'); })
      .sort(function (a, b) { return a.day - b.day; })[0];
  }

  function renderQ4(p) {
    var a = E.analyzeOrder(S, draft);
    var ni = nextOf(p, 'in'), no = nextOf(p, 'out');
    var q = [
      ['¿Cuánto tengo disponible?', money(p.cash), 'Efectivo real hoy. Reserva mínima deseada: ' + money(S.reserve) + '.'],
      ['¿Cuánto me deben y cuándo cobraré?', money(p.receivable), ni ? 'Próximo cobro: ' + ni.party + ', ' + money(ni.pending) + ', ' + dayLbl(ni.day) + '. Todavía no es efectivo.' : 'Sin cobros pendientes.'],
      ['¿Cuánto debo pagar y cuándo?', money(p.obligations), no ? 'Próximo pago: ' + no.party + ', ' + money(no.pending) + ', ' + dayLbl(no.day) + '.' : 'Sin pagos pendientes.'],
      ['¿Cuánto quedaría si hago otra venta a crédito?', money(a.with.min), 'Menor saldo con un pedido de ' + money(draft.price) + (S.order ? ' (ya incluido en el escenario).' : ', contra ' + money(a.without.min) + ' sin él.')]
    ];
    $('q4').innerHTML = q.map(function (r, i) {
      return '<div class="q"><div class="qq">' + esc(r[0]) + '</div><div class="qa' + (i === 3 && a.with.min < 0 ? ' neg' : '') + '">' + esc(r[1]) + '</div><div class="qd">' + esc(r[2]) + '</div></div>';
    }).join('');
  }

  function renderDeckKpis(p) {
    $('deckKpis').innerHTML =
      kpi('Efectivo real', money(p.cash), 'Disponible hoy', '') +
      kpi('Cartera por cobrar', money(p.receivable), 'Entrada esperada, no efectivo', 'exp') +
      kpi('Cartera vencida', money(p.overdue), 'Al ' + dayLbl(S.evalDay), p.overdue > 0 ? 'bad' : 'exp') +
      kpi('Obligaciones pendientes', money(p.obligations), 'Pagos, nómina y mensualidades', 'bad') +
      kpi('Saldo final proyectado', money(p.final), 'Día ' + p.horizon + '. Mínimo ' + money(p.min) + ', día ' + p.minDay, 'proj', p.final < 0);
  }

  // tablero tipo cabina: cuatro instrumentos con semáforo, calculados con el mismo escenario
  function gauge(name, metric, value, sub, level, frac) {
    var col = { ok: '#5fe0a0', warn: '#ffc35a', bad: '#ff7a7a' }[level];
    var lbl = { ok: 'En la línea', warn: 'Atención', bad: 'Fuera de la línea' }[level];
    frac = Math.max(0.04, Math.min(1, frac));
    var a = Math.PI * (1 - frac), x = 60 + 46 * Math.cos(a), y = 60 - 46 * Math.sin(a);
    return '<div class="gauge ' + level + '"><svg viewBox="0 0 120 70" aria-hidden="true"><path d="M14 60 A46 46 0 0 1 106 60" fill="none" stroke="rgba(160,190,230,.2)" stroke-width="10" stroke-linecap="round"/>' +
      '<path d="M14 60 A46 46 0 0 1 ' + x.toFixed(1) + ' ' + y.toFixed(1) + '" fill="none" stroke="' + col + '" stroke-width="10" stroke-linecap="round"/></svg>' +
      '<div class="gname">' + esc(name) + '</div><div class="gmet">' + esc(metric) + '</div><div class="gval">' + value + '</div><div class="gsub">' + esc(sub) + '</div><div class="glvl"><i style="background:' + col + '"></i>' + lbl + '</div></div>';
  }
  function renderGauges(p) {
    var res = S.reserve || 0;
    var cover = p.obligations > 0 ? (p.cash + p.receivable) / p.obligations : 2;
    var ovr = p.receivable > 0 ? p.overdue / p.receivable : 0;
    $('gauges').innerHTML =
      gauge('Altitud', 'Efectivo hoy', money(p.cash), 'Reserva mínima ' + money(res), p.cash >= res ? 'ok' : p.cash > 0 ? 'warn' : 'bad', res > 0 ? p.cash / (res * 4) : 1) +
      gauge('Velocidad', 'Cartera por cobrar', money(p.receivable), 'Vencida ' + money(p.overdue), ovr === 0 ? 'ok' : ovr < 0.25 ? 'warn' : 'bad', 1 - ovr) +
      gauge('Inclinación', 'Cobertura de pagos', (Math.round(cover * 100)) + ' %', 'Efectivo y cartera contra obligaciones', cover >= 1.2 ? 'ok' : cover >= 1 ? 'warn' : 'bad', cover / 2) +
      gauge('Horizonte', 'Menor saldo proyectado', money(p.min), 'Día ' + p.minDay + ' de ' + p.horizon, p.min >= res ? 'ok' : p.min >= 0 ? 'warn' : 'bad', p.min >= res ? 0.9 : p.min >= 0 ? 0.5 : 0.15);
  }

  function clientsList(p) {
    var seen = {}, out = [];
    p.items.forEach(function (m) { if (m.kind === 'in' && !seen[m.party]) { seen[m.party] = 1; out.push(m.party); } });
    return out;
  }
  function renderStatement(p) {
    var cl = clientsList(p);
    if (cl.indexOf(ui.stmtClient) < 0) ui.stmtClient = cl[0] || '';
    $('stmtClient').innerHTML = cl.map(function (c) { return '<option' + (c === ui.stmtClient ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    var rows = p.items.filter(function (m) { return m.kind === 'in' && m.party === ui.stmtClient; });
    var total = 0, paid = 0, pend = 0, html = '';
    rows.forEach(function (m) {
      total += m.amount; paid += m.paid || 0; pend += m.pending;
      var dd = m.day - S.evalDay, st;
      if (m.pending <= 0) st = '<span class="st realizado">Pagada</span>';
      else if (dd < 0) st = '<span class="st vencido">Vencida hace ' + (-dd) + ' días</span>';
      else if (m.paid > 0) st = '<span class="st parcial">Abono parcial · vence en ' + dd + ' días</span>';
      else st = '<span class="st pendiente">' + (dd === 0 ? 'Vence hoy' : 'Vence en ' + dd + ' días') + '</span>';
      html += '<tr><td data-l="Concepto">' + esc(m.concept) + (m.delayed ? ' <span class="st sup">retrasado ' + m.delayed + ' días</span>' : '') + '</td><td data-l="Vencimiento">' + esc(dayLbl(m.day)) + '</td><td data-l="Venta">' + money(m.amount) + '</td><td data-l="Abonado">' + money(m.paid || 0) + '</td><td data-l="Saldo"><b>' + money(m.pending) + '</b></td><td data-l="Estado">' + st + '</td></tr>';
      (m.payments || []).forEach(function (pp) {
        html += '<tr class="payrow"><td colspan="3" style="padding-left:24px;color:#b4c4da">' + (pp.type === 'abono' ? 'Abono' : 'Cobro') + ' registrado el ' + esc(dayLbl(pp.day)) + '</td><td>' + money(pp.amount) + '</td><td colspan="2"></td></tr>';
      });
    });
    $('stmt').innerHTML = '<div class="stmt"><table><thead><tr><th>Concepto</th><th>Vencimiento</th><th>Venta</th><th>Abonado</th><th>Saldo</th><th>Estado</th></tr></thead><tbody>' + (html || '<tr><td colspan="6">Sin movimientos.</td></tr>') + '</tbody></table>' +
      '<div class="tot"><div>Total vendido<b>' + money(total) + '</b></div><div>Abonado<b>' + money(paid) + '</b></div><div>Saldo pendiente<b>' + money(pend) + '</b></div></div></div>';
  }

  function renderCallouts(p) {
    var nextIn = p.items.filter(function (m) { return m.kind === 'in' && m.pending > 0 && m.day > p.minEnd && m.day <= p.horizon; }).sort(function (a, b) { return a.day - b.day; })[0];
    $('deckCallouts').innerHTML =
      '<div class="co ' + (p.final >= 0 ? 'good' : 'bad') + '"><div class="kl">Saldo al día ' + p.horizon + '</div><div class="kv">' + money(p.final) + '</div><p>Cerrar en positivo no evita un faltante durante el periodo.</p></div>' +
      '<div class="co ' + (p.min < 0 ? 'bad' : '') + '"><div class="kl">Menor saldo proyectado</div><div class="kv">' + money(p.min) + '</div><p>' + esc(minText(p)) + (nextIn ? ', hasta el cobro de ' + esc(nextIn.party) + ' el día ' + nextIn.day : '') + '.</p></div>' +
      '<div class="co ' + (p.shortReserve > 0 ? 'bad' : 'good') + '"><div class="kl">Faltante para mantener la reserva de ' + money(S.reserve) + '</div><div class="kv">' + money(p.shortReserve) + '</div><p>Un saldo negativo es una necesidad de fondos, no un sobregiro autorizado.</p></div>';
  }

  // ---------- pedido ----------
  var OF = [
    ['client', 'Cliente', 'text'], ['price', 'Importe de venta', 'number'], ['cost', 'Costo de materiales', 'number'], ['delivery', 'Gastos de entrega', 'number'],
    ['deliveryDay', 'Día de entrega', 'number'], ['supplierDay', 'Día de pago al proveedor', 'number'], ['collectDay', 'Día de cobro del saldo', 'number']
  ];
  function orderFormHTML(compact) {
    var keys = compact ? ['price', 'cost', 'delivery', 'collectDay'] : OF.map(function (f) { return f[0]; });
    var h = OF.filter(function (f) { return keys.indexOf(f[0]) >= 0; }).map(function (f) {
      return '<label>' + f[1] + '<input class="ofield" data-k="' + f[0] + '" type="' + f[2] + '"' + (f[2] === 'number' ? ' min="0" step="' + (/Day/.test(f[0]) ? 1 : 1000) + '"' : ' maxlength="40"') + '></label>';
    }).join('');
    h += '<div class="advrow"><label>Anticipo<select class="ofield" data-k="advMode"><option value="pct">Porcentaje</option><option value="amt">Importe</option></select></label>' +
      '<label class="advpct">Porcentaje<input class="ofield" data-k="advPct" type="number" min="0" max="100" step="5"></label>' +
      '<label class="advamt">Importe del anticipo<input class="ofield" data-k="advAmt" type="number" min="0" step="1000"></label></div>';
    h += '<div class="obtns"><button class="sbtn" data-plazo="30">Plazo 30 días</button><button class="sbtn" data-plazo="60">Plazo 60 días</button>' +
      '<button class="sbtn ok js-addorder"></button><button class="sbtn js-delorder">Eliminar pedido</button></div>' +
      '<div class="disclaim">Importes sin impuestos para simplificar. El anticipo se recibe el día de entrega. Los materiales se compran para este pedido.</div>';
    return h;
  }
  function syncOrderForms() {
    document.querySelectorAll('.ofield').forEach(function (inp) {
      if (document.activeElement === inp) return;
      inp.value = draft[inp.dataset.k] != null ? draft[inp.dataset.k] : '';
    });
    document.querySelectorAll('.advpct').forEach(function (l) { l.hidden = draft.advMode === 'amt'; });
    document.querySelectorAll('.advamt').forEach(function (l) { l.hidden = draft.advMode !== 'amt'; });
    document.querySelectorAll('.js-addorder').forEach(function (b) { b.textContent = S.order ? 'Pedido en el escenario' : 'Agregar pedido al escenario'; b.disabled = !!S.order; });
    document.querySelectorAll('.js-delorder').forEach(function (b) { b.hidden = !S.order; });
    $('scAdv').value = draft.advMode === 'pct' ? draft.advPct : Math.round(E.advanceOf(draft) / Math.max(1, draft.price) * 100);
    $('scAdvLbl').textContent = $('scAdv').value + ' %';
  }
  function orderOutHTML(a, withChart) {
    var c = function (l, v, p, cls) { return '<div class="co ' + (cls || '') + '"><div class="kl">' + esc(l) + '</div><div class="kv' + (/ \/ /.test(v) ? ' pair' : '') + '">' + esc(v) + '</div>' + (p ? '<p>' + esc(p) + '</p>' : '') + '</div>'; };
    var dMin = a.minChange, dRes = a.shortReserveChange;
    return '<div class="oout">' +
      c('Margen comercial ilustrativo', money(a.margin), 'Antes de impuestos y otros gastos. No es utilidad neta.', a.margin >= 0 ? 'good' : 'bad') +
      c('Salida antes del cobro', money(a.cashOut), 'Materiales y entrega.') +
      c('Anticipo', money(a.advance), 'Efectivo que entra al entregar.') +
      c('Salida neta inicial', money(a.netOut), 'Capital que el pedido pide hasta cobrar ' + money(a.balanceDue) + '.', a.netOut > 0 ? 'bad' : 'good') +
      c('Menor saldo: sin / con pedido', money(a.without.min) + ' / ' + money(a.with.min), dMin === 0 ? 'Sin cambio.' : 'Cambia ' + money(dMin) + '.', dMin < 0 ? 'bad' : '') +
      c('Faltante vs. reserva: sin / con', money(a.without.shortReserve) + ' / ' + money(a.with.shortReserve), dRes === 0 ? 'Sin cambio.' : 'Aumenta ' + money(dRes) + '.', dRes > 0 ? 'bad' : 'good') +
      (withChart ? '<div class="co wide"><div class="kl">Flujo de caja sin el pedido (gris) y con el pedido (turquesa)</div><div class="chartbox js-ochart" style="min-height:220px;height:220px;padding:0;border:0"></div></div>' : '') +
      '<div class="disclaim">Efecto bajo los supuestos capturados. No es una aprobación automática de crédito.</div></div>';
  }
  function renderOrderOut() {
    var a = E.analyzeOrder(S, draft);
    $('deckOrderOut').innerHTML = orderOutHTML(a, true);
    $('simOrderOut').innerHTML = orderOutHTML(a, true);
    document.querySelectorAll('.js-ochart').forEach(function (oc) {
      drawChart(oc, { series: a.with.series, base: a.without.series, reserve: S.reserve, min: a.with.min, minDay: a.with.minDay, minEnd: a.with.minEnd, evalDay: 0 });
    });
  }

  // ---------- simulador ----------
  function renderSim(p, b) {
    $('inCash').value = S.cash; $('inReserve').value = S.reserve; $('inStart').value = ui.start;
    document.querySelectorAll('#horizon button').forEach(function (bt) { bt.classList.toggle('on', +bt.dataset.h === S.horizon); });
    $('inEval').max = S.horizon; $('inEval').value = S.evalDay; $('evalLbl').textContent = dayLbl(S.evalDay);

    var al = $('alert');
    if (p.shortZero > 0) { al.className = 'alert bad'; al.innerHTML = 'El saldo al día ' + p.horizon + ' es <b>' + money(p.final) + '</b>, pero el saldo cae a <b>' + money(p.min) + '</b> (' + esc(minText(p)) + '). Faltan <b>' + money(p.shortZero) + '</b> para no quedar en negativo y <b>' + money(p.shortReserve) + '</b> para mantener la reserva. Un saldo negativo es una necesidad de fondos, no un sobregiro autorizado.'; }
    else if (p.shortReserve > 0) { al.className = 'alert warn'; al.innerHTML = 'El saldo no queda en negativo, pero baja de la reserva mínima desde el ' + esc(dayLbl(p.firstBelowReserve)) + '. Faltan <b>' + money(p.shortReserve) + '</b> para mantenerla.'; }
    else { al.className = 'alert ok'; al.textContent = 'Con estos supuestos el saldo se mantiene sobre la reserva mínima todo el periodo.'; }

    $('simKpis').innerHTML =
      kpi('Efectivo disponible actual', money(p.cash), 'Efectivo real', '') +
      kpi('Cartera pendiente de cobro', money(p.receivable), 'Entrada esperada, no es efectivo', 'exp') +
      kpi('Cartera vencida', money(p.overdue), 'Al ' + dayLbl(S.evalDay), p.overdue > 0 ? 'bad' : 'exp') +
      kpi('Obligaciones pendientes', money(p.obligations), 'Incluye ' + money(p.inHorizonOut) + ' dentro del horizonte', 'bad') +
      kpi('Saldo final proyectado', money(p.final), 'Día ' + p.horizon + ' · ' + dateOf(p.horizon), 'proj', p.final < 0) +
      kpi('Menor saldo del periodo', money(p.min), minText(p), 'proj', p.min < 0) +
      kpi('Faltante respecto a cero', money(p.shortZero), 'Para no quedar en negativo', p.shortZero > 0 ? 'bad' : '') +
      kpi('Faltante respecto a la reserva', money(p.shortReserve), 'Reserva ' + money(S.reserve), p.shortReserve > 0 ? 'bad' : '');

    drawChart($('simChart'), { series: p.series, base: b.series, reserve: S.reserve, min: p.min, minDay: p.minDay, minEnd: p.minEnd, evalDay: S.evalDay });

    // calendario
    var byDay = {};
    p.items.forEach(function (m) { if (m.pending > 0 && m.day <= p.horizon) { var d = Math.max(0, m.day); (byDay[d] = byDay[d] || { i: 0, o: 0, n: [] }); if (m.kind === 'in') byDay[d].i += m.pending; else byDay[d].o += m.pending; byDay[d].n.push(m.party + ' ' + money(m.pending)); } });
    var cal = '';
    for (var d = 0; d <= p.horizon; d++) {
      var v = p.series[d], x = byDay[d];
      var cls = v < 0 ? 'neg' : v < S.reserve ? 'low' : '';
      cal += '<div class="cd ' + cls + (d === S.evalDay ? ' ev' : '') + '" title="' + esc(x ? x.n.join(' · ') : 'Sin movimientos') + '"><div class="cdn"><span>' + d + '</span><span>' + esc(dateOf(d)) + '</span></div>' +
        (x && x.i ? '<div class="ci">+' + short(x.i) + '</div>' : '') + (x && x.o ? '<div class="co2">−' + short(x.o) + '</div>' : '') +
        '<div class="cb">' + short(v) + '</div></div>';
    }
    $('cal').innerHTML = cal;
    $('outside').innerHTML = p.outside.length ? '<b>Fuera del horizonte (no cuentan en el saldo final):</b> ' + p.outside.map(function (m) { return esc(m.party) + ' ' + (m.kind === 'in' ? '+' : '−') + money(m.pending) + ' el ' + esc(dayLbl(m.day)); }).join(' · ') : '';

    // escenarios: selectores
    var ins = S.movements.filter(function (m) { return m.kind === 'in'; });
    var opt = function (list) { return list.map(function (m) { return '<option value="' + esc(m.id) + '">' + esc(m.party) + ' · ' + money(Math.max(0, m.amount - (m.paid || 0))) + ' · día ' + m.day + '</option>'; }).join(''); };
    keepSel('scDelayWho', opt(ins));
    keepSel('scAbonoWho', opt(p.items.filter(function (m) { return m.kind === 'in' && m.pending > 0; })));
    keepSel('scSupWho', opt(S.movements.filter(function (m) { return m.cat === 'proveedor'; })));
    $('scPayroll').checked = !!S.payrollUp;

    // comparación
    var rows = [
      ['Efectivo hoy', b.cash, p.cash, 1], ['Saldo final (día ' + p.horizon + ')', b.final, p.final, 1], ['Menor saldo', b.min, p.min, 1],
      ['Día del menor saldo', 'día ' + b.minDay, 'día ' + p.minDay, 0], ['Faltante respecto a cero', b.shortZero, p.shortZero, -1], ['Faltante respecto a la reserva', b.shortReserve, p.shortReserve, -1]
    ];
    $('cmp').innerHTML = '<thead><tr><th></th><th>Inicial</th><th>Modificado</th><th>Diferencia</th></tr></thead><tbody>' + rows.map(function (r) {
      if (!r[3]) return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td><td></td></tr>';
      var df = r[2] - r[1], good = r[3] > 0 ? df > 0 : df < 0;
      return '<tr><td>' + r[0] + '</td><td>' + money(r[1]) + '</td><td>' + money(r[2]) + '</td><td class="' + (df === 0 ? '' : good ? 'up' : 'down') + '">' + (df === 0 ? '—' : (df > 0 ? '+' : '') + money(df)) + '</td></tr>';
    }).join('') + '</tbody>';

    renderTable(p);
    renderCalc();
    renderWa(p);
  }
  function keepSel(id, html) { var el = $(id), v = el.value; el.innerHTML = html; if (v && el.querySelector('option[value="' + CSS.escape(v) + '"]')) el.value = v; }

  function renderTable(p) {
    var parties = [], cats = [];
    p.items.forEach(function (m) { if (parties.indexOf(m.party) < 0) parties.push(m.party); if (cats.indexOf(m.cat) < 0) cats.push(m.cat); });
    var fp = $('fParty').value, fc = $('fCat').value, fs = $('fStatus').value;
    $('fParty').innerHTML = '<option value="">Todos los clientes y proveedores</option>' + parties.map(function (x) { return '<option' + (x === fp ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('');
    $('fCat').innerHTML = '<option value="">Todas las categorías</option>' + cats.map(function (x) { return '<option value="' + x + '"' + (x === fc ? ' selected' : '') + '>' + esc(CAT[x] || x) + '</option>'; }).join('');
    var rows = p.items.filter(function (m) { return (!fp || m.party === fp) && (!fc || m.cat === fc) && (!fs || m.status === fs); }).sort(function (a, b) { return a.day - b.day; });
    $('mov').innerHTML = '<thead><tr><th>Vence</th><th>Cliente o proveedor</th><th>Concepto</th><th>Categoría</th><th class="num">Importe</th><th class="num">Pendiente</th><th>Estado</th><th>Acción</th></tr></thead><tbody>' +
      rows.map(function (m) {
        var tags = (m.origin === 'pedido' ? ' <span class="st sup">pedido simulado</span>' : '') + (m.origin === 'captura' ? ' <span class="st sup">capturado</span>' : '') + (m.assumption ? ' <span class="st sup">' + esc(m.assumption) + '</span>' : '') + (m.delayed ? ' <span class="st sup">retrasado ' + m.delayed + ' días</span>' : '') + (m.cat === 'nomina' && S.payrollUp ? ' <span class="st sup">+10 %</span>' : '');
        var act = '';
        if (m.pending > 0 && m.kind === 'in') act = '<input type="number" min="1" step="1000" value="' + m.pending + '" aria-label="Importe"><button class="sbtn mini" data-collect="' + esc(m.id) + '">Registrar cobro o abono</button>';
        else if (m.pending > 0) act = '<button class="sbtn mini" data-pay="' + esc(m.id) + '">Confirmar pago</button>';
        else act = '<span class="st realizado">' + (m.kind === 'in' ? 'Cobrado' : 'Pagado') + '</span>';
        return '<tr class="' + (m.status === 'fuera' ? 'outh' : '') + '"><td data-l="Vence">' + esc(dayLbl(m.day)) + '</td><td data-l="Contraparte">' + esc(m.party) + '</td><td data-l="Concepto">' + esc(m.concept) + tags + '</td><td data-l="Categoría">' + esc(CAT[m.cat] || m.cat) + '</td>' +
          '<td data-l="Importe" class="num ' + m.kind + '">' + (m.kind === 'in' ? '+' : '−') + money(m.amount) + '</td><td data-l="Pendiente" class="num">' + money(m.pending) + '</td><td data-l="Estado"><span class="st ' + m.status + '">' + STL[m.status] + '</span></td><td data-l="Acción"><div class="acts">' + act + '</div></td></tr>';
      }).join('') + (rows.length ? '' : '<tr><td colspan="8">Sin movimientos con estos filtros.</td></tr>') + '</tbody>';
  }

  function renderCalc() {
    var h = Math.max(0, +$('cHours').value || 0), pc = Math.max(0, Math.min(100, +$('cPct').value || 0)), r = Math.max(0, +$('cRate').value || 0);
    var hrs = h * 4.33 * pc / 100;
    $('cOut').innerHTML = '<span>Horas liberadas al mes</span><b>' + hrs.toLocaleString('es-MX', { maximumFractionDigits: 1 }) + ' h</b><span>Valor estimado del tiempo: ' + money(hrs * r) + ' al mes</span>';
    ui.calc = { h: h, p: pc, r: r };
  }

  var waState = { draft: null, edited: false, discarded: false };
  function waDraftText(p) {
    var t = p.items.filter(function (m) { return m.kind === 'in' && m.cat !== 'anticipo' && m.pending > 0; }).sort(function (a, b) { return a.day - b.day; });
    var m = t.find(function (x) { return x.day < S.evalDay; }) || t.find(function (x) { return x.party === 'Cliente B'; }) || t[0];
    if (!m) return null;
    return { party: m.party, text: 'Hola, buen día. Le recordamos que su saldo de ' + money(m.pending) + (m.day < S.evalDay ? ' venció el ' : ' vence el ') + dateOf(m.day) + '. ¿Nos confirma la fecha de pago? Gracias.' };
  }
  function renderWa(p) {
    if (waState.discarded) { $('waDraft').hidden = true; return; }
    if (!waState.edited) waState.draft = waDraftText(p);
    $('waDraft').hidden = !waState.draft;
    if (waState.draft) $('waDraft').innerHTML = esc(waState.draft.text) + '<span class="who">Borrador para ' + esc(waState.draft.party) + ' · pendiente de revisión humana</span>';
  }

  // ---------- render general ----------
  function render() {
    var p = E.project(S), b = E.project(baseline());
    renderQ4(p); renderDeckKpis(p); renderGauges(p); renderStatement(p); renderCallouts(p);
    if (ui.slide === 5 || !ui.drawnDeck) drawChart($('deckChart'), { series: p.series, base: b.series, reserve: S.reserve, min: p.min, minDay: p.minDay, minEnd: p.minEnd, evalDay: S.evalDay });
    syncOrderForms(); renderOrderOut();
    if (ui.view === 'sim') renderSim(p, b);
    document.querySelectorAll('.js-cname').forEach(function (e) { e.textContent = ui.cname; });
    save();
  }
  function change(fn) { return function () { var r = fn.apply(this, arguments); render(); return r; }; }

  // ---------- línea de tiempo (diapositiva 2, escenario inicial) ----------
  function renderTimeline() {
    var W = 1160, H = 240, x = function (d) { return 40 + d / 36 * (W - 80); }, mid = 120;
    var pays = [[7, 'Proveedor A', 90000], [10, 'Vehículo', 12000], [15, 'Proveedor B + nómina', 105000], [25, 'Otros gastos', 18000]];
    var ins = [[20, 'Cliente A', 120000], [35, 'Cliente B', 80000]];
    var g = '<rect x="' + x(0) + '" y="' + (mid - 6) + '" width="' + (x(20) - x(0)) + '" height="12" rx="6" fill="rgba(255,122,122,.35)"/>' +
      '<rect x="' + x(20) + '" y="' + (mid - 6) + '" width="' + (x(36) - x(20)) + '" height="12" rx="6" fill="rgba(25,195,177,.35)"/>' +
      '<text x="' + x(10) + '" y="' + (mid + 32) + '" fill="#ffd0d0" font-size="15" font-weight="700" text-anchor="middle">El dinero ya salió y todavía no regresa</text>';
    for (var d = 0; d <= 35; d += 5) g += '<text x="' + x(d) + '" y="' + (mid + 4) + '" dy="-14" fill="#8ea3bf" font-size="12" text-anchor="middle">día ' + d + '</text>';
    pays.forEach(function (q, i) { var yy = i % 2 ? 22 : 52; g += '<line x1="' + x(q[0]) + '" x2="' + x(q[0]) + '" y1="' + (yy + 8) + '" y2="' + (mid - 8) + '" stroke="#ff7a7a"/><circle cx="' + x(q[0]) + '" cy="' + (mid) + '" r="7" fill="#ff7a7a"/><text x="' + x(q[0]) + '" y="' + yy + '" fill="#ffb3b3" font-size="14" font-weight="700" text-anchor="middle">Pago ' + esc(q[1]) + ' ' + money(q[2]) + '</text>'; });
    ins.forEach(function (q) { g += '<line x1="' + x(q[0]) + '" x2="' + x(q[0]) + '" y1="' + (mid + 8) + '" y2="' + (mid + 56) + '" stroke="#5fe0a0"/><circle cx="' + x(q[0]) + '" cy="' + mid + '" r="7" fill="#5fe0a0"/><text x="' + x(q[0]) + '" y="' + (mid + 76) + '" fill="#a8f0c8" font-size="14" font-weight="700" text-anchor="' + (q[0] >= 30 ? 'end' : 'middle') + '">Cobro ' + esc(q[1]) + ' ' + money(q[2]) + '</text>'; });
    g += '<text x="' + (W - 40) + '" y="' + (H - 6) + '" fill="#ffc35a" font-size="12" text-anchor="end">Escenario inicial · datos simulados</text>';
    var ev = pays.map(function (q) { return [q[0], 'out', 'Pago ' + q[1], q[2]]; }).concat(ins.map(function (q) { return [q[0], 'in', 'Cobro ' + q[1], q[2]]; })).sort(function (a, b) { return a[0] - b[0]; });
    var v = '<ol class="tlv">' + ev.map(function (e, k) {
      return '<li class="' + e[1] + (e[0] < 20 ? ' gap' : '') + '"><span class="tday">Día ' + e[0] + '</span><span class="tlbl">' + esc(e[2]) + '</span><b>' + (e[1] === 'in' ? '+' : '−') + money(e[3]) + '</b></li>';
    }).join('') + '</ol><p class="tlnote">Del día 0 al 19 el dinero ya salió y todavía no regresa. Escenario inicial, datos simulados.</p>';
    $('timeline').innerHTML = '<svg class="tlh" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Línea de tiempo de pagos y cobros">' + g + '</svg>' + v;
  }

  // ---------- presentación ----------
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  function isPhone() { return window.innerWidth <= 820; }
  function fit() {
    var st = $('stage');
    if (window.innerWidth <= 820) { st.style.transform = 'none'; return; }
    var w = $('stagewrap').clientWidth, h = $('stagewrap').clientHeight;
    var s = Math.min(w / 1280, h / 720) * 0.97;
    st.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
  }
  function show(i) {
    ui.slide = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach(function (s, k) { s.classList.toggle('on', k === ui.slide); });
    $('count').textContent = (ui.slide + 1) + ' / ' + slides.length;
    $('notes').innerHTML = '<b>Notas para el presentador:</b> ' + esc(SLIDES[ui.slide].notes);
    $('caption').textContent = SLIDES[ui.slide].narr;
    if (ui.slide === 5) { var p = E.project(S), b = E.project(baseline()); drawChart($('deckChart'), { series: p.series, base: b.series, reserve: S.reserve, min: p.min, minDay: p.minDay, minEnd: p.minEnd, evalDay: S.evalDay }); ui.drawnDeck = true; }
    if (ui.slide === 6) renderOrderOut();
    if (isPhone() && ui.view === 'deck') window.scrollTo(0, 0);
    $('volBanner') && ($('volBanner').hidden = ui.slide !== 0);
    save();
    if (playing) speak(ui.slide);
  }

  // voz: Edge neural (Dalia) por /api/tts/edge; si falla, voz del navegador; si tampoco, pausa de lectura
  var playing = false, cache = {}, token = 0, timer = null, playerTok = -1;
  var player = new Audio(); player.preload = 'auto'; player.setAttribute('playsinline', '');
  player.onended = function () { if (playerTok === token) advance(token); };
  var SILENT = (function () { var n = 800, b = new Uint8Array(44 + n), dv = new DataView(b.buffer), w = function (o, t) { for (var i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true); for (var i = 44; i < 44 + n; i++) b[i] = 128;
    return URL.createObjectURL(new Blob([b], { type: 'audio/wav' })); })();
  function unlockAudio() { try { playerTok = -1; player.src = SILENT; var pr = player.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {} }
  function stopAudio() { token++; playerTok = -1; try { player.pause(); } catch (e) {} if (window.speechSynthesis) speechSynthesis.cancel(); clearTimeout(timer); }
  function fetchTTS(i) {
    if (cache[i]) return Promise.resolve(cache[i]);
    return fetch('/api/tts/edge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: SLIDES[i].narr, voice: 'dalia' }) })
      .then(function (r) { if (!r.ok) throw new Error('tts ' + r.status); return r.blob(); })
      .then(function (b) { if (!b || b.size < 500) throw new Error('vacío'); cache[i] = URL.createObjectURL(b); return cache[i]; });
  }
  function advance(t) { if (t !== token || !playing) return; if (ui.slide < slides.length - 1) show(ui.slide + 1); else setPlaying(false); }
  function speak(i) {
    stopAudio(); var t = token;
    $('caption').textContent = SLIDES[i].narr;
    if (i + 1 < slides.length) fetchTTS(i + 1).catch(function () {});
    fetchTTS(i).then(function (url) {
      if (t !== token) return;
      playerTok = t; player.src = url;
      return player.play();
    }).catch(function () {
      if (t !== token) return;
      if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
        var u = new SpeechSynthesisUtterance(SLIDES[i].narr); u.lang = 'es-MX'; u.rate = 0.98;
        var v = speechSynthesis.getVoices().filter(function (x) { return /^es/i.test(x.lang); })[0]; if (v) u.voice = v;
        u.onend = function () { advance(t); }; u.onerror = function () { advance(t); };
        speechSynthesis.speak(u);
      } else { timer = setTimeout(function () { advance(t); }, Math.max(6000, SLIDES[i].narr.split(' ').length * 380)); }
    });
  }
  function setPlaying(on) {
    playing = on; $('playLbl').textContent = on ? 'Pausar' : 'Escuchar a Dalia'; $('play').classList.toggle('on', on);
    if (on) { unlockAudio(); speak(ui.slide); } else { stopAudio(); }
  }

  function showView(v, anchor) {
    ui.view = v;
    $('deck').hidden = v !== 'deck'; $('sim').hidden = v !== 'sim';
    $('toDeck').setAttribute('aria-current', v === 'deck'); $('toSim').setAttribute('aria-current', v === 'sim');
    document.body.dataset.view = v;
    if (v === 'sim') $('intro').hidden = true;
    if (v === 'sim') { if (playing) setPlaying(false); render(); if (anchor && anchor !== 'top' && $(anchor)) $(anchor).scrollIntoView({ behavior: 'smooth' }); else window.scrollTo(0, 0); }
    else { fit(); show(ui.slide); render(); }
    history.replaceState(null, '', v === 'sim' ? '#simulador' : '#presentacion');
  }

  // ---------- eventos ----------
  function bind() {
    $('prev').onclick = function () { show(ui.slide - 1); };
    $('next').onclick = function () { show(ui.slide + 1); };
    $('play').onclick = function () { setPlaying(!playing); };
    $('introPlay').onclick = function () { closeIntro(); show(0); setPlaying(true); };
    $('introSkip').onclick = function () { closeIntro(); };
    $('volPlay').onclick = function () { if (!playing) setPlaying(true); };
    $('caption').onclick = function () { this.classList.toggle('open'); };
    $('notesBtn').onclick = function () { ui.notes = !ui.notes; $('notes').hidden = !ui.notes; };
    $('toDeck').onclick = function () { showView('deck'); };
    $('toSim').onclick = function () { showView('sim'); };
    $('backDeck').onclick = function () { showView('deck'); };
    document.addEventListener('click', function (e) {
      var g = e.target.closest('[data-goto-sim]'); if (g) { showView('sim', g.dataset.gotoSim); return; }
      var pl = e.target.closest('[data-plazo]'); if (pl) { draft.collectDay = (+draft.deliveryDay || 0) + (+pl.dataset.plazo); if (S.order) E.setOrder(S, draft); render(); return; }
      if (e.target.closest('.js-addorder')) { E.setOrder(S, draft); render(); return; }
      if (e.target.closest('.js-delorder')) { E.removeOrder(S); render(); return; }
      var c = e.target.closest('[data-collect]'); if (c) { var amt = +c.parentNode.querySelector('input').value; E.collect(S, c.dataset.collect, amt); render(); return; }
      var pa = e.target.closest('[data-pay]'); if (pa) { E.pay(S, pa.dataset.pay); render(); return; }
      var dl = e.target.closest('[data-delay]'); if (dl) { E.delay(S, $('scDelayWho').value, +dl.dataset.delay); render(); return; }
    });
    document.addEventListener('input', function (e) {
      var k = e.target.dataset && e.target.dataset.k;
      if (k) { draft[k] = e.target.type === 'number' ? Math.max(0, +e.target.value || 0) : e.target.value; if (S.order) E.setOrder(S, draft); render(); }
    });
    document.addEventListener('change', function (e) { if (e.target.dataset && e.target.dataset.k === 'advMode') { draft.advMode = e.target.value; if (S.order) E.setOrder(S, draft); render(); } });
    $('stmtClient').onchange = function () { ui.stmtClient = this.value; render(); };
    $('inCash').onchange = change(function () { S.cash = Math.round(+this.value || 0); });
    $('inReserve').onchange = change(function () { S.reserve = Math.max(0, Math.round(+this.value || 0)); });
    $('inStart').onchange = change(function () { if (/^\d{4}-\d{2}-\d{2}$/.test(this.value)) ui.start = this.value; });
    $('inEval').oninput = change(function () { S.evalDay = +this.value; });
    document.querySelectorAll('#horizon button').forEach(function (b) { b.onclick = change(function () { S.horizon = +b.dataset.h; if (S.evalDay > S.horizon) S.evalDay = S.horizon; }); });
    $('scAbono').onclick = change(function () { E.collect(S, $('scAbonoWho').value, +$('scAbonoAmt').value); });
    $('scSup').onclick = change(function () { E.moveSupplier(S, $('scSupWho').value, +$('scSupDay').value); });
    $('scPayroll').onchange = change(function () { E.setPayrollUp(S, this.checked); });
    $('scExtra').onclick = change(function () { E.addExtra(S, +$('scExtraAmt').value, +$('scExtraDay').value); });
    $('scAdv').oninput = change(function () { draft.advMode = 'pct'; draft.advPct = +this.value; if (S.order) E.setOrder(S, draft); });
    $('fParty').onchange = $('fCat').onchange = $('fStatus').onchange = function () { renderTable(E.project(S)); };
    $('resetAll').onclick = function () { S = E.fresh(); draft = Object.assign({}, E.DEFAULT_ORDER); waState = { draft: null, edited: false, discarded: false }; $('reviewForm').hidden = true; $('waAbono').hidden = true; $('waMsg').textContent = ''; render(); };
    ['cHours', 'cPct', 'cRate'].forEach(function (id) { $(id).oninput = function () { renderCalc(); save(); }; });

    // captura revisada
    $('readDoc').onclick = function () {
      var f = $('reviewForm'); f.hidden = false; $('reviewMsg').textContent = '';
      f.party.value = 'Ferretera Simulada'; f.concept.value = 'Cemento gris, 200 bultos'; f.amount.value = 24500; f.docDay.value = 2; f.day.value = 18; f.kind.value = 'out'; f.done.value = '0';
    };
    $('reviewForm').onsubmit = function (e) {
      e.preventDefault(); var f = this;
      if (!(+f.amount.value > 0) || !f.party.value.trim()) { $('reviewMsg').textContent = 'Revisa el importe y el nombre antes de guardar.'; return; }
      var m = E.addMovement(S, { kind: f.kind.value, party: f.party.value.trim(), concept: f.concept.value.trim(), amount: +f.amount.value, day: +f.day.value, done: f.done.value === '1' });
      f.hidden = true; render();
      $('reviewMsg').textContent = '';
      $('readDoc').insertAdjacentHTML('afterend', '<div class="rmsg">Guardado en el escenario: ' + esc(m.party) + ', ' + money(m.amount) + ', ' + (f.done.value === '1' ? 'realizado' : 'pendiente') + ' el ' + esc(dayLbl(m.day)) + '. Ya aparece en la proyección.</div>');
    };
    $('discardDoc').onclick = function () { $('reviewForm').hidden = true; };

    // WhatsApp (demostración)
    $('waPropose').onclick = function () {
      var m = E.effective(S).find(function (x) { return x.id === 'c-a'; });
      var box = $('waAbono'); box.hidden = false;
      if (!m || m.pending <= 0) { box.innerHTML = 'Cliente A ya no tiene saldo pendiente en el escenario.'; return; }
      var amt = Math.min(40000, m.pending);
      box.innerHTML = '<b>Registro propuesto:</b> Cliente A · abono · ' + money(amt) + ' · ' + esc(dayLbl(S.evalDay)) + '<br>Saldo antes ' + money(m.pending) + ', después ' + money(m.pending - amt) + '. El resto conserva su vencimiento del día ' + m.day + '.<div class="rbtns"><button class="sbtn ok" id="waConfirm">Confirmar abono</button><button class="sbtn" id="waNo">Descartar</button></div>';
      $('waConfirm').onclick = function () { E.collect(S, 'c-a', amt); box.innerHTML = 'Abono registrado en el escenario. Subió el efectivo y bajó el saldo de Cliente A.'; render(); };
      $('waNo').onclick = function () { box.hidden = true; };
    };
    $('waApprove').onclick = function () { $('waMsg').textContent = waState.discarded ? 'No hay borrador.' : 'Aprobado. En esta demostración no se envió ningún mensaje.'; };
    $('waEditBtn').onclick = function () {
      var ta = $('waEdit');
      if (ta.hidden) { if (!waState.draft) return; ta.value = waState.draft.text; ta.hidden = false; this.textContent = 'Guardar cambios'; }
      else { waState.draft.text = ta.value.slice(0, 600); waState.edited = true; ta.hidden = true; this.textContent = 'Editar'; renderWa(E.project(S)); }
    };
    $('waDiscard').onclick = function () { waState.discarded = true; $('waMsg').textContent = 'Borrador descartado. No se envió nada.'; renderWa(E.project(S)); };

    // nombre editable
    $('cname').oninput = function () { ui.cname = (this.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Empresa de Rafael'; document.querySelectorAll('.js-cname').forEach(function (e) { e.textContent = ui.cname; }); save(); };
    $('cname').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); this.blur(); } };

    // teclado y gestos
    document.addEventListener('keydown', function (e) {
      if (ui.view !== 'deck' || window.D2BOOK_OPEN) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.target.isContentEditable) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); show(ui.slide + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(ui.slide - 1); }
      else if (e.key === 'Home') show(0); else if (e.key === 'End') show(slides.length - 1);
      else if (e.key.toLowerCase() === 'f') toggleFs();
    });
    var tx = null;
    $('stagewrap').addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
    $('stagewrap').addEventListener('touchend', function (e) {
      if (tx == null || e.target.closest('input,select,button,textarea')) return;
      var dx = e.changedTouches[0].clientX - tx; tx = null;
      if (Math.abs(dx) > 60) show(ui.slide + (dx < 0 ? 1 : -1));
    });
    $('fsBtn').onclick = toggleFs;
    window.addEventListener('resize', function () { fit(); if (ui.view === 'sim') render(); else if (ui.slide === 5) show(5); });
    window.addEventListener('d2book:open', function () { if (playing) setPlaying(false); });
  }
  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
    setTimeout(fit, 200);
  }

  function closeIntro() { $('intro').hidden = true; try { sessionStorage.setItem('fz_intro', '1'); } catch (e) {} }
  function openIntro() { var seen = false; try { seen = sessionStorage.getItem('fz_intro') === '1'; } catch (e) {} if (!seen && ui.view === 'deck') $('intro').hidden = false; }

  // ---------- inicio ----------
  load();
  $('deckOrderForm').innerHTML = orderFormHTML(true);
  $('simOrderForm').innerHTML = orderFormHTML(false);
  $('cname').textContent = ui.cname;
  $('cHours').value = ui.calc.h; $('cPct').value = ui.calc.p; $('cRate').value = ui.calc.r;
  bind(); renderTimeline();
  showView(/simulador/.test(location.hash) ? 'sim' : 'deck');
  openIntro();
  window.FzApp = { state: function () { return S; }, draft: function () { return draft; }, project: function () { return E.project(S); } };
})();
