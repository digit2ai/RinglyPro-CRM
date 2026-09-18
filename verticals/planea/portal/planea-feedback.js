/* PLANEA — dos señales para las métricas del MVP, en la página del Puntaje Planea:
   1. "vio su puntaje" (una vez por día, solo el evento, sin cifras);
   2. la pregunta NPS "¿Recomendarías Planea a un amigo?" (0-10), una sola vez por persona.
   Nada se muestra antes de que el usuario tenga su puntaje: preguntar si recomendaría
   la app a quien aún no la ha usado da un dato vacío. */
(function () {
  'use strict';
  var API = '/planea/api/v1';
  var shown = false;
  function req(method, path, body) {
    return fetch(API + path, { method: method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._ok = r.ok; j._status = r.status; return j; }); })
      .catch(function () { return { _ok: false }; });
  }
  function css() {
    if (document.getElementById('pl-nps-css')) return;
    var st = document.createElement('style'); st.id = 'pl-nps-css';
    st.textContent = '.pl-nps{margin:18px 0;padding:18px;border-radius:16px;border:1px solid var(--line);background:var(--pane,transparent);color:var(--txt)}' +
      '.pl-nps h3{font-family:Inter,sans-serif;font-size:16px;margin:0 0 4px}.pl-nps p{margin:0 0 12px;font-size:13.5px;color:var(--mut)}' +
      '.pl-nps .row{display:grid;grid-template-columns:repeat(11,1fr);gap:6px}' +
      '.pl-nps button{min-height:44px;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--txt);font:600 15px Inter,sans-serif;cursor:pointer;padding:0}' +
      '.pl-nps button:hover,.pl-nps button:focus-visible{border-color:var(--green);background:var(--green-soft)}' +
      '.pl-nps .ends{display:flex;justify-content:space-between;font-size:12px;color:var(--mut);margin-top:6px}' +
      '@media(max-width:480px){.pl-nps .row{grid-template-columns:repeat(6,1fr)}}';
    document.head.appendChild(st);
  }
  function card() {
    if (shown) return; shown = true;
    css();
    var host = document.querySelector('.wrap') || document.body;
    var el = document.createElement('section'); el.className = 'pl-nps'; el.id = 'pl-nps';
    el.innerHTML = '<h3>¿Recomendarías Planea a un amigo?</h3><p>Elige de 0 (nada probable) a 10 (muy probable). Es una sola pregunta y solo se hace una vez.</p>' +
      '<div class="row" role="group" aria-label="Probabilidad de recomendar Planea, de 0 a 10">' +
      Array.from({ length: 11 }, function (_, i) { return '<button type="button" data-n="' + i + '">' + i + '</button>'; }).join('') +
      '</div><div class="ends"><span>Nada probable</span><span>Muy probable</span></div>';
    host.appendChild(el);
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-n]'); if (!b) return;
      el.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
      req('POST', '/me/nps', { score: +b.getAttribute('data-n') }).then(function (r) {
        el.innerHTML = (r._ok || r._status === 409) ? '<h3>Gracias.</h3><p>Tu respuesta nos ayuda a mejorar Planea.</p>' : '<h3>No se pudo guardar.</h3><p>Inténtalo más tarde.</p>';
      });
    });
  }
  function run() {
    req('GET', '/me/profile').then(function (p) {
      if (!p._ok || !p.score_data || p.score_data.score == null) return;
      try {
        var day = new Date().toISOString().slice(0, 10);
        if (localStorage.getItem('planea-scoreview-day') !== day) {
          req('POST', '/me/events', { event: 'score_view' }).then(function (r) { if (r._ok) try { localStorage.setItem('planea-scoreview-day', day); } catch (e) {} });
        }
      } catch (e) {}
      req('GET', '/me/nps').then(function (n) { if (n._ok && n.answered === false) card(); });
    });
  }
  window.addEventListener('planea:onboarded', function () { setTimeout(run, 400); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
