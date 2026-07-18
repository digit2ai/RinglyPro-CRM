/* PLANEA — module editor (Ingresos / Gastos / Ahorro / Deuda / Inversión / Seguros / Retiro).
   Each module is INDEPENDENT and stored as its own rows in the planea_items table.
   The page carries <div id="mod-edit" data-cat="X">; this fills it with an
   interactive list + "+ Agregar" and add / edit / remove operate on single rows via
   PlaneaSB.itemCreate / itemUpdate / itemDelete (no whole-array writes, no races).
   Auth is the httpOnly JWT. Header totals refresh via planea-data.js on reload. */
(function () {
  'use strict';

  var CATS = {
    ingreso:   { cat: 'ingreso', title: 'Tus fuentes de ingreso', noun: 'ingresos', amount: 'Monto mensual', ph: 'Ej: Salario',
      types: ['Salario', 'Freelance / honorarios', 'Negocio propio', 'Arriendos / rentas', 'Pensión', 'Comisiones', 'Otro'] },
    gastos:    { cat: 'gasto', title: 'Tus gastos mensuales', noun: 'gastos', amount: 'Monto mensual', ph: 'Ej: Arriendo',
      types: ['Vivienda / arriendo', 'Alimentación', 'Transporte', 'Servicios públicos', 'Entretenimiento', 'Educación', 'Salud', 'Suscripciones', 'Otro'] },
    ahorro:    { cat: 'ahorro', title: 'Tus cuentas de ahorro', noun: 'ahorros', amount: 'Valor actual', ph: 'Ej: Cuenta de ahorros',
      types: ['Cuenta de ahorros', 'Efectivo', 'CDT', 'Fondo (FIC)', 'Cuenta AFC', 'Otro'] },
    inversion: { cat: 'inversion', title: 'Tus inversiones', noun: 'inversiones', amount: 'Valor actual', ph: 'Ej: Fondo de inversión',
      types: ['Acciones', 'Fondo de inversión', 'CDT', 'Cripto', 'Bonos', 'ETF', 'Portafolio', 'Otro'] },
    deuda:     { cat: 'deuda', title: 'Tus deudas', noun: 'deudas', amount: 'Saldo que debes', ph: 'Ej: Tarjeta Visa',
      extra: { key: 'monthly', label: 'Cuota mensual' },
      types: ['Tarjeta de crédito', 'Crédito de libre inversión', 'Crédito de vehículo', 'Crédito hipotecario', 'Crédito educativo', 'Deuda informal', 'Otro'] },
    seguros:   { cat: 'seguros', title: 'Tus pólizas', noun: 'seguros', amount: 'Valor asegurado', ph: 'Ej: Seguro de vida',
      types: ['Vida', 'Salud', 'Vehículo', 'Hogar', 'Educativo', 'Exequial', 'Otro'] },
    retiro:    { cat: 'retiro', title: 'Tus fondos de retiro', noun: 'fondos de retiro', amount: 'Saldo acumulado', ph: 'Ej: Pensión voluntaria',
      types: ['Pensión obligatoria', 'Pensión voluntaria', 'Cesantías', 'Fondo privado', 'Otro'] }
  };

  var mount, cat, cfg, items = [], editItem = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); }); }
  function cop(n) { return '$' + (Math.round(+n || 0)).toLocaleString('es-CO'); }
  function digits(s) { return (s || '').replace(/\D/g, ''); }
  function total() { return items.reduce(function (a, x) { return a + (+x.value || 0); }, 0); }

  function render() {
    if (!mount) return;
    var body = items.length
      ? items.map(function (x) {
          var sub = x.type || '';
          if (cfg.extra && x[cfg.extra.key]) sub += (sub ? ' · ' : '') + 'cuota ' + cop(x[cfg.extra.key]) + '/mes';
          return '<div class="pe-row"><div><div class="pe-nm">' + esc(x.name || '—') + '</div>' +
            (sub ? '<div class="pe-ty">' + esc(sub) + '</div>' : '') + '</div>' +
            '<div class="pe-amt">' + cop(x.value) + '</div>' +
            '<button class="pe-edit" data-edit="' + x.id + '" title="Editar" aria-label="Editar">✎</button>' +
            '<button class="pe-del" data-del="' + x.id + '" title="Eliminar" aria-label="Eliminar">✕</button></div>';
        }).join('')
      : '<div class="pe-empty">Aún no has agregado ' + cfg.noun + '. Toca “+ Agregar”.</div>';
    mount.innerHTML = '<div class="pe-col"><div class="pe-head"><span>' + esc(cfg.title) +
      '</span><button class="pe-add" data-add>+ Agregar</button></div>' + body + '</div>';
    // keep the page's "total above" header in sync immediately (planea-data also does on reload)
    document.querySelectorAll('[data-pl="' + totalKey() + '"]').forEach(function (el) { el.textContent = cop(total()); });
  }
  function totalKey() {
    return { ingreso: 'ingreso_total', gasto: 'gasto_total', ahorro: 'ahorro_total', inversion: 'inversion_total', deuda: 'deuda_total', seguros: 'seguros_total', retiro: 'retiro_total' }[cfg.cat];
  }

  function formHtml(prefill) {
    return '<div class="pe-backdrop" id="pe-modal"><div class="pe-form">' +
      '<div class="pe-form-h">' + (prefill ? 'Editar' : 'Agregar') + '<button class="pe-x" data-close>✕</button></div>' +
      '<label class="pe-l">Nombre</label><input class="pe-in" id="pe-name" placeholder="' + esc(cfg.ph) + '" value="' + esc(prefill && prefill.name || '') + '">' +
      '<label class="pe-l">Tipo</label><select class="pe-in" id="pe-type">' +
        cfg.types.map(function (t) { return '<option' + (prefill && prefill.type === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' +
      '<label class="pe-l">' + esc(cfg.amount) + ' ($)</label><div class="pe-money"><span>$</span>' +
        '<input class="pe-in" id="pe-value" inputmode="numeric" placeholder="0" value="' + (prefill && prefill.value ? (+prefill.value).toLocaleString('es-CO') : '') + '"></div>' +
      (cfg.extra ? '<label class="pe-l">' + esc(cfg.extra.label) + ' ($)</label><div class="pe-money"><span>$</span>' +
        '<input class="pe-in" id="pe-extra" inputmode="numeric" placeholder="0" value="' + (prefill && prefill[cfg.extra.key] ? (+prefill[cfg.extra.key]).toLocaleString('es-CO') : '') + '"></div>' : '') +
      '<div class="pe-actions"><button class="pe-cancel" data-close>Cancelar</button><button class="pe-save" data-save>Guardar</button></div>' +
      '</div></div>';
  }
  function openForm(prefill) {
    editItem = prefill || null;
    document.body.insertAdjacentHTML('beforeend', formHtml(prefill));
    var fmt = function (el) { if (!el) return; el.addEventListener('input', function () { var d = digits(el.value); el.value = d ? parseInt(d, 10).toLocaleString('es-CO') : ''; }); };
    fmt(document.getElementById('pe-value'));
    fmt(document.getElementById('pe-extra'));
    document.getElementById('pe-name').focus();
  }
  function closeForm() { var m = document.getElementById('pe-modal'); if (m) m.remove(); editItem = null; }

  function save() {
    var name = document.getElementById('pe-name').value.trim();
    var type = document.getElementById('pe-type').value;
    var value = parseInt(digits(document.getElementById('pe-value').value), 10) || 0;
    if (!name || !value) { alert('Escribe un nombre y un valor.'); return; }
    var body = { category: cfg.cat, name: name, type: type, value: value };
    if (cfg.extra) body[cfg.extra.key] = parseInt(digits((document.getElementById('pe-extra') || {}).value || ''), 10) || 0;
    if (!window.PlaneaSB) { closeForm(); return; }
    var op = editItem ? PlaneaSB.itemUpdate(editItem.id, body) : PlaneaSB.itemCreate(body);
    closeForm();
    op.then(reload).catch(function (e) { if (window.console) console.warn('[module-edit] save failed', e && e.message); alert('No se pudo guardar. Vuelve a iniciar sesión.'); });
  }
  function del(id) {
    if (!confirm('¿Eliminar este ' + cfg.noun.replace(/s$/, '') + '?')) return;
    PlaneaSB.itemDelete(id).then(reload).catch(function () { alert('No se pudo eliminar.'); });
  }

  function reload() {
    PlaneaSB.items(cfg.cat).then(function (d) { items = (d && d.items) || []; render(); }).catch(function () { render(); });
  }

  function onClick(e) {
    if (e.target.id === 'pe-modal') { closeForm(); return; }
    var t = e.target.closest('button'); if (!t) return;
    if (t.hasAttribute('data-add')) { openForm(null); return; }
    if (t.hasAttribute('data-edit')) { var id = +t.getAttribute('data-edit'); var it = items.filter(function (x) { return x.id === id; })[0]; if (it) openForm(it); return; }
    if (t.hasAttribute('data-del')) { del(+t.getAttribute('data-del')); return; }
    if (t.hasAttribute('data-close')) { closeForm(); return; }
    if (t.hasAttribute('data-save')) { save(); return; }
  }

  function style() {
    var s = document.createElement('style');
    s.textContent = '#mod-edit .pe-edit{background:none;border:none;color:var(--mut,#9db3ab);cursor:pointer;font-size:15px;padding:4px 6px;margin-left:6px}#mod-edit .pe-edit:hover{color:var(--green,#3fc06a)}';
    document.head.appendChild(s);
  }

  function boot() {
    mount = document.getElementById('mod-edit');
    if (!mount) return;
    cat = mount.getAttribute('data-cat');
    cfg = CATS[cat];
    if (!cfg) return;
    style();
    render();
    document.addEventListener('click', onClick);
    if (window.PlaneaSB) reload(); // load this module's rows (JWT-auth); 401 => empty
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
