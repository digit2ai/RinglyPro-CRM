/* PLANEA — Impuestos (Documento Maestro §23). Persona natural, Colombia.
   Estado tributario §23.1 · Calendario personalizado por 2 últimos dígitos de cédula
   §23.2 (PARAMETRIZABLE, referencial — confirmar con DIAN) · Perfil tributario §23.4 que
   alimenta el componente de cumplimiento del pilar Impuestos y recalcula el puntaje ·
   RUT §23.3 (el PDF no se almacena). Maya traduce; nunca afirma obligación ni calcula topes. */
(function () {
  'use strict';
  var SB = window.PlaneaSB, M = window.PlaneaMotor;
  var scoreData = null, meta = null;
  var $ = function (id) { return document.getElementById(id); };
  function toast(msg) { var t = $('tx-toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2600); }

  // ── Documentos de impuestos (PDF) — se guardan en la base de Planea (§23.3) ──
  var TAXAPI = '/planea/api/v1';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtSize(n) { n = +n || 0; return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
  function renderDocs(docs) {
    var box = $('tx-doclist'); if (!box) return;
    var card = $('tx-docs-card');
    if (!docs || !docs.length) { box.innerHTML = ''; if (card) card.hidden = true; return; }
    if (card) card.hidden = false;
    box.innerHTML = docs.map(function (d) {
      return '<div class="tx-doc"><span class="ic">PDF</span>' +
        '<span class="nm">' + esc(d.filename) + '<small>' + fmtSize(d.size_bytes) + '</small></span>' +
        '<a class="dl" href="' + TAXAPI + '/me/tax-docs/' + d.id + '" target="_blank" rel="noopener">Ver</a>' +
        '<button class="del" title="Eliminar" data-del="' + d.id + '">×</button></div>';
    }).join('');
  }
  function loadDocs() {
    fetch(TAXAPI + '/me/tax-docs', { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { renderDocs(j && j.docs || []); }).catch(function () {});
  }
  function delDoc(id) {
    fetch(TAXAPI + '/me/tax-docs/' + id, { method: 'DELETE', credentials: 'include' })
      .then(function () { toast('Documento eliminado.'); loadDocs(); }).catch(function () {});
  }
  function initDocs() {
    var list = $('tx-doclist');
    if (list) list.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-del]'); if (b) delDoc(b.getAttribute('data-del')); });
    loadDocs();
  }

  // ── Calendario DIAN (§23.2). Las ventanas y la tabla oficial viven en planea-tax.js y en
  //    /planea/api/v1/tax/calendar; sin tabla oficial la fecha se muestra como ESTIMADA,
  //    nunca como un día exacto que la DIAN no ha publicado. ──
  var TAXCAL = { table: null, loaded: false };
  fetch(TAXAPI + '/tax/calendar', { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { TAXCAL.table = j && j.table || null; TAXCAL.loaded = true; renderCalendario(); })
    .catch(function () { TAXCAL.loaded = true; });
  function renderCalendario() {
    var T = window.PlaneaTax; if (!T) return;
    var d = ($('t-cedula').value || '').replace(/\D/g, '').slice(-2);
    var r = d.length === 2 ? T.forDigits(d, TAXCAL.table, +T.todayColombia().slice(0, 4)) : null;
    if (!r) { $('tx-prox').textContent = 'Cuéntanos tus dos últimos dígitos'; $('tx-fecha').textContent = ''; $('tx-keep').textContent = 'Ingresa los dos últimos dígitos de tu cédula en el perfil tributario para ver tu fecha de declaración.'; return; }
    $('tx-prox').textContent = 'Declaración de renta ' + r.year;
    $('tx-fecha').textContent = r.kind === 'exacta' ? 'Fecha según el calendario DIAN: ' + r.label + '.' : 'Ventana estimada: ' + r.label + '. Confírmala con el calendario oficial de la DIAN.';
    $('tx-keep').textContent = 'Ten a mano tus soportes (ingresos, retenciones, deducciones) antes de esa fecha. Si un contador te ayuda, avísale con tiempo.';
  }

  // ── Estado tributario §23.1 ────────────────────────────────────────────────────
  function renderEstado() {
    var c = $('t-cumplimiento').value, s = $('t-soportes').value;
    var estado, color;
    if (!c && !s) { estado = 'Información incompleta'; color = 'var(--mut)'; }
    else if ((c === 'aldia') && (s === 'organizados')) { estado = 'Organizado'; color = 'var(--green)'; }
    else if (c === 'nose' || s === 'nose' || c === 'atraso' || !c || !s) { estado = 'Por revisar'; color = '#e0954f'; }
    else { estado = 'Por revisar'; color = '#e0954f'; }
    $('tx-estado-val').textContent = estado;
    $('tx-dot').style.background = color;
  }

  // ── Perfil tributario → pilar Impuestos (§23.5). Recalcula el puntaje. ──────────
  function sub(P, k) { return Math.round((P[k] && P[k].puntaje) || 0); }
  function recompute() {
    if (!scoreData || !scoreData.answers || !scoreData.answers.edad) return;
    var c = $('t-cumplimiento').value, s = $('t-soportes').value;
    var ans = scoreData.answers, changed = false;
    if (c && ans.impuestos_cumplimiento !== c) { ans.impuestos_cumplimiento = c; changed = true; }
    if (s && ans.impuestos_soportes !== s) { ans.impuestos_soportes = s; changed = true; }
    if (!changed) return;
    var prev = scoreData.score, r = M.compute(ans), P = r.pilares;
    var hist = Array.isArray(scoreData.history) ? scoreData.history.slice() : [];
    hist.push({ score: r.score, at: new Date().toISOString(), source: 'impuestos' });
    scoreData = Object.assign({}, scoreData, {
      score: r.score, rango: r.rango.name, answers: ans, history: hist, prioridad: r.prioridad,
      pilares: { ahorro: sub(P, 'ahorro'), flujo: sub(P, 'flujo'), deuda: sub(P, 'deuda'), retiro: sub(P, 'retiro'), seguros: sub(P, 'seguros'), inversion: sub(P, 'inversion'), impuestos: sub(P, 'impuestos'), patrimonio: sub(P, 'patrimonio') },
      pillars: { emergency_fund: sub(P, 'ahorro'), cash_flow: sub(P, 'flujo'), debt_health: sub(P, 'deuda'), stability: sub(P, 'patrimonio') }
    });
    var delta = r.score - prev;
    $('tx-calc-note').textContent = (delta === 0 ? 'Tu Puntaje Planea se mantuvo en ' + r.score + '.' : 'Tu Puntaje Planea quedó en ' + r.score + '.') + ' Actualizaste tu frente de impuestos.';
    if (SB) SB.mePut({ score_data: scoreData }).catch(function () {});
  }

  function saveMeta() {
    var m = Object.assign({}, meta || {});
    m.tributario = {
      cumplimiento: $('t-cumplimiento').value, soportes: $('t-soportes').value,
      preparador: $('t-preparador').value, cedula2: ($('t-cedula').value || '').replace(/\D/g, '').slice(-2)
    };
    meta = m;
    if (SB) SB.mePut({ finance_meta: m }).then(function () { toast('Guardado.'); }).catch(function () { toast('No se pudo guardar.'); });
  }

  function boot() {
    if (!SB) return;
    SB.meGet().then(function (d) {
      d = d || {};
      scoreData = d.score_data || null;
      meta = (d.finance_meta && typeof d.finance_meta === 'object') ? d.finance_meta : {};
      var t = meta.tributario || {};
      var ans = (scoreData && scoreData.answers) || {};
      $('t-cumplimiento').value = t.cumplimiento || ans.impuestos_cumplimiento || '';
      $('t-soportes').value = t.soportes || ans.impuestos_soportes || '';
      $('t-preparador').value = t.preparador || '';
      $('t-cedula').value = t.cedula2 || '';
      renderEstado(); renderCalendario();
    }).catch(function (e) { if (e && /\b401\b/.test(e.message || '')) location.replace('/planea/login'); });

    $('t-cumplimiento').addEventListener('change', function () { renderEstado(); recompute(); });
    $('t-soportes').addEventListener('change', function () { renderEstado(); recompute(); });
    $('t-cedula').addEventListener('input', renderCalendario);
    initDocs();
    $('tx-save').addEventListener('click', saveMeta);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
