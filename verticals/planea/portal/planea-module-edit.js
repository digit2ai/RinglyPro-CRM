/* PLANEA — module editor (Ahorro / Deuda / Inversión / Seguros / Retiro).
   One reusable CRUD editor. The page carries <div id="mod-edit" data-cat="X">;
   this fills it with an interactive list + "+ Agregar", and add / edit / remove
   write straight to our backend profile via PlaneaSB.mePut:
     ahorro|inversion -> assets_data (tagged cat) · deuda -> liabilities_data
     seguros -> seguros_data · retiro -> retiro_data
   Header totals/rings are refreshed by planea-data.js on reload. */
(function () {
  'use strict';

  var CATS = {
    ingreso:   { source: 'ingresos_data', title: 'Tus fuentes de ingreso', noun: 'ingresos', amount: 'Monto mensual', ph: 'Ej: Salario',
      types: ['Salario', 'Freelance / honorarios', 'Negocio propio', 'Arriendos / rentas', 'Pensión', 'Comisiones', 'Otro'] },
    ahorro:    { source: 'assets_data', cat: 'ahorro', title: 'Tus cuentas de ahorro', noun: 'ahorros', amount: 'Valor actual', ph: 'Ej: Cuenta de ahorros',
      types: ['Cuenta de ahorros', 'Efectivo', 'CDT', 'Fondo (FIC)', 'Cuenta AFC', 'Otro'] },
    inversion: { source: 'assets_data', cat: 'inversion', title: 'Tus inversiones', noun: 'inversiones', amount: 'Valor actual', ph: 'Ej: Fondo de inversión',
      types: ['Acciones', 'Fondo de inversión', 'CDT', 'Cripto', 'Bonos', 'ETF', 'Portafolio', 'Otro'] },
    deuda:     { source: 'liabilities_data', title: 'Tus deudas', noun: 'deudas', amount: 'Saldo que debes', ph: 'Ej: Tarjeta Visa',
      types: ['Tarjeta de crédito', 'Crédito de libre inversión', 'Crédito de vehículo', 'Crédito hipotecario', 'Crédito educativo', 'Deuda informal', 'Otro'] },
    seguros:   { source: 'seguros_data', title: 'Tus pólizas', noun: 'seguros', amount: 'Valor asegurado', ph: 'Ej: Seguro de vida',
      types: ['Vida', 'Salud', 'Vehículo', 'Hogar', 'Educativo', 'Exequial', 'Otro'] },
    retiro:    { source: 'retiro_data', title: 'Tus fondos de retiro', noun: 'fondos de retiro', amount: 'Saldo acumulado', ph: 'Ej: Pensión voluntaria',
      types: ['Pensión obligatoria', 'Pensión voluntaria', 'Cesantías', 'Fondo privado', 'Otro'] }
  };

  var mount, cat, cfg, profile = null, editIdx = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function cop(n) { return '$' + (Math.round(+n || 0)).toLocaleString('es-CO'); }
  function digits(s) { return (s || '').replace(/\D/g, ''); }

  function arr() { return (profile && Array.isArray(profile[cfg.source])) ? profile[cfg.source] : []; }
  function bucketOf(a) {
    if (a.cat === 'ahorro' || a.cat === 'inversion') return a.cat;
    var s = ((a.type || '') + ' ' + (a.name || '')).toLowerCase();
    if (/invers|accion|acción|fondo|fic|cripto|bono|etf|cdt|portafol|renta/.test(s)) return 'inversion';
    if (/ahorro|efectivo|cuenta|emergenc|cesant|caja|liquid|líquid/.test(s)) return 'ahorro';
    return 'otro';
  }
  // Rows to show + their REAL index in the source array (assets are shared/filtered).
  function view() {
    var a = arr(), out = [];
    a.forEach(function (x, i) {
      if (cfg.source === 'assets_data' && bucketOf(x) !== cfg.cat) return;
      out.push({ x: x, i: i });
    });
    return out;
  }

  function render() {
    if (!mount) return;
    var items = view();
    var body = items.length
      ? items.map(function (o) {
          return '<div class="pe-row"><div><div class="pe-nm">' + esc(o.x.name || '—') + '</div>' +
            (o.x.type ? '<div class="pe-ty">' + esc(o.x.type) + '</div>' : '') + '</div>' +
            '<div class="pe-amt">' + cop(o.x.value) + '</div>' +
            '<button class="pe-edit" data-edit="' + o.i + '" title="Editar" aria-label="Editar">✎</button>' +
            '<button class="pe-del" data-del="' + o.i + '" title="Eliminar" aria-label="Eliminar">✕</button></div>';
        }).join('')
      : '<div class="pe-empty">Aún no has agregado ' + cfg.noun + '. Toca “+ Agregar”.</div>';
    mount.innerHTML = '<div class="pe-col"><div class="pe-head"><span>' + esc(cfg.title) +
      '</span><button class="pe-add" data-add>+ Agregar</button></div>' + body + '</div>';
  }

  function formHtml(prefill) {
    var editing = !!prefill;
    return '<div class="pe-backdrop" id="pe-modal"><div class="pe-form">' +
      '<div class="pe-form-h">' + (editing ? 'Editar' : 'Agregar') + '<button class="pe-x" data-close>✕</button></div>' +
      '<label class="pe-l">Nombre</label><input class="pe-in" id="pe-name" placeholder="' + esc(cfg.ph) + '" value="' + esc(prefill && prefill.name || '') + '">' +
      '<label class="pe-l">Tipo</label><select class="pe-in" id="pe-type">' +
        cfg.types.map(function (t) { return '<option' + (prefill && prefill.type === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' +
      '<label class="pe-l">' + esc(cfg.amount) + ' ($)</label><div class="pe-money"><span>$</span>' +
        '<input class="pe-in" id="pe-value" inputmode="numeric" placeholder="0" value="' + (prefill && prefill.value ? (+prefill.value).toLocaleString('es-CO') : '') + '"></div>' +
      '<div class="pe-actions"><button class="pe-cancel" data-close>Cancelar</button><button class="pe-save" data-save>Guardar</button></div>' +
      '</div></div>';
  }
  function openForm(prefill) {
    editIdx = (prefill && typeof prefill.i === 'number') ? prefill.i : null;
    document.body.insertAdjacentHTML('beforeend', formHtml(prefill));
    var val = document.getElementById('pe-value');
    val.addEventListener('input', function () { var d = digits(val.value); val.value = d ? parseInt(d, 10).toLocaleString('es-CO') : ''; });
    document.getElementById('pe-name').focus();
  }
  function closeForm() { var m = document.getElementById('pe-modal'); if (m) m.remove(); editIdx = null; }

  function save() {
    var name = document.getElementById('pe-name').value.trim();
    var type = document.getElementById('pe-type').value;
    var value = parseInt(digits(document.getElementById('pe-value').value), 10) || 0;
    if (!name || !value) { alert('Escribe un nombre y un valor.'); return; }
    var item = { name: name, type: type, value: value };
    if (cfg.cat) item.cat = cfg.cat; // tag ahorro/inversión so bucketing is exact
    if (!profile) profile = {};
    if (!Array.isArray(profile[cfg.source])) profile[cfg.source] = [];
    if (editIdx != null) profile[cfg.source][editIdx] = item;
    else profile[cfg.source] = profile[cfg.source].concat([item]);
    commit();
  }
  function del(i) {
    if (!profile || !Array.isArray(profile[cfg.source])) return;
    if (!confirm('¿Eliminar este ' + cfg.noun.replace(/s$/, '') + '?')) return;
    profile[cfg.source].splice(i, 1);
    commit();
  }

  function commit() {
    if (!(window.PlaneaSB && PlaneaSB.loggedIn())) { closeForm(); render(); return; }
    var fields = {}; fields[cfg.source] = profile[cfg.source] || [];
    closeForm();
    PlaneaSB.mePut(fields)
      .then(function () { location.reload(); }) // refresh header totals/rings via planea-data
      .catch(function (e) { if (window.console) console.warn('[module-edit] save failed', e && e.message); alert('No se pudo guardar. Revisa tu sesión.'); render(); });
  }

  function onClick(e) {
    if (e.target.id === 'pe-modal') { closeForm(); return; }
    var t = e.target.closest('button'); if (!t) return;
    if (t.hasAttribute('data-add')) { openForm(null); return; }
    if (t.hasAttribute('data-edit')) { var i = +t.getAttribute('data-edit'); openForm({ i: i, name: arr()[i].name, type: arr()[i].type, value: arr()[i].value }); return; }
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
    if (window.PlaneaSB && PlaneaSB.loggedIn()) {
      PlaneaSB.meGet().then(function (d) { profile = d || {}; render(); }).catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
