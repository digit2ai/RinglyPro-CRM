/* AutoDev — History: every past meeting, newest first, searchable. Opening one makes it the
 * active meeting on /speakup/meetings. The server scopes the list to the signed-in tenant and
 * lists meetings only (Factory instructions are recordings too, and are left out). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var lang = (function () { try { return localStorage.getItem('speakup_lang') || 'es'; } catch (e) { return 'es'; } })();
  var L = function (es, en) { return lang === 'en' ? en : es; };
  var page = 1, rows = [], hasMore = false, q = '', timer = null, seq = 0;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  async function api(path) {
    var r = await fetch('/speakup/api/v1' + path, { headers: { 'X-SpeakUp': '1' } });
    if (r.status === 401) { location.href = '/speakup/login'; throw new Error('401'); }
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
    return d;
  }
  function render() {
    if (!rows.length) {
      $('list').innerHTML = '<div class="tiny">' + esc(q ? L('Nada coincide con la búsqueda.', 'Nothing matches the search.') : L('Todavía no hay reuniones.', 'No meetings yet.')) + '</div>';
    } else {
      $('list').innerHTML = rows.map(function (r) {
        var when = r.created_at ? new Date(r.created_at).toLocaleString(lang === 'en' ? 'en-US' : 'es-ES') : '';
        return '<a class="meet" href="/speakup/meetings?id=' + esc(r.id) + '">' +
          '<span class="t">' + esc(r.title || ('#' + r.id)) + '</span>' +
          '<span class="tiny" style="display:block">' + esc(when) + (r.has_transcript ? '' : ' · ' + esc(L('sin transcripción', 'no transcript'))) + '</span></a>';
      }).join('');
    }
    $('moreBtn').hidden = !hasMore;
  }
  async function load(reset) {
    var mine = ++seq;
    if (reset) { page = 1; rows = []; }
    try {
      var d = await api('/meetings?limit=30&page=' + page + (q ? '&q=' + encodeURIComponent(q) : ''));
      if (mine !== seq) return;              // a newer search already answered
      rows = rows.concat(d.meetings || []); hasMore = !!d.has_more; render();
    } catch (e) { $('list').innerHTML = '<div class="tiny">' + esc(e.message) + '</div>'; }
  }
  function setLang(l) {
    lang = l;
    try { localStorage.setItem('speakup_lang', l); } catch (e) {}
    document.documentElement.lang = l;
    document.dispatchEvent(new CustomEvent('speakup:lang', { detail: l }));
    $('langBtn').textContent = l === 'en' ? 'ES' : 'EN';
    $('outBtn').textContent = L('Salir', 'Sign out');
    // A tab the page does not carry is not an error: the Factory link was removed from the bar
    // and reading .textContent off a missing node threw here, which killed the whole relabel —
    // the language toggle silently stopped working on four screens.
    var tab = function (id, es, en) { var el = $(id); if (el) el.textContent = L(es, en); };
    tab('tabMeet', 'Reuniones', 'Meetings');
    tab('tabFac', 'Fábrica', 'Factory');
    tab('tabCC', 'Builder', 'Builder');
    $('hTitle').textContent = L('Historial', 'History');
    $('q').placeholder = L('Buscar por título o por lo que se dijo…', 'Search by title or by what was said…');
    $('moreBtn').textContent = L('Cargar más', 'Load more');
    document.title = L('AutoDev — Historial', 'AutoDev — History');
    render();
  }
  setLang(lang);
  $('langBtn').addEventListener('click', function () { setLang(lang === 'en' ? 'es' : 'en'); });
  $('outBtn').addEventListener('click', async function () {
    await fetch('/speakup/api/v1/auth/logout', { method: 'POST', headers: { 'X-SpeakUp': '1' } });
    location.href = '/speakup/login';
  });
  $('q').addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { q = $('q').value.trim(); load(true); }, 250); });
  $('moreBtn').addEventListener('click', function () { page++; load(false); });
  load(true);
})();
