/* AutoDev — Settings: language, the signed-in account, whether the AI model is reachable,
 * and sign out. It shows the model's real state rather than a green light: "configured" only
 * means a key is set, so the last error the server saw is shown beside it. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var lang = (function () { try { return localStorage.getItem('speakup_lang') || 'es'; } catch (e) { return 'es'; } })();
  var L = function (es, en) { return lang === 'en' ? en : es; };
  var model = null;

  async function api(path, opts) {
    var o = Object.assign({ headers: { 'Content-Type': 'application/json', 'X-SpeakUp': '1' } }, opts || {});
    var r = await fetch('/speakup/api/v1' + path, o);
    if (r.status === 401) { location.href = '/speakup/login'; throw new Error('401'); }
    return r.json().catch(function () { return {}; });
  }
  /* THE HOUSE RULES. Written once, read before every instruction — the same job CLAUDE.md does
   * in the editor. The box is only shown to the factory operator; for anyone else the endpoint
   * answers 403 and the card stays hidden rather than offering a control that cannot work. */
  var defaultRules = '';
  async function loadRules() {
    try {
      var d = await api('/factory/rules');
      if (!d || typeof d.rules !== 'string') return;
      defaultRules = d.default_rules || '';
      $('rules').value = d.rules;
      $('rulesCard').hidden = false;
      $('rStat').textContent = d.is_default ? L('Reglas por defecto', 'Default rules') : '';
    } catch (e) { /* not the operator: no card */ }
  }
  async function saveRules() {
    $('saveRules').disabled = true;
    $('rStat').textContent = L('Guardando…', 'Saving…');
    try {
      var d = await api('/factory/rules', { method: 'PUT', body: JSON.stringify({ rules: $('rules').value }) });
      $('rules').value = (d && d.rules) || '';
      $('rStat').textContent = L('Guardado', 'Saved');
    } catch (e) { $('rStat').textContent = e.message; }
    finally { $('saveRules').disabled = false; }
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
    $('rTitle').textContent = L('Reglas de la casa', 'House rules');
    $('rNote').textContent = L('La fábrica las lee antes de cada instrucción, así no hay que repetirlas.',
      'The factory reads these before every instruction, so you never have to repeat them.');
    $('saveRules').textContent = L('Guardar', 'Save');
    $('resetRules').textContent = L('Restaurar', 'Reset');
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
  $('saveRules').addEventListener('click', saveRules);
  $('resetRules').addEventListener('click', function () { $('rules').value = defaultRules; $('rStat').textContent = L('Sin guardar', 'Not saved yet'); });
  loadRules();
  api('/auth/me').then(function (d) { $('vUser').textContent = (d.user && d.user.email) || '—'; });
  api('/factory/health').then(function (d) { model = d.model || null; $('vModel').textContent = modelLine(); });
})();
