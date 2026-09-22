/* LevelUp Media Marketing — the creator's back office. Vanilla JS, no build.
 * Every action goes through the MCP Brain: POST {BASE}/api/v1/tools/<agent.tool>. */
(function () {
  'use strict';
  var B = window.LU_BASE || '';
  var LANG = 'en', ME = null, CORPUS = null;
  var $ = function (id) { return document.getElementById(id); };
  var view = $('view');

  var T = {
    en: { today: 'Dashboard', calendar: 'Content Calendar', pipeline: 'Content Pipeline', batch: 'Batch Planning', strategy: 'Creative Strategist', ideas: 'Ideas & Scripts', editing: 'Editing', business: 'Business Assistant', picks: 'Top Picks', research: 'Product Research', train: 'Train the agents', settings: 'Settings',
      core: 'Core', addons: 'Add-ons', platform: 'Your AI team', signout: 'Sign out', close: 'Close', send: 'Send', save: 'Save', ask: 'Tell Andrea what to do', notConnected: 'Not connected',
      cheer: 'A little more consistency, a lot more you.', hello: 'You are doing amazing.', more: 'More', noModel: 'No model: written from your own words', model: 'Written by AI, checked by LevelUp' },
    es: { today: 'Inicio', calendar: 'Calendario', pipeline: 'Flujo de contenido', batch: 'Grabar en lote', strategy: 'Estratega creativa', ideas: 'Ideas y guiones', editing: 'Edición', business: 'Asistente de negocios', picks: 'Top Picks', research: 'Investigación de productos', train: 'Entrenar a los agentes', settings: 'Ajustes',
      core: 'Básico', addons: 'Complementos', platform: 'Tu equipo de IA', signout: 'Salir', close: 'Cerrar', send: 'Enviar', save: 'Guardar', ask: 'Dile a Andrea qué hacer', notConnected: 'No conectado',
      cheer: 'Un poco más de constancia, mucho más tú.', hello: 'Lo estás haciendo increíble.', more: 'Más', noModel: 'Sin modelo: escrito con tus propias palabras', model: 'Escrito por IA, verificado por LevelUp' }
  };
  function t(k) { return (T[LANG] && T[LANG][k]) || T.en[k] || k; }
  function L(en, es) { return LANG === 'es' ? es : en; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(msg) { var el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { el.hidden = true; }, 3800); }

  function api(path, opts) {
    opts = opts || {};
    return fetch(B + path, { method: opts.method || 'GET', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-LevelUp': '1' }, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        if (r.status === 401) { location.href = B + '/login'; throw new Error('Sign in'); }
        return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Error'); return j; });
      });
  }
  function tool(name, args) { return api('/api/v1/tools/' + name, { method: 'POST', body: args || {} }); }
  function busy(btn, on) { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.l = btn.textContent; btn.textContent = L('Working…', 'Trabajando…'); } else if (btn.dataset.l) btn.textContent = btn.dataset.l; }
  function simLabel(r) { return r && r.composed_by ? '<span class="label-sim">' + esc(r.composed_by === 'model' ? t('model') : t('noModel')) + '</span>' : ''; }
  function val(id) { var el = $(id); return el ? el.value : ''; }

  var SECTIONS = [
    ['today', 'core'], ['calendar', 'core'], ['pipeline', 'core'], ['batch', 'core'], ['strategy', 'core'], ['ideas', 'core'], ['editing', 'core'],
    ['business', 'addons'], ['picks', 'addons'], ['research', 'addons'], ['train', 'platform'], ['settings', 'platform']
  ];
  function renderNav() {
    var cur = (location.hash || '#today').slice(1).split('/')[0], grp = '', h = '';
    SECTIONS.forEach(function (s) {
      if (s[1] !== grp) { grp = s[1]; h += '<div class="grp">' + t(grp) + '</div>'; }
      h += '<a href="#' + s[0] + '" class="' + (cur === s[0] ? 'on' : '') + '">' + t(s[0]) + '</a>';
    });
    $('nav').innerHTML = h;
    $('tabbar').innerHTML = ['today', 'calendar', 'pipeline', 'batch', 'train'].map(function (k) { return '<a href="#' + k + '" class="' + (cur === k ? 'on' : '') + '">' + t(k).split(' ')[0] + '</a>'; }).join('') +
      '<a href="#settings" class="' + (['strategy', 'ideas', 'editing', 'business', 'picks', 'research', 'settings'].indexOf(cur) >= 0 ? 'on' : '') + '" id="moreTab">' + t('more') + '</a>';
    $('title').textContent = t(cur) || t('today');
    $('cheer').textContent = t('cheer');
    $('hello').textContent = (ME && ME.name ? ME.name.split(' ')[0] + ', ' : '') + t('hello');
    $('langBtn').textContent = LANG === 'es' ? 'EN' : 'ES';
    $('outBtn').textContent = t('signout');
    $('dIn').placeholder = t('ask');
    $('liderBtn').textContent = 'Andrea';
  }

  function statusPill(s) { return '<span class="pill s-' + esc(s) + '">' + esc(s) + '</span>'; }
  function postCard(p, actions) {
    return '<div class="post"><b>' + esc(p.title) + '</b>' + (p.hook ? '<div class="hook">"' + esc(p.hook) + '"</div>' : '') +
      '<div class="meta">' + statusPill(p.status) + (p.pillar ? '<span class="pill">' + esc(p.pillar) + '</span>' : '') + (p.purpose ? '<span class="pill">' + esc(p.purpose) + '</span>' : '') +
      (p.format ? '<span class="pill">' + esc(p.format.replace('_', ' ')) + '</span>' : '') + (p.effort ? '<span class="pill">' + L('effort', 'esfuerzo') + ': ' + esc(p.effort) + '</span>' : '') +
      (p.scheduled_date ? '<span class="pill">' + esc(String(p.scheduled_date).slice(0, 10)) + '</span>' : '') + '</div>' + (actions || '') + '</div>';
  }
  function nextStatus(s) { var i = CORPUS.statuses.indexOf(s); return i >= 0 && i < CORPUS.statuses.length - 1 ? CORPUS.statuses[i + 1] : null; }
  function postActions(p) {
    var n = nextStatus(p.status), h = '<div class="acts">';
    if (p.status === 'idea' || p.status === 'script') h += '<button class="btn small" data-script="' + p.id + '">' + L('Write script', 'Escribir guion') + '</button>';
    if (n) h += '<button class="btn small' + (n === 'approved' || n === 'posted' ? ' primary' : '') + '" data-status="' + p.id + ':' + n + '">' + (n === 'approved' ? L('Approve', 'Aprobar') : n === 'posted' ? L('Mark posted (by me)', 'Marcar publicado (por mí)') : L('Move to ', 'Pasar a ') + n) + '</button>';
    if (p.status === 'approved' || p.status === 'edited') h += '<button class="btn small" data-prep="' + p.id + '">' + L('Prepare post drafts', 'Preparar borradores') + '</button>';
    h += '<button class="btn small" data-open="' + p.id + '">' + L('Details', 'Detalles') + '</button></div>';
    return h;
  }
  function bindPostActions(root, reload) {
    root.querySelectorAll('[data-status]').forEach(function (b) { b.onclick = function () { var x = b.dataset.status.split(':'); busy(b, true); tool('calendar.set_status', { id: +x[0], status: x[1] }).then(reload).catch(function (e) { toast(e.message); busy(b, false); }); }; });
    root.querySelectorAll('[data-script]').forEach(function (b) { b.onclick = function () { location.hash = '#ideas/' + b.dataset.script; }; });
    root.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { location.hash = '#ideas/' + b.dataset.open; }; });
    root.querySelectorAll('[data-prep]').forEach(function (b) { b.onclick = function () { busy(b, true); tool('publisher.prepare', { post_id: +b.dataset.prep }).then(function (r) { toast(r.note); location.hash = '#ideas/' + b.dataset.prep; }).catch(function (e) { toast(e.message); busy(b, false); }); }; });
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  function viewToday() {
    Promise.all([tool('lider.brief'), tool('strategist.get_profile'), tool('calendar.list', {})]).then(function (r) {
      var b = r[0], prof = r[1].profile, posts = r[2].posts;
      var pillars = (prof && prof.pillars) || [];
      var cards = [
        [L('Total posts', 'Publicaciones'), b.total_posts], [L('Posted', 'Publicadas'), b.posted],
        [L('Brand replies to approve', 'Respuestas por aprobar'), b.deals_waiting_approval], [L('Videos waiting to edit', 'Videos por editar'), b.edit_jobs_waiting],
        [L('Retainers behind', 'Retainers atrasados'), b.retainers_behind], [L('Views', 'Vistas'), null], [L('Revenue', 'Ingresos'), null]
      ].map(function (c) { return '<div class="stat"><small>' + esc(c[0]) + '</small>' + (c[1] == null ? '<span class="nc">' + t('notConnected') + '</span>' : '<b>' + c[1] + '</b>') + '</div>'; }).join('');
      var today = b.today.length ? b.today.map(function (p) { return postCard(p, postActions(p)); }).join('') : '<p class="muted">' + L('Nothing scheduled for today. Plan next week or add an idea.', 'Nada programado para hoy. Planea la próxima semana o agrega una idea.') + '</p>';
      var pipe = b.pipeline.map(function (p) { return '<div class="stat"><small>' + esc(p.label[LANG] || p.label.en) + '</small><b>' + p.count + '</b></div>'; }).join('');
      var pil = pillars.length ? pillars.map(function (p) {
        var all = posts.filter(function (x) { return x.pillar === p.name; }), done = all.filter(function (x) { return x.status === 'posted'; }).length;
        return '<div style="margin:8px 0"><div style="display:flex;justify-content:space-between;font-size:14px"><span>' + esc(p.name) + '</span><span>' + done + '/' + all.length + '</span></div><div class="bar"><i style="width:' + (all.length ? Math.round(done * 100 / all.length) : 0) + '%"></i></div></div>';
      }).join('') : '<p class="muted">' + L('No pillars yet.', 'Aún no hay pilares.') + ' <a href="#strategy">' + t('strategy') + '</a></p>';
      view.innerHTML = '<div class="cards">' + cards + '</div>' +
        '<div class="two"><div><div class="panel"><h2>' + L("Today's plan", 'Plan de hoy') + ' <span class="muted">' + esc(b.date) + '</span></h2>' + today + '</div>' +
        '<div class="panel"><h2>' + t('pipeline') + '</h2><div class="cards" style="margin:0">' + pipe + '</div></div></div>' +
        '<div><div class="panel"><h2>' + L('Quick actions', 'Acciones rápidas') + '</h2><div class="acts">' +
        '<a class="btn small" href="#calendar">' + L('View full calendar', 'Ver calendario') + '</a><a class="btn small" href="#ideas">' + L('Add new idea', 'Nueva idea') + '</a>' +
        '<a class="btn small" href="#batch">' + L('Open batch plan', 'Plan de lote') + '</a><a class="btn small" href="#editing">' + L('Send to editing', 'Enviar a edición') + '</a></div></div>' +
        '<div class="panel"><h2>' + L('Content pillars', 'Pilares de contenido') + '</h2>' + pil + '</div>' +
        '<div class="panel"><h2>' + L('Top performing posts', 'Mejores publicaciones') + '</h2><p class="muted">' + L('Not connected. This will show real numbers once TikTok or Instagram is connected through their official API. We never show sample numbers as yours.', 'No conectado. Mostrará números reales cuando TikTok o Instagram se conecten por su API oficial. Nunca mostramos números de ejemplo como tuyos.') + '</p></div></div></div>';
      bindPostActions(view, viewToday);
    }).catch(function (e) { view.innerHTML = '<p class="warn">' + esc(e.message) + '</p>'; });
  }

  // ── Calendar ───────────────────────────────────────────────────────────────
  var calMonth = null;
  function postForm(p) {
    p = p || {};
    function opts(list, cur) { return '<option value="">—</option>' + list.map(function (x) { return '<option' + (x === cur ? ' selected' : '') + ' value="' + x + '">' + x.replace('_', ' ') + '</option>'; }).join(''); }
    return '<div class="grid2"><div><label>' + L('Title', 'Título') + '</label><input id="pTitle" value="' + esc(p.title || '') + '"></div>' +
      '<div><label>' + L('Date', 'Fecha') + '</label><input id="pDate" type="date" value="' + esc(p.scheduled_date ? String(p.scheduled_date).slice(0, 10) : '') + '"></div>' +
      '<div><label>' + L('Pillar', 'Pilar') + '</label><input id="pPillar" value="' + esc(p.pillar || '') + '"></div>' +
      '<div><label>' + L('Purpose', 'Propósito') + '</label><select id="pPurpose">' + opts(CORPUS.purposes, p.purpose) + '</select></div>' +
      '<div><label>' + L('Format', 'Formato') + '</label><select id="pFormat">' + opts(CORPUS.formats, p.format) + '</select></div>' +
      '<div><label>' + L('Effort', 'Esfuerzo') + '</label><select id="pEffort">' + opts(CORPUS.efforts, p.effort) + '</select></div>' +
      '<div><label>' + L('What is needed to film', 'Qué se necesita para grabar') + '</label><input id="pNeeds" value="' + esc(p.needs || '') + '"></div>' +
      '<div><label>' + L('Location / outfit / setup', 'Lugar / outfit / montaje') + '</label><input id="pSetup" value="' + esc(p.setup || '') + '"></div>' +
      '<div><label>' + L('Hook', 'Gancho') + '</label><input id="pHook" value="' + esc(p.hook || '') + '"></div>' +
      '<div><label>' + L('Post to', 'Publicar en') + '</label><div class="acts">' + CORPUS.destinations.map(function (d) { return '<label style="margin:0;display:flex;gap:4px;align-items:center"><input style="width:auto" type="checkbox" class="pDest" value="' + d + '"' + ((p.destinations || []).indexOf(d) >= 0 ? ' checked' : '') + '>' + d + '</label>'; }).join('') + '</div></div></div>' +
      '<label>' + L('Links to include (one per line)', 'Enlaces (uno por línea)') + '</label><textarea id="pLinks" style="min-height:60px">' + esc((p.links || []).join('\n')) + '</textarea>';
  }
  function readPostForm(id) {
    return { id: id || undefined, title: val('pTitle'), scheduled_date: val('pDate'), pillar: val('pPillar'), purpose: val('pPurpose'), format: val('pFormat'), effort: val('pEffort'), needs: val('pNeeds'), setup: val('pSetup'), hook: val('pHook'),
      destinations: [].slice.call(document.querySelectorAll('.pDest:checked')).map(function (x) { return x.value; }), links: val('pLinks').split('\n').map(function (s) { return s.trim(); }).filter(Boolean) };
  }
  function viewCalendar() {
    var d = calMonth || new Date(); d = new Date(d.getFullYear(), d.getMonth(), 1); calMonth = d;
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0), iso = function (x) { return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    Promise.all([tool('calendar.list', { from: iso(d), to: iso(last) }), tool('calendar.list', {})]).then(function (r) {
      var posts = r[0].posts, unscheduled = r[1].posts.filter(function (p) { return !p.scheduled_date && p.status !== 'posted'; });
      var todayIso = iso(new Date()), cells = '', names = LANG === 'es' ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      names.forEach(function (n) { cells += '<div class="hd">' + n + '</div>'; });
      for (var i = 0; i < d.getDay(); i++) cells += '<div></div>';
      for (var day = 1; day <= last.getDate(); day++) {
        var k = iso(new Date(d.getFullYear(), d.getMonth(), day));
        var ps = posts.filter(function (p) { return String(p.scheduled_date).slice(0, 10) === k; });
        cells += '<div class="d' + (k === todayIso ? ' today' : '') + '"><span class="n">' + day + '</span>' + ps.map(function (p) { return '<a class="e" href="#ideas/' + p.id + '" title="' + esc(p.title) + '">' + esc(p.title) + '</a>'; }).join('') + '</div>';
      }
      view.innerHTML = '<div class="panel"><h2><span><button class="btn small" id="prevM">&lsaquo;</button> ' + d.toLocaleString(LANG, { month: 'long', year: 'numeric' }) + ' <button class="btn small" id="nextM">&rsaquo;</button></span><button class="btn small" id="todayM">' + L('Today', 'Hoy') + '</button></h2><div class="cal">' + cells + '</div></div>' +
        '<div class="two"><div class="panel"><h2>' + L('Not scheduled yet', 'Sin fecha aún') + '</h2>' + (unscheduled.map(function (p) { return postCard(p, postActions(p)); }).join('') || '<p class="muted">' + L('Everything has a date.', 'Todo tiene fecha.') + '</p>') + '</div>' +
        '<div class="panel"><h2>' + L('Add a post', 'Agregar publicación') + '</h2>' + postForm() + '<div class="acts"><button class="btn primary" id="addPost">' + t('save') + '</button></div></div></div>';
      $('prevM').onclick = function () { calMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1); viewCalendar(); };
      $('nextM').onclick = function () { calMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1); viewCalendar(); };
      $('todayM').onclick = function () { calMonth = null; viewCalendar(); };
      $('addPost').onclick = function () { var b = this; busy(b, true); tool('calendar.save_post', readPostForm()).then(function () { toast(L('Added', 'Agregado')); viewCalendar(); }).catch(function (e) { toast(e.message); busy(b, false); }); };
      bindPostActions(view, viewCalendar);
    }).catch(function (e) { view.innerHTML = '<p class="warn">' + esc(e.message) + '</p>'; });
  }

  // ── Pipeline ───────────────────────────────────────────────────────────────
  function viewPipeline() {
    tool('calendar.list', {}).then(function (r) {
      view.innerHTML = '<div class="kan">' + CORPUS.pipeline.map(function (c) {
        var ps = r.posts.filter(function (p) { return c.statuses.indexOf(p.status) >= 0; });
        return '<div class="col"><h3>' + esc(c.label[LANG] || c.label.en) + '<span class="pill">' + ps.length + '</span></h3>' + ps.map(function (p) { return postCard(p, postActions(p)); }).join('') + '</div>';
      }).join('') + '</div>';
      bindPostActions(view, viewPipeline);
    }).catch(function (e) { view.innerHTML = '<p class="warn">' + esc(e.message) + '</p>'; });
  }

  // ── Batch ──────────────────────────────────────────────────────────────────
  function viewBatch() {
    tool('calendar.batch_suggest').then(function (r) {
      view.innerHTML = '<div class="panel"><h2>' + t('batch') + '</h2><p class="muted">' + L('Posts that share a location, outfit or setup (or, failing that, a format), so you can film them in one session.', 'Publicaciones que comparten lugar, outfit o montaje (o, si no, formato), para grabarlas en una sola sesión.') + '</p>' +
        (r.batches.length ? r.batches.map(function (g) { return '<div class="panel" style="background:var(--bg)"><h2>' + esc(g.by === 'setup' ? L('Setup', 'Montaje') : L('Format', 'Formato')) + ': ' + esc(g.label) + ' <span class="pill">' + g.posts.length + '</span></h2>' + g.posts.map(function (p) { return '<div>· ' + esc(p.title) + '</div>'; }).join('') + '</div>'; }).join('')
          : '<p class="muted">' + L('No batches yet. Give unfilmed posts a setup (e.g. "kitchen, white top") in the calendar.', 'Aún no hay lotes. Dale un montaje a las publicaciones sin grabar (por ejemplo "cocina, blusa blanca").') + '</p>') + '</div>';
    }).catch(function (e) { view.innerHTML = '<p class="warn">' + esc(e.message) + '</p>'; });
  }

  // ── Strategy + business settings ──────────────────────────────────────────
  function viewStrategy() {
    tool('strategist.get_profile').then(function (r) {
      var p = r.profile || {}, a = p.answers || {};
      var qs = [['brand', L('Tell us about you and your brand', 'Cuéntanos de ti y tu marca')], ['audience', L('Who do you want to reach?', '¿A quién quieres llegar?')], ['goals', L('What do you want from content this year?', '¿Qué quieres lograr con tu contenido este año?')],
        ['style', L('How do you talk? Describe your style', '¿Cómo hablas? Describe tu estilo')], ['sells', L('What do you sell, or want to sell?', '¿Qué vendes o quieres vender?')], ['topics', L('3 to 5 topics you could talk about forever (comma separated)', '3 a 5 temas de los que podrías hablar siempre (separados por coma)')],
        ['time_per_week', L('How much time a week can you give content?', '¿Cuánto tiempo a la semana puedes darle al contenido?')]];
      var result = p.niche || (p.pillars || []).length ? '<div class="panel"><h2>' + L('Your profile', 'Tu perfil') + ' ' + simLabel(p) + '</h2>' +
        '<p><b>' + L('Niche', 'Nicho') + ':</b> ' + esc(p.niche || '—') + '</p><p><b>' + L('Offer', 'Oferta') + ':</b> ' + esc(p.offer || L('None yet', 'Aún ninguna')) + '</p><p><b>' + L('Voice', 'Voz') + ':</b> ' + esc(p.voice || '—') + '</p>' +
        '<p><b>' + L('Pillars', 'Pilares') + ':</b></p><ul>' + (p.pillars || []).map(function (x) { return '<li><b>' + esc(x.name) + '</b>' + (x.why ? ' — ' + esc(x.why) : '') + '</li>'; }).join('') + '</ul><p><b>Plan:</b> ' + esc(p.plan || '') + '</p></div>' : '';
      var accs = (p.accounts || []).map(function (x) { return x.name + ' | ' + x.platform + ' | ' + (x.audience || ''); }).join('\n');
      var rc = (p.rate_card || []).map(function (x) { return (x.account || '') + ' | ' + x.deliverable + ' | ' + x.price; }).join('\n');
      view.innerHTML = result + '<div class="two"><div class="panel"><h2>' + L('Tell the Strategist about you', 'Cuéntale a la Estratega') + '</h2>' +
        qs.map(function (q) { return '<label>' + esc(q[1]) + '</label><textarea id="q_' + q[0] + '" style="min-height:70px">' + esc(a[q[0]] || '') + '</textarea>'; }).join('') +
        '<div class="acts"><button class="btn primary" id="buildP">' + L('Build my profile', 'Crear mi perfil') + '</button></div></div>' +
        '<div class="panel"><h2>' + L('Accounts, rate card and template', 'Cuentas, tarifas y plantilla') + '</h2><p class="muted">' + L('The Business Assistant only ever quotes prices from this rate card. Only you can change it.', 'El Asistente de negocios solo cita precios de esta tabla. Solo tú puedes cambiarla.') + '</p>' +
        '<label>' + L('Accounts: name | platform | audience size (one per line)', 'Cuentas: nombre | red | tamaño de audiencia (una por línea)') + '</label><textarea id="accs" placeholder="@mybeauty | tiktok | 120K">' + esc(accs) + '</textarea>' +
        '<label>' + L('Rate card: account | deliverable | price in USD (one per line)', 'Tarifas: cuenta | entregable | precio en USD (una por línea)') + '</label><textarea id="rc" placeholder="@mybeauty | 1 TikTok video | 450">' + esc(rc) + '</textarea>' +
        '<label>' + L('Negotiation template (optional). You can use {brand}, {rate}, {account}, {deliverable}', 'Plantilla de negociación (opcional). Puedes usar {brand}, {rate}, {account}, {deliverable}') + '</label><textarea id="nt">' + esc(p.negotiation_template || '') + '</textarea>' +
        '<div class="acts"><button class="btn primary" id="saveBiz">' + t('save') + '</button></div></div></div>';
      $('buildP').onclick = function () {
        var b = this, ans = {}; qs.forEach(function (q) { ans[q[0]] = val('q_' + q[0]); }); busy(b, true);
        tool('strategist.build_profile', { answers: ans }).then(function () { toast(L('Profile ready', 'Perfil listo')); viewStrategy(); }).catch(function (e) { toast(e.message); busy(b, false); });
      };
      $('saveBiz').onclick = function () {
        var b = this; busy(b, true);
        var lines = function (id) { return val(id).split('\n').map(function (l) { return l.split('|').map(function (s) { return s.trim(); }); }).filter(function (x) { return x[0] || x[1]; }); };
        tool('strategist.save_business', { accounts: lines('accs').map(function (x) { return { name: x[0], platform: (x[1] || 'tiktok').toLowerCase(), audience: x[2] }; }),
          rate_card: lines('rc').map(function (x) { return { account: x[0], deliverable: x[1], price: x[2] }; }), negotiation_template: val('nt') })
          .then(function () { toast(L('Saved', 'Guardado')); busy(b, false); viewStrategy(); }).catch(function (e) { toast(e.message); busy(b, false); });
      };
    }).catch(function (e) { view.innerHTML = '<p class="warn">' + esc(e.message) + '</p>'; });
  }

  // ── Ideas & Scripts (+ post detail) ────────────────────────────────────────
  function viewIdeas(postId) {
    Promise.all([tool('calendar.list', {}), tool('strategist.get_profile')]).then(function (r) {
      var posts = r[0].posts, pillars = ((r[1].profile || {}).pillars || []);
      var p = postId ? posts.filter(function (x) { return String(x.id) === String(postId); })[0] : null;
      var gen = '<div class="panel"><h2>' + L('Generate ideas', 'Generar ideas') + '</h2><label>' + L('Pillar', 'Pilar') + '</label><select id="gPillar"><option value="">—</option>' + pillars.map(function (x) { return '<option>' + esc(x.name) + '</option>'; }).join('') + '</select>' +
        '<label>' + L('Or your own thoughts', 'O tus propias ideas') + '</label><textarea id="gThoughts" style="min-height:70px"></textarea><div class="acts"><button class="btn primary" id="gGo">' + L('Give me 5 ideas', 'Dame 5 ideas') + '</button></div><div id="gOut"></div></div>';
      var list = '<div class="panel"><h2>' + L('Ideas and posts', 'Ideas y publicaciones') + '</h2>' + (posts.filter(function (x) { return x.status === 'idea' || x.status === 'script'; }).map(function (x) { return postCard(x, postActions(x)); }).join('') || '<p class="muted">' + L('No ideas yet.', 'Aún no hay ideas.') + '</p>') + '</div>';
      var detail = '';
      if (p) {
        var sm = p.script_meta || {};
        detail = '<div class="panel"><h2>' + esc(p.title) + ' ' + statusPill(p.status) + '</h2>' + postForm(p) + '<div class="acts"><button class="btn primary" id="savePost">' + t('save') + '</button><button class="btn" id="delPost">' + L('Delete', 'Eliminar') + '</button></div>' +
          '<h2 style="margin-top:16px">' + L('Script', 'Guion') + ' ' + (sm.composed_by ? simLabel(sm) : '') + '</h2>' +
          (sm.rejected ? '<div class="warn">' + esc(sm.rejected) + '</div>' : '') +
          ((sm.unverified_numbers || []).length ? '<div class="warn">' + L('Confirm before filming — these numbers were not given by you: ', 'Confirma antes de grabar — estos números no los diste tú: ') + esc(sm.unverified_numbers.join(', ')) + '</div>' : '') +
          (p.script ? '<pre class="script">' + esc(p.script) + '</pre>' : '<p class="muted">' + L('No script yet.', 'Aún no hay guion.') + '</p>') +
          '<label>' + L('Optional: paste a top video transcript. Its structure is copied, never its words.', 'Opcional: pega la transcripción de un video exitoso. Se copia su estructura, nunca sus palabras.') + '</label><textarea id="sRef" style="min-height:70px"></textarea>' +
          '<div class="acts"><button class="btn primary" id="sGo">' + (p.script ? L('Rewrite script', 'Reescribir guion') : L('Write script', 'Escribir guion')) + '</button><button class="btn" id="sEdit">' + L('Send to editing', 'Enviar a edición') + '</button></div>' +
          (p.caption_drafts && Object.keys(p.caption_drafts).length ? '<h2 style="margin-top:16px">' + L('Post drafts (copy and post yourself)', 'Borradores (copia y publica tú)') + '</h2>' + Object.keys(p.caption_drafts).map(function (d) { return '<p><b>' + esc(d) + '</b>' + (p.caption_drafts[d].trimmed ? ' <span class="label-sim">' + L('trimmed to limit', 'recortado al límite') + '</span>' : '') + '</p><pre class="script">' + esc(p.caption_drafts[d].caption) + '</pre>'; }).join('') : '') +
          postActions(p) + '</div>';
      }
      view.innerHTML = (detail ? detail : '') + '<div class="two">' + gen + list + '</div>';
      $('gGo').onclick = function () {
        var b = this; busy(b, true);
        tool('ideas.generate', { pillar: val('gPillar'), thoughts: val('gThoughts'), count: 5 }).then(function (r2) { toast(r2.ideas.length + L(' ideas added', ' ideas agregadas')); viewIdeas(postId); }).catch(function (e) { toast(e.message); busy(b, false); });
      };
      if (p) {
        $('savePost').onclick = function () { var b = this; busy(b, true); tool('calendar.save_post', readPostForm(p.id)).then(function () { toast(L('Saved', 'Guardado')); viewIdeas(p.id); }).catch(function (e) { toast(e.message); busy(b, false); }); };
        $('delPost').onclick = function () { if (!confirm(L('Delete this post?', '¿Eliminar esta publicación?'))) return; tool('calendar.delete_post', { id: p.id }).then(function () { location.hash = '#ideas'; }); };
        $('sGo').onclick = function () { var b = this; busy(b, true); tool('scripts.write', { post_id: p.id, reference: val('sRef') }).then(function () { viewIdeas(p.id); }).catch(function (e) { toast(e.message); busy(b, false); }); };
        $('sEdit').onclick = function () { location.hash = '#editing/' + p.id; };
      }
      bindPostActions(view, function () { viewIdeas(postId); });
    }).catch(function (e) { view.innerHTML = '<p class="warn">' + esc(e.message) + '</p>'; });
  }

  // ── Editing ────────────────────────────────────────────────────────────────
  function viewEditing(postId) {
    Promise.all([tool('editor.rules'), tool('editor.list_jobs'), tool('calendar.list', {})]).then(function (r) {
      var rules = r[0], jobs = r[1].jobs, posts = r[2].posts.filter(function (p) { return ['script', 'filmed', 'editing'].indexOf(p.status) >= 0; });
      view.innerHTML = '<div class="warn">' + L('Descript is not connected yet. Jobs wait here with your rules; nothing is marked complete until an exported file exists.', 'Descript aún no está conectado. Los trabajos esperan aquí con tus reglas; nada se marca completo hasta que exista un archivo exportado.') + '</div>' +
        '<div class="two"><div><div class="panel"><h2>' + L('Send to editing', 'Enviar a edición') + '</h2><label>' + L('Footage file name', 'Nombre del archivo') + '</label><input id="eName" placeholder="IMG_4821.MOV">' +
        '<label>' + L('For which post', 'Para qué publicación') + '</label><select id="ePost"><option value="">—</option>' + posts.map(function (p) { return '<option value="' + p.id + '"' + (String(p.id) === String(postId) ? ' selected' : '') + '>' + esc(p.title) + '</option>'; }).join('') + '</select>' +
        '<div class="acts"><button class="btn primary" id="eGo">' + L('Queue edit', 'Poner en cola') + '</button></div></div>' +
        '<div class="panel"><h2>' + L('Editing jobs', 'Trabajos de edición') + '</h2>' + (jobs.length ? '<table class="t"><tr><th>' + L('File', 'Archivo') + '</th><th>' + L('Status', 'Estado') + '</th><th></th></tr>' + jobs.map(function (j) {
          return '<tr><td>' + esc(j.source_name) + '<br><small class="muted">→ ' + esc(j.output_name || '') + '</small></td><td>' + statusPill(j.status) + (j.blocker ? '<br><small class="muted">' + esc(j.blocker) + '</small>' : '') + '</td><td>' +
            '<div class="acts">' + CORPUS.review_issues.map(function (i) { return '<button class="btn small" data-issue="' + i.code + '" data-job="' + j.id + '" title="' + L('This keeps happening', 'Esto sigue pasando') + '">' + esc(i[LANG] || i.en) + '</button>'; }).join('') + '</div></td></tr>';
        }).join('') + '</table>' : '<p class="muted">' + L('No jobs yet.', 'Aún no hay trabajos.') + '</p>') + '</div>' +
        '<div class="panel"><h2>' + L('Phone to folder setup (iPhone)', 'Del teléfono a la carpeta (iPhone)') + '</h2><ol class="muted"><li>' + L('Files app → iCloud Drive → create a folder with a subfolder 01_TO_EDIT.', 'App Archivos → iCloud Drive → crea una carpeta con una subcarpeta 01_TO_EDIT.') + '</li><li>' + L('Shortcuts → new shortcut "SEND TO EDITING" → Save File, input = Shortcut Input.', 'Atajos → nuevo atajo "SEND TO EDITING" → Guardar archivo, entrada = Entrada del atajo.') + '</li><li>' + L('Destination 01_TO_EDIT; Ask Where to Save off; Overwrite off.', 'Destino 01_TO_EDIT; Preguntar dónde guardar: no; Sobrescribir: no.') + '</li><li>' + L('Show in Share Sheet, input type Media. Test with one video, then several.', 'Mostrar en hoja de compartir, tipo Multimedia. Prueba con un video y luego con varios.') + '</li></ol><p class="muted">' + L('Folder watching is not connected yet; for now, queue the file name here.', 'La carpeta aún no se vigila automáticamente; por ahora, pon el nombre del archivo aquí.') + '</p></div></div>' +
        '<div class="panel"><h2>' + L('Your editing rules', 'Tus reglas de edición') + '</h2><ol>' + rules.defaults.map(function (x) { return '<li>' + esc(x[LANG] || x.en) + '</li>'; }).join('') + '</ol>' +
        (rules.creator_rules.length ? '<h2>' + L('Rules you added', 'Reglas que agregaste') + '</h2><ul>' + rules.creator_rules.map(function (x) { return '<li>' + esc(x.body) + '</li>'; }).join('') + '</ul>' : '') +
        '<p class="muted">' + L('Same problem three times? Press the issue button on the job each time. On the third, LevelUp proposes a rule for you to confirm.', '¿El mismo problema tres veces? Pulsa el botón del problema en el trabajo cada vez. A la tercera, LevelUp te propone una regla para confirmar.') + '</p></div></div>';
      $('eGo').onclick = function () { var b = this; busy(b, true); tool('editor.create_job', { source_name: val('eName'), post_id: val('ePost') ? +val('ePost') : undefined }).then(function () { toast(L('Queued', 'En cola')); viewEditing(); }).catch(function (e) { toast(e.message); busy(b, false); }); };
      view.querySelectorAll('[data-issue]').forEach(function (b) {
        b.onclick = function () {
          tool('editor.report_issue', { code: b.dataset.issue, job_id: +b.dataset.job }).then(function (r2) {
            if (r2.proposal && confirm(r2.proposal.note + '\n\n' + r2.proposal.rule)) {
              tool('editor.confirm_rule', { code: r2.code, text: r2.proposal.rule }).then(function () { toast(L('Rule added. Every edit follows it now.', 'Regla agregada. Toda edición la sigue ahora.')); viewEditing(); });
            } else toast(L('Noted ', 'Anotado ') + r2.count + '/' + r2.threshold);
          }).catch(function (e) { toast(e.message); });
        };
      });
    }).catch(function (e) { view.innerHTML = '<p class="warn">' + esc(e.message) + '</p>'; });
  }

  // ── Business ───────────────────────────────────────────────────────────────
  function viewBusiness() {
    Promise.all([tool('business.list_deals'), tool('business.retainers')]).then(function (r) {
      var deals = r[0].deals, rets = r[1].retainers;
      view.innerHTML = '<div class="good">' + L('Read only: LevelUp never sends mail. You approve a reply, send it from your own email, then mark it sent.', 'Solo lectura: LevelUp nunca envía correos. Tú apruebas la respuesta, la envías desde tu correo y la marcas como enviada.') + '</div>' +
        '<div class="two"><div class="panel"><h2>' + L('Paste a brand email', 'Pega el correo de una marca') + '</h2><div class="grid2"><div><label>' + L('From', 'De') + '</label><input id="bFrom" placeholder="partnerships@brand.com"></div><div><label>' + L('Brand', 'Marca') + '</label><input id="bBrand"></div></div>' +
        '<label>' + L('Subject', 'Asunto') + '</label><input id="bSubj"><label>' + L('Email text', 'Texto del correo') + '</label><textarea id="bBody" style="min-height:160px"></textarea><div class="acts"><button class="btn primary" id="bGo">' + L('Analyze and draft reply', 'Analizar y redactar') + '</button></div><div id="bOut"></div></div>' +
        '<div class="panel"><h2>' + L('Retainers', 'Retainers') + '</h2>' + (rets.length ? rets.map(function (x) { return '<div class="post"><b>' + esc(x.brand) + '</b><div class="meta">' + (x.monthly_rate != null ? '<span class="pill">$' + esc(x.monthly_rate) + '/mo</span>' : '') + (x.deliverables_per_month ? '<span class="pill">' + x.deliverables_done + '/' + x.deliverables_per_month + '</span>' : '') + '<span class="pill">' + esc(x.payment_status) + '</span>' + (x.behind ? '<span class="pill" style="background:var(--peach)">' + L('behind', 'atrasado') + '</span>' : '') + (x.renewal_soon ? '<span class="pill">' + L('renewal soon', 'renueva pronto') + '</span>' : '') + '</div></div>'; }).join('') : '<p class="muted">' + L('No retainers yet.', 'Aún no hay retainers.') + '</p>') +
        '<div class="grid2"><div><label>' + L('Brand', 'Marca') + '</label><input id="rBrand"></div><div><label>' + L('Monthly rate (USD)', 'Tarifa mensual (USD)') + '</label><input id="rRate" inputmode="decimal"></div><div><label>' + L('Deliverables per month', 'Entregables al mes') + '</label><input id="rPer" inputmode="numeric"></div><div><label>' + L('Due day of month', 'Día de entrega') + '</label><input id="rDue" inputmode="numeric"></div><div><label>' + L('Renewal date', 'Renovación') + '</label><input id="rRen" type="date"></div></div><div class="acts"><button class="btn" id="rGo">' + L('Add retainer', 'Agregar retainer') + '</button></div></div></div>' +
        '<div class="panel"><h2>' + L('Brand deals', 'Tratos con marcas') + '</h2>' + (deals.length ? deals.map(dealCard).join('') : '<p class="muted">' + L('No deals yet.', 'Aún no hay tratos.') + '</p>') + '</div>';
      $('bGo').onclick = function () {
        var b = this; busy(b, true);
        tool('business.analyze_email', { from: val('bFrom'), brand: val('bBrand'), subject: val('bSubj'), body: val('bBody') }).then(function (x) {
          toast(L('Draft ready for your review', 'Borrador listo para revisar')); viewBusiness();
          if (x.injection_warning) setTimeout(function () { toast(x.injection_warning); }, 400);
        }).catch(function (e) { toast(e.message); busy(b, false); });
      };
      $('rGo').onclick = function () { tool('business.save_retainer', { brand: val('rBrand'), monthly_rate: val('rRate'), deliverables_per_month: val('rPer'), due_day: val('rDue'), renewal_date: val('rRen') }).then(viewBusiness).catch(function (e) { toast(e.message); }); };
      view.querySelectorAll('[data-deal]').forEach(function (b) {
        b.onclick = function () { var x = b.dataset.deal.split(':'); tool('business.update_deal', { id: +x[0], action: x[1], draft_reply: $('dr' + x[0]) ? $('dr' + x[0]).value : undefined }).then(viewBusiness).catch(function (e) { toast(e.message); }); };
      });
      view.querySelectorAll('[data-copy]').forEach(function (b) { b.onclick = function () { var ta = $('dr' + b.dataset.copy); navigator.clipboard.writeText(ta.value).then(function () { toast(L('Copied. Send it from your email.', 'Copiado. Envíalo desde tu correo.')); }); }; });
    }).catch(function (e) { view.innerHTML = '<p class="warn">' + esc(e.message) + '</p>'; });
  }
  function dealCard(d) {
    var flags = (d.red_flags || []).map(function (c) { var f = CORPUS.red_flags.filter(function (x) { return x.code === c; })[0]; return '<div class="flag">' + esc(f ? (f[LANG] || f.en) : c) + '</div>'; }).join('');
    var q = { good: L('Looks real', 'Parece real'), check: L('Check before replying', 'Revisa antes de responder'), likely_fake: L('Likely fake', 'Probablemente falso') }[d.lead_quality] || '';
    return '<div class="post"><b>' + esc(d.brand || d.sender || L('Unknown brand', 'Marca desconocida')) + '</b> <span class="muted">' + esc(d.subject || '') + '</span><div class="meta">' + statusPill(d.status) + '<span class="pill">' + esc(q) + '</span>' + (d.account ? '<span class="pill">' + esc(d.account) + '</span>' : '') + (d.suggested_rate != null ? '<span class="pill">$' + esc(d.suggested_rate) + '</span>' : '') + simLabel(d) + '</div>' +
      (d.injection_flag ? '<div class="warn">' + L('This email tried to give the assistant instructions. They were ignored.', 'Este correo intentó darle instrucciones al asistente. Se ignoraron.') + '</div>' : '') + flags +
      (d.rate_source ? '<small class="muted">' + esc(d.rate_source) + '</small>' : '') +
      '<label>' + L('Reply draft (edit freely)', 'Borrador de respuesta (edítalo)') + '</label><textarea id="dr' + d.id + '"' + (d.status === 'sent_by_you' || d.status === 'declined' ? ' readonly' : '') + '>' + esc(d.draft_reply || '') + '</textarea>' +
      '<div class="acts">' + (d.status === 'drafted' ? '<button class="btn small primary" data-deal="' + d.id + ':approve">' + L('Approve', 'Aprobar') + '</button><button class="btn small" data-deal="' + d.id + ':decline">' + L('Decline', 'Rechazar') + '</button>' : '') +
      (d.status === 'approved' ? '<button class="btn small" data-copy="' + d.id + '">' + L('Copy reply', 'Copiar respuesta') + '</button><button class="btn small primary" data-deal="' + d.id + ':mark_sent">' + L('I sent it', 'Ya la envié') + '</button>' : '') + '</div></div>';
  }

  // ── Top Picks ──────────────────────────────────────────────────────────────
  function viewPicks() {
    tool('picks.lists').then(function (r) {
      view.innerHTML = '<div class="panel"><h2>' + L('New list', 'Nueva lista') + '</h2><div class="grid2"><div><label>' + L('Title', 'Título') + '</label><input id="lTitle" placeholder="Under $25 Finds"></div><div><label>' + L('Intro', 'Introducción') + '</label><input id="lIntro"></div></div><div class="acts"><button class="btn primary" id="lGo">' + L('Create list', 'Crear lista') + '</button></div></div>' +
        r.lists.map(function (l) {
          var link = location.origin + B + '/p/' + l.share_token;
          return '<div class="panel"><h2>' + esc(l.title) + ' <span><button class="btn small" data-pub="' + l.id + ':' + (l.published ? 0 : 1) + '">' + (l.published ? L('Unpublish', 'Despublicar') : L('Publish page', 'Publicar página')) + '</button></span></h2>' +
            (l.published ? '<p class="good">' + L('Public link: ', 'Enlace público: ') + '<a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(link) + '</a></p>' : '<p class="muted">' + L('Not published.', 'No publicada.') + '</p>') +
            '<table class="t"><tr><th>' + L('Product', 'Producto') + '</th><th>' + L('Clicks', 'Clics') + '</th><th></th></tr>' + l.items.map(function (i) { return '<tr><td><b>' + esc(i.name) + '</b> ' + esc(i.price || '') + '<br><small class="muted">' + esc(i.retailer || '') + ' ' + esc(i.note || '') + '</small></td><td>' + i.clicks + '</td><td><button class="btn small" data-rm="' + i.id + '">' + L('Remove', 'Quitar') + '</button></td></tr>'; }).join('') + '</table>' +
            '<div class="grid2"><div><label>' + L('Product name', 'Producto') + '</label><input id="iN' + l.id + '"></div><div><label>' + L('Link (affiliate or store)', 'Enlace (afiliado o tienda)') + '</label><input id="iU' + l.id + '" placeholder="https://"></div><div><label>' + L('Price', 'Precio') + '</label><input id="iP' + l.id + '"></div><div><label>' + L('Retailer', 'Tienda') + '</label><input id="iR' + l.id + '"></div><div><label>' + L('Image URL (https, optional)', 'URL de imagen (https, opcional)') + '</label><input id="iI' + l.id + '"></div><div><label>' + L('Why I picked it', 'Por qué lo elegí') + '</label><input id="iW' + l.id + '"></div></div><div class="acts"><button class="btn" data-add="' + l.id + '">' + L('Add product', 'Agregar producto') + '</button></div></div>';
        }).join('') + '<p class="muted">' + L('Clicks are counted on your public page. Orders and earnings need each affiliate program connected, which is not built yet.', 'Los clics se cuentan en tu página pública. Pedidos y ganancias requieren conectar cada programa de afiliados, lo que aún no está construido.') + '</p>';
      $('lGo').onclick = function () { tool('picks.create_list', { title: val('lTitle'), intro: val('lIntro') }).then(viewPicks).catch(function (e) { toast(e.message); }); };
      view.querySelectorAll('[data-add]').forEach(function (b) { var id = b.dataset.add; b.onclick = function () { tool('picks.add_item', { list_id: +id, name: val('iN' + id), url: val('iU' + id), price: val('iP' + id), retailer: val('iR' + id), image_url: val('iI' + id), note: val('iW' + id) }).then(viewPicks).catch(function (e) { toast(e.message); }); }; });
      view.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { tool('picks.remove_item', { id: +b.dataset.rm }).then(viewPicks); }; });
      view.querySelectorAll('[data-pub]').forEach(function (b) { b.onclick = function () { var x = b.dataset.pub.split(':'); tool('picks.publish', { list_id: +x[0], published: x[1] === '1' }).then(viewPicks).catch(function (e) { toast(e.message); }); }; });
    }).catch(function (e) { view.innerHTML = '<p class="warn">' + esc(e.message) + '</p>'; });
  }

  // ── Research ───────────────────────────────────────────────────────────────
  function viewResearch() {
    tool('research.status').then(function (s) {
      view.innerHTML = '<div class="warn">' + esc(s.note) + '</div><div class="panel"><h2>' + L('Break down a top video', 'Desarma un video exitoso') + '</h2><p class="muted">' + L('Paste the transcript of a video that sells. You get its structure; the Scripts agent reuses the structure, never the words.', 'Pega la transcripción de un video que vende. Obtienes su estructura; el agente de Guiones reutiliza la estructura, nunca las palabras.') + '</p><textarea id="rT" style="min-height:160px"></textarea><div class="acts"><button class="btn primary" id="rGo">' + L('Analyze structure', 'Analizar estructura') + '</button></div><div id="rOut"></div></div>';
      $('rGo').onclick = function () {
        tool('research.analyze_structure', { transcript: val('rT') }).then(function (r) {
          var s2 = r.structure;
          $('rOut').innerHTML = '<table class="t"><tr><td>' + L('Hook type', 'Tipo de gancho') + '</td><td><b>' + esc(s2.hook_type.replace('_', ' ')) + '</b> (' + s2.hook_words + L(' words', ' palabras') + ')</td></tr><tr><td>' + L('Length', 'Largo') + '</td><td>' + s2.total_words + L(' words, ', ' palabras, ') + s2.sentences + L(' sentences', ' frases') + '</td></tr>' +
            Object.keys(s2.beats).map(function (k) { return '<tr><td>' + esc(k.replace('_', ' ')) + '</td><td>' + (s2.beats[k] ? L('yes', 'sí') : L('no', 'no')) + '</td></tr>'; }).join('') + '</table><p class="muted">' + esc(r.rule) + '</p>';
        }).catch(function (e) { toast(e.message); });
      };
    });
  }

  // ── Train the agents ──────────────────────────────────────────────────────
  function viewTrain() {
    tool('trainer.list', { include_inactive: true }).then(function (r) {
      var agents = r.agents.filter(function (a) { return a.id !== 'trainer'; });
      var opts = '<option value="all">' + L('All agents', 'Todos los agentes') + '</option>' + agents.map(function (a) { return '<option value="' + a.id + '">' + esc(a.person ? a.person + ' · ' + a.name : a.name) + '</option>'; }).join('');
      var active = r.entries.filter(function (e) { return e.active; }), old = r.entries.filter(function (e) { return !e.active; });
      function entry(e) {
        var mine = e.tenant_id !== 0;
        return '<div class="post"><b>' + esc(e.title) + '</b><div class="meta"><span class="pill">' + (e.kind === 'rule' ? L('rule', 'regla') : L('document', 'documento')) + '</span><span class="pill">' + esc(e.agent === 'all' ? L('all agents', 'todos') : e.agent) + '</span><span class="pill">v' + e.version + '</span>' + (mine ? '' : '<span class="pill">' + L('platform', 'plataforma') + '</span>') + (e.active ? '' : '<span class="pill">' + L('inactive', 'inactiva') + '</span>') + '</div>' +
          '<details><summary>' + L('View', 'Ver') + '</summary><textarea id="kb' + e.id + '"' + (e.active && (mine || (ME && ME.platform_admin)) ? '' : ' readonly') + '>' + esc(e.body) + '</textarea>' +
          (e.active && (mine || (ME && ME.platform_admin)) ? '<div class="acts"><button class="btn small" data-kedit="' + e.id + ':' + (mine ? 0 : 1) + '">' + L('Save correction (new version)', 'Guardar corrección (nueva versión)') + '</button><button class="btn small" data-koff="' + e.id + ':' + (mine ? 0 : 1) + '">' + L('Deactivate', 'Desactivar') + '</button></div>' : '') + '</details></div>';
      }
      view.innerHTML = '<div class="good">' + L('Everything here travels with every call the chosen agents make. It is context, not model retraining. Rules go first; your agents\' own safety rules still win.', 'Todo lo de aquí viaja con cada llamada de los agentes elegidos. Es contexto, no reentrenamiento del modelo. Las reglas van primero; las reglas de seguridad de cada agente siguen mandando.') + '</div>' +
        '<div class="two"><div class="panel"><h2>' + L('Teach the agents', 'Enséñale a los agentes') + '</h2><div class="grid2"><div><label>' + L('Type', 'Tipo') + '</label><select id="kKind"><option value="rule">' + L('Rule (a correction)', 'Regla (una corrección)') + '</option><option value="doc">' + L('Document (knowledge)', 'Documento (conocimiento)') + '</option></select></div><div><label>' + L('Which agent', 'Qué agente') + '</label><select id="kAgent">' + opts + '</select></div></div>' +
        '<label>' + L('Title', 'Título') + '</label><input id="kTitle"><label>' + L('Text', 'Texto') + '</label><textarea id="kBody" style="min-height:140px" placeholder="' + L('e.g. Never use the word hack. My audience is moms of toddlers in Texas.', 'ej. Nunca uses la palabra truco. Mi audiencia son mamás de niños pequeños en Texas.') + '"></textarea>' +
        '<label><input type="file" id="kFile" accept=".md,.txt,text/plain,text/markdown" style="width:auto"> ' + L('or load a .md / .txt file', 'o carga un archivo .md / .txt') + '</label>' +
        (ME && ME.platform_admin ? '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="kPlat" style="width:auto"> ' + L('Platform knowledge (every creator on LevelUp)', 'Conocimiento de plataforma (toda creadora en LevelUp)') + '</label>' : '') +
        '<div class="acts"><button class="btn primary" id="kGo">' + L('Teach', 'Enseñar') + '</button></div></div>' +
        '<div class="panel"><h2>' + L('Test the training', 'Prueba el entrenamiento') + '</h2><label>' + L('Agent', 'Agente') + '</label><select id="tAgent">' + agents.map(function (a) { return '<option value="' + a.id + '">' + esc(a.person ? a.person + ' · ' + a.name : a.name) + '</option>'; }).join('') + '</select><label>' + L('Question', 'Pregunta') + '</label><textarea id="tQ" style="min-height:70px"></textarea><div class="acts"><button class="btn" id="tGo">' + L('Compare with and without training', 'Comparar con y sin entrenamiento') + '</button></div><div id="tOut"></div></div></div>' +
        '<div class="panel"><h2>' + L('What the agents know', 'Lo que saben los agentes') + ' <span class="pill">' + active.length + '</span></h2>' + (active.map(entry).join('') || '<p class="muted">' + L('Nothing yet.', 'Nada aún.') + '</p>') + '</div>' +
        (old.length ? '<div class="panel"><h2>' + L('History', 'Historial') + '</h2>' + old.map(entry).join('') + '</div>' : '');
      $('kFile').onchange = function () { var f = this.files[0]; if (!f) return; if (f.size > 500000) { toast(L('File too large', 'Archivo muy grande')); return; } f.text().then(function (txt) { $('kBody').value = txt; if (!val('kTitle')) $('kTitle').value = f.name.replace(/\.(md|txt)$/i, ''); $('kKind').value = 'doc'; }); };
      $('kGo').onclick = function () { var b = this; busy(b, true); tool('trainer.add', { kind: val('kKind'), agent: val('kAgent'), title: val('kTitle'), body: val('kBody'), platform: $('kPlat') ? $('kPlat').checked : false }).then(function () { toast(L('Taught', 'Aprendido')); viewTrain(); }).catch(function (e) { toast(e.message); busy(b, false); }); };
      $('tGo').onclick = function () {
        var b = this; busy(b, true);
        tool('trainer.test', { agent: val('tAgent'), question: val('tQ') }).then(function (x) {
          busy(b, false);
          $('tOut').innerHTML = x.note ? '<p class="warn">' + esc(x.note) + '</p>' : '<div class="grid2"><div><b>' + L('With training', 'Con entrenamiento') + '</b><pre class="script">' + esc(x.with_training || '') + '</pre></div><div><b>' + L('Without', 'Sin') + '</b><pre class="script">' + esc(x.without_training || '') + '</pre></div></div>';
        }).catch(function (e) { toast(e.message); busy(b, false); });
      };
      view.querySelectorAll('[data-kedit]').forEach(function (b) { b.onclick = function () { var x = b.dataset.kedit.split(':'); tool('trainer.edit', { id: +x[0], body: val('kb' + x[0]), platform: x[1] === '1' }).then(function () { toast(L('New version saved', 'Nueva versión guardada')); viewTrain(); }).catch(function (e) { toast(e.message); }); }; });
      view.querySelectorAll('[data-koff]').forEach(function (b) { b.onclick = function () { var x = b.dataset.koff.split(':'); tool('trainer.deactivate', { id: +x[0], platform: x[1] === '1' }).then(viewTrain).catch(function (e) { toast(e.message); }); }; });
    }).catch(function (e) { view.innerHTML = '<p class="warn">' + esc(e.message) + '</p>'; });
  }

  // ── Connections ────────────────────────────────────────────────────────────
  // Saved, not connected: the copy says so on every card, because a vault that
  // looks connected is worse than no vault at all.
  function connName(p) { return typeof p.name === 'string' ? p.name : L(p.name.en, p.name.es); }
  function renderConns(d) {
    var box = $('connBox'); if (!box) return;
    var head = '<p class="muted">' + L(
      'Descript, TikTok, Instagram, Facebook and inbox connections are being built through official APIs. Save your details here now and they are ready the day each connector ships. Until then you still paste, copy and post by hand.',
      'Las conexiones con Descript, TikTok, Instagram, Facebook y tu correo se están construyendo con APIs oficiales. Guarda tus datos aquí y quedan listos el día que cada conexión salga. Mientras tanto sigues pegando, copiando y publicando a mano.'
    ) + '</p><p class="muted">' + L(
      'Your secrets are encrypted and never shown again, only the last four characters. Nothing here posts or sends by itself.',
      'Tus claves se guardan cifradas y no se vuelven a mostrar, solo los últimos cuatro caracteres. Nada de esto publica ni envía por su cuenta.'
    ) + '</p>';
    if (!d.encryption_configured) {
      head += '<p class="warn">' + L('Saving is closed until the server has an encryption secret set.', 'Guardar está cerrado hasta que el servidor tenga una clave de cifrado.') + '</p>';
    }
    box.innerHTML = head + d.providers.map(function (p) {
      var chip = p.unreadable
        ? '<span class="tag warn">' + L('Key rotated — save them again', 'Clave rotada — vuelve a guardarlas') + '</span>'
        : (p.saved ? '<span class="tag">' + L('Saved · not connected yet', 'Guardado · aún no conectado') + '</span>'
                   : '<span class="tag muted">' + L('Not saved', 'Sin guardar') + '</span>');
      var fields = p.fields.map(function (f) {
        var ph = f.secret ? (f.set ? f.hint + ' — ' + L('leave blank to keep', 'déjalo vacío para conservarla') : '') : '';
        return '<div><label>' + L(f.label.en, f.label.es) + '</label>' +
          '<input data-conn="' + p.id + '" data-field="' + f.key + '"' +
          (f.secret ? ' type="password" autocomplete="new-password"' : '') +
          ' placeholder="' + esc(ph) + '" value="' + esc(f.value || '') + '"></div>';
      }).join('');
      return '<div class="card conn"><div class="conn-h"><b>' + esc(connName(p)) + '</b>' + chip + '</div>' +
        '<small class="muted">' + L(p.what.en, p.what.es) + '</small>' +
        '<div class="grid2">' + fields + '</div>' +
        '<div class="acts"><button class="btn small" data-csave="' + p.id + '"' + (d.encryption_configured ? '' : ' disabled') + '>' + L('Save', 'Guardar') + '</button>' +
        (p.saved ? '<button class="btn small" data-cdel="' + p.id + '">' + L('Remove', 'Borrar') + '</button>' : '') + '</div></div>';
    }).join('');
    box.querySelectorAll('[data-csave]').forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.csave, body = {};
        box.querySelectorAll('[data-conn="' + id + '"]').forEach(function (i) { body[i.dataset.field] = i.value; });
        api('/api/v1/connections/' + id, { method: 'PUT', body: body })
          .then(function (d2) { renderConns(d2); toast(L('Saved. Not connected yet.', 'Guardado. Aún no conectado.')); })
          .catch(function (e) { toast(e.message); });
      };
    });
    box.querySelectorAll('[data-cdel]').forEach(function (b) {
      b.onclick = function () {
        api('/api/v1/connections/' + b.dataset.cdel, { method: 'DELETE' }).then(renderConns).catch(function (e) { toast(e.message); });
      };
    });
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  function viewSettings() {
    Promise.all([api('/api/v1/keys'), api('/api/v1/audit'), api('/api/v1/connections')]).then(function (r) {
      var mcp = location.origin + B + '/mcp';
      view.innerHTML = '<div class="panel"><h2>' + L('More', 'Más') + '</h2><div class="acts">' + ['strategy', 'ideas', 'editing', 'business', 'picks', 'research'].map(function (k) { return '<a class="btn small" href="#' + k + '">' + t(k) + '</a>'; }).join('') + '<a class="btn small" href="' + B + '/about">' + L('About us', 'Quiénes somos') + '</a></div></div>' +
        '<div class="panel"><h2>' + L('Connect your own AI (MCP)', 'Conecta tu propia IA (MCP)') + '</h2><p class="muted">' + L('Endpoint', 'Endpoint') + ': <code>' + esc(mcp) + '</code>. ' + L('Keys can call your agents. Approving, marking sent and marking posted stay yours: no key can do them.', 'Las llaves pueden llamar a tus agentes. Aprobar, marcar enviado y marcar publicado siguen siendo tuyos: ninguna llave puede hacerlo.') + '</p>' +
        '<div class="grid2"><div><label>' + L('Label', 'Nombre') + '</label><input id="kLabel" value="My assistant"></div><div><label style="display:flex;gap:6px;align-items:center;margin-top:36px"><input type="checkbox" id="kTrain" style="width:auto"> ' + L('Allow training (train scope)', 'Permitir entrenar (alcance train)') + '</label></div></div><div class="acts"><button class="btn" id="kNew">' + L('Create key', 'Crear llave') + '</button></div><div id="kOut"></div>' +
        '<table class="t">' + r[0].keys.map(function (k) { return '<tr><td>' + esc(k.label) + '<br><small class="muted">' + esc(k.prefix) + '… · ' + esc((k.scopes || []).join(', ')) + '</small></td><td>' + (k.revoked ? L('revoked', 'revocada') : '<button class="btn small" data-rev="' + k.id + '">' + L('Revoke', 'Revocar') + '</button>') + '</td></tr>'; }).join('') + '</table></div>' +
        '<div class="panel"><h2>' + L('Connections', 'Conexiones') + '</h2><div id="connBox"></div></div>' +
        '<div class="panel"><h2>' + L('Brain audit (last 100 calls)', 'Auditoría del cerebro (últimas 100)') + '</h2><table class="t">' + r[1].calls.map(function (c) { return '<tr><td>' + esc(c.tool) + '</td><td>' + esc(c.channel) + '</td><td>' + esc(c.outcome) + (c.reason ? '<br><small class="muted">' + esc(c.reason) + '</small>' : '') + '</td><td><small class="muted">' + esc(new Date(c.created_at).toLocaleString()) + '</small></td></tr>'; }).join('') + '</table></div>';
      $('kNew').onclick = function () { api('/api/v1/keys', { method: 'POST', body: { label: val('kLabel'), scopes: $('kTrain').checked ? ['agent', 'train'] : ['agent'] } }).then(function (x) { $('kOut').innerHTML = '<p class="warn">' + L('Copy it now, it is shown once: ', 'Cópiala ahora, solo se muestra una vez: ') + '<code>' + esc(x.secret) + '</code></p>'; }).catch(function (e) { toast(e.message); }); };
      renderConns(r[2]);
      view.querySelectorAll('[data-rev]').forEach(function (b) { b.onclick = function () { api('/api/v1/keys/' + b.dataset.rev, { method: 'DELETE' }).then(viewSettings); }; });
    }).catch(function (e) { view.innerHTML = '<p class="warn">' + esc(e.message) + '</p>'; });
  }

  // ── Andrea drawer ──────────────────────────────────────────────────────────
  function addMsg(role, text) { var m = document.createElement('div'); m.className = 'm ' + role; m.textContent = text; $('msgs').appendChild(m); $('msgs').scrollTop = 1e9; }
  var CHAT = [];
  $('liderBtn').onclick = function () { $('drawer').hidden = false; if (!$('msgs').children.length) addMsg('a', L('Hi, I am Andrea. Write what you want done and I will do it: add ideas, write a script, schedule a post, queue an edit, analyse a brand email, teach an agent a rule. Approving, sending and publishing stay your tap.', 'Hola, soy Andrea. Escribe lo que quieres y lo hago: agregar ideas, escribir un guion, programar una publicación, poner un video en cola, analizar un correo de marca, enseñarle una regla a un agente. Aprobar, enviar y publicar siguen siendo tu decisión.')); $('dIn').focus(); };
  $('dClose').onclick = function () { $('drawer').hidden = true; };
  $('dForm').onsubmit = function (e) {
    e.preventDefault(); var m = val('dIn').trim(); if (!m) return; $('dIn').value = ''; addMsg('u', m);
    CHAT.push({ role: 'user', content: m });
    var wait = document.createElement('div'); wait.className = 'm a'; wait.textContent = L('Working…', 'Trabajando…'); $('msgs').appendChild(wait); $('msgs').scrollTop = 1e9;
    api('/api/v1/copilot', { method: 'POST', body: { message: m, history: CHAT.slice(-8) } }).then(function (r) {
      wait.remove(); addMsg('a', r.reply); CHAT.push({ role: 'assistant', content: r.reply });
      if (r.actions && r.actions.length) {
        var did = document.createElement('div'); did.className = 'm a'; did.style.fontSize = '13px'; did.style.opacity = '.85';
        did.textContent = L('Ran: ', 'Ejecutó: ') + r.actions.map(function (a) { return a.tool + (a.ok ? '' : ' (' + L('failed', 'falló') + ')'); }).join(', ');
        $('msgs').appendChild(did);
      }
      (r.proposals || []).forEach(function (p) { addProposal(p); });
      if (r.no_model) addMsg('a', L('Tip: the buttons in the dashboard do the same work.', 'Consejo: los botones del panel hacen el mismo trabajo.'));
      $('msgs').scrollTop = 1e9;
      if (r.actions && r.actions.some(function (a) { return a.ok; })) route();
    }).catch(function (x) { wait.remove(); addMsg('a', x.message); });
  };
  // A human_only action is never performed by the copilot: it comes back as a
  // button, and the creator's tap is what runs it (through the app channel).
  function addProposal(p) {
    var box = document.createElement('div'); box.className = 'm a';
    var label = document.createElement('div'); label.style.marginBottom = '6px';
    label.textContent = L('This one is yours to confirm:', 'Esto lo confirmas tú:') + ' ' + p.tool;
    var b = document.createElement('button'); b.className = 'btn small primary'; b.textContent = L('Do it', 'Hazlo');
    b.onclick = function () {
      b.disabled = true;
      tool(p.tool, p.args || {}).then(function () { b.textContent = L('Done', 'Hecho'); route(); })
        .catch(function (e) { b.disabled = false; toast(e.message); });
    };
    box.appendChild(label); box.appendChild(b); $('msgs').appendChild(box); $('msgs').scrollTop = 1e9;
  }
  $('langBtn').onclick = function () { LANG = LANG === 'es' ? 'en' : 'es'; document.documentElement.lang = LANG; api('/api/v1/me/lang', { method: 'POST', body: { lang: LANG } }).catch(function () {}); renderNav(); route(); };
  $('outBtn').onclick = function () { api('/api/v1/auth/logout', { method: 'POST' }).finally(function () { location.href = B + '/'; }); };

  function route() {
    renderNav();
    var h = (location.hash || '#today').slice(1).split('/'), s = h[0], arg = h[1];
    view.innerHTML = '<p class="muted">…</p>';
    ({ today: viewToday, calendar: viewCalendar, pipeline: viewPipeline, batch: viewBatch, strategy: viewStrategy, ideas: function () { viewIdeas(arg); }, editing: function () { viewEditing(arg); },
      business: viewBusiness, picks: viewPicks, research: viewResearch, train: viewTrain, settings: viewSettings }[s] || viewToday)();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  Promise.all([api('/api/v1/me'), api('/api/v1/corpus')]).then(function (r) {
    ME = r[0].user; CORPUS = r[1]; LANG = ME.lang === 'es' ? 'es' : 'en'; document.documentElement.lang = LANG; route();
  }).catch(function (e) { view.innerHTML = '<p class="warn">' + esc(e.message) + '</p>'; });
})();
