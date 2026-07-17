/* PLANEA — Patrimonio editor. Restores the interactive "Agregar activo / Agregar
   pasivo / ¿Tu vivienda actual es…?" flow from the initial version. Writes the
   assets_data / liabilities_data JSONB arrays on persons_patrimony — the exact
   rows planea-data.js reads back to render balances, rings and pockets. */
(function () {
  'use strict';

  var mount, person = null, patrimony = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function cop(n) { n = Math.round(+n || 0); return '$' + n.toLocaleString('es-CO'); }
  function digits(s) { return (s || '').replace(/\D/g, ''); }

  var VIVIENDA = [
    { v: 'Propia sin deuda', hint: 'La agregamos como activo.' },
    { v: 'Propia con crédito', hint: 'Activo + saldo del crédito como pasivo.' },
    { v: 'Arrendada', hint: 'No suma patrimonio; seguimos.' },
    { v: 'Familiar / prestada', hint: 'No suma patrimonio; seguimos.' }
  ];

  function panel() {
    var assets = (patrimony && patrimony.assets_data) || [];
    var liab = (patrimony && patrimony.liabilities_data) || [];
    var rows = function (arr, kind) {
      if (!arr.length) return '<div class="pe-empty">Aún no has agregado ' + (kind === 'a' ? 'activos' : 'pasivos') + '.</div>';
      return arr.map(function (x, i) {
        return '<div class="pe-row"><div><div class="pe-nm">' + esc(x.name || '—') + '</div>' +
          (x.type ? '<div class="pe-ty">' + esc(x.type) + '</div>' : '') + '</div>' +
          '<div class="pe-amt">' + cop(x.value) + '</div>' +
          '<button class="pe-del" data-del="' + kind + '" data-i="' + i + '" aria-label="Eliminar">✕</button></div>';
      }).join('');
    };

    return '' +
      '<section class="sec pe-sec">' +
      '<div class="group"><div class="group-head"><div><div class="gt">🏠 ¿Tu vivienda actual es…?</div><div class="gs">Para la mayoría de colombianos la vivienda es el activo más grande. Empieza aquí.</div></div></div>' +
      '<div class="group-body" style="padding:16px 18px"><div class="pe-vivienda">' +
      VIVIENDA.map(function (o, i) { return '<button class="pe-viv" data-viv="' + i + '">' + esc(o.v) + '<span>' + esc(o.hint) + '</span></button>'; }).join('') +
      '</div></div></div>' +

      '<div class="pe-cols">' +
      '<div class="pe-col"><div class="pe-head"><span>Activos</span><button class="pe-add" data-add="a">+ Agregar activo</button></div>' + rows(assets, 'a') + '</div>' +
      '<div class="pe-col"><div class="pe-head"><span>Pasivos</span><button class="pe-add" data-add="p">+ Agregar pasivo</button></div>' + rows(liab, 'p') + '</div>' +
      '</div>' +

      '<div class="pe-def"><b>Definiciones.</b> Activo = todo lo que tienes y vale plata (ahorros, carro, apartamento). Pasivo = todo lo que debes (tarjeta, créditos). Patrimonio neto = activos − pasivos.</div>' +
      '</section>';
  }

  function formHtml(kind) {
    var isA = kind === 'a';
    var types = isA
      ? ['Ahorros / efectivo', 'Cuenta bancaria', 'Inversión / CDT / FIC', 'Vivienda', 'Vehículo', 'Otro']
      : ['Tarjeta de crédito', 'Crédito bancario', 'Crédito de vivienda', 'Crédito de vehículo', 'Deuda informal', 'Otro'];
    return '<div class="pe-backdrop" id="pe-modal"><div class="pe-form">' +
      '<div class="pe-form-h">' + (isA ? 'Nuevo activo' : 'Nuevo pasivo') + '<button class="pe-x" data-close>✕</button></div>' +
      '<label class="pe-l">Nombre</label><input class="pe-in" id="pe-name" placeholder="' + (isA ? 'Ej: Cuenta de ahorros' : 'Ej: Tarjeta Visa') + '">' +
      '<label class="pe-l">Tipo</label><select class="pe-in" id="pe-type">' + types.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select>' +
      '<label class="pe-l">' + (isA ? 'Valor actual' : 'Saldo que debes') + ' ($)</label><div class="pe-money"><span>$</span><input class="pe-in" id="pe-value" inputmode="numeric" placeholder="0"></div>' +
      '<div class="pe-actions"><button class="pe-cancel" data-close>Cancelar</button><button class="pe-save" data-save="' + kind + '">Guardar</button></div>' +
      '</div></div>';
  }

  function openForm(kind, prefill) {
    document.body.insertAdjacentHTML('beforeend', formHtml(kind));
    if (prefill) {
      if (prefill.type) { var sel = document.getElementById('pe-type'); for (var i = 0; i < sel.options.length; i++) if (sel.options[i].text === prefill.type) sel.selectedIndex = i; }
      if (prefill.name) document.getElementById('pe-name').value = prefill.name;
    }
    var val = document.getElementById('pe-value');
    val.addEventListener('input', function () { var d = digits(val.value); val.value = d ? parseInt(d, 10).toLocaleString('es-CO') : ''; });
    document.getElementById('pe-name').focus();
  }
  function closeForm() { var m = document.getElementById('pe-modal'); if (m) m.remove(); }

  function saveRow(kind) {
    var name = document.getElementById('pe-name').value.trim();
    var type = document.getElementById('pe-type').value;
    var value = parseInt(digits(document.getElementById('pe-value').value), 10) || 0;
    if (!name || !value) { alert('Escribe un nombre y un valor.'); return; }
    var item = { name: name, type: type, value: value };
    if (!patrimony) patrimony = { assets_data: [], liabilities_data: [] };
    if (kind === 'a') patrimony.assets_data = (patrimony.assets_data || []).concat([item]);
    else patrimony.liabilities_data = (patrimony.liabilities_data || []).concat([item]);
    commit();
  }
  function delRow(kind, i) {
    if (!patrimony) return;
    var arr = kind === 'a' ? patrimony.assets_data : patrimony.liabilities_data;
    arr.splice(i, 1);
    commit();
  }

  function commit() {
    if (!person) { render(); return; }
    var body = { assets_data: patrimony.assets_data || [], liabilities_data: patrimony.liabilities_data || [] };
    var pid = person.id;
    var p = patrimony && patrimony.__exists
      ? PlaneaSB.patch('persons_patrimony?person_id=eq.' + pid, body)
      : PlaneaSB.get('persons_patrimony?person_id=eq.' + pid + '&select=person_id&limit=1').then(function (rows) {
          if (rows && rows.length) return PlaneaSB.patch('persons_patrimony?person_id=eq.' + pid, body);
          body.person_id = pid;
          return PlaneaSB.post('persons_patrimony', body);
        });
    closeForm();
    p.then(function () { patrimony.__exists = true; location.reload(); })
     .catch(function (e) { if (window.console) console.warn('[patrimonio] save failed', e && e.message); alert('No se pudo guardar. Revisa tu sesión.'); render(); });
  }

  function render() { mount.innerHTML = panel(); }

  function onClick(e) {
    var t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-add')) { openForm(t.getAttribute('data-add')); return; }
    if (t.hasAttribute('data-viv')) {
      var o = VIVIENDA[+t.getAttribute('data-viv')];
      if (/Propia/.test(o.v)) openForm('a', { name: 'Vivienda', type: 'Vivienda' });
      else { location.href = '#'; alert(o.v + ' — no suma patrimonio. Puedes agregar tus otros activos abajo.'); }
      return;
    }
    if (t.hasAttribute('data-del')) { delRow(t.getAttribute('data-del'), +t.getAttribute('data-i')); return; }
    if (t.hasAttribute('data-close')) { closeForm(); return; }
    if (t.hasAttribute('data-save')) { saveRow(t.getAttribute('data-save')); return; }
  }

  function boot() {
    mount = document.getElementById('pat-edit');
    if (!mount) return;
    render();
    // one document-level delegate covers both the panel (in #pat-edit) and the
    // modal form (appended to <body>). Clicking the dim backdrop closes it.
    document.addEventListener('click', function (e) { if (e.target.id === 'pe-modal') { closeForm(); return; } onClick(e); });
    if (window.PlaneaSB && PlaneaSB.loggedIn()) {
      PlaneaSB.person().then(function (pr) {
        person = pr;
        if (!pr) return;
        return PlaneaSB.get('persons_patrimony?person_id=eq.' + pr.id + '&select=assets_data,liabilities_data&limit=1').then(function (rows) {
          if (rows && rows[0]) { patrimony = rows[0]; patrimony.__exists = true; patrimony.assets_data = patrimony.assets_data || []; patrimony.liabilities_data = patrimony.liabilities_data || []; render(); }
        });
      }).catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
