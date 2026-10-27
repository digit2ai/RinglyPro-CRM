/* =====================================================
   Salud Financiera — owner-only view of the Projects Hub.
   Every figure on this screen comes from /projects/api/salud-financiera;
   nothing is computed here except chart pixel positions.
   Reuses the Hub's .card / .card-stat / .btn / .data-table / modal and the
   Home orb's .lina-v2 styles (index.html).
   ===================================================== */
(function () {
  'use strict';
  var SF_API = '/projects/api/salud-financiera';
  // Lina is hidden from the dashboard for now (owner request 2026-10-25). Set to true to bring her back;
  // the API, the brain and every Lina function stay in place.
  var SHOW_LINA = false;
  var CATS = [
    ['gasto_personal', 'Gasto personal'], ['otro', 'Otro'], ['ingreso_extra', 'Ingreso extra'], ['salario', 'Salario'],
    ['ahorro', 'Ahorro'], ['inversion', 'Inversión'], ['corte', 'Corte'], ['pago_lina', 'Pago Lina'], ['hija', 'Casa de mi hija'], ['servicios', 'Servicios'], ['gasto_semanal', 'Gastos semana']
  ];
  var CHIPS = ['¿Cómo estoy hoy?', '¿Cuánto tendré el 1 de diciembre?', '¿Por qué tengo este saldo hoy?', '¿Cómo se calcula la proyección?', '¿Qué hago para mantenerla?', 'Agrega un gasto de 45 en comida'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var state = { f: { q: '', desde: '', hasta: '', min: '', max: '', sort: '', dir: 1, bank: null }, fmin: null, salud: null, movs: [], meses: [], mes: '', historial: [], audio: null, paused: false, rec: null };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function tok() { try { return localStorage.getItem('d2ai_token') || localStorage.getItem('token') || ''; } catch (e) { return ''; } }
  function sf(path, opts) {
    opts = opts || {};
    var h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok() };
    return fetch(SF_API + path, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }); });
  }
  function fechaCorta(iso) { if (!iso) return ''; var p = iso.split('-'); return Number(p[2]) + ' ' + MESES[Number(p[1]) - 1].slice(0, 3) + ' ' + p[0].slice(2); }
  function fechaLarga(iso) { if (!iso) return ''; var p = iso.split('-'); return Number(p[2]) + ' de ' + MESES[Number(p[1]) - 1]; }
  function todayNY() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

  // ---------- nav: only the owner ever sees the item ----------
  window.sfInitNav = function () {
    var li = document.getElementById('nav-salud-financiera');
    if (!li) return;
    sf('/acceso').then(function (j) { if (j && j.ok) li.style.display = ''; else li.remove(); }).catch(function () { li.remove(); });
  };

  // ---------- orb markup (same component as Home, its own ids) ----------
  function orbHtml() {
    return '<style>#sf-lina .orb-svg g,#sf-lina .orb-svg circle{transform-box:view-box}</style>' +
      '<div class="lina lina-v2" id="sf-lina" style="margin:0 0 16px">' +
      '<div class="lina-name">Lina &middot; Tu asesora financiera</div>' +
      '<div class="lina-role">Pregúntame por voz o por texto. Solo hablo de tus finanzas.</div>' +
      '<div class="orb-wrap" id="sfOrbWrap" role="button" tabindex="0" data-state="idle" aria-label="Tocar y hablar con Lina">' +
      '<svg class="orb-svg" viewBox="0 0 240 240" aria-hidden="true"><defs>' +
      '<radialGradient id="sfOrbCore" cx="0.5" cy="0.45"><stop offset="0" stop-color="#a5f3fc"/><stop offset="0.25" stop-color="#22d3ee" stop-opacity="0.95"/><stop offset="0.55" stop-color="#3b82f6" stop-opacity="0.85"/><stop offset="0.82" stop-color="#8b5cf6" stop-opacity="0.7"/><stop offset="1" stop-color="#ec4899" stop-opacity="0.5"/></radialGradient>' +
      '<radialGradient id="sfOrbGlow" cx="0.5" cy="0.5"><stop offset="0" stop-color="#22d3ee" stop-opacity="0.4"/><stop offset="0.45" stop-color="#8b5cf6" stop-opacity="0.22"/><stop offset="1" stop-color="#ec4899" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="sfOrbInner" cx="0.5" cy="0.45"><stop offset="0" stop-color="#fff"/><stop offset="0.35" stop-color="#a5f3fc" stop-opacity="0.95"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0.4"/></radialGradient>' +
      '<linearGradient id="sfOrbRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="0.4" stop-color="#3b82f6"/><stop offset="0.75" stop-color="#8b5cf6"/><stop offset="1" stop-color="#ec4899"/></linearGradient>' +
      '</defs>' +
      '<circle class="orb-glow" cx="120" cy="120" r="112" fill="url(#sfOrbGlow)"><animate attributeName="r" values="104;120;104" dur="5s" repeatCount="indefinite"/></circle>' +
      '<g class="orb-ring-outer"><circle cx="120" cy="120" r="108" fill="none" stroke="url(#sfOrbRing)" stroke-width="0.6" stroke-dasharray="2 4" opacity="0.55"/></g>' +
      '<g class="orb-ring-mid"><circle cx="120" cy="120" r="96" fill="none" stroke="url(#sfOrbRing)" stroke-width="0.8" stroke-dasharray="6 3" opacity="0.7"/></g>' +
      '<circle class="orb-ring-inner" cx="120" cy="120" r="84" fill="none" stroke="url(#sfOrbRing)" stroke-width="1" stroke-dasharray="10 2 2 2" opacity="0.85"/>' +
      '<g class="orb-particles"><circle class="orb-particle" cx="120" cy="36" r="2.5" fill="#22d3ee"/><circle class="orb-particle" cx="120" cy="36" r="2" fill="#8b5cf6" style="animation-delay:-1.2s"/><circle class="orb-particle" cx="120" cy="36" r="2.5" fill="#ec4899" style="animation-delay:-2.4s"/></g>' +
      '<circle class="orb-iris-segs" cx="120" cy="120" r="56" fill="none" stroke="#22d3ee" stroke-width="2" stroke-dasharray="14 18" stroke-linecap="round" opacity="0.75"/>' +
      '<circle class="orb-core" cx="120" cy="120" r="48" fill="url(#sfOrbCore)"><animate attributeName="r" values="44;52;44" dur="4.5s" repeatCount="indefinite"/></circle>' +
      '<circle cx="120" cy="120" r="14" fill="url(#sfOrbInner)"><animate attributeName="r" values="12;18;12" dur="2.2s" repeatCount="indefinite"/></circle>' +
      '</svg>' +
      '<div class="orb-caption"><span class="orb-cap-idle">Toca el orbe y habla</span><span class="orb-cap-active" id="sfCapActive">Escuchando</span></div>' +
      '</div>' +
      '<div class="status" id="sfStatus" style="text-align:center"></div>' +
      '<div id="sfBrain" style="text-align:center;font-size:11.5px;color:var(--text-muted);margin-top:2px"></div>' +
      '<div id="sfChat" style="width:100%;max-height:260px;overflow-y:auto;text-align:left;margin:10px 0"></div>' +
      '<div style="display:flex;gap:8px;width:100%">' +
      '<input id="sfAsk" type="text" placeholder="Pregúntale a Lina: ¿Cómo estoy hoy?" style="flex:1;min-width:0;padding:10px 12px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:16px">' +
      '<button class="btn btn-primary" id="sfAskBtn">Preguntar</button></div>' +
      '<div id="sfChips" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:10px">' + CHIPS.map(function (c) { return '<button class="btn btn-sm btn-ghost" data-chip="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
      '<div class="controls" style="justify-content:center;margin-top:10px">' +
      '<button id="sfVoz" aria-pressed="false">Voz: apagada</button>' +
      '<button id="sfPause" disabled>&#10074;&#10074; Pausar</button><button id="sfStop" disabled>&#9632; Detener</button></div>' +
      '</div>';
  }

  // ---------- render ----------
  function hideHubAssistant(hide) { var w = document.getElementById('nlp-widget'); if (w) w.style.display = hide ? 'none' : ''; }
  window.sfLeave = function () { hideHubAssistant(false); stopAudio && document.getElementById('sfPause') && stopAudio(); };

  window.renderSaludFinanciera = function (container) {
    hideHubAssistant(true);
    try { if (location.pathname !== '/projects/salud-financiera') history.replaceState(null, '', '/projects/salud-financiera'); } catch (e) {}
    container.innerHTML =
      '<div id="sf-root" style="max-width:1100px;margin:0 auto">' +
      (SHOW_LINA ? orbHtml() : '') +
      '<div class="card card-accent-blue" style="margin-bottom:16px;padding:12px"><div class="section-header"><h3>Panel de instrumentos</h3></div><div id="sf-pfd"><div class="spinner"></div></div></div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">' +
      '<button class="btn btn-primary" id="sf-add" style="flex:1 1 220px;padding:14px 16px;font-size:16px;font-weight:600">+ Agregar movimiento</button>' +
      '<button class="btn btn-ghost" id="sf-extend">Extender plan</button></div>' +
      '<div id="sf-bank" style="margin-bottom:16px"></div>' +
      '<div class="card card-accent-blue" id="sf-mov-card" style="margin-bottom:24px"><div class="section-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h3>Movimientos</h3>' +
      '<select id="sf-mes" style="padding:6px 10px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:16px"></select></div>' +
      '<p class="section-hint">Gris: plan pendiente. Azul: real. Verde: cumplido. Fondo resaltado: tu punto más bajo.</p>' +
      '<div id="sf-filt" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">' +
      '<input id="sf-q" type="search" placeholder="Buscar concepto, monto o fecha" aria-label="Buscar" style="flex:1 1 220px;min-width:0;padding:6px 8px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:16px">' +
      '<label style="display:flex;gap:4px;align-items:center;font-size:12px;color:var(--text-muted)">Desde<input id="sf-desde" type="date" style="padding:6px 8px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:16px"></label>' +
      '<label style="display:flex;gap:4px;align-items:center;font-size:12px;color:var(--text-muted)">Hasta<input id="sf-hasta" type="date" style="padding:6px 8px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:16px"></label>' +
      '<input id="sf-min" type="number" inputmode="decimal" step="0.01" placeholder="Monto mín" aria-label="Monto mínimo" style="width:110px;padding:6px 8px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:16px">' +
      '<input id="sf-max" type="number" inputmode="decimal" step="0.01" placeholder="Monto máx" aria-label="Monto máximo" style="width:110px;padding:6px 8px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:16px">' +
      '<button class="btn btn-sm btn-ghost" id="sf-clear">Limpiar</button></div>' +
      '<div id="sf-chip"></div>' +
      '<div id="sf-table" style="overflow-x:auto"></div></div>' +
      '</div>';
    document.getElementById('sf-add').onclick = openAdd;
    document.getElementById('sf-extend').onclick = extendPlan;
    document.getElementById('sf-mes').onchange = function () { state.mes = this.value; loadMovs(); };
    wireFilters();
    if (SHOW_LINA) wireLina();
    resumeOAuth();
    return refresh();
  };

  function refresh() { return Promise.all([loadSalud(), loadMovs(), loadBank()]); }

  // ---------- Bank of America via Plaid (READ-ONLY) ----------
  function haceCuanto(ts) {
    if (!ts) return 'nunca';
    var m = Math.round((Date.now() - Date.parse(ts)) / 60000);
    if (m < 2) return 'hace un momento'; if (m < 60) return 'hace ' + m + ' min'; var h = Math.round(m / 60); if (h < 48) return 'hace ' + h + ' h'; return 'hace ' + Math.round(h / 24) + ' días';
  }
  var ESTADO_BANCO = { activo: ['Conectado', 'var(--success)'], login_requerido: ['Hay que volver a iniciar sesión', 'var(--danger)'], por_desconectar: ['Se va a desconectar', 'var(--warning)'], desconectado: ['Desconectado', 'var(--danger)'] };
  function loadBank() {
    var el = document.getElementById('sf-bank'); if (!el) return Promise.resolve();
    return sf('/plaid/estado').then(function (j) {
      if (!j.success) { el.innerHTML = ''; return; }
      state.bank = j.data; drawBank();
    }).catch(function () {});
  }
  function money(n) { return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fechaCorta(iso) { var m = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']; var p = String(iso).split('-'); return Number(p[2]) + ' ' + m[Number(p[1]) - 1]; }
  // Corte reserve: how much to keep in the corte account on each payday (owner design 2026-10-26)
  function reservaHtml(d) {
    var r = d.reserva; if (!r || !d.items.length) return '';
    var c = function (x) { return money((x || 0) / 100); };
    var cuenta = r.cuenta ? '••' + r.cuenta.mask : 'la cuenta del Corte', gastos = r.gastos ? '••' + r.gastos.mask : 'la cuenta de gastos';
    if (r.estado === 'sin_cuenta') return '<p class="section-hint">Marca en <b>Cuentas</b> cuál recibe el sueldo y paga el Corte, y cuál paga lo demás.</p>';
    if (r.estado === 'sin_saldo') return '<p class="section-hint">Esperando el saldo de ' + esc(cuenta) + ' desde el banco. Pulsa "Sincronizar ahora".</p>';
    if (r.estado === 'sin_corte' || r.estado === 'error') return '';
    var col = { cubierto: 'var(--success)', en_camino: 'var(--success)', faltante: 'var(--danger)', insuficiente: 'var(--danger)' }[r.estado] || 'var(--text-muted)';
    var h = '<div style="border:1px solid var(--border);border-left:4px solid ' + col + ';border-radius:8px;padding:10px 12px;margin:6px 0 10px">' +
      '<div style="font-weight:700;margin-bottom:4px">Reserva del Corte</div>' +
      '<div style="font-size:14px">Corte del <b>' + esc(fechaCorta(r.corte.fecha)) + '</b>: ' + c(r.corte.montoCents) + ' + colchón ' + c(r.colchonCents) + ' = <b>' + c(r.objetivoCents) + '</b>. Hoy en ' + esc(cuenta) + ': <b>' + c(r.saldoCents) + '</b>.</div>';
    if (r.estado === 'cubierto') h += '<div style="color:var(--success);font-weight:600;margin-top:4px">Cubierto. Puedes pasar ' + c(r.moverAhoraCents) + ' a ' + esc(gastos) + ' hoy.</div>';
    if (r.estado === 'faltante') h += '<div style="color:var(--danger);font-weight:600;margin-top:4px">Faltan ' + c(r.traerCents) + ' y no hay sueldo antes del Corte: pásalos de ' + esc(gastos) + ' a ' + esc(cuenta) + '.</div>';
    if (r.pagos && r.pagos.length) {
      h += '<div style="font-size:14px;margin-top:6px">' + r.pagos.map(function (p) {
        return 'Sueldo del <b>' + esc(fechaCorta(p.fecha)) + '</b> (' + c(p.montoCents) + '): deja <b>' + c(p.guardarCents) + '</b> en ' + esc(cuenta) + ' y pasa <b>' + c(p.moverCents) + '</b> a ' + esc(gastos) + '.';
      }).join('<br>') + '</div>';
    }
    if (r.estado === 'insuficiente') h += '<div style="color:var(--danger);font-weight:600;margin-top:4px">Aun guardando todo el sueldo faltan ' + c(r.traerCents) + ': pásalos de ' + esc(gastos) + ' antes del Corte.</div>';
    if (r.riesgo) h += '<div style="color:var(--warning,#d97706);font-size:13px;margin-top:4px">Ojo: el sueldo del ' + esc(fechaCorta(r.riesgo.fecha)) + ' llega justo antes del Corte. Si se retrasa, faltarían ' + c(r.riesgo.faltaSinEseCents) + '. Mejor deja ese dinero desde el sueldo anterior.</div>';
    if (r.cuenta && r.cuenta.saldo_at) h += '<div style="font-size:12px;color:var(--text-muted);margin-top:4px">Saldo del banco: ' + esc(haceCuanto(r.cuenta.saldo_at)) + '.</div>';
    return h + '</div>';
  }
  function drawBank() {
    var el = document.getElementById('sf-bank'), d = state.bank; if (!el || !d) return;
    var h = '<div class="card card-accent-blue" style="padding:12px 14px"><div class="section-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h3>Banco</h3>' +
      '<span style="font-size:12px;color:var(--text-muted)">Solo lectura · ' + (d.entorno === 'production' ? 'producción' : 'prueba (sandbox)') + ' · <a href="/salud-financiera-privacy.html" target="_blank" rel="noopener">Privacidad</a></span></div>';
    if (!d.configurado) {
      h += '<p class="section-hint">La conexión con el banco todavía no está configurada en el servidor. Falta: ' + esc((d.falta || []).join(', ')) + '.</p>';
    } else if (!d.items.length) {
      h += '<p class="section-hint">Conecta tu cuenta de Bank of America para que tus compras, depósitos y suscripciones lleguen solos. Solo se leen datos: nunca se mueve dinero.</p>' +
        '<button class="btn btn-primary" id="sf-bank-connect">Conectar Bank of America</button>';
    }
    h += reservaHtml(d);
    d.items.forEach(function (it) {
      var e = ESTADO_BANCO[it.estado] || ESTADO_BANCO.activo;
      var vence = it.consent_expira ? String(it.consent_expira).slice(0, 10) : null;
      var pronto = vence && (Date.parse(vence) - Date.now() < 30 * 864e5);
      if (it.estado !== 'activo' || pronto) {
        h += '<div style="background:rgba(239,68,68,.12);border:1px solid var(--danger);border-radius:8px;padding:10px;margin:8px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
          '<span style="flex:1 1 220px">' + esc(it.institution_name) + ': ' + (it.estado !== 'activo' ? esc(e[0]) : 'el permiso vence el ' + esc(vence)) + '. Renuévalo para seguir importando.</span>' +
          '<button class="btn btn-sm btn-primary" data-bank-update="' + it.id + '">Reconectar</button></div>';
      }
      var incl = it.cuentas.filter(function (c) { return c.incluir; }).map(function (c) { var sb = c.saldo_disponible != null ? c.saldo_disponible : c.saldo_actual; return (c.mask ? '••' + c.mask : c.nombre) + (sb != null ? ' ' + money(Number(sb)) : '') + (c.rol === 'corte' ? ' (Corte)' : c.rol === 'gastos' ? ' (gastos)' : ''); });
      h += '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;margin-top:6px">' +
        '<div><b>' + esc(it.institution_name) + '</b> <span style="color:' + e[1] + ';font-weight:600;font-size:13px">· ' + esc(e[0]) + '</span>' +
        '<div style="font-size:13px;color:var(--text-muted)">Última sincronización: ' + esc(haceCuanto(it.ultimo_sync)) + (vence ? ' · permiso hasta ' + esc(vence) : '') + ' · cuentas que cuentan: ' + esc(incl.join(', ') || 'ninguna') + '</div>' +
        (it.ultimo_error ? '<div style="font-size:12px;color:var(--danger)">Último error: ' + esc(it.ultimo_error) + '</div>' : '') + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm btn-ghost" data-bank-sync="1">Sincronizar ahora</button>' +
        '<button class="btn btn-sm btn-ghost" data-bank-accounts="' + it.id + '">Cuentas</button>' +
        '<button class="btn btn-sm btn-ghost" data-bank-add="' + it.id + '">Agregar cuentas</button>' +
        '<button class="btn btn-sm btn-ghost" data-bank-update="' + it.id + '">Reconectar</button>' +
        '<button class="btn btn-sm btn-ghost" data-bank-off="' + it.id + '" style="color:var(--danger)">Desconectar</button></div></div>';
    });
    if (d.configurado && d.items.length) h += '<div style="margin-top:8px"><button class="btn btn-sm btn-ghost" id="sf-bank-connect">+ Conectar otra cuenta (otro usuario del banco)</button></div>';
    if ((d.alertas || []).length) {
      h += '<div style="margin-top:10px">' + d.alertas.map(function (a) {
        return '<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;border-top:1px solid var(--border);padding:7px 0;font-size:14px"><span>' + esc(a.texto) + '</span>' +
          '<button class="btn btn-sm btn-ghost" data-alerta-ok="' + a.id + '">Entendido</button></div>';
      }).join('') + '</div>';
    }
    var subs = (d.recurrentes || []).filter(function (r) { return r.direccion === 'salida' && r.activo; });
    if (subs.length) h += '<div style="margin-top:8px"><button class="btn btn-sm btn-ghost" id="sf-bank-subs">Cobros recurrentes (' + subs.length + ')</button></div>';
    h += '</div>';
    el.innerHTML = h;
    var c = document.getElementById('sf-bank-connect'); if (c) c.onclick = function () { bankLink(null); };
    el.querySelectorAll('[data-bank-update]').forEach(function (b) { b.onclick = function () { bankLink(Number(b.getAttribute('data-bank-update'))); }; });
    el.querySelectorAll('[data-bank-add]').forEach(function (b) { b.onclick = function () { bankLink(Number(b.getAttribute('data-bank-add')), true); }; });
    el.querySelectorAll('[data-bank-sync]').forEach(function (b) { b.onclick = function () { b.disabled = true; b.textContent = 'Sincronizando…'; sf('/plaid/sync', { method: 'POST' }).then(function () { setTimeout(refresh, 6000); }); }; });
    el.querySelectorAll('[data-bank-accounts]').forEach(function (b) { b.onclick = function () { bankAccounts(Number(b.getAttribute('data-bank-accounts'))); }; });
    el.querySelectorAll('[data-bank-off]').forEach(function (b) { b.onclick = function () {
      if (!confirm('¿Desconectar el banco? Los movimientos ya importados se quedan. En el plan de prueba de Plaid ese cupo no se recupera.')) return;
      sf('/plaid/item/' + b.getAttribute('data-bank-off'), { method: 'DELETE' }).then(function () { refresh(); });
    }; });
    el.querySelectorAll('[data-alerta-ok]').forEach(function (b) { b.onclick = function () { sf('/plaid/alertas/' + b.getAttribute('data-alerta-ok'), { method: 'PATCH', body: { leida: true } }).then(loadBank); }; });
    var sb = document.getElementById('sf-bank-subs'); if (sb) sb.onclick = function () {
      openModal('Cobros recurrentes', '<table class="data-table" style="width:100%"><thead><tr><th>Concepto</th><th>Frecuencia</th><th style="text-align:right">Último</th><th>Próximo</th></tr></thead><tbody>' +
        subs.map(function (r) { return '<tr><td>' + esc(r.descripcion) + (r.fuente === 'detector' ? ' <span style="font-size:11px;color:var(--text-muted)">(detectado por la app)</span>' : '') + '</td><td>' + esc({ WEEKLY: 'semanal', BIWEEKLY: 'quincenal', SEMI_MONTHLY: '2 al mes', MONTHLY: 'mensual', ANNUALLY: 'anual' }[r.frecuencia] || r.frecuencia || '') + '</td><td style="text-align:right">' + (r.monto_ultimo ? '$' + esc(r.monto_ultimo) : '') + '</td><td>' + esc(r.proxima_fecha || '') + '</td></tr>'; }).join('') + '</tbody></table>', function () { closeModal(); });
    };
  }
  function loadPlaidScript() {
    if (window.Plaid) return Promise.resolve();
    if (state.plaidLoading) return state.plaidLoading;
    state.plaidLoading = new Promise(function (ok, bad) {
      var s = document.createElement('script'); s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
      s.onload = function () { ok(); }; s.onerror = function () { state.plaidLoading = null; bad(new Error('No se pudo cargar Plaid Link')); };
      document.head.appendChild(s);
    });
    return state.plaidLoading;
  }
  // itemId null = new connection; a number = update mode (same Item, renews consent, no new slot)
  function linkHandlers(itemId) {
    return {
      onSuccess: function (publicToken, meta) {
        try { localStorage.removeItem('sf_plaid_link'); } catch (e) {}
        if (itemId) sf('/plaid/update-done', { method: 'POST', body: { id: itemId } }).then(function () { setTimeout(refresh, 4000); });
        else sf('/plaid/exchange', { method: 'POST', body: { public_token: publicToken, institution: meta && meta.institution ? { name: meta.institution.name, institution_id: meta.institution.institution_id } : null, cuentas: (meta && meta.accounts || []).map(function (a) { return a.mask; }) } })
          .then(function (x) { if (!x.success) alert(x.error || 'No se pudo conectar'); setTimeout(refresh, 6000); refresh(); });
      },
      onExit: function (err, meta) {
        if (err) alert('El banco no terminó la conexión: ' + (err.display_message || err.error_message || err.error_code || 'error') + (err.error_code ? ' (' + err.error_code + ')' : ''));
      }
    };
  }
  // nuevas = true: same login, pick extra accounts (update mode with account selection, no new slot)
  function bankLink(itemId, nuevas) {
    var tokenCall = itemId ? sf('/plaid/update-token', { method: 'POST', body: { id: itemId, cuentas_nuevas: !!nuevas } }) : sf('/plaid/link-token', { method: 'POST' });
    Promise.all([tokenCall, loadPlaidScript()]).then(function (res) {
      var j = res[0];
      if (!j.success) { alert(j.error || 'No se pudo abrir la conexión con el banco'); return; }
      // banks like Bank of America log in on their own page (OAuth) and may come back to this URL:
      // keep the link token so the flow can resume (Plaid: receivedRedirectUri)
      try { localStorage.setItem('sf_plaid_link', JSON.stringify({ token: j.data.link_token, itemId: itemId || null, at: Date.now() })); } catch (e) {}
      var h = window.Plaid.create(Object.assign({ token: j.data.link_token }, linkHandlers(itemId)));
      h.open();
    }).catch(function (e) { alert(e.message); });
  }
  // returning from the bank's own login page (?oauth_state_id=...): resume the same Link session
  function resumeOAuth() {
    if (!/[?&]oauth_state_id=/.test(location.search)) return;
    var saved = null; try { saved = JSON.parse(localStorage.getItem('sf_plaid_link') || 'null'); } catch (e) {}
    var href = location.href;
    try { history.replaceState(null, '', '/projects/salud-financiera'); } catch (e) {}
    if (!saved || !saved.token || Date.now() - saved.at > 30 * 60 * 1000) { alert('La conexión con el banco expiró. Vuelve a pulsar "Conectar".'); return; }
    loadPlaidScript().then(function () {
      window.Plaid.create(Object.assign({ token: saved.token, receivedRedirectUri: href }, linkHandlers(saved.itemId))).open();
    }).catch(function (e) { alert(e.message); });
  }
  function bankAccounts(itemId) {
    var it = (state.bank.items || []).filter(function (x) { return x.id === itemId; })[0]; if (!it) return;
    openModal('Cuentas de ' + it.institution_name,
      '<p class="section-hint">Solo las cuentas marcadas cuentan en tu salud financiera. Recomendado: solo la cuenta de cheques (la tarjeta ya la pagas como "Corte"; incluirla contaría cada compra dos veces).</p>' +
      it.cuentas.map(function (c) { return '<label style="display:flex;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--border);font-size:15px"><input type="checkbox" data-acct="' + c.id + '"' + (c.incluir ? ' checked' : '') + ' style="width:20px;height:20px"> ' + esc(c.nombre || 'Cuenta') + (c.mask ? ' ••' + esc(c.mask) : '') + ' <span style="color:var(--text-muted);font-size:12px">' + esc(c.subtipo || c.tipo || '') + '</span>' + ' <select data-rol="' + c.id + '" style="margin-left:auto"><option value="">—</option><option value="corte"' + (c.rol === 'corte' ? ' selected' : '') + '>Recibe sueldo y paga el Corte</option><option value="gastos"' + (c.rol === 'gastos' ? ' selected' : '') + '>Paga los demás gastos</option></select></label>'; }).join(''),
      function () { closeModal(); });
    document.querySelectorAll('[data-rol]').forEach(function (sel) { sel.onchange = function () { sf('/plaid/cuentas/' + sel.getAttribute('data-rol'), { method: 'PATCH', body: { rol: sel.value || null } }).then(function () { refresh(); }); }; });
    document.querySelectorAll('[data-acct]').forEach(function (cb) { cb.onchange = function () {
      cb.disabled = true;
      sf('/plaid/cuentas/' + cb.getAttribute('data-acct'), { method: 'PATCH', body: { incluir: cb.checked } }).then(function () { cb.disabled = false; refresh(); });
    }; });
  }

  function loadSalud() {
    return sf('/salud').then(function (s) {
      if (!s.success) { document.getElementById('sf-pfd').innerHTML = '<p>' + (s._status === 404 ? 'Este módulo no está disponible para tu usuario.' : esc(s.error || 'No disponible')) + '</p>'; return; }
      state.salud = s; if (window.drawSfPfd) window.drawSfPfd(document.getElementById('sf-pfd'), s);
    });
  }

  function loadMovs() {
    var q = state.mes ? '?mes=' + encodeURIComponent(state.mes) : '';
    return sf('/movimientos' + q).then(function (j) {
      if (!j.success) return;
      state.movs = j.data; state.meses = j.meses;
      var sel = document.getElementById('sf-mes');
      if (sel) sel.innerHTML = '<option value="">Todos los meses</option>' + j.meses.map(function (m) { return '<option value="' + m + '"' + (m === state.mes ? ' selected' : '') + '>' + MESES[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4) + '</option>'; }).join('');
      state.fmin = j.fecha_min; redraw();
    });
  }

  // ---------- table filters (owner 2026-10-27): search, date range, amount range, sortable Fecha/Concepto/Monto, bank chip
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; }
  function fold(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function filtered() {
    var f = state.f, q = fold(f.q).trim(), mn = num(f.min), mx = num(f.max);
    var bank = f.bank ? f.bank.reduce(function (o, id) { o[id] = 1; return o; }, {}) : null;
    var out = state.movs.filter(function (r) {
      if (bank && !bank[r.id]) return false;
      if (f.desde && r.fecha < f.desde) return false;
      if (f.hasta && r.fecha > f.hasta) return false;
      var m = Math.abs(num(r.efectivo || r.monto) || 0);
      if (mn != null && m < mn) return false;
      if (mx != null && m > mx) return false;
      if (q) {
        var hay = fold([r.concepto, r.comercio, r.nota, r.fecha, fechaCorta(r.fecha), r.monto, r.efectivo, r.categoria].join(' '));
        if (!q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0 || hay.replace(/,/g, '').indexOf(w.replace(/,/g, '')) >= 0; })) return false;
      }
      return true;
    });
    if (f.sort) {
      out = out.slice().sort(function (a, b) {
        var x, y;
        if (f.sort === 'fecha') { x = a.fecha + String(a.id).padStart(9, '0'); y = b.fecha + String(b.id).padStart(9, '0'); }
        else if (f.sort === 'concepto') { x = fold(a.concepto); y = fold(b.concepto); }
        else { x = (a.tipo === 'ingreso' ? 1 : -1) * Math.abs(num(a.efectivo || a.monto) || 0); y = (b.tipo === 'ingreso' ? 1 : -1) * Math.abs(num(b.efectivo || b.monto) || 0); }
        return (x < y ? -1 : x > y ? 1 : 0) * f.dir;
      });
    }
    return out;
  }
  function anyFilter() { var f = state.f; return !!(f.q || f.desde || f.hasta || f.min || f.max || f.bank); }
  function redraw() {
    var rows = filtered(), chip = document.getElementById('sf-chip');
    if (chip) {
      var parts = [];
      if (state.f.bank) parts.push('Gastos del banco fuera del plan');
      if (anyFilter()) {
        var tot = rows.reduce(function (x, r) { return x + (r.tipo === 'ingreso' ? 1 : -1) * Math.round(Math.abs(num(r.efectivo || r.monto) || 0) * 100); }, 0);
        parts.push(rows.length + (rows.length === 1 ? ' movimiento' : ' movimientos') + ' · total ' + money(tot / 100));
      }
      chip.innerHTML = parts.length ? '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;font-size:13px">' +
        '<span style="background:rgba(34,211,238,.12);color:var(--info);border:1px solid currentColor;border-radius:999px;padding:3px 10px">' + esc(parts.join(' · ')) + '</span>' +
        (state.f.bank ? '<button class="btn btn-sm btn-ghost" id="sf-unbank">Quitar filtro del banco</button>' : '') + '</div>' : '';
      var ub = document.getElementById('sf-unbank');
      if (ub) ub.onclick = function () { state.f.bank = null; redraw(); };
    }
    drawTable(rows, state.fmin);
  }
  function wireFilters() {
    var f = state.f, t = null;
    var q = document.getElementById('sf-q');
    q.oninput = function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { f.q = v; redraw(); }, 150); };
    ['desde', 'hasta'].forEach(function (k) {
      document.getElementById('sf-' + k).onchange = function () {
        f[k] = this.value;
        // a date range may cross months: read every month, not just the one selected
        if (this.value && state.mes && this.value.slice(0, 7) !== state.mes) { state.mes = ''; loadMovs(); } else redraw();
      };
    });
    ['min', 'max'].forEach(function (k) { document.getElementById('sf-' + k).oninput = function () { f[k] = this.value; redraw(); }; });
    document.getElementById('sf-clear').onclick = function () {
      state.f = { q: '', desde: '', hasta: '', min: '', max: '', sort: '', dir: 1, bank: null };
      ['q', 'desde', 'hasta', 'min', 'max'].forEach(function (k) { document.getElementById('sf-' + k).value = ''; });
      redraw();
    };
  }
  // the Bank card in the instrument panel: this month's bank debits outside the plan, from the 1st to today
  window.sfFilterBank = function (ids, hoy) {
    var ym = String(hoy).slice(0, 7);
    state.f = { q: '', desde: ym + '-01', hasta: hoy, min: '', max: '', sort: 'fecha', dir: 1, bank: ids.slice() };
    var set = function (k, v) { var e = document.getElementById('sf-' + k); if (e) e.value = v; };
    set('q', ''); set('desde', state.f.desde); set('hasta', state.f.hasta); set('min', ''); set('max', '');
    var card = document.getElementById('sf-mov-card');
    var done = function () { if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    if (state.mes !== ym) { state.mes = ym; loadMovs().then(done); } else { redraw(); done(); }
  };

  function sortTh(k, label, st) {
    var on = state.f.sort === k, arrow = on ? (state.f.dir === 1 ? ' ▲' : ' ▼') : '';
    return '<th data-sort="' + k + '" title="Ordenar por ' + label.toLowerCase() + '" style="cursor:pointer;user-select:none;' + st + (on ? 'color:var(--info);' : '') + '">' + label + arrow + '</th>';
  }
  function drawTable(rows, fmin) {
    var el = document.getElementById('sf-table');
    if (!rows.length) { el.innerHTML = '<p class="section-hint">' + (anyFilter() ? 'Ningún movimiento coincide con el filtro.' : 'No hay movimientos en este mes.') + '</p>'; return; }
    var color = { plan: 'var(--text-muted)', real: 'var(--info)', cumplido: 'var(--success)' };
    var label = { plan: 'Plan', real: 'Real', cumplido: 'Cumplido' };
    el.innerHTML = '<style>@media (max-width:700px){#sf-mov-card{padding:12px 8px}#sf-table .sf-hide-m{display:none}#sf-table .sf-yr{display:none}#sf-table td,#sf-table th{padding:7px 4px;font-size:12px}#sf-table td.sf-concepto{word-break:break-word;white-space:normal}#sf-table tr[data-row]{cursor:pointer}}</style><table class="data-table" style="width:100%"><thead><tr>' + sortTh('fecha', 'Fecha', '') + sortTh('concepto', 'Concepto', '') + sortTh('monto', 'Monto', 'text-align:right') + '<th style="text-align:right">Saldo</th><th class="sf-hide-m">Estado</th><th class="sf-hide-m"></th></tr></thead><tbody>' +
      rows.map(function (r) {
        var v = r.estado_visual; var neg = r.saldo && r.saldo.charAt(0) === '-';
        var bg = r.es_minimo ? 'background:rgba(245,158,11,.14);' : '';
        var monto = (r.tipo === 'ingreso' ? '+' : '-') + (r.efectivo || r.monto);
        var planned = (v === 'cumplido' && r.monto_real && r.monto_real !== r.monto) ? '<div style="font-size:11px;color:var(--text-muted)">plan $' + esc(r.monto) + '</div>' : '';
        var act = v === 'plan' ? '<button class="btn btn-sm btn-ghost" data-done="' + r.id + '">Cumplido</button>'
          : v === 'cumplido' ? '<button class="btn btn-sm btn-ghost" data-undo="' + r.id + '">Deshacer</button>'
            : '<button class="btn btn-sm btn-ghost" data-del="' + r.id + '">Borrar</button>';
        act = '<button class="btn btn-sm btn-ghost" data-edit="' + r.id + '">Editar</button> ' + act;
        return '<tr data-row="' + r.id + '" style="' + bg + 'border-left:3px solid ' + color[v] + '">' +
          '<td style="white-space:nowrap">' + esc(fechaCorta(r.fecha).replace(/ \d\d$/, '')) + '<span class="sf-yr"> ' + esc(r.fecha.slice(2, 4)) + '</span>' + (r.es_minimo ? '<div style="font-size:11px;color:var(--warning);font-weight:700">PUNTO MÁS BAJO</div>' : '') + '</td>' +
          '<td class="sf-concepto">' + esc(r.concepto) + (r.fuente === 'plaid' ? ' <span style="font-size:10px;font-weight:700;color:var(--accent,#3b82f6);border:1px solid currentColor;border-radius:4px;padding:0 4px">BANCO</span>' : '') + (r.pendiente_banco ? ' <span style="font-size:10px;color:var(--warning)">pendiente</span>' : '') + '</td>' +
          '<td style="text-align:right;white-space:nowrap;color:' + (r.tipo === 'ingreso' ? 'var(--success)' : 'var(--text-primary)') + '">' + esc(monto) + planned + '</td>' +
          '<td style="text-align:right;white-space:nowrap;font-weight:600;color:' + (neg ? 'var(--danger)' : 'var(--text-primary)') + '">' + esc(r.saldo) + '</td>' +
          '<td class="sf-hide-m"><span style="font-size:12px;color:' + color[v] + ';font-weight:600">' + label[v] + '</span></td><td class="sf-hide-m" style="white-space:nowrap">' + act + '</td></tr>';
      }).join('') + '</tbody></table>';
    el.querySelectorAll('[data-done]').forEach(function (b) { b.onclick = function () { openDone(Number(b.getAttribute('data-done'))); }; });
    el.querySelectorAll('[data-undo]').forEach(function (b) { b.onclick = function () { sf('/movimientos/' + b.getAttribute('data-undo'), { method: 'PATCH', body: { estado: 'pendiente' } }).then(refresh); }; });
    // On a phone the action buttons are hidden: tapping a row opens Editar (which can also delete).
    el.querySelectorAll('tr[data-row]').forEach(function (tr) { tr.onclick = function (e) { if (e.target.closest('button')) return; if (window.innerWidth <= 700) openEdit(Number(tr.getAttribute('data-row'))); }; });
    el.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { openEdit(Number(b.getAttribute('data-edit'))); }; });
    el.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.onclick = function () {
        var k = th.getAttribute('data-sort');
        if (state.f.sort === k) { if (state.f.dir === 1) state.f.dir = -1; else { state.f.sort = ''; state.f.dir = 1; } } else { state.f.sort = k; state.f.dir = 1; }
        redraw();
      };
    });
    el.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { if (confirm('¿Borrar este movimiento?')) sf('/movimientos/' + b.getAttribute('data-del'), { method: 'DELETE' }).then(refresh); }; });
  }

  // ---------- forms ----------
  function field(label, html) { return '<div class="form-group"><label>' + label + '</label>' + html + '</div>'; }
  function openAdd(prefill) {
    prefill = prefill && prefill.fecha ? prefill : {};
    var tipo = prefill.tipo || 'egreso';
    openModal('Agregar movimiento',
      '<div class="form-row">' + field('Fecha', '<input type="date" id="sf-f-fecha" value="' + (prefill.fecha || todayNY()) + '" style="font-size:16px">') +
      field('Monto', '<input type="text" inputmode="decimal" id="sf-f-monto" placeholder="45.00" value="' + esc(prefill.monto || '') + '" style="font-size:16px">') + '</div>' +
      field('Concepto', '<input type="text" id="sf-f-concepto" placeholder="Comida" value="' + esc(prefill.concepto || '') + '" style="font-size:16px">') +
      '<div class="form-row">' + field('Tipo', '<select id="sf-f-tipo" style="font-size:16px"><option value="egreso"' + (tipo === 'egreso' ? ' selected' : '') + '>Egreso</option><option value="ingreso"' + (tipo === 'ingreso' ? ' selected' : '') + '>Ingreso</option></select>') +
      field('Categoría', '<select id="sf-f-cat" style="font-size:16px">' + CATS.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === (prefill.categoria || 'gasto_personal') ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select>') + '</div>' +
      '<p id="sf-f-err" style="color:var(--danger);font-size:13px"></p>',
      function () {
        var body = { fecha: val('sf-f-fecha'), monto: val('sf-f-monto'), concepto: val('sf-f-concepto') || (val('sf-f-tipo') === 'ingreso' ? 'Ingreso' : 'Gasto'), tipo: val('sf-f-tipo'), categoria: val('sf-f-cat') };
        return sf('/movimientos', { method: 'POST', body: body }).then(function (j) {
          if (!j.success) { document.getElementById('sf-f-err').textContent = j.error || 'No se pudo guardar'; return; }
          closeModal(); refresh();
        });
      });
    var m = document.getElementById('sf-f-monto'); if (m) setTimeout(function () { m.focus(); }, 50);
  }
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }

  // Edit any movement (plan or real). Only the fields that changed are sent.
  // also opened from the panel's "Pagos de hoy" card; the table may be filtered to another month, so the card passes the row
  window.sfOpenEdit = function (id, row) {
    if (row && !(state.movs || []).some(function (x) { return x.id === id; })) (state.movs = state.movs || []).push(row);
    openEdit(id);
  };
  function openEdit(id) {
    var r = state.movs.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    var cumplido = r.origen === 'plan' && r.estado === 'cumplido';
    openModal('Editar movimiento',
      '<p style="margin-bottom:10px;color:var(--text-secondary);font-size:13px">' + (r.origen === 'plan' ? 'Movimiento del plan' + (cumplido ? ' (cumplido)' : '') : 'Movimiento real') + '</p>' +
      '<div class="form-row">' + field('Fecha', '<input type="date" id="sf-e-fecha" value="' + esc(r.fecha) + '" style="font-size:16px">') +
      field(cumplido ? 'Monto planeado' : 'Monto', '<input type="text" inputmode="decimal" id="sf-e-monto" value="' + esc(r.monto) + '" style="font-size:16px">') + '</div>' +
      (cumplido ? field('Monto real pagado o recibido', '<input type="text" inputmode="decimal" id="sf-e-real" value="' + esc(r.monto_real || r.monto) + '" style="font-size:16px">') : '') +
      field('Concepto', '<input type="text" id="sf-e-concepto" value="' + esc(r.concepto) + '" style="font-size:16px">') +
      '<div class="form-row">' + field('Tipo', '<select id="sf-e-tipo" style="font-size:16px"><option value="egreso"' + (r.tipo === 'egreso' ? ' selected' : '') + '>Egreso</option><option value="ingreso"' + (r.tipo === 'ingreso' ? ' selected' : '') + '>Ingreso</option></select>') +
      field('Categoría', '<select id="sf-e-cat" style="font-size:16px">' + CATS.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === r.categoria ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select>') + '</div>' +
      (r.fuente === 'plaid' ? '<label style="display:flex;gap:8px;align-items:center;font-size:14px;margin:6px 0"><input type="checkbox" id="sf-e-regla"> Usar esta categoría siempre para ' + esc(r.comercio || r.concepto) + '</label>' : '') +
      '<p id="sf-e-err" style="color:var(--danger);font-size:13px"></p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (r.origen === 'plan' ? '<button type="button" class="btn btn-sm btn-ghost" id="sf-e-done">' + (cumplido ? 'Volver a pendiente' : 'Marcar como cumplido') + '</button>' : '') +
      '<button type="button" class="btn btn-sm btn-ghost" id="sf-e-del" style="color:var(--danger);border-color:var(--danger)">Borrar este movimiento</button></div>',
      function () {
        var cambios = {};
        var campos = { fecha: val('sf-e-fecha'), monto: val('sf-e-monto'), concepto: val('sf-e-concepto'), tipo: val('sf-e-tipo'), categoria: val('sf-e-cat') };
        Object.keys(campos).forEach(function (k) { if (String(campos[k]) !== String(r[k])) cambios[k] = campos[k]; });
        if (cumplido && val('sf-e-real') !== String(r.monto_real || r.monto)) cambios.monto_real = val('sf-e-real');
        var regla = document.getElementById('sf-e-regla') && document.getElementById('sf-e-regla').checked;
        if (!Object.keys(cambios).length && !regla) { closeModal(); return; }
        var pre = Object.keys(cambios).length ? sf('/movimientos/' + id, { method: 'PATCH', body: cambios }) : Promise.resolve({ success: true });
        return pre.then(function (j) {
          if (!j.success) { document.getElementById('sf-e-err').textContent = j.error || 'No se pudo guardar'; return; }
          var after = regla ? sf('/plaid/regla', { method: 'POST', body: { movimiento_id: id, categoria: val('sf-e-cat') } }) : Promise.resolve();
          return after.then(function () { closeModal(); refresh(); });
        });
      });
    var done = document.getElementById('sf-e-done');
    if (done) done.onclick = function () {
      if (cumplido) sf('/movimientos/' + id, { method: 'PATCH', body: { estado: 'pendiente' } }).then(function () { closeModal(); refresh(); });
      else { closeModal(); openDone(id); }
    };
    var del = document.getElementById('sf-e-del');
    if (del) del.onclick = function () {
      if (!confirm('¿Borrar "' + r.concepto + '" del ' + fechaLarga(r.fecha) + '?')) return;
      sf('/movimientos/' + id, { method: 'DELETE' }).then(function (j) { if (j.success) { closeModal(); refresh(); } else document.getElementById('sf-e-err').textContent = j.error || 'No se pudo borrar'; });
    };
  }

  function openDone(id) {
    var r = state.movs.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    openModal('Marcar como cumplido',
      '<p style="margin-bottom:12px">' + esc(r.concepto) + ' &middot; ' + esc(fechaLarga(r.fecha)) + '</p>' +
      field('Monto real pagado o recibido', '<input type="text" inputmode="decimal" id="sf-d-monto" value="' + esc(r.monto) + '" style="font-size:16px">') +
      '<p id="sf-d-err" style="color:var(--danger);font-size:13px"></p>',
      function () {
        return sf('/movimientos/' + id, { method: 'PATCH', body: { estado: 'cumplido', monto_real: val('sf-d-monto') } }).then(function (j) {
          if (!j.success) { document.getElementById('sf-d-err').textContent = j.error || 'No se pudo guardar'; return; }
          closeModal(); refresh();
        });
      });
  }

  function extendPlan() {
    if (!confirm('¿Extender el plan un mes más con las reglas (salario cada dos viernes, corte el día 6, pago Lina con el primer salario, $100 por semana)?')) return;
    sf('/plan/extender', { method: 'POST', body: { meses: 1 } }).then(function (j) {
      alert(j.success ? ('Listo: ' + j.creados + ' movimientos nuevos del ' + fechaLarga(j.desde) + ' al ' + fechaLarga(j.hasta) + '.') : (j.error || 'No se pudo extender'));
      refresh();
    });
  }

  // ---------- Lina ----------
  function setOrb(st) { var w = document.getElementById('sfOrbWrap'); if (w) w.setAttribute('data-state', st); var c = document.getElementById('sfCapActive'); if (c) c.textContent = st === 'listening' ? 'Escuchando' : st === 'thinking' ? 'Pensando' : 'Hablando'; }
  function status(t) { var e = document.getElementById('sfStatus'); if (e) e.textContent = t || ''; }
  function bubble(who, html) {
    var c = document.getElementById('sfChat'); if (!c) return null;
    var d = document.createElement('div');
    d.style.cssText = 'margin:6px 0;padding:9px 12px;border-radius:10px;font-size:14px;line-height:1.45;' + (who === 'yo' ? 'background:var(--accent-muted);margin-left:15%;' : 'background:var(--bg-tertiary);margin-right:10%;');
    d.innerHTML = html; c.appendChild(d); c.scrollTop = c.scrollHeight; return d;
  }

  function wireLina() {
    var input = document.getElementById('sfAsk');
    document.getElementById('sfAskBtn').onclick = function () { ask(input.value, 'texto'); };
    input.onkeydown = function (e) { if (e.key === 'Enter') ask(input.value, 'texto'); };
    var orb = document.getElementById('sfOrbWrap');
    orb.onclick = function () { if (state.listening) return finishListening(); if (state.audio && !state.audio.paused) return stopAudio(); listen(); };
    orb.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); orb.onclick(); } };
    document.getElementById('sfPause').onclick = function () {
      if (!state.audio) return;
      if (state.audio.paused) { state.audio.play(); this.innerHTML = '&#10074;&#10074; Pausar'; setOrb('speaking'); }
      else { state.audio.pause(); this.innerHTML = '&#9654; Reanudar'; setOrb('idle'); }
    };
    document.getElementById('sfStop').onclick = stopAudio;
    document.getElementById('sfVoz').onclick = function () { var on = !vozOn(); try { localStorage.setItem('sf_voz', on ? '1' : '0'); } catch (e) {} if (!on) stopAudio(); pintarVoz(); };
    pintarVoz();
    document.querySelectorAll('#sfChips [data-chip]').forEach(function (b) { b.onclick = function () { ask(b.getAttribute('data-chip'), 'texto'); }; });
    brainLine();
    sf('/lina/historial?limit=6').then(function (j) {
      if (!j.success) return;
      j.data.forEach(function (h) { state.historial.push({ rol: 'yo', texto: h.pregunta }, { rol: 'lina', texto: h.respuesta }); });
      var last = j.data[j.data.length - 1];
      if (last) { bubble('yo', esc(last.pregunta)); bubble('lina', esc(last.respuesta)); }
      if (!j.data.length) status('Toca el orbe y pregúntame "¿Cómo estoy hoy?"');
    });
  }

  // Listens until you finish: keeps going through pauses and only sends after
  // SILENCIO_MS without new words (or when you tap the orb again). Browsers end
  // a recognition session on their own every few seconds; it is restarted.
  var SILENCIO_MS = 3000, MAX_MS = 90000;
  function listen() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { status('Este navegador no reconoce voz. Escribe tu pregunta abajo.'); document.getElementById('sfAsk').focus(); return; }
    if (state.listening) { finishListening(); return; }
    var acc = '', interim = '', timer = null, started = Date.now();
    state.listening = true;
    function show() { document.getElementById('sfAsk').value = (acc + ' ' + interim).trim(); }
    function arm() { clearTimeout(timer); timer = setTimeout(finishListening, SILENCIO_MS); }
    function startRec() {
      var rec = new SR(); state.rec = rec;
      rec.lang = 'es-MX'; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
      rec.onresult = function (e) {
        interim = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) acc = (acc + ' ' + e.results[i][0].transcript).trim();
          else interim += e.results[i][0].transcript;
        }
        show(); arm();
      };
      rec.onerror = function (ev) { if (ev && (ev.error === 'not-allowed' || ev.error === 'service-not-allowed')) { state.listening = false; setOrb('idle'); status('Necesito permiso para usar el micrófono.'); } };
      rec.onend = function () {
        if (!state.listening) return;
        if (Date.now() - started > MAX_MS) return finishListening();
        try { startRec(); } catch (e) { finishListening(); }
      };
      try { rec.start(); } catch (e) {}
    }
    state.finishListening = function () {
      if (!state.listening) return;
      state.listening = false; clearTimeout(timer);
      try { state.rec && state.rec.stop(); } catch (e) {}
      setOrb('idle'); status('');
      var t = (acc + ' ' + interim).trim() || document.getElementById('sfAsk').value.trim();
      if (t) ask(t, 'voz');
    };
    setOrb('listening'); status('Te escucho. Habla con calma; toca el orbe cuando termines.');
    timer = setTimeout(finishListening, 8000); // nothing said at all: stop after 8 s
    startRec();
  }
  function finishListening() { if (state.finishListening) state.finishListening(); }

  function ask(text, canal) {
    text = String(text || '').trim(); if (!text) return;
    document.getElementById('sfAsk').value = '';
    document.getElementById('sfChat').innerHTML = ''; // only the latest question and answer stay on screen
    bubble('yo', esc(text));
    setOrb('thinking'); status('Lina está revisando tus números...');
    sf('/lina', { method: 'POST', body: { pregunta: text, canal: canal, historial: state.historial.slice(-6) } }).then(function (j) {
      setOrb('idle'); status('');
      if (!j.success) { bubble('lina', esc(j.error || 'No pude responder.')); return; }
      state.historial.push({ rol: 'yo', texto: text }, { rol: 'lina', texto: j.texto });
      var nota = j.composed_by !== 'claude' && j.motivo_respaldo ? '<div style="font-size:11px;color:var(--warning);margin-top:4px">Respondí con reglas básicas porque mi cerebro falló: ' + esc(j.motivo_respaldo) + '</div>' : '';
      var b = bubble('lina', esc(j.texto) + nota);
      if (j.pendiente && j.propuesta) proposal(b);
      if (j.cambio || (j.cambios && j.cambios.length)) { refresh(); deshacerBtn(b); }
      brainLine();
      speak(j.texto);
    }).catch(function () { setOrb('idle'); bubble('lina', 'No hay conexión. Intenta otra vez.'); });
  }

  // Lina never saves on her own: Sí sends "sí" through the conversation, the
  // server executes the proposal IT stored (not anything from the page) and
  // Lina explains how the projection changed.
  function proposal(b) {
    var box = document.createElement('div'); box.style.cssText = 'display:flex;gap:8px;margin-top:8px';
    box.innerHTML = '<button class="btn btn-sm btn-primary">Sí</button><button class="btn btn-sm btn-ghost">No</button>';
    b.appendChild(box);
    box.children[0].onclick = function () { box.remove(); ask('sí', 'texto'); };
    box.children[1].onclick = function () { box.remove(); ask('no', 'texto'); };
  }

  // The Spanish neural voice reads "$" as "pesos". All amounts here are US
  // dollars, so the spoken text says so; the written text keeps "$".
  function paraVoz(t) {
    return String(t || '')
      .replace(/(-)?\$\s?(\d[\d,]*)(?:\.(\d{2}))?/g, function (m, neg, ent, cen) {
        var n = ent.replace(/,/g, ''); var c = cen ? Number(cen) : 0;
        return (neg ? 'menos ' : '') + n + (n === '1' ? ' dólar' : ' dólares') + (c ? ' con ' + c + (c === 1 ? ' centavo' : ' centavos') : '');
      })
      .replace(/(\d)\s?%/g, '$1 por ciento')
      .replace(/ – /g, ', ');
  }
  window.sfParaVoz = paraVoz;

  // After Lina changes data, one tap reverses it (the server keeps the undo log).
  function deshacerBtn(b) {
    var x = document.createElement('div'); x.style.cssText = 'margin-top:8px';
    x.innerHTML = '<button class="btn btn-sm btn-ghost">Deshacer</button>';
    b.appendChild(x);
    x.firstChild.onclick = function () { x.remove(); ask('deshaz el último cambio', 'texto'); };
  }
  function brainLine() {
    sf('/lina/estado').then(function (e) {
      var el = document.getElementById('sfBrain'); if (!el || !e.success) return;
      el.style.color = e.cerebro === 'claude' ? 'var(--text-muted)' : 'var(--warning)';
      el.textContent = e.cerebro === 'claude'
        ? 'Cerebro: Claude (' + e.modelo + ')' + (e.ultimo_error && (!e.ultimo_ok || e.ultimo_error_at > e.ultimo_ok) ? ' · último fallo: ' + e.ultimo_error : ' · activo')
        : 'Cerebro sin conexión (' + (!e.llave ? 'falta la llave de Anthropic' : (!e.habilitado ? 'desactivado' : 'no disponible')) + '): respondo con reglas básicas';
    }).catch(function () {});
  }

  function stopAudio() {
    if (state.audio) { try { state.audio.pause(); } catch (e) {} state.audio = null; }
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    setOrb('idle'); document.getElementById('sfPause').disabled = true; document.getElementById('sfStop').disabled = true;
    document.getElementById('sfPause').innerHTML = '&#10074;&#10074; Pausar';
  }

  // Narration is OFF by default (owner request); the choice is remembered on this device.
  function vozOn() { try { return localStorage.getItem('sf_voz') === '1'; } catch (e) { return false; } }
  function pintarVoz() { var b = document.getElementById('sfVoz'); if (!b) return; var on = vozOn(); b.textContent = on ? 'Voz: encendida' : 'Voz: apagada'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); }

  function speak(text) {
    stopAudio();
    if (!vozOn()) return;
    fetch('/api/tts/edge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: paraVoz(text).slice(0, 1900), voice: 'lina' }) })
      .then(function (r) { if (!r.ok) throw new Error('tts'); return r.blob(); })
      .then(function (blob) {
        if (!blob || blob.size < 200) throw new Error('empty');
        var a = new Audio(URL.createObjectURL(blob)); state.audio = a;
        a.onended = function () { state.audio = null; stopAudio(); };
        document.getElementById('sfPause').disabled = false; document.getElementById('sfStop').disabled = false;
        setOrb('speaking'); return a.play();
      })
      .catch(function () {
        if (!window.speechSynthesis) return;
        var u = new SpeechSynthesisUtterance(paraVoz(text)); u.lang = 'es-MX';
        u.onstart = function () { setOrb('speaking'); document.getElementById('sfStop').disabled = false; };
        u.onend = function () { setOrb('idle'); };
        window.speechSynthesis.speak(u);
      });
  }
})();
