/* Simulador de capital — motor de cálculo (datos simulados).
   Es el único lugar donde se calcula una cifra. La página solo la dibuja.
   Importes en pesos enteros (MXN, sin impuestos). Los días se cuentan desde el día 0 (inicio del escenario). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FzEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var INITIAL = {
    cash: 150000,
    reserve: 30000,
    horizon: 60,
    evalDay: 0,
    movements: [
      { id: 'c-a', kind: 'in',  cat: 'cliente',   party: 'Cliente A',   concept: 'Venta a crédito, saldo pendiente', amount: 120000, day: 20 },
      { id: 'c-b', kind: 'in',  cat: 'cliente',   party: 'Cliente B',   concept: 'Venta a crédito, saldo pendiente', amount: 80000,  day: 35 },
      { id: 'p-a', kind: 'out', cat: 'proveedor', party: 'Proveedor A', concept: 'Pago de materiales',               amount: 90000,  day: 7 },
      { id: 'p-b', kind: 'out', cat: 'proveedor', party: 'Proveedor B', concept: 'Pago de materiales',               amount: 60000,  day: 15 },
      { id: 'nom', kind: 'out', cat: 'nomina',    party: 'Nómina',      concept: 'Nómina pendiente',                 amount: 45000,  day: 15 },
      { id: 'veh', kind: 'out', cat: 'vehiculo',  party: 'Financiera',  concept: 'Mensualidad de vehículo',          amount: 12000,  day: 10 },
      { id: 'otr', kind: 'out', cat: 'gasto',     party: 'Varios',      concept: 'Otros gastos pendientes',          amount: 18000,  day: 25 }
    ],
    order: null,
    payrollUp: false,
    log: []
  };

  var DEFAULT_ORDER = {
    client: 'Cliente C', price: 100000, cost: 75000, delivery: 5000,
    advMode: 'pct', advPct: 0, advAmt: 0,
    deliveryDay: 5, supplierDay: 5, collectDay: 35
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function int(v, d) { var n = Math.round(Number(v)); return isFinite(n) ? n : (d || 0); }
  function clampDay(v) { return Math.max(0, Math.min(365, int(v))); }

  function fresh() {
    var s = clone(INITIAL);
    s.movements.forEach(function (m) { m.paid = 0; m.baseDay = m.day; m.baseAmount = m.amount; m.payments = []; });
    return s;
  }

  function advanceOf(o) {
    if (!o) return 0;
    var price = Math.max(0, int(o.price));
    var a = o.advMode === 'amt' ? int(o.advAmt) : Math.round(price * Math.max(0, Math.min(100, Number(o.advPct) || 0)) / 100);
    return Math.max(0, Math.min(price, a));
  }

  /* Movimientos que nacen de un pedido. Se derivan del pedido cada vez:
     así se crean una sola vez, y editar o borrar el pedido los actualiza o los quita. */
  function orderMovements(o) {
    if (!o) return [];
    var paid = o.paid || {};
    var adv = advanceOf(o), price = Math.max(0, int(o.price));
    var list = [];
    function add(m) { m.paid = paid[m.id] || 0; m.origin = 'pedido'; m.baseDay = m.day; m.baseAmount = m.amount; m.payments = (o.payments && o.payments[m.id]) || []; list.push(m); }
    if (int(o.cost) > 0) add({ id: 'o-mat', kind: 'out', cat: 'proveedor', party: 'Proveedor del pedido', concept: 'Materiales del nuevo pedido', amount: int(o.cost), day: clampDay(o.supplierDay) });
    if (int(o.delivery) > 0) add({ id: 'o-ent', kind: 'out', cat: 'entrega', party: 'Entrega', concept: 'Gastos directos de entrega', amount: int(o.delivery), day: clampDay(o.deliveryDay) });
    if (adv > 0) add({ id: 'o-ant', kind: 'in', cat: 'anticipo', party: o.client || 'Cliente nuevo', concept: 'Anticipo del nuevo pedido', amount: adv, day: clampDay(o.deliveryDay) });
    if (price - adv > 0) add({ id: 'o-sal', kind: 'in', cat: 'cliente', party: o.client || 'Cliente nuevo', concept: 'Saldo del nuevo pedido a crédito', amount: price - adv, day: clampDay(o.collectDay) });
    return list;
  }

  function effective(s) {
    return s.movements.concat(orderMovements(s.order)).map(function (m) {
      var e = Object.assign({}, m);
      e.pending = Math.max(0, int(m.amount) - int(m.paid));
      return e;
    });
  }

  function statusOf(m, s) {
    if (m.pending <= 0) return 'realizado';
    if (m.day > s.horizon) return 'fuera';
    if (m.day < s.evalDay) return 'vencido';
    if (m.paid > 0) return 'parcial';
    return 'pendiente';
  }

  /* Saldo proyectado diario = saldo inicial + cobros acumulados previstos − pagos acumulados previstos.
     Solo cuenta la parte pendiente de cada movimiento: lo ya cobrado o pagado ya está en el efectivo. */
  function project(s) {
    var H = int(s.horizon) || 60;
    var items = effective(s);
    var delta = new Array(H + 1).fill(0);
    var outside = [];
    items.forEach(function (m) {
      if (m.pending <= 0) return;
      if (m.day > H) { outside.push(m); return; }
      var d = Math.max(0, m.day);
      delta[d] += m.kind === 'in' ? m.pending : -m.pending;
    });
    var series = [], b = int(s.cash);
    for (var d = 0; d <= H; d++) { b += delta[d]; series.push(b); }
    var min = Infinity, minDay = 0;
    series.forEach(function (v, i) { if (v < min) { min = v; minDay = i; } });
    var minEnd = minDay;
    while (minEnd + 1 <= H && series[minEnd + 1] === min) minEnd++;
    var reserve = int(s.reserve);
    var firstBelowReserve = -1, firstNegative = -1;
    series.forEach(function (v, i) {
      if (firstBelowReserve < 0 && v < reserve) firstBelowReserve = i;
      if (firstNegative < 0 && v < 0) firstNegative = i;
    });
    var sum = function (f) { return items.filter(f).reduce(function (a, m) { return a + m.pending; }, 0); };
    return {
      horizon: H,
      series: series,
      final: series[H],
      min: min, minDay: minDay, minEnd: minEnd,
      shortZero: Math.max(0, -min),
      shortReserve: Math.max(0, reserve - min),
      firstBelowReserve: firstBelowReserve,
      firstNegative: firstNegative,
      cash: int(s.cash),
      // Cartera = lo que los clientes deben. El anticipo es efectivo al entregar, no cartera.
      receivable: sum(function (m) { return m.kind === 'in' && m.cat !== 'anticipo'; }),
      overdue: sum(function (m) { return m.kind === 'in' && m.cat !== 'anticipo' && m.day < s.evalDay; }),
      overduePay: sum(function (m) { return m.kind === 'out' && m.day < s.evalDay; }),
      obligations: sum(function (m) { return m.kind === 'out'; }),
      inHorizonIn: sum(function (m) { return m.kind === 'in' && m.day <= H; }),
      inHorizonOut: sum(function (m) { return m.kind === 'out' && m.day <= H; }),
      outside: outside,
      items: items.map(function (m) { m.status = statusOf(m, s); return m; })
    };
  }

  /* Análisis de un pedido nuevo bajo los supuestos capturados. No aprueba crédito. */
  function analyzeOrder(s, draft) {
    var o = Object.assign({}, DEFAULT_ORDER, draft || {});
    var adv = advanceOf(o);
    var price = int(o.price), cost = int(o.cost), del = int(o.delivery);
    var without = clone(s); without.order = null;
    var withIt = clone(s); withIt.order = Object.assign({}, o, { paid: (s.order && s.order.paid) || {}, payments: (s.order && s.order.payments) || {} });
    var a = project(without), b = project(withIt);
    return {
      advance: adv,
      margin: price - cost - del,           // margen comercial ilustrativo, antes de impuestos y otros gastos
      cashOut: cost + del,                   // salida antes del cobro
      netOut: cost + del - adv,              // salida neta inicial
      balanceDue: price - adv,
      without: a, with: b,
      minChange: b.min - a.min,
      shortReserveChange: b.shortReserve - a.shortReserve
    };
  }

  // ---- operaciones (mutan el escenario) ----
  function find(s, id) {
    var m = s.movements.find(function (x) { return x.id === id; });
    if (m) return { m: m, inOrder: false };
    var om = orderMovements(s.order).find(function (x) { return x.id === id; });
    return om ? { m: om, inOrder: true } : null;
  }
  function setPaid(s, ref, paid, entry) {
    if (ref.inOrder) {
      s.order.paid = s.order.paid || {}; s.order.payments = s.order.payments || {};
      s.order.paid[ref.m.id] = paid;
      (s.order.payments[ref.m.id] = s.order.payments[ref.m.id] || []).push(entry);
    } else { ref.m.paid = paid; ref.m.payments.push(entry); }
  }

  /* Cobro o abono: sube el efectivo, baja el saldo de la cuenta, el resto conserva su vencimiento. */
  function collect(s, id, amount) {
    var ref = find(s, id); if (!ref || ref.m.kind !== 'in') return { ok: false, error: 'no_es_cobro' };
    var pending = Math.max(0, ref.m.amount - (ref.m.paid || 0));
    var x = Math.max(0, Math.min(pending, int(amount == null ? pending : amount)));
    if (!x) return { ok: false, error: 'sin_importe' };
    s.cash = int(s.cash) + x;
    setPaid(s, ref, (ref.m.paid || 0) + x, { amount: x, day: s.evalDay, type: x < pending ? 'abono' : 'cobro' });
    s.log.push({ t: 'cobro', id: id, amount: x });
    return { ok: true, amount: x, remaining: pending - x };
  }

  /* Pago confirmado: baja el efectivo y la obligación; ya no se descuenta en la proyección. */
  function pay(s, id, amount) {
    var ref = find(s, id); if (!ref || ref.m.kind !== 'out') return { ok: false, error: 'no_es_pago' };
    var pending = Math.max(0, ref.m.amount - (ref.m.paid || 0));
    var x = Math.max(0, Math.min(pending, int(amount == null ? pending : amount)));
    if (!x) return { ok: false, error: 'sin_importe' };
    s.cash = int(s.cash) - x;
    setPaid(s, ref, (ref.m.paid || 0) + x, { amount: x, day: s.evalDay, type: 'pago' });
    s.log.push({ t: 'pago', id: id, amount: x });
    return { ok: true, amount: x };
  }

  function delay(s, id, days) {
    var m = s.movements.find(function (x) { return x.id === id && x.kind === 'in'; });
    if (!m) return false;
    m.day = clampDay(m.day + int(days)); m.delayed = (m.delayed || 0) + int(days);
    return true;
  }
  /* Cambio de fecha a un proveedor: supuesto de negociación, nunca un acuerdo confirmado. */
  function moveSupplier(s, id, day) {
    var m = s.movements.find(function (x) { return x.id === id && x.cat === 'proveedor'; });
    if (!m) return false;
    m.day = clampDay(day);
    m.assumption = m.day === m.baseDay ? null : 'Supuesto de negociación, no confirmado';
    return true;
  }
  function setPayrollUp(s, on) {
    s.payrollUp = !!on;
    s.movements.forEach(function (m) { if (m.cat === 'nomina') m.amount = on ? Math.round(m.baseAmount * 1.1) : m.baseAmount; });
  }
  function addExtra(s, amount, day, concept) {
    var a = int(amount); if (a <= 0) return null;
    var id = 'x-' + (s.movements.filter(function (m) { return m.origin === 'extra'; }).length + 1) + '-' + Date.now().toString(36);
    var m = { id: id, kind: 'out', cat: 'gasto', party: 'Gasto extraordinario', concept: concept || 'Gasto extraordinario', amount: a, day: clampDay(day), paid: 0, baseDay: clampDay(day), baseAmount: a, payments: [], origin: 'extra' };
    s.movements.push(m); return m;
  }
  function addMovement(s, rec) {
    var a = int(rec.amount); if (a <= 0) return null;
    var id = 'r-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
    var m = { id: id, kind: rec.kind === 'in' ? 'in' : 'out', cat: rec.cat || (rec.kind === 'in' ? 'cliente' : 'proveedor'),
      party: String(rec.party || '').slice(0, 60) || 'Sin nombre', concept: String(rec.concept || '').slice(0, 80) || 'Registro capturado',
      amount: a, day: clampDay(rec.day), paid: 0, baseDay: clampDay(rec.day), baseAmount: a, payments: [], origin: 'captura' };
    s.movements.push(m);
    if (rec.done) { if (m.kind === 'in') collect(s, id); else pay(s, id); }
    return m;
  }
  function setOrder(s, draft) {
    var keepPaid = s.order && s.order.paid ? s.order.paid : {};
    var keepPay = s.order && s.order.payments ? s.order.payments : {};
    s.order = Object.assign({}, DEFAULT_ORDER, draft || {}, { paid: keepPaid, payments: keepPay });
    return s.order;
  }
  function removeOrder(s) {
    // Lo ya cobrado o pagado del pedido ya está en el efectivo; quitar el pedido solo quita lo pendiente.
    s.order = null;
  }

  return {
    INITIAL: INITIAL, DEFAULT_ORDER: DEFAULT_ORDER,
    fresh: fresh, project: project, analyzeOrder: analyzeOrder, advanceOf: advanceOf,
    orderMovements: orderMovements, effective: effective,
    collect: collect, pay: pay, delay: delay, moveSupplier: moveSupplier, setPayrollUp: setPayrollUp,
    addExtra: addExtra, addMovement: addMovement, setOrder: setOrder, removeOrder: removeOrder, clone: clone
  };
});
