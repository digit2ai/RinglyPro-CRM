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

  function formHtml() {
    return '<div class="me-form">' +
      '<div class="me-h">Nueva meta</div>' +
      '<div class="me-types">' + TYPES.map(function (o) { return '<button class="me-type' + (o.t === selType ? ' on' : '') + '" data-type="' + o.t + '">' + svg(o.ic) + '<span>' + o.t + '</span></button>'; }).join('') + '</div>' +
      '<label class="me-l">¿Para qué es?</label><input class="me-in" id="me-name" placeholder="Ej: Viaje a Cartagena">' +
      '<div class="me-grid"><div><label class="me-l">Meta total ($)</label><div class="me-money"><span>$</span><input class="me-in" id="me-target" inputmode="numeric" placeholder="5.000.000"></div></div>' +
      '<div><label class="me-l">Ya ahorrado ($)</label><div class="me-money"><span>$</span><input class="me-in" id="me-current" inputmode="numeric" placeholder="0"></div></div></div>' +
      '<label class="me-l">Ahorro mensual estimado ($)</label><div class="me-money"><span>$</span><input class="me-in" id="me-monthly" inputmode="numeric" placeholder="200.000"></div>' +
      '<div class="me-actions"><button class="me-cancel" data-me-cancel>Cancelar</button><button class="me-save" data-me-save>Agregar meta</button></div>' +
      '</div>';
  }

  function render() {
    mount.innerHTML = open
      ? formHtml()
      : '<button class="btn ghost" data-me-open style="width:100%;justify-content:center;border-style:dashed">+ Crear una meta</button>';
    if (open) {
      ['me-target', 'me-current', 'me-monthly'].forEach(function (id) {
        var el = document.getElementById(id);
        el.addEventListener('input', function () { var d = digits(el.value); el.value = d ? parseInt(d, 10).toLocaleString('es-CO') : ''; });
      });
      var nm = document.getElementById('me-name'); if (nm) nm.focus();
    }
  }

  function save() {
    var name = document.getElementById('me-name').value.trim();
    var target = parseInt(digits(document.getElementById('me-target').value), 10) || 0;
    var current = parseInt(digits(document.getElementById('me-current').value), 10) || 0;
    var monthly = parseInt(digits(document.getElementById('me-monthly').value), 10) || 0;
    if (!name || !target) { alert('Escribe para qué es y la meta total.'); return; }
    if (!person) { alert('Inicia sesión para guardar tu meta.'); return; }
    var row = { person_id: person.id, name: name, type: selType, target_amount: target, current_savings: current, monthly_saving: monthly };
    PlaneaSB.post('persons_long_term_goals', row)
      .then(function () { location.reload(); })
      .catch(function (e) { if (window.console) console.warn('[metas] save failed', e && e.message); alert('No se pudo guardar la meta. Revisa tu sesión.'); });
  }

  function onClick(e) {
    var t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-me-open')) { open = true; render(); return; }
    if (t.hasAttribute('data-me-cancel')) { open = false; render(); return; }
    if (t.hasAttribute('data-type')) { selType = t.getAttribute('data-type'); render(); return; }
    if (t.hasAttribute('data-me-save')) { save(); return; }
  }

  function boot() {
    mount = document.getElementById('metas-edit');
    if (!mount) return;
    render();
    mount.addEventListener('click', onClick);
    if (window.PlaneaSB && PlaneaSB.loggedIn()) PlaneaSB.person().then(function (pr) { person = pr; }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
