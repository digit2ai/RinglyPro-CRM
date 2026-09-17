/* AutoDev — Settings: language, the signed-in account, whether the AI model is reachable,
 * and sign out. It shows the model's real state rather than a green light: "configured" only
 * means a key is set, so the last error the server saw is shown beside it. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var lang = (function () { try { return localStorage.getItem('speakup_lang') || 'es'; } catch (e) { return 'es'; } })();
  var L = function (es, en) { return lang === 'en' ? en : es; };
  var model = null;

  async function api(path) {
    var r = await fetch('/speakup/api/v1' + path, { headers: { 'X-SpeakUp': '1' } });
    if (r.status === 401) { location.href = '/speakup/login'; throw new Error('401'); }
    return r.json().catch(function () { return {}; });
  }
  function modelLine() {
    if (!model) return '…';
    var sub = model.subscription;
    if (sub && sub.available) {
      var err0 = model.last_error && model.last_error.chat;
      return (err0 ? L('Suscripción de Claude, pero la última llamada falló: ', 'Claude subscription, but the last call failed: ') + err0
        : L('Suscripción de Claude', 'Claude subscription') + (model.working && model.working.chat ? ' (' + model.working.chat.replace('subscription:', '') + ')' : ''));
    }
    if (sub && sub.token_set && !sub.cli_installed) return L('Hay token de suscripción, pero Claude Code no está instalado en el servidor.', 'A subscription token is set, but Claude Code is not installed on the server.');
    if (!model.configured) return L('Sin conectar: las respuestas se marcan como "sin modelo".', 'Not connected: replies are labelled "no model".');
    var err = model.last_error && model.last_error.chat;
    var using = model.working && model.working.chat;
    if (err) return L('Conectado, pero la última llamada falló: ', 'Connected, but the last call failed: ') + err;
    return L('Conectado', 'Connected') + (using ? ' (' + using + ')' : '');
  }
  function setLang(l) {
    lang = l;
    try { localStorage.setItem('speakup_lang', l); } catch (e) {}
    document.documentElement.lang = l;
    document.dispatchEvent(new CustomEvent('speakup:lang', { detail: l }));
    $('langBtn').textContent = l === 'en' ? 'ES' : 'EN';
    $('outBtn').textContent = L('Salir', 'Sign out');
    $('tabMeet').textContent = L('Reuniones', 'Meetings');
    $('tabFac').textContent = L('Fábrica', 'Factory');
    $('sTitle').textContent = L('Ajustes', 'Settings');
    $('kLang').textContent = L('Idioma', 'Language');
    $('kUser').textContent = L('Cuenta', 'Account');
    $('kModel').textContent = L('Modelo de IA', 'AI model');
    $('kOut').textContent = L('Sesión', 'Session');
    $('signOut').textContent = L('Salir', 'Sign out');
    $('esBtn').className = 'btn small' + (l === 'es' ? ' primary' : '');
    $('enBtn').className = 'btn small' + (l === 'en' ? ' primary' : '');
    $('vModel').textContent = modelLine();
    document.title = L('AutoDev — Ajustes', 'AutoDev — Settings');
  }
  async function signOut() {
    await fetch('/speakup/api/v1/auth/logout', { method: 'POST', headers: { 'X-SpeakUp': '1' } });
    location.href = '/speakup/login';
  }
  setLang(lang);
  $('langBtn').addEventListener('click', function () { setLang(lang === 'en' ? 'es' : 'en'); });
  $('esBtn').addEventListener('click', function () { setLang('es'); });
  $('enBtn').addEventListener('click', function () { setLang('en'); });
  $('outBtn').addEventListener('click', signOut);
  $('signOut').addEventListener('click', signOut);
  api('/auth/me').then(function (d) { $('vUser').textContent = (d.user && d.user.email) || '—'; });
  api('/factory/health').then(function (d) { model = d.model || null; $('vModel').textContent = modelLine(); });
})();
