/* Digit2AI Workspace — client dashboard. No framework, no build step. */
(function () {
  'use strict';
  var API = 'api/v1';
  var S = { me: null, workspaces: [], ws: null, tab: 'resumen', project: null };
  var $ = function (id) { return document.getElementById(id); };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fdate(d) { if (!d) return ''; var s = String(d).slice(0, 10).split('-'); return s.length === 3 ? s[2] + '/' + s[1] + '/' + s[0] : ''; }
  function fdt(d) { try { return new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } }
  function money(n, c) { if (n == null || n === '') return '—'; return Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (c || 'USD'); }
  function size(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  var today = new Date().toISOString().slice(0, 10);
  var LBL = {
    planeado: 'Planeado', en_curso: 'En curso', en_pausa: 'En pausa', terminado: 'Terminado', archivado: 'Archivado',
    pendiente: 'Pendiente', bloqueado: 'Bloqueado', hecho: 'Hecho', pagada: 'Pagada', cancelada: 'Cancelada',
    propuesta: 'Propuesta', contrato: 'Contrato', factura: 'Factura', documento: 'Documento',
    member: 'Colaborador', viewer: 'Solo lectura', owner: 'Administrador'
  };
  var ERR = {
    invalid_credentials: 'Correo o contraseña incorrectos.', too_many_attempts: 'Demasiados intentos. Espera 15 minutos.',
    wrong_current_password: 'La contraseña actual no es correcta.', password_too_short: 'La nueva contraseña debe tener al menos 10 caracteres.',
    type_not_allowed: 'Tipo de archivo no permitido. Usa PDF, Word, Excel, PowerPoint, PNG, JPG o ZIP.',
    file_too_large: 'El archivo es demasiado grande.', category_owner_only: 'Solo Digit2AI puede subir propuestas y facturas.',
    email_exists: 'Ese correo ya tiene una cuenta.', invalid_email: 'Correo no válido.', read_only: 'Tu cuenta es de solo lectura.',
    not_configured: 'El servicio no está configurado.', database_unavailable: 'El servicio no está disponible. Intenta en un momento.'
  };
  function errText(e) { return ERR[e] || 'Ocurrió un error. Intenta de nuevo.'; }

  function call(method, path, body, isForm) {
    var opt = { method: method, credentials: 'same-origin', headers: { 'X-Workspace': '1' } };
    if (body && !isForm) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    if (isForm) opt.body = body;
    return fetch(API + path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && path !== '/auth/login') { show('login'); throw new Error('not_signed_in'); }
        if (!r.ok) { var e = new Error(j.error || 'error'); e.code = j.error; throw e; }
        return j;
      });
    });
  }
  function wsPath(p) { return '/w/' + S.ws.id + p; }
  var owner = function () { return S.me && S.me.role === 'owner'; };
  var editor = function () { return S.me && (S.me.role === 'owner' || S.me.role === 'member'); };

  function show(v) {
    $('vLogin').hidden = v !== 'login'; $('vChange').hidden = v !== 'change'; $('vApp').hidden = v !== 'app';
  }
  function modal(html) { $('modalBox').innerHTML = html; $('modal').hidden = false; }
  function closeModal() { $('modal').hidden = true; $('modalBox').innerHTML = ''; }
  $('modal').addEventListener('click', function (e) { if (e.target.id === 'modal' || e.target.getAttribute('data-close') != null) closeModal(); });

  /* ── auth ── */
  $('fLogin').addEventListener('submit', function (e) {
    e.preventDefault(); $('loginErr').hidden = true;
    call('POST', '/auth/login', { email: $('lEmail').value, password: $('lPass').value })
      .then(function (r) { $('lPass').value = ''; if (r.must_change) show('change'); else boot(); })
      .catch(function (err) { $('loginErr').textContent = errText(err.code); $('loginErr').hidden = false; });
  });
  $('fChange').addEventListener('submit', function (e) {
    e.preventDefault(); $('chErr').hidden = true;
    if ($('cNew').value !== $('cNew2').value) { $('chErr').textContent = 'Las contraseñas nuevas no coinciden.'; $('chErr').hidden = false; return; }
    call('POST', '/auth/password', { current: $('cCur').value, new: $('cNew').value })
      .then(function () { ['cCur', 'cNew', 'cNew2'].forEach(function (i) { $(i).value = ''; }); boot(); })
      .catch(function (err) { $('chErr').textContent = errText(err.code); $('chErr').hidden = false; });
  });
  $('bOut').addEventListener('click', function () { call('POST', '/auth/logout').finally(function () { show('login'); }); });
  $('bPass').addEventListener('click', function () {
    if (owner()) { modal('<h3>Contraseña</h3><p class="muted">Como administrador, entras con tu contraseña de RinglyPro. Cámbiala desde el CRM.</p><button class="btn sec" data-close>Cerrar</button>'); return; }
    show('change');
  });

  function boot() {
    call('GET', '/auth/me').then(function (r) {
      S.me = r.user; S.workspaces = r.workspaces;
      if (S.me.must_change) return show('change');
      if (!S.workspaces.length) { show('app'); $('view').innerHTML = '<div class="card empty">No tienes un espacio de trabajo asignado.</div>'; return; }
      var saved = null; try { saved = Number(localStorage.getItem('cws_ws')); } catch (e) {}
      S.ws = S.workspaces.filter(function (w) { return w.id === saved; })[0] || S.workspaces[0];
      $('who').textContent = (S.me.name || S.me.email) + ' · ' + LBL[S.me.role];
      var sel = $('wsSel');
      if (owner() && S.workspaces.length > 1) {
        sel.hidden = false; $('wsName').hidden = true;
        sel.innerHTML = S.workspaces.map(function (w) { return '<option value="' + w.id + '"' + (w.id === S.ws.id ? ' selected' : '') + '>' + esc(w.name) + '</option>'; }).join('');
      } else { sel.hidden = true; $('wsName').hidden = false; $('wsName').textContent = S.ws.name; }
      [].forEach.call(document.querySelectorAll('#tabs [data-owner]'), function (b) { b.hidden = !owner(); });
      show('app'); go(S.tab);
    }).catch(function (e) { if (e.message !== 'not_signed_in') show('login'); });
  }
  $('wsSel').addEventListener('change', function () {
    S.ws = S.workspaces.filter(function (w) { return String(w.id) === this.value; }, this)[0];
    try { localStorage.setItem('cws_ws', S.ws.id); } catch (e) {}
    S.project = null; go(S.tab);
  });
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { S.project = null; go(b.getAttribute('data-t')); } });

  function go(t) {
    S.tab = t;
    [].forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.getAttribute('data-t') === t); });
    $('view').innerHTML = '<div class="empty">Cargando…</div>';
    ({ resumen: vResumen, proyectos: S.project ? vProject : vProjects, documentos: vDocs, facturas: vInvoices, equipo: vTeam, actividad: vActivity }[t] || vResumen)();
  }
  function progress(p) { return p.tasks ? Math.round(p.done / p.tasks * 100) : 0; }

  /* ── resumen ── */
  function vResumen() {
    call('GET', wsPath('/summary')).then(function (r) {
      var open = 0, over = 0; r.projects.forEach(function (p) { open += p.tasks - p.done; over += p.overdue; });
      var h = '<h2>' + esc(r.workspace.name) + '</h2><p class="subt">Estado general de los proyectos y documentos.</p>';
      h += '<div class="grid k4">' +
        kpi(r.projects.length, 'Proyectos activos') + kpi(open, 'Tareas abiertas') +
        kpi(over, 'Tareas vencidas') + kpi(r.files.total, 'Documentos') + '</div>';
      if (r.files.invoices_pending) h += '<div class="card" style="margin-top:14px"><b>' + r.files.invoices_pending + ' factura(s) pendiente(s)</b> <span class="muted">· ' + money(r.files.pending_amount) + '</span></div>';
      h += '<h3 style="margin:24px 0 10px">Proyectos</h3><div class="grid k2">';
      if (!r.projects.length) h += '<div class="card empty">Aún no hay proyectos.</div>';
      r.projects.forEach(function (p) { h += projCard(p); });
      $('view').innerHTML = h + '</div>';
      bindProjCards();
    });
  }
  function kpi(n, l) { return '<div class="card kpi"><b>' + esc(n) + '</b><span>' + esc(l) + '</span></div>'; }
  function projCard(p) {
    var pc = progress(p);
    return '<div class="card proj" data-p="' + p.id + '" tabindex="0"><div class="row"><h3>' + esc(p.name) + '</h3><span class="spacer"></span><span class="pill s-' + p.status + '">' + LBL[p.status] + '</span></div>' +
      '<div class="muted">' + (p.start_date ? fdate(p.start_date) : 'Sin fecha de inicio') + (p.end_date ? ' — ' + fdate(p.end_date) : '') + ' · ' + p.done + ' de ' + p.tasks + ' tareas</div>' +
      '<div class="bar"><i style="width:' + pc + '%"></i></div><div class="muted" style="margin-top:4px">' + pc + '% completado</div></div>';
  }
  function bindProjCards() {
    [].forEach.call(document.querySelectorAll('.proj'), function (c) {
      var open = function () { S.project = Number(c.getAttribute('data-p')); go('proyectos'); };
      c.addEventListener('click', open); c.addEventListener('keydown', function (e) { if (e.key === 'Enter') open(); });
    });
  }

  /* ── proyectos ── */
  function vProjects() {
    call('GET', wsPath('/projects')).then(function (rows) {
      var h = '<div class="row"><div><h2>Proyectos</h2><p class="subt">Cada proyecto con sus tareas, fechas y documentos.</p></div><span class="spacer"></span>' +
        (editor() ? '<button class="btn" id="bNewP">Nuevo proyecto</button>' : '') + '</div><div class="grid k2">';
      if (!rows.length) h += '<div class="card empty">Aún no hay proyectos.</div>';
      rows.forEach(function (p) { h += projCard(p); });
      $('view').innerHTML = h + '</div>'; bindProjCards();
      if ($('bNewP')) $('bNewP').onclick = newProject;
    });
  }
  function newProject() {
    modal('<h3>Nuevo proyecto</h3><div class="field"><label>Nombre</label><input id="npN"></div>' +
      '<div class="field"><label>Descripción</label><textarea id="npD"></textarea></div>' +
      '<div class="grid k2"><div class="field"><label>Inicio</label><input id="npS" type="date"></div><div class="field"><label>Fin</label><input id="npE" type="date"></div></div>' +
      '<div class="err" id="npErr" hidden></div><div class="row"><button class="btn" id="npOk">Crear</button><button class="btn sec" data-close>Cancelar</button></div>');
    $('npOk').onclick = function () {
      call('POST', wsPath('/projects'), { name: $('npN').value, description: $('npD').value, start_date: $('npS').value, end_date: $('npE').value })
        .then(function (p) { closeModal(); S.project = p.id; go('proyectos'); })
        .catch(function (e) { $('npErr').textContent = e.code === 'name_required' ? 'Escribe un nombre.' : errText(e.code); $('npErr').hidden = false; });
    };
  }
  var COLS = ['pendiente', 'en_curso', 'bloqueado', 'hecho'];
  function vProject() {
    Promise.all([call('GET', wsPath('/projects')), call('GET', wsPath('/projects/' + S.project + '/tasks')), call('GET', wsPath('/files?project=' + S.project))])
      .then(function (r) {
        var p = r[0].filter(function (x) { return x.id === S.project; })[0];
        if (!p) { S.project = null; return go('proyectos'); }
        var tasks = r[1], files = r[2], ed = editor();
        var h = '<button class="btn link" id="bBack">← Proyectos</button>';
        h += '<div class="card" style="margin:8px 0 14px"><div class="row"><h2 style="margin:0">' + esc(p.name) + '</h2><span class="spacer"></span>' +
          (ed ? '<select id="pStatus" style="width:auto">' + ['planeado', 'en_curso', 'en_pausa', 'terminado', 'archivado'].map(function (s) { return '<option value="' + s + '"' + (s === p.status ? ' selected' : '') + '>' + LBL[s] + '</option>'; }).join('') + '</select>'
            : '<span class="pill s-' + p.status + '">' + LBL[p.status] + '</span>') + '</div>' +
          (p.description ? '<p style="margin:8px 0 0">' + esc(p.description) + '</p>' : '') +
          (ed ? '<div class="grid k2" style="margin-top:12px;max-width:520px"><div><label>Inicio</label><input id="pS" type="date" value="' + esc(String(p.start_date || '').slice(0, 10)) + '"></div><div><label>Fin</label><input id="pE" type="date" value="' + esc(String(p.end_date || '').slice(0, 10)) + '"></div></div>'
            : '<div class="muted" style="margin-top:6px">' + fdate(p.start_date) + (p.end_date ? ' — ' + fdate(p.end_date) : '') + '</div>') +
          '<div class="bar"><i style="width:' + progress(p) + '%"></i></div><div class="muted" style="margin-top:4px">' + progress(p) + '% completado · ' + p.done + ' de ' + p.tasks + ' tareas</div></div>';
        if (ed) h += '<div class="card"><div class="form"><div><label>Nueva tarea</label><input id="tT" placeholder="¿Qué hay que hacer?"></div><div><label>Responsable</label><input id="tA"></div><div><label>Fecha límite</label><input id="tD" type="date"></div><button class="btn" id="tOk">Agregar</button></div></div>';
        h += '<div class="board">' + COLS.map(function (c) {
          var list = tasks.filter(function (t) { return t.status === c; });
          return '<div class="col"><h4>' + LBL[c] + ' · ' + list.length + '</h4>' + list.map(function (t) {
            var over = t.status !== 'hecho' && t.due_date && String(t.due_date).slice(0, 10) < today;
            return '<div class="task' + (over ? ' overdue' : '') + '"><b>' + esc(t.title) + '</b><div class="meta">' + (t.assignee ? esc(t.assignee) : 'Sin responsable') + (t.due_date ? ' · ' + fdate(t.due_date) : '') + (over ? ' · <span class="pill s-vencida">Vencida</span>' : '') + '</div>' +
              (ed ? '<div class="row"><select data-task="' + t.id + '" style="flex:1">' + COLS.map(function (s) { return '<option value="' + s + '"' + (s === t.status ? ' selected' : '') + '>' + LBL[s] + '</option>'; }).join('') + '</select><button class="btn link" data-del="' + t.id + '" aria-label="Eliminar tarea">Eliminar</button></div>' : '') + '</div>';
          }).join('') + '</div>';
        }).join('') + '</div>';
        h += '<div class="row" style="margin:26px 0 10px"><h3 style="margin:0">Documentos del proyecto</h3><span class="spacer"></span>' + (ed ? '<button class="btn sec" id="bUpP">Subir documento</button>' : '') + '</div>' + fileTable(files);
        $('view').innerHTML = h;
        $('bBack').onclick = function () { S.project = null; go('proyectos'); };
        bindFileTable();
        if (!ed) return;
        $('pStatus').onchange = function () { call('PATCH', wsPath('/projects/' + p.id), { status: this.value }).then(vProject); };
        $('pS').onchange = $('pE').onchange = function () { call('PATCH', wsPath('/projects/' + p.id), { start_date: $('pS').value, end_date: $('pE').value }); };
        $('tOk').onclick = function () {
          if (!$('tT').value.trim()) return $('tT').focus();
          call('POST', wsPath('/projects/' + p.id + '/tasks'), { title: $('tT').value, assignee: $('tA').value, due_date: $('tD').value }).then(vProject);
        };
        $('tT').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('tOk').click(); });
        [].forEach.call(document.querySelectorAll('[data-task]'), function (s) { s.onchange = function () { call('PATCH', wsPath('/tasks/' + s.getAttribute('data-task')), { status: s.value }).then(vProject); }; });
        [].forEach.call(document.querySelectorAll('[data-del]'), function (b) { b.onclick = function () { if (confirm('¿Eliminar esta tarea?')) call('DELETE', wsPath('/tasks/' + b.getAttribute('data-del'))).then(vProject); }; });
        $('bUpP').onclick = function () { uploadForm(p.id, vProject); };
      });
  }

  /* ── documentos ── */
  function fileTable(rows, invoices) {
    if (!rows.length) return '<div class="card empty">No hay documentos todavía.</div>';
    return '<div class="card tablewrap"><table><thead><tr><th>Documento</th><th>Tipo</th>' + (invoices ? '<th>Monto</th><th>Vence</th><th>Estado</th>' : '<th>Proyecto</th><th>Tamaño</th>') + '<th>Fecha</th><th></th></tr></thead><tbody>' +
      rows.map(function (f) {
        var st = f.invoice_status;
        if (st === 'pendiente' && f.due_date && String(f.due_date).slice(0, 10) < today) st = 'vencida';
        return '<tr><td><b>' + esc(f.title) + '</b><div class="muted">' + esc(f.filename) + '</div></td><td><span class="pill c-' + f.category + '">' + LBL[f.category] + '</span></td>' +
          (invoices ? '<td>' + money(f.amount, f.currency) + '</td><td>' + (fdate(f.due_date) || '—') + '</td><td>' +
            (owner() ? '<select data-inv="' + f.id + '" style="width:auto">' + ['pendiente', 'pagada', 'cancelada'].map(function (s) { return '<option value="' + s + '"' + (s === f.invoice_status ? ' selected' : '') + '>' + LBL[s] + '</option>'; }).join('') + '</select>'
              : '<span class="pill s-' + st + '">' + (st === 'vencida' ? 'Vencida' : LBL[st]) + '</span>') + '</td>'
            : '<td>' + esc(f.project_name || '—') + '</td><td>' + size(f.size) + '</td>') +
          '<td>' + fdate(f.created_at) + '</td><td style="white-space:nowrap">' +
          (f.mime === 'application/pdf' ? '<a class="btn link" target="_blank" rel="noopener" href="' + API + wsPath('/files/' + f.id + '/download?view=1') + '">Ver</a>' : '') +
          '<a class="btn link" href="' + API + wsPath('/files/' + f.id + '/download') + '">Descargar</a>' +
          (owner() ? '<button class="btn link" data-fdel="' + f.id + '">Eliminar</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function bindFileTable() {
    [].forEach.call(document.querySelectorAll('[data-fdel]'), function (b) { b.onclick = function () { if (confirm('¿Eliminar este documento?')) call('DELETE', wsPath('/files/' + b.getAttribute('data-fdel'))).then(function () { go(S.tab); }); }; });
    [].forEach.call(document.querySelectorAll('[data-inv]'), function (s) { s.onchange = function () { call('PATCH', wsPath('/files/' + s.getAttribute('data-inv')), { invoice_status: s.value }); }; });
  }
  function vDocs(filter) {
    var cat = typeof filter === 'string' ? filter : '';
    call('GET', wsPath('/files' + (cat ? '?category=' + cat : ''))).then(function (rows) {
      var h = '<div class="row"><div><h2>Documentos</h2><p class="subt">Propuestas, contratos, facturas y documentos del proyecto.</p></div><span class="spacer"></span>' +
        (editor() ? '<button class="btn" id="bUp">Subir documento</button>' : '') + '</div>';
      h += '<div class="row" style="margin-bottom:12px"><select id="fCat" style="width:auto"><option value="">Todos</option>' + ['propuesta', 'contrato', 'factura', 'documento'].map(function (c) { return '<option value="' + c + '"' + (c === cat ? ' selected' : '') + '>' + LBL[c] + '</option>'; }).join('') + '</select></div>';
      $('view').innerHTML = h + fileTable(rows); bindFileTable();
      $('fCat').onchange = function () { vDocs(this.value); };
      if ($('bUp')) $('bUp').onclick = function () { uploadForm(null, function () { vDocs(cat); }); };
    });
  }
  function uploadForm(projectId, done) {
    call('GET', wsPath('/projects')).then(function (projects) {
      var cats = owner() ? ['propuesta', 'contrato', 'factura', 'documento'] : ['documento', 'contrato'];
      modal('<h3>Subir documento</h3><div class="field"><label>Archivo (PDF, Word, Excel, PowerPoint, imagen o ZIP)</label><input id="uF" type="file"></div>' +
        '<div class="field"><label>Título</label><input id="uT" placeholder="Opcional"></div>' +
        '<div class="grid k2"><div class="field"><label>Tipo</label><select id="uC">' + cats.map(function (c) { return '<option value="' + c + '">' + LBL[c] + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>Proyecto</label><select id="uP"><option value="">General</option>' + projects.map(function (p) { return '<option value="' + p.id + '"' + (p.id === projectId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></div></div>' +
        '<div id="uInv" hidden class="grid k2"><div class="field"><label>Monto</label><input id="uA" type="number" step="0.01" min="0"></div><div class="field"><label>Moneda</label><select id="uM"><option>USD</option><option>MXN</option></select></div><div class="field"><label>Vence</label><input id="uD" type="date"></div></div>' +
        '<div class="err" id="uErr" hidden></div><div class="row"><button class="btn" id="uOk">Subir</button><button class="btn sec" data-close>Cancelar</button></div>');
      $('uC').onchange = function () { $('uInv').hidden = this.value !== 'factura'; };
      $('uOk').onclick = function () {
        var f = $('uF').files[0]; if (!f) { $('uErr').textContent = 'Elige un archivo.'; $('uErr').hidden = false; return; }
        var fd = new FormData(); fd.append('file', f); fd.append('title', $('uT').value); fd.append('category', $('uC').value);
        fd.append('project_id', $('uP').value);
        if ($('uC').value === 'factura') { fd.append('amount', $('uA').value); fd.append('currency', $('uM').value); fd.append('due_date', $('uD').value); }
        this.disabled = true; this.textContent = 'Subiendo…'; var btn = this;
        call('POST', wsPath('/files'), fd, true).then(function () { closeModal(); done(); })
          .catch(function (e) { btn.disabled = false; btn.textContent = 'Subir'; $('uErr').textContent = errText(e.code); $('uErr').hidden = false; });
      };
    });
  }
  function vInvoices() {
    call('GET', wsPath('/files?category=factura')).then(function (rows) {
      var pend = rows.filter(function (f) { return f.invoice_status === 'pendiente'; });
      var h = '<div class="row"><div><h2>Facturas</h2><p class="subt">' + pend.length + ' pendiente(s) de pago.</p></div><span class="spacer"></span>' + (owner() ? '<button class="btn" id="bUpI">Subir factura</button>' : '') + '</div>';
      $('view').innerHTML = h + fileTable(rows, true); bindFileTable();
      if ($('bUpI')) $('bUpI').onclick = function () { uploadForm(null, vInvoices); setTimeout(function () { if ($('uC')) { $('uC').value = 'factura'; $('uInv').hidden = false; } }, 50); };
    });
  }

  /* ── equipo (owner) ── */
  function vTeam() {
    if (!owner()) return go('resumen');
    call('GET', wsPath('/users')).then(function (rows) {
      var h = '<h2>Equipo de ' + esc(S.ws.name) + '</h2><p class="subt">Las cuentas del cliente. Cada una recibe una contraseña temporal que debe cambiar al entrar.</p>';
      h += '<div class="card" style="margin-bottom:14px"><div class="uform"><div><label>Correo</label><input id="nuE" type="email"></div><div><label>Nombre</label><input id="nuN"></div>' +
        '<div><label>Permiso</label><select id="nuR"><option value="member">Colaborador</option><option value="viewer">Solo lectura</option></select></div><button class="btn" id="nuOk">Crear cuenta</button></div><div class="err" id="nuErr" hidden style="margin-top:10px"></div></div>';
      h += rows.length ? '<div class="card tablewrap"><table><thead><tr><th>Usuario</th><th>Permiso</th><th>Estado</th><th>Último acceso</th><th></th></tr></thead><tbody>' + rows.map(function (u) {
        return '<tr><td><b>' + esc(u.name || '') + '</b><div class="muted">' + esc(u.email) + '</div></td><td>' + LBL[u.role] + '</td><td>' + (u.active ? (u.must_change ? 'Pendiente de primer acceso' : 'Activo') : 'Desactivado') + '</td><td>' + (u.last_login ? fdt(u.last_login) : '—') + '</td>' +
          '<td style="white-space:nowrap"><button class="btn link" data-reset="' + u.id + '">Restablecer contraseña</button><button class="btn link" data-act="' + u.id + '" data-on="' + (u.active ? '0' : '1') + '">' + (u.active ? 'Desactivar' : 'Activar') + '</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card empty">Aún no hay cuentas del cliente.</div>';
      $('view').innerHTML = h;
      $('nuOk').onclick = function () {
        call('POST', wsPath('/users'), { email: $('nuE').value, name: $('nuN').value, role: $('nuR').value })
          .then(function (u) { showSecret(u.email, u.temporary_password); vTeam(); })
          .catch(function (e) { $('nuErr').textContent = errText(e.code); $('nuErr').hidden = false; });
      };
      [].forEach.call(document.querySelectorAll('[data-reset]'), function (b) { b.onclick = function () {
        if (!confirm('¿Restablecer la contraseña? La actual dejará de funcionar.')) return;
        call('PATCH', wsPath('/users/' + b.getAttribute('data-reset')), { reset_password: true }).then(function (r) { showSecret('', r.temporary_password); vTeam(); });
      }; });
      [].forEach.call(document.querySelectorAll('[data-act]'), function (b) { b.onclick = function () { call('PATCH', wsPath('/users/' + b.getAttribute('data-act')), { active: b.getAttribute('data-on') === '1' }).then(vTeam); }; });
    });
  }
  function showSecret(email, pw) {
    modal('<h3>Contraseña temporal</h3><p class="muted">' + (email ? 'Cuenta: <b>' + esc(email) + '</b>. ' : '') + 'Compártela por un canal privado. Solo se muestra esta vez; al entrar, la persona deberá crear su propia contraseña.</p>' +
      '<div class="secret" id="sec">' + esc(pw) + '</div><p class="muted">Dirección de acceso: <b>' + esc(location.origin + location.pathname) + '</b></p>' +
      '<div class="row"><button class="btn" id="cp">Copiar</button><button class="btn sec" data-close>Cerrar</button></div>');
    $('cp').onclick = function () { try { navigator.clipboard.writeText(pw); this.textContent = 'Copiada'; } catch (e) {} };
  }

  /* ── actividad ── */
  var ACT = { login: 'Inició sesión', password_changed: 'Cambió su contraseña', project_created: 'Creó el proyecto', project_updated: 'Actualizó el proyecto',
    task_created: 'Agregó la tarea', task_status: 'Cambió el estado de', task_deleted: 'Eliminó la tarea', file_uploaded: 'Subió', file_downloaded: 'Descargó',
    file_updated: 'Actualizó', file_deleted: 'Eliminó', user_created: 'Creó la cuenta de', user_updated: 'Actualizó la cuenta de', workspace_created: 'Creó el espacio' };
  function vActivity() {
    call('GET', wsPath('/activity')).then(function (rows) {
      $('view').innerHTML = '<h2>Actividad</h2><p class="subt">Todo lo que se hace en este espacio queda registrado.</p>' + (rows.length
        ? '<div class="card tablewrap"><table><thead><tr><th>Fecha</th><th>Quién</th><th>Qué</th></tr></thead><tbody>' + rows.map(function (a) {
          return '<tr><td style="white-space:nowrap">' + fdt(a.created_at) + '</td><td>' + esc(a.user_email || '—') + '</td><td>' + esc(ACT[a.action] || a.action) + (a.detail ? ' <span class="muted">' + esc(a.detail) + '</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="card empty">Sin actividad todavía.</div>');
    });
  }

  boot();
})();
