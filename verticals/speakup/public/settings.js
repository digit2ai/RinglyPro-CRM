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
  /* PER-PROJECT RULES AND THE PROJECT'S NAME. The name is what the Factory header shows, so a
   * workspace can be called what the owner calls it rather than a registry key. */
  var projects = [], projKey = '';
  async function loadProjects() {
    try {
      var d = await api('/factory/projects');
      projects = (d && d.projects) || [];
      if (!projects.length) return;
      try { projKey = localStorage.getItem('speakup_project') || ''; } catch (e) {}
      if (!projects.some(function (p) { return p.key === projKey; })) projKey = projects[0].key;
      $('projSel').innerHTML = projects.map(function (p) { return '<option value="' + p.key + '">' + (p.name || p.key) + '</option>'; }).join('');
      $('projSel').value = projKey;
      $('projSel').addEventListener('change', function () { projKey = $('projSel').value; showProject(); });
      showProject();
    } catch (e) { /* not the operator */ }
  }
  async function showProject() {
    var p = projects.filter(function (x) { return x.key === projKey; })[0];
    $('projName').value = (p && p.name) || projKey;
    $('pStat').textContent = '';
    try {
      var d = await api('/factory/rules?project=' + encodeURIComponent(projKey));
      $('projRules').value = (d && d.rules) || '';
    } catch (e) { $('projRules').value = ''; }
  }
  async function saveProject() {
    $('saveProj').disabled = true;
    $('pStat').textContent = L('Guardando…', 'Saving…');
    try {
      await api('/factory/rules', { method: 'PUT', body: JSON.stringify({ rules: $('projRules').value, project_key: projKey }) });
      var name = $('projName').value.trim();
      if (name) {
        await api('/factory/projects/' + encodeURIComponent(projKey), { method: 'PATCH', body: JSON.stringify({ name: name }) });
        var p = projects.filter(function (x) { return x.key === projKey; })[0];
        if (p) { p.name = name; $('projSel').querySelector('option[value="' + projKey + '"]').textContent = name; }
      }
      $('pStat').textContent = L('Guardado', 'Saved');
    } catch (e) { $('pStat').textContent = e.message; }
    finally { $('saveProj').disabled = false; }
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
    $('kProj').textContent = L('Proyecto', 'Project');
    $('kName').textContent = L('Nombre', 'Name');
    $('saveProj').textContent = L('Guardar proyecto', 'Save project');
    $('pNote').textContent = L('Reglas solo para este proyecto, además de las de la casa. El nombre es el que verás en la Fábrica.',
      'Rules for this project only, on top of the house rules. The name is what you see in the Factory.');
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
  loadProjects();
  $('saveProj').addEventListener('click', saveProject);
  api('/auth/me').then(function (d) { $('vUser').textContent = (d.user && d.user.email) || '—'; });
  api('/factory/health').then(function (d) { model = d.model || null; $('vModel').textContent = modelLine(); });
})();
