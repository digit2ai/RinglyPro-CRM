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
      types: ['Salario', 'Mesada', 'Freelance / honorarios', 'Negocio propio', 'Arriendos / rentas', 'Pensión', 'Comisiones', 'Otro'] },
    gastos:    { cat: 'gasto', title: 'Tus gastos mensuales', noun: 'gastos', amount: 'Monto mensual', ph: 'Ej: Arriendo',
      types: ['Vivienda / arriendo', 'Alimentación', 'Transporte', 'Servicios públicos', 'Entretenimiento', 'Educación', 'Salud', 'Suscripciones', 'Otro'] },
    ahorro:    { cat: 'ahorro', title: 'Tus cuentas de ahorro', noun: 'ahorros', amount: 'Valor actual', ph: 'Ej: Cuenta de ahorros',
      types: ['Cuenta de ahorros', 'Efectivo', 'CDT', 'Fondo (FIC)', 'Cuenta AFC', 'Otro'] },
    inversion: { cat: 'inversion', title: 'Tus inversiones', noun: 'inversiones', amount: 'Valor actual', ph: 'Ej: Fondo de inversión',
      types: ['Acciones', 'Fondo de inversión', 'CDT', 'Cripto', 'Bonos', 'ETF', 'Portafolio', 'Otro'] },
    deuda:     { cat: 'deuda', title: 'Tus deudas', noun: 'deudas', amount: 'Saldo que debes', ph: 'Ej: Tarjeta Visa',
      extra: { key: 'monthly', label: 'Cuota mensual', short: 'cuota' },
      types: ['Tarjeta de crédito', 'Crédito de libre inversión', 'Crédito de vehículo', 'Crédito hipotecario', 'Crédito educativo', 'Deuda informal', 'Otro'] },
    seguros:   { cat: 'seguros', title: 'Tus pólizas', noun: 'seguros', amount: 'Valor asegurado', ph: 'Ej: Seguro de vida',
      extra: { key: 'monthly', label: 'Prima mensual de la póliza', short: 'prima' },
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
          if (cfg.extra && x[cfg.extra.key]) sub += (sub ? ' · ' : '') + (cfg.extra.short || 'cuota') + ' ' + cop(x[cfg.extra.key]) + '/mes';
          return '<div class="pe-row"><div><div class="pe-nm">' + esc(x.name || '—') + '</div>' +
            (sub ? '<div class="pe-ty">' + esc(sub) + '</div>' : '') + '</div>' +
            '<div class="pe-amt">' + cop(x.value) + '</div>' +
            '<button class="pe-edit" data-edit="' + x.id + '" title="Editar" aria-label="Editar">✎</button>' +
            '<button class="pe-del" data-del="' + x.id + '" title="Eliminar" aria-label="Eliminar">✕</button></div>';
        }).join('')
      : '<div class="pe-empty">Aún no has agregado ' + cfg.noun + '. Toca “+ Agregar”.</div>';
    mount.innerHTML = '<div class="pe-col"><div class="pe-head"><span>' + esc(cfg.title) +
      '</span><button class="pe-add" data-add>+ Agregar</button></div>' + body + '</div>' + continueHtml();
    // keep the page's "total above" header in sync immediately (planea-data also does on reload)
    document.querySelectorAll('[data-pl="' + totalKey() + '"]').forEach(function (el) { el.textContent = cop(total()); });
  }

  // ── Paso guiado: etiqueta legible de cada pilar para el botón "Continuar" ──
  var STEP_LABEL = { ingreso: 'Ingresos', gastos: 'Gastos', ahorro: 'Ahorro', deuda: 'Deuda', inversion: 'Inversión', seguros: 'Seguros', retiro: 'Retiro' };
  // Botón "Continuar" del flujo guiado: marca este paso como completado (incluso si
  // el pilar va vacío — "no tengo") y lleva al SIGUIENTE pilar en el orden fijo. Solo
  // aparece cuando este pilar es el paso ACTUAL del acompañamiento.
  function continueHtml() {
    var PS = window.PlaneaSteps; if (!PS) return '';
    if (guidedActive()) return '';                // el flujo ?guided=1 ya trae su barra
    if (PS.current() !== cat) return '';          // no es el paso actual -> sin CTA de avance
    var nxt = PS.next(cat);
    var label = items.length
      ? (nxt ? 'Continuar a ' + (STEP_LABEL[nxt] || 'lo siguiente') : 'Terminar y ver mi Salud Financiera')
      : (nxt ? 'No tengo, continuar a ' + (STEP_LABEL[nxt] || 'lo siguiente') : 'No tengo, terminar');
    return '<div class="pe-nextwrap"><button class="pe-next" data-next>' + esc(label) +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>' +
      '<div class="pe-nexthint">Planea te guía paso a paso, en orden. Completa este para desbloquear el siguiente.</div></div>';
  }
  function goNext() {
    var PS = window.PlaneaSteps; if (!PS) { location.href = '/planea/portal/salud'; return; }
    var nxt = PS.next(cat);
    var done = PS.markDone(cat);
    var jump = function () { location.href = nxt ? ('/planea/portal/' + nxt) : '/planea/portal/salud'; };
    (done && done.then ? done.then(jump, jump) : jump());
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
    op.then(reload).catch(function (e) {
      if (window.console) console.warn('[module-edit] save failed', e && e.message);
      // 401 = not authenticated on this domain -> go log in here, then come back.
      if (e && /\b401\b/.test(e.message || '')) { location.href = '/planea/login'; return; }
      alert('No se pudo guardar. Intenta de nuevo.');
    });
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
    if (t.hasAttribute('data-next')) { goNext(); return; }
  }

  function style() {
    var s = document.createElement('style');
    s.textContent = '#mod-edit .pe-edit{background:none;border:none;color:var(--mut,#9db3ab);cursor:pointer;font-size:15px;padding:4px 6px;margin-left:6px}#mod-edit .pe-edit:hover{color:var(--green,#3fc06a)}' +
      '#mod-edit .pe-nextwrap{margin-top:18px;display:flex;flex-direction:column;gap:8px}' +
      '#mod-edit .pe-next{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;background:linear-gradient(90deg,#3fc06a,#17a6a6);color:#04120c;border:none;border-radius:14px;padding:15px 20px;font-family:"Inter",system-ui,sans-serif;font-weight:800;font-size:16px;cursor:pointer;box-shadow:0 8px 22px rgba(63,192,106,.30)}' +
      '#mod-edit .pe-next:active{transform:scale(.99)}#mod-edit .pe-next svg{width:20px;height:20px}' +
      '#mod-edit .pe-nexthint{font-size:12.5px;color:var(--mut,#9db3ab);line-height:1.4;text-align:center}';
    document.head.appendChild(s);
  }

  // ── Registro GUIADO paso a paso (?guided=1) ─────────────────────────────────
  // Tras el Planea Score, "Próximo paso" arranca este flujo: lleva al usuario click a
  // click por cada bucket (ingresos -> gastos -> ... -> retiro) con un botón Siguiente
  // grande, para que registrar sus datos sea muy fácil y explícito.
  var GUIDED_SEQ = ['ingreso', 'gastos', 'ahorro', 'deuda', 'inversion', 'seguros', 'retiro'];
  var GUIDED_LABEL = { ingreso: 'Ingresos', gastos: 'Gastos', ahorro: 'Ahorro', deuda: 'Deudas', inversion: 'Inversión', seguros: 'Seguros', retiro: 'Retiro' };
  function guidedActive() { try { return /[?&]guided=1/.test(location.search); } catch (e) { return false; } }

  function guidedStyle() {
    var s = document.createElement('style');
    s.textContent =
      'body.guided-mode{padding-bottom:96px}' +
      '.gw-top{position:sticky;top:0;z-index:40;background:var(--bg,#0a1310);border-bottom:1px solid var(--line);padding:12px 16px 14px}' +
      '.gw-step{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);font-weight:700}' +
      '.gw-ttl{font-family:"Inter",sans-serif;font-weight:800;font-size:16px;margin-top:3px;color:var(--txt)}' +
      '.gw-track{height:7px;border-radius:99px;background:var(--line);overflow:hidden;margin-top:9px}' +
      '.gw-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#3fc06a,#17a6a6);transition:width .4s ease}' +
      '.gw-hint{font-size:12.5px;color:var(--mut);margin-top:9px;line-height:1.4}' +
      '.gw-bar{position:fixed;left:0;right:0;bottom:0;z-index:41;display:flex;gap:12px;align-items:center;justify-content:space-between;' +
        'padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));background:var(--bg,#0a1310);border-top:1px solid var(--line)}' +
      '.gw-skip{background:none;border:none;color:var(--mut);font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;padding:10px}' +
      '.gw-next{flex:1;max-width:280px;margin-left:auto;background:linear-gradient(90deg,#3fc06a,#17a6a6);color:#04120c;border:none;border-radius:14px;' +
        'padding:15px 20px;font-family:"Inter",sans-serif;font-weight:800;font-size:16px;cursor:pointer;box-shadow:0 8px 22px rgba(63,192,106,.32)}' +
      '.gw-next:active{transform:scale(.99)}';
    document.head.appendChild(s);
  }

  function guided() {
    var idx = GUIDED_SEQ.indexOf(cat);
    if (idx < 0) return;                       // este módulo no está en el flujo guiado
    guidedStyle();
    document.body.classList.add('guided-mode');
    var n = idx + 1, total = GUIDED_SEQ.length;
    var last = idx === total - 1;
    var pct = Math.round((n / total) * 100);

    // Banner superior con progreso
    var top = document.createElement('div');
    top.className = 'gw-top';
    top.innerHTML = '<div class="gw-step">Paso ' + n + ' de ' + total + '</div>' +
      '<div class="gw-ttl">' + esc(GUIDED_LABEL[cat] || cfg.title) + '</div>' +
      '<div class="gw-track"><div class="gw-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="gw-hint">Agrega tus ' + esc(cfg.noun) + ' con “+ Agregar”. Cuando termines (o si no aplica), toca ' + (last ? 'Finalizar' : 'Siguiente') + '.</div>';
    document.body.insertBefore(top, document.body.firstChild);

    // Barra inferior con Siguiente/Finalizar
    var bar = document.createElement('div');
    bar.className = 'gw-bar';
    var nextLabel = last ? 'Finalizar' : 'Siguiente';
    bar.innerHTML = '<button class="gw-skip" id="gw-skip">Saltar por ahora</button>' +
      '<button class="gw-next" id="gw-next">' + nextLabel + '</button>';
    document.body.appendChild(bar);

    function go() {
      // Marca este paso como completado (desbloquea el siguiente en la navegación),
      // luego avanza. "Saltar por ahora" también completa: el flujo debe progresar.
      var PS = window.PlaneaSteps;
      var done = PS ? PS.markDone(cat) : null;
      var jump = function () {
        if (last) { location.href = '/planea/portal/salud'; return; }   // termina en Salud Financiera
        location.href = '/planea/portal/' + GUIDED_SEQ[idx + 1] + '?guided=1';
      };
      (done && done.then ? done.then(jump, jump) : jump());
    }
    document.getElementById('gw-next').addEventListener('click', go);
    document.getElementById('gw-skip').addEventListener('click', go);
  }

  // Guardia anti-atajo: si el usuario llega por URL a un pilar BLOQUEADO (posterior al
  // paso actual), lo devolvemos a su paso actual. Se ejecuta cuando ya hay perfil real
  // (planea:profile) para no rebotar durante la carga inicial.
  function guardLocked() {
    var PS = window.PlaneaSteps; if (!PS || !window.PLANEA_PROFILE) return;
    if (guidedActive()) return;                 // el flujo guiado maneja su propio orden
    if (PS.isLocked(cat)) {
      var cur = PS.current();
      if (cur && cur !== cat) location.replace('/planea/portal/' + cur);
    }
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
    // El botón "Continuar" y el candado del siguiente pilar dependen del paso actual,
    // que se resuelve cuando llega el perfil real. Re-render al cambiar pasos/perfil,
    // y aplica la guardia anti-atajo una vez que hay datos reales.
    window.addEventListener('planea:steps', render);
    window.addEventListener('planea:profile', function () { render(); guardLocked(); });
    if (guidedActive()) guided();
    if (window.PlaneaSB) reload(); // load this module's rows (JWT-auth); 401 => empty
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
