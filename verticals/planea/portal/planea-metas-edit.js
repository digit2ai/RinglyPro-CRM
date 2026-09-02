/* PLANEA — Metas editor. Restores the "Nueva meta" creation form from the initial
   version (type picker + ¿Para qué es? + Meta total + Ya ahorrado + Ahorro mensual).
   Inserts rows into persons_long_term_goals — the same table planea-data.js reads
   to render the metacards + the Inicio fondo-de-emergencia progress. */
(function () {
  'use strict';

  var mount, person = null, open = false;

  function digits(s) { return (s || '').replace(/\D/g, ''); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  var TYPES = [
    { t: 'Viaje', ic: 'M2 22l10-10M13 11l4-4c1.5-1.5 3.5-2 4.5-1.5.5 1 0 3-1.5 4.5l-4 4M11 13l-3 3H5l-1 1 3 2 2 3 1-1v-3l3-3' },
    { t: 'Casa', ic: 'M3 10.5 12 3l9 7.5|M5 9.5V21h14V9.5' },
    { t: 'Carro', ic: 'M3 13l2-5h14l2 5v5h-3M6 18H3v-5|circle:7,18,1.6|circle:17,18,1.6' },
    { t: 'Educación', ic: 'M22 10 12 5 2 10l10 5 10-5Z|M6 12v5c0 1 3 2.5 6 2.5s6-1.5 6-2.5v-5' },
    { t: 'Otro', ic: 'M12 3l2.6 6.3L21 10l-5 4 1.6 7L12 17l-5.6 4L8 14l-5-4 6.4-.7Z' }
  ];
  function svg(path) {
    var parts = path.split('|'), inner = '';
    parts.forEach(function (p) {
      if (p.indexOf('circle:') === 0) { var c = p.slice(7).split(','); inner += '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '"/>'; }
      else inner += '<path d="' + p + '"/>';
    });
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }

  var selType = 'Viaje';
  var customType = '';

  // §17.2 — los 8 pilares oficiales. Maya SUGIERE uno; el usuario puede cambiarlo.
  var PILARES = [
    ['ahorro', 'Ahorro'], ['flujo', 'Flujo de Caja'], ['deuda', 'Deuda'], ['inversion', 'Inversión'],
    ['seguros', 'Seguros'], ['retiro', 'Retiro / Pensión'], ['impuestos', 'Impuestos'], ['patrimonio', 'Patrimonio']
  ];
  function suggestPilar(name, type) {
    var s = ((name || '') + ' ' + (type || '')).toLowerCase();
    if (/deuda|tarjeta|crédito|credito|préstamo|prestamo/.test(s)) return 'deuda';
    if (/retiro|pensión|pension|jubila/.test(s)) return 'retiro';
    if (/seguro|póliza|poliza|protección|proteccion/.test(s)) return 'seguros';
    if (/invertir|inversión|inversion|acciones|cripto|fondo/.test(s)) return 'inversion';
    if (/impuesto|renta|dian|tributar/.test(s)) return 'impuestos';
    if (/casa|vivienda|apartamento|carro|vehículo|vehiculo|patrimonio|herencia|sucesión|sucesion/.test(s)) return 'patrimonio';
    if (/gasto|presupuesto|flujo/.test(s)) return 'flujo';
    return 'ahorro'; // por defecto, la mayoría de metas de compra se apalancan en ahorro
  }

  function formHtml() {
    var otro = selType === 'Otro';
    // §17.2: la creación comienza con una pregunta abierta. §17: una meta puede ser
    // CUALITATIVA (sin monto ni fecha) — no se le inventan valores para que encaje.
    return '<div class="me-form">' +
      '<div class="me-h">Crear una meta</div>' +
      '<label class="me-l">¿Qué quieres lograr?</label><input class="me-in" id="me-name" placeholder="Ej: Comprar vivienda · Organizar mis deudas · Viajar">' +
      '<div class="me-types">' + TYPES.map(function (o) { return '<button class="me-type' + (o.t === selType ? ' on' : '') + '" data-type="' + o.t + '">' + svg(o.ic) + '<span>' + o.t + '</span></button>'; }).join('') + '</div>' +
      '<div id="me-custom-wrap" style="' + (otro ? '' : 'display:none') + '"><label class="me-l">Categoría personalizada</label><input class="me-in" id="me-custom" placeholder="Ej: Negocio, Boda, Fondo médico…" value="' + esc(customType) + '"></div>' +
      '<div class="me-grid"><div><label class="me-l">Meta total ($) <span class="me-opt">opcional</span></label><div class="me-money"><span>$</span><input class="me-in" id="me-target" inputmode="numeric" placeholder="5.000.000"></div></div>' +
      '<div><label class="me-l">Ya tienes ($) <span class="me-opt">opcional</span></label><div class="me-money"><span>$</span><input class="me-in" id="me-current" inputmode="numeric" placeholder="0"></div></div></div>' +
      '<label class="me-l">Aporte que estás dispuesto a hacer ($/mes) <span class="me-opt">opcional</span></label><div class="me-money"><span>$</span><input class="me-in" id="me-monthly" inputmode="numeric" placeholder="200.000"></div>' +
      '<div class="me-grid"><div><label class="me-l">Área relacionada <span class="me-opt">Maya sugiere</span></label>' +
        '<select class="me-in" id="me-pilar">' + PILARES.map(function (p) { return '<option value="' + p[0] + '">' + p[1] + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="me-l">Fecha objetivo <span class="me-opt">opcional</span></label><input class="me-in" id="me-fecha" type="date"></div></div>' +
      '<div class="me-hint">Una meta puede ser sin monto ni fecha (por ejemplo «organizar mis deudas»). Con el nombre basta para crearla.</div>' +
      '<div class="me-err" id="me-err" hidden></div>' +
      '<div class="me-actions"><button class="me-cancel" data-me-cancel>Cancelar</button><button class="me-save" data-me-save>Crear meta</button></div>' +
      '</div>';
  }

  function render() {
    mount.innerHTML = open
      ? formHtml()
      : '<button class="me-add-btn" data-me-open aria-label="Crear una meta personalizada">' +
          '<span class="me-plus" aria-hidden="true">+</span>' +
          '<span class="me-add-tx"><span class="t">Nueva meta</span><span class="s">Crea una meta personalizada</span></span>' +
        '</button>';
    if (open) {
      ['me-target', 'me-current', 'me-monthly'].forEach(function (id) {
        var el = document.getElementById(id);
        el.addEventListener('input', function () { var d = digits(el.value); el.value = d ? parseInt(d, 10).toLocaleString('es-CO') : ''; });
      });
      pilarTouched = false;
      var pil = document.getElementById('me-pilar');
      if (pil) { pil.value = suggestPilar('', selType); pil.addEventListener('change', function () { pilarTouched = true; }); }
      var nm = document.getElementById('me-name');
      if (nm) {
        nm.addEventListener('input', function () { if (!pilarTouched && pil) pil.value = suggestPilar(nm.value, selType); });
        nm.focus();
      }
    }
  }
  var pilarTouched = false;

  function save() {
    var name = document.getElementById('me-name').value.trim();
    var target = parseInt(digits(document.getElementById('me-target').value), 10) || 0;
    var current = parseInt(digits(document.getElementById('me-current').value), 10) || 0;
    var monthly = parseInt(digits(document.getElementById('me-monthly').value), 10) || 0;
    // Solo el nombre es obligatorio (§17: metas cualitativas sin monto). Mensaje EN LÍNEA.
    var er = document.getElementById('me-err');
    if (!name) { if (er) { er.textContent = 'Escribe qué quieres lograr.'; er.hidden = false; } var nmi = document.getElementById('me-name'); if (nmi) nmi.focus(); return; }
    if (!person) { if (er) { er.textContent = 'Inicia sesión para guardar tu meta.'; er.hidden = false; } return; }
    // Custom category: when "Otro" is picked, use the free-text type the user entered.
    var customEl = document.getElementById('me-custom');
    customType = customEl ? customEl.value.trim() : customType;
    var type = selType === 'Otro' ? (customType || 'Otro') : selType;
    var pilarEl = document.getElementById('me-pilar');
    var fechaEl = document.getElementById('me-fecha');
    var pilar = pilarEl ? pilarEl.value : suggestPilar(name, type);
    var fecha = fechaEl && fechaEl.value ? fechaEl.value : null;
    var row = { person_id: person.id, name: name, type: type, pilar: pilar, fecha_objetivo: fecha, target_amount: target, current_savings: current, monthly_saving: monthly };
    PlaneaSB.post('persons_long_term_goals', row)
      .then(function () { location.reload(); })
      .catch(function (e) { if (window.console) console.warn('[metas] save failed', e && e.message); alert('No se pudo guardar la meta. Revisa tu sesión.'); });
  }

  function onClick(e) {
    var t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-me-open')) { open = true; render(); return; }
    if (t.hasAttribute('data-me-cancel')) { open = false; render(); return; }
    if (t.hasAttribute('data-type')) {
      selType = t.getAttribute('data-type');
      // Update in place (do NOT re-render — that would wipe what the user typed).
      mount.querySelectorAll('.me-type').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-type') === selType); });
      var wrap = document.getElementById('me-custom-wrap');
      if (wrap) {
        wrap.style.display = selType === 'Otro' ? '' : 'none';
        if (selType === 'Otro') { var ci = document.getElementById('me-custom'); if (ci) ci.focus(); }
      }
      return;
    }
    if (t.hasAttribute('data-me-save')) { save(); return; }
  }

  function boot() {
    mount = document.getElementById('metas-edit');
    if (!mount) return;
    var st = document.createElement('style');
    st.textContent = '#metas-edit .me-opt{color:var(--mut,#9db3ab);font-weight:500;font-size:11.5px}' +
      '#metas-edit .me-hint{font-size:12px;color:var(--mut,#9db3ab);line-height:1.45;margin:10px 0 2px}' +
      '#metas-edit .me-err{color:#e0705a;font-size:12.5px;margin-top:8px;font-weight:600}' +
      '#metas-edit select.me-in{-webkit-appearance:none;appearance:none;background:var(--card2,#16302a)}' +
      // §17.3 estados + acciones + invitación destacada (viven en la lista, fuera de #metas-edit)
      '.mc-badge{font-size:10px;font-weight:800;letter-spacing:.03em;border:1px solid;border-radius:99px;padding:1px 7px;vertical-align:middle;white-space:nowrap}' +
      '.metacard.mc-done{opacity:.62}' +
      '.mc-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}' +
      '.mc-act{background:#12494b;color:#eafff4;border:none;border-radius:10px;padding:8px 13px;font-family:inherit;font-weight:700;font-size:12.5px;cursor:pointer}' +
      '.mc-act.ghost{background:transparent;color:var(--mut,#9db3ab);border:1px solid var(--line,#26332e)}' +
      '.meta-invi{display:block;background:linear-gradient(120deg,rgba(63,192,106,.14),rgba(23,166,166,.12));border:1px solid var(--green,#3fc06a);border-radius:14px;padding:13px 15px;margin-bottom:12px;color:var(--txt,#eaf1ec);font-size:13.5px;line-height:1.5;text-decoration:none}' +
      '.meta-invi b{color:var(--green,#3fc06a)}';
    document.head.appendChild(st);
    if (/(^|#)crear$/.test(location.hash)) open = true;   // invitación destacada §17.3
    render();
    mount.addEventListener('click', onClick);
    // §17.3 — estados de meta: marcar cumplida / archivar / eliminar (botones de la tarjeta).
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-goal-act]') : null;
      if (!b) return;
      var id = b.getAttribute('data-goal-id'), act = b.getAttribute('data-goal-act');
      if (!id || !window.PlaneaSB) return;
      if (act === 'delete' && !confirm('¿Eliminar esta meta?')) return;
      b.disabled = true;
      var op = act === 'delete' ? PlaneaSB.goalDelete(id) : PlaneaSB.goalUpdate(id, { estado: act });
      op.then(function () { location.reload(); }).catch(function () { b.disabled = false; alert('No se pudo actualizar la meta.'); });
    });
    if (window.PlaneaSB && PlaneaSB.loggedIn()) PlaneaSB.person().then(function (pr) { person = pr; }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
