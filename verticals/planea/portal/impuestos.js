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

  // ── Calendario DIAN PARAMETRIZABLE (§23.2) — actualizable por año, NO fijo en lógica.
  //    Ventanas REFERENCIALES por los dos últimos dígitos de la cédula (persona natural,
  //    declaración de renta). Deben confirmarse contra la resolución vigente de la DIAN. ──
  var CAL_ANIO = 2026;
  var CAL = [
    { from: 1, to: 6, win: 'segunda quincena de agosto' },
    { from: 7, to: 16, win: 'última semana de agosto' },
    { from: 17, to: 28, win: 'primera semana de septiembre' },
    { from: 29, to: 40, win: 'segunda semana de septiembre' },
    { from: 41, to: 52, win: 'tercera semana de septiembre' },
    { from: 53, to: 64, win: 'última semana de septiembre' },
    { from: 65, to: 76, win: 'primera semana de octubre' },
    { from: 77, to: 88, win: 'segunda semana de octubre' },
    { from: 89, to: 100, win: 'tercera semana de octubre' }
  ];
  function ventana(dig2) {
    var n = parseInt(dig2, 10); if (isNaN(n)) return null;
    if (n === 0) n = 100;
    for (var i = 0; i < CAL.length; i++) if (n >= CAL[i].from && n <= CAL[i].to) return CAL[i].win;
    return null;
  }
  function renderCalendario() {
    var d = ($('t-cedula').value || '').replace(/\D/g, '').slice(-2);
    var win = ventana(d);
    if (!win) { $('tx-prox').textContent = 'Cuéntanos tus dos últimos dígitos'; $('tx-fecha').textContent = ''; $('tx-keep').textContent = 'Ingresa los dos últimos dígitos de tu cédula en el perfil tributario para ver tu ventana estimada.'; return; }
    $('tx-prox').textContent = 'Declaración de renta ' + CAL_ANIO;
    $('tx-fecha').textContent = 'Ventana estimada: ' + win + ' de ' + CAL_ANIO + '.';
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
    // Carga de RUT deshabilitada por protección de datos personales — sin input de archivo.
    $('tx-save').addEventListener('click', saveMeta);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
