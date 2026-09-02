/* PLANEA — Mi Perfil (Documento Maestro §27).
   Contexto personal del usuario. TRES campos (edad, ocupación, dependientes) operan como
   moduladores del Puntaje Planea (§27.2, regla de fuente única §3): editarlos recalcula el
   puntaje al instante con el motor único (window.PlaneaMotor) sobre las respuestas del
   survey. El resto es contexto para Maya y no toca el cálculo. */
(function () {
  'use strict';
  var SB = window.PlaneaSB, M = window.PlaneaMotor;
  var scoreData = null, meta = null;

  var PRIORIDADES = ['Familia', 'Tranquilidad', 'Independencia', 'Experiencias', 'Viajar', 'Crecimiento profesional', 'Emprender', 'Construir patrimonio', 'Comprar vivienda', 'Retirarme con tranquilidad'];
  var $ = function (id) { return document.getElementById(id); };
  function toast(msg) { var t = $('mp-toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2600); }

  function renderChips(selected) {
    var wrap = $('c-prioridades'); if (!wrap) return;
    wrap.innerHTML = '';
    PRIORIDADES.forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'mp-chip' + (selected.indexOf(p) >= 0 ? ' on' : '');
      b.type = 'button'; b.textContent = p; b.setAttribute('data-p', p);
      b.addEventListener('click', function () { b.classList.toggle('on'); updateCompleteness(); });
      wrap.appendChild(b);
    });
  }
  function chipsSelected() { return Array.prototype.slice.call(document.querySelectorAll('.mp-chip.on')).map(function (b) { return b.getAttribute('data-p'); }); }

  // ── Completitud (§27.4) — informativa, NO es un segundo puntaje ────────────────
  var COMP_IDS = ['f-edad', 'f-ocupacion', 'f-dependientes', 'c-ciudad', 'c-profesion', 'c-laboral', 'c-convive', 'c-responsabilidades', 'c-proposito', 'c-preocupa', 'c-organizado', 'c-acompanamiento', 'c-libre'];
  function updateCompleteness() {
    var filled = 0, total = COMP_IDS.length + 1; // +1 por prioridades
    COMP_IDS.forEach(function (id) { var el = $(id); if (el && String(el.value || '').trim()) filled++; });
    if (chipsSelected().length) filled++;
    var pct = Math.round(filled / total * 100);
    var fill = $('mp-compfill'), pctEl = $('mp-comppct');
    if (fill) fill.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
  }

  // ── Recalcular el Puntaje Planea al cambiar un modulador (§27.2) ───────────────
  function sub(P, k) { return Math.round((P[k] && P[k].puntaje) || 0); }
  function recompute() {
    var edad = $('f-edad').value, ocu = $('f-ocupacion').value, dep = $('f-dependientes').value;
    if (!edad || !ocu || !dep || !M || !SB) return;
    // Re-lee fresco (no pisar el DATO REAL que otras secciones guardaron, §3) y aplica el
    // dato real de los ítems al recalcular — un solo motor, un solo número.
    SB.meGet().then(function (d) {
      var sd = d && d.score_data;
      if (!sd || !sd.answers || !sd.answers.edad) {
        $('mp-calc-note').textContent = 'Completa tu vinculación (Puntaje Planea) para que estos datos afinen tu puntaje.';
        return;
      }
      var prev = sd.score;
      var ans = Object.assign({}, sd.answers);
      if (ans.edad === edad && ans.ocupacion === ocu && ans.dependientes === dep) { scoreData = sd; return; }
      ans.edad = edad; ans.ocupacion = ocu; ans.dependientes = dep;
      if (window.PlaneaRealData) ans = PlaneaRealData.applyRealData(ans, (d && d.items) || []);
      var r = M.compute(ans), P = r.pilares;
      var hist = Array.isArray(sd.history) ? sd.history.slice() : [];
      hist.push({ score: r.score, at: new Date().toISOString(), source: 'perfil' });
      scoreData = Object.assign({}, sd, {
        score: r.score, survey_score: sd.survey_score != null ? sd.survey_score : r.score,
        rango: r.rango.name, answers: ans, history: hist, prioridad: r.prioridad,
        pilares: { ahorro: sub(P, 'ahorro'), flujo: sub(P, 'flujo'), deuda: sub(P, 'deuda'), retiro: sub(P, 'retiro'), seguros: sub(P, 'seguros'), inversion: sub(P, 'inversion'), impuestos: sub(P, 'impuestos'), patrimonio: sub(P, 'patrimonio') },
        pillars: { emergency_fund: sub(P, 'ahorro'), cash_flow: sub(P, 'flujo'), debt_health: sub(P, 'deuda'), stability: sub(P, 'patrimonio') }
      });
      var delta = r.score - prev;
      var frase = delta === 0 ? 'Tu Puntaje Planea se mantuvo en ' + r.score + '.' : (delta > 0 ? 'Tu Puntaje Planea subió a ' + r.score + '.' : 'Tu Puntaje Planea quedó en ' + r.score + '.');
      $('mp-calc-note').textContent = frase + ' Cambió porque tu contexto ajusta la exigencia de algunos pilares.';
      SB.mePut({ score_data: scoreData }).then(function () { toast('Puntaje actualizado.'); }).catch(function () {});
    }).catch(function () {});
  }

  function collectMeta() {
    var m = Object.assign({}, meta || {});
    m.perfil = {
      ciudad: $('c-ciudad').value.trim(), profesion: $('c-profesion').value.trim(), laboral: $('c-laboral').value.trim(),
      convive: $('c-convive').value.trim(), responsabilidades: $('c-responsabilidades').value.trim(),
      prioridades: chipsSelected(), proposito: $('c-proposito').value.trim(), preocupa: $('c-preocupa').value.trim(),
      organizado: $('c-organizado').value, acompanamiento: $('c-acompanamiento').value, libre: $('c-libre').value.trim()
    };
    return m;
  }

  function boot() {
    if (!SB) return;
    SB.meGet().then(function (d) {
      d = d || {};
      scoreData = d.score_data || null;
      meta = (d.finance_meta && typeof d.finance_meta === 'object') ? d.finance_meta : {};
      var per = meta.perfil || {};
      // moduladores: fuente única = score_data.answers (lo que respondió en la vinculación)
      var ans = (scoreData && scoreData.answers) || {};
      if (ans.edad) $('f-edad').value = ans.edad;
      if (ans.ocupacion) $('f-ocupacion').value = ans.ocupacion;
      if (ans.dependientes) $('f-dependientes').value = ans.dependientes;
      // contexto
      $('c-ciudad').value = per.ciudad || '';
      $('c-profesion').value = per.profesion || '';
      $('c-laboral').value = per.laboral || '';
      $('c-convive').value = per.convive || '';
      $('c-responsabilidades').value = per.responsabilidades || '';
      $('c-proposito').value = per.proposito || '';
      $('c-preocupa').value = per.preocupa || '';
      $('c-organizado').value = per.organizado || '';
      $('c-acompanamiento').value = per.acompanamiento || '';
      $('c-libre').value = per.libre || '';
      renderChips(per.prioridades || []);
      if (!scoreData || !scoreData.answers || !scoreData.answers.edad) {
        $('mp-calc-note').textContent = 'Completa tu vinculación (Puntaje Planea) para que estos datos afinen tu puntaje.';
      }
      updateCompleteness();
    }).catch(function (e) {
      if (e && /\b401\b/.test(e.message || '')) location.replace('/planea/login');
    });

    ['f-edad', 'f-ocupacion', 'f-dependientes'].forEach(function (id) { $(id).addEventListener('change', function () { recompute(); updateCompleteness(); }); });
    COMP_IDS.forEach(function (id) { var el = $(id); if (el) el.addEventListener('input', updateCompleteness); });

    $('mp-save').addEventListener('click', function () {
      if (!SB) return;
      SB.mePut({ finance_meta: collectMeta() }).then(function () { toast('Perfil guardado.'); }).catch(function () { toast('No se pudo guardar. Revisa tu sesión.'); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
