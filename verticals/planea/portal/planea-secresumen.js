/* PLANEA — Resumen del período por sección (Documento Maestro §18-§26, bloque 1 y afines).
   Renderiza el bloque de RESUMEN arriba del listado de cada sección, calculado en el cliente
   desde los ítems reales (los mismos que ya carga el editor). No toca el puntaje ni el backend:
   solo lee y presenta. Un contenedor por página: <div data-secresumen="ahorro"></div>.

   §18 Ingresos / §19 Gastos: total + recurrentes / variables / nº de fuentes.
   §20 Ahorro: total + Fondo de emergencia (meses de gastos cubiertos con saldo LÍQUIDO).
   §21 Deuda: saldo total + pago mensual + % del ingreso.
   §22 Inversión: portafolio total + nº de instrumentos.
   §24 Seguros: «Tu protección» (vida/salud/vehículo/hogar: protegido o sin registrar).
   §26 Patrimonio: patrimonio neto = activos (ahorro+inversión) − deudas. */
(function () {
  'use strict';
  function num(v) { v = Number(v); return isFinite(v) && v > 0 ? v : 0; }
  function cop(n) { return '$' + Math.round(n).toLocaleString('es-CO'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function ofCat(items, c) { return items.filter(function (i) { return i && i.category === c; }); }
  function sum(items, c, f) { return ofCat(items, c).reduce(function (s, i) { return s + num(i[f]); }, 0); }

  var AHORRO_ILIQUIDO = { 'CDT': 1, 'Cuenta AFC': 1 };
  function ahorroLiquido(items) {
    return ofCat(items, 'ahorro').reduce(function (s, i) {
      if (i.meta && i.meta.permanencia === true) return s;
      return AHORRO_ILIQUIDO[i.type] ? s : s + num(i.value);
    }, 0);
  }
  var SEG_KEY = { 'Vida': 'vida', 'Salud': 'salud', 'Vehículo': 'vehiculo', 'Hogar': 'hogar' };
  var PROT = [['vida', 'Vida'], ['salud', 'Salud'], ['vehiculo', 'Vehículo'], ['hogar', 'Hogar']];

  function cell(lbl, val, sub) {
    return '<div class="sr-cell"><div class="sr-lbl">' + esc(lbl) + '</div><div class="sr-val">' + val + '</div>' + (sub ? '<div class="sr-sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function build(cat, items) {
    var I = sum(items, 'ingreso', 'value'), G = sum(items, 'gasto', 'value');
    if (cat === 'ingreso' || cat === 'gasto') {
      var c = cat === 'ingreso' ? 'ingreso' : 'gasto', rows = ofCat(items, c);
      var vari = rows.filter(function (r) { return r.meta && r.meta.behavior === 'variable'; }).length;
      var rec = rows.filter(function (r) { return !r.meta || r.meta.behavior !== 'variable'; }).length;
      return cell('Total del mes', cop(sum(items, c, 'value'))) + cell('Recurrentes', rec) + cell('Variables', vari) + cell(c === 'ingreso' ? 'Fuentes' : 'Gastos', rows.length);
    }
    if (cat === 'ahorro') {
      var liq = ahorroLiquido(items), meses = G > 0 ? liq / G : 0;
      var nota = G > 0 ? (meses >= 6 ? 'Sólido' : meses >= 3 ? 'Vas bien' : 'En construcción') : 'Registra tus gastos para calcularlo';
      return cell('Total ahorrado', cop(sum(items, 'ahorro', 'value'))) +
        cell('Fondo de emergencia', G > 0 ? (Math.round(meses * 10) / 10 + ' meses') : '—', nota) +
        cell('Cuentas', ofCat(items, 'ahorro').length);
    }
    if (cat === 'deuda') {
      var saldo = sum(items, 'deuda', 'value'), pago = sum(items, 'deuda', 'monthly');
      var pct = I > 0 ? Math.round(pago / I * 100) : null;
      return cell('Saldo total', cop(saldo)) + cell('Pago mensual', cop(pago)) +
        cell('% del ingreso', pct != null ? pct + '%' : '—', pct != null ? (pct <= 30 ? 'En nivel cómodo' : 'Pesa sobre tu ingreso') : 'Registra tus ingresos');
    }
    if (cat === 'inversion') {
      var invs = ofCat(items, 'inversion').filter(function (i) { return i.type !== 'CDT'; });
      var tipos = {}; invs.forEach(function (i) { tipos[i.type || 'Otro'] = 1; });
      return cell('Portafolio total', cop(invs.reduce(function (s, i) { return s + num(i.value); }, 0))) +
        cell('Instrumentos', Object.keys(tipos).length) + cell('Registros', invs.length);
    }
    if (cat === 'seguros') {
      var pol = ofCat(items, 'seguros'), have = {};
      pol.forEach(function (p) { var k = SEG_KEY[p.type]; if (k) have[k] = 1; });
      var grid = PROT.map(function (p) {
        var ok = have[p[0]];
        return '<div class="sr-prot ' + (ok ? 'on' : '') + '"><span class="sr-dot"></span>' + esc(p[1]) + '<small>' + (ok ? 'Protegido' : 'Sin registrar') + '</small></div>';
      }).join('');
      return '<div class="sr-prot-grid">' + grid + '</div>';
    }
    if (cat === 'patrimonio') {
      var activos = sum(items, 'ahorro', 'value') + sum(items, 'inversion', 'value') + sum(items, 'retiro', 'value');
      var deudas = sum(items, 'deuda', 'value');
      return cell('Patrimonio neto', cop(activos - deudas), 'Activos − deudas') + cell('Activos', cop(activos)) + cell('Deudas', cop(deudas));
    }
    return '';
  }

  function style() {
    if (document.getElementById('sr-style')) return;
    var s = document.createElement('style'); s.id = 'sr-style';
    s.textContent =
      '.sr-wrap{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:2px 0 6px}' +
      '.sr-cell{background:var(--card2,#16302a);border:1px solid var(--line,#26332e);border-radius:14px;padding:13px 15px}' +
      '.sr-lbl{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--mut,#9db3ab);font-weight:700}' +
      '.sr-val{font-family:"Inter";font-weight:800;font-size:19px;margin-top:5px;color:var(--txt,#eaf1ec);font-variant-numeric:tabular-nums}' +
      '.sr-sub{font-size:11.5px;color:var(--green,#3fc06a);margin-top:3px;font-weight:600}' +
      '.sr-prot-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:2px 0 6px}' +
      '.sr-prot{display:flex;align-items:center;gap:9px;background:var(--card2,#16302a);border:1px solid var(--line,#26332e);border-radius:12px;padding:11px 13px;font-size:14px;font-weight:600;color:var(--mut,#9db3ab)}' +
      '.sr-prot.on{color:var(--txt,#eaf1ec)}' +
      '.sr-prot small{display:block;font-size:11px;font-weight:500;color:var(--mut,#9db3ab)}' +
      '.sr-dot{width:9px;height:9px;border-radius:50%;background:#3a4a43;flex:0 0 9px}' +
      '.sr-prot.on .sr-dot{background:var(--green,#3fc06a)}';
    document.head.appendChild(s);
  }

  function boot() {
    var box = document.querySelector('[data-secresumen]');
    if (!box || !window.PlaneaSB || !PlaneaSB.meGet) return;
    var cat = box.getAttribute('data-secresumen');
    style();
    PlaneaSB.meGet().then(function (d) {
      var items = (d && d.items) || [];
      var inner = build(cat, items);
      if (inner) box.innerHTML = (cat === 'seguros') ? inner : '<div class="sr-wrap">' + inner + '</div>';
    }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
