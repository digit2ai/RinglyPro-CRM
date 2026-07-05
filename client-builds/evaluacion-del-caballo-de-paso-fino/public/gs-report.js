// =====================================================
// GSReport — embeddable "3D Gaussian Splatting Report" generator.
// Renders the report-builder UI into any container and drives the EquiMind GS
// engine (/equimind-gs-engine/api/v1/*) using the shared same-origin ecpf_token
// cookie — so it works anywhere the EquiMind account is logged in (e.g. the juez
// results page). Self-contained: own i18n (es/en via window.__LANG), no globals
// leaked except window.GSReport.
//   GSReport.mount(container)                 -> render the generator
//   GSReport.setContext({horseName, measurements, findings, captureSeconds})
//                                             -> prefill from an analysis
// =====================================================
(function () {
  'use strict';
  var GS_API = '/equimind-gs-engine/api/v1/';
  var GS_ROOT = '/equimind-gs-engine/';
  var LANG = (String(window.__LANG || 'es').slice(0, 2) === 'en') ? 'en' : 'es';
  var STAT = ['ok', 'watch', 'info'];
  var T = ({
    es: {
      title: 'Informe 3D Gaussian Splatting', sub: 'Genera un informe 3D compartible a partir de este análisis. Sin GPU — costo cero.',
      horse: 'Nombre del caballo', breed: 'Raza', height: 'Alzada a la cruz (cm)', length: 'Largo del cuerpo (cm)', capsec: 'Duración de la captura (s)',
      measures: 'Medidas / métricas', add_measure: '+ Agregar medida', findings: 'Hallazgos', add_finding: '+ Agregar hallazgo',
      c_label: 'Medida', c_value: 'Valor', c_cm: 'cm', c_min: 'mín', c_max: 'máx', c_status: 'Estado', c_title: 'Título', c_detail: 'Detalle',
      media: 'Video/fotos (opcional — para el escaneo real Luma más adelante)', gen: 'Generar informe 3D · 2 créditos', gening: 'Generando informe…',
      done: 'Informe listo.', open: 'Abrir informe ↗', copy: 'Copiar enlace', copied: 'Copiado ✓', need: 'Ingresa al menos el nombre del caballo o una medida.',
      st_ok: 'En estándar', st_watch: 'Vigilar', st_info: 'Referencia', nocred: 'Sin créditos suficientes', login: 'Inicia sesión en EquiMind',
      cost_note: 'El informe 3D profesional deduce 2 créditos: modelo 3D navegable, panel de marcha, hallazgos mapeados, historial y PDF compartible con veterinarios, jueces y federaciones.'
    },
    en: {
      title: '3D Gaussian Splatting Report', sub: 'Generate a shareable 3D report from this analysis. No GPU — zero cost.',
      horse: 'Horse name', breed: 'Breed', height: 'Withers height (cm)', length: 'Body length (cm)', capsec: 'Capture length (s)',
      measures: 'Measurements / metrics', add_measure: '+ Add measurement', findings: 'Findings', add_finding: '+ Add finding',
      c_label: 'Measure', c_value: 'Value', c_cm: 'cm', c_min: 'min', c_max: 'max', c_status: 'Status', c_title: 'Title', c_detail: 'Detail',
      media: 'Video/photos (optional — for the real Luma scan later)', gen: 'Generate 3D report · 2 credits', gening: 'Generating report…',
      done: 'Report ready.', open: 'Open report ↗', copy: 'Copy link', copied: 'Copied ✓', need: 'Enter at least a horse name or one measurement.',
      st_ok: 'In standard', st_watch: 'Watch', st_info: 'Reference', nocred: 'Out of credits', login: 'Log in to EquiMind',
      cost_note: 'The professional 3D report deducts 2 credits: navigable 3D model, gait dashboard, mapped findings, history and a shareable PDF for vets, judges and federations.'
    }
  })[LANG];

  var ctx = { horseName: '', measurements: [], findings: [], neural: null, gait: null, captureSeconds: null };
  var mounted = [];

  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]); }); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function statusOpts(sel) { return STAT.map(function (s) { return '<option value="' + s + '"' + (s === sel ? ' selected' : '') + '>' + T['st_' + s] + '</option>'; }).join(''); }

  function panelHTML() {
    return '' +
      '<div class="gsr-wrap bg-slate-900/60 border rounded-xl p-5" style="border-color:rgba(230,197,114,.28)">' +
        '<div class="flex items-center gap-2">' +
          '<svg viewBox="0 0 32 32" width="22" height="22" fill="none"><path d="M7 25c-1-6 1-11 6-13 1-2 4-4 7-4 1 0 2 1 1 2-1 1-3 1-3 3 3 0 6 2 7 6-2 0-3-1-4-1 1 3 0 6-2 8" stroke="#E6C572" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="21.5" cy="10.5" r="1" fill="#E6C572"/></svg>' +
          '<h3 class="text-base font-bold" style="color:#E6C572">' + esc(T.title) + '</h3></div>' +
        '<p class="text-xs text-slate-400 mt-1">' + esc(T.sub) + '</p>' +
        '<div class="grid grid-cols-2 gap-3 mt-4">' +
          field('gsr-horse', T.horse) + field('gsr-breed', T.breed) +
          field('gsr-height', T.height, 'number') + field('gsr-length', T.length, 'number') + field('gsr-capsec', T.capsec, 'number') +
        '</div>' +
        head(T.measures, 'gsr-add-measure', T.add_measure) + measHead() + '<div class="gsr-meas mt-1 grid gap-2"></div>' +
        head(T.findings, 'gsr-add-finding', T.add_finding) + findHead() + '<div class="gsr-find mt-1 grid gap-2"></div>' +
        '<label class="block text-[11px] text-slate-400 mb-1 mt-5">' + esc(T.media) + '</label>' +
        '<input type="file" class="gsr-file w-full text-xs text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white" accept="video/mp4,video/quicktime,image/*" multiple>' +
        '<button class="gsr-gen mt-5 w-full rounded-lg px-4 py-3 font-semibold" style="background:linear-gradient(180deg,#E6C572,#C9A24B);color:#241a08">' + esc(T.gen) + '</button>' +
        '<p class="text-[11px] mt-2" style="color:#7C6F5E;line-height:1.4">' + esc(T.cost_note) + '</p>' +
        '<div class="gsr-status text-xs mono mt-3" style="color:#98A199"></div>' +
        '<div class="gsr-result hidden mt-3 flex items-center gap-3 flex-wrap"></div>' +
      '</div>';
  }
  function field(cls, label, type) { return '<div><label class="block text-[11px] text-slate-400 mb-1">' + esc(label) + '</label><input class="' + cls + ' w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm" ' + (type === 'number' ? 'type="number" step="0.1"' : '') + '></div>'; }
  function colH(t) { return '<div class="text-[10px] uppercase tracking-wide text-slate-500 px-1 truncate">' + esc(t) + '</div>'; }
  function measHead() { return '<div class="gsr-mhead hidden sm:grid gap-1 px-2 pt-1" style="grid-template-columns:1.4fr .9fr .6fr .6fr .6fr .9fr 1.2rem">' + colH(T.c_label) + colH(T.c_value) + colH(T.c_cm) + colH('▼ ' + T.c_min) + colH('▲ ' + T.c_max) + colH(T.c_status) + '<span></span></div>'; }
  function findHead() { return '<div class="gsr-fhead hidden sm:grid gap-1 px-2 pt-1" style="grid-template-columns:.8fr 1.3fr 2.2fr 1.2rem">' + colH(T.c_status) + colH(T.c_title) + colH(T.c_detail) + '<span></span></div>'; }
  function head(label, addCls, addLabel) { return '<div class="mt-5 flex items-center justify-between"><label class="text-xs font-semibold" style="color:#E6C572">' + esc(label) + '</label><button class="' + addCls + ' text-xs underline" style="color:#98A199">' + esc(addLabel) + '</button></div>'; }

  function measRow(root, pre) {
    pre = pre || {};
    var el = document.createElement('div');
    el.className = 'gsr-mrow grid gap-1 border border-slate-800 rounded-lg p-2';
    el.style.gridTemplateColumns = '1.4fr .9fr .6fr .6fr .6fr .9fr 1.2rem';
    el.innerHTML =
      inp('m-label', T.c_label, pre.label) + inp('m-value', T.c_value, pre.value) +
      inp('m-cm', T.c_cm, pre.cm, 'number') + inp('m-lo', T.c_min, pre.ideal_lo, 'number') + inp('m-hi', T.c_max, pre.ideal_hi, 'number') +
      '<select class="m-status bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs">' + statusOpts(pre.status || 'ok') + '</select>' +
      '<button class="m-del text-xs px-2" style="color:#C56A4E">✕</button>';
    el.querySelector('.m-del').onclick = function () { el.remove(); };
    root.querySelector('.gsr-meas').appendChild(el);
  }
  function findRow(root, pre) {
    pre = pre || {};
    var el = document.createElement('div');
    el.className = 'gsr-frow grid gap-1 border border-slate-800 rounded-lg p-2';
    el.style.gridTemplateColumns = '.8fr 1.3fr 2.2fr 1.2rem';
    el.innerHTML =
      '<select class="f-kind bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs">' + statusOpts(pre.kind || 'info') + '</select>' +
      inp('f-title', T.c_title, pre.title) + inp('f-detail', T.c_detail, pre.detail) +
      '<button class="f-del text-xs px-2" style="color:#C56A4E">✕</button>';
    el.querySelector('.f-del').onclick = function () { el.remove(); };
    root.querySelector('.gsr-find').appendChild(el);
  }
  function inp(cls, ph, val, type) { return '<input class="' + cls + ' bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" placeholder="' + esc(ph) + '" ' + (type === 'number' ? 'type="number" step="0.1"' : '') + ' value="' + esc(val != null ? val : '') + '">'; }

  function collect(root) {
    var g = function (c) { return root.querySelector('.' + c); };
    var measurements = [];
    root.querySelectorAll('.gsr-mrow').forEach(function (el) {
      var label = el.querySelector('.m-label').value.trim(), value = el.querySelector('.m-value').value.trim(), cm = num(el.querySelector('.m-cm').value);
      if (!label && !value && cm == null) return;
      var lo = num(el.querySelector('.m-lo').value), hi = num(el.querySelector('.m-hi').value);
      measurements.push({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40), label: label, value: value || null, cm: cm, ideal_lo: lo, ideal_hi: hi, lo: lo != null ? lo * 0.85 : null, hi: hi != null ? hi * 1.15 : null, at: cm, status: el.querySelector('.m-status').value });
    });
    var findings = [];
    root.querySelectorAll('.gsr-frow').forEach(function (el) {
      var title = el.querySelector('.f-title').value.trim(), detail = el.querySelector('.f-detail').value.trim();
      if (!title && !detail) return;
      findings.push({ kind: el.querySelector('.f-kind').value, title: title, detail: detail });
    });
    return {
      horse_name: g('gsr-horse').value.trim() || null, breed: g('gsr-breed').value.trim() || null,
      height_cm: num(g('gsr-height').value), length_cm: num(g('gsr-length').value), capture_seconds: num(g('gsr-capsec').value),
      measurements: measurements, findings: findings, neural_findings: ctx.neural || [],
      gait: ctx.gait || null, report_date: new Date().toISOString().slice(0, 10)
    };
  }

  function generate(root, btn) {
    var report = collect(root);
    var st = root.querySelector('.gsr-status'), resultBox = root.querySelector('.gsr-result');
    if (!report.horse_name && !report.measurements.length && report.height_cm == null) { st.textContent = T.need; return; }
    btn.disabled = true; st.textContent = T.gening; resultBox.classList.add('hidden');
    var files = root.querySelector('.gsr-file').files;
    var opt = { credentials: 'same-origin' };
    fetch(GS_API + 'sessions', Object.assign({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'conformation', source_type: 'video', title: report.horse_name || 'Conformation', report: report }) }, opt))
      .then(function (r) { if (r.status === 401) { st.textContent = T.login; throw new Error('auth'); } return r.json(); })
      .then(function (s) {
        var fd = new FormData(); for (var i = 0; i < files.length; i++) fd.append('frames', files[i]);
        if (report.capture_seconds != null) fd.append('source_seconds', report.capture_seconds);
        return fetch(GS_API + 'sessions/' + s.id + '/upload', Object.assign({ method: 'POST', body: fd }, opt)).then(function () { return s; });
      })
      .then(function (s) { return fetch(GS_API + 'sessions/' + s.id + '/process?inline=1', Object.assign({ method: 'POST' }, opt)).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); }); })
      .then(function (res) {
        btn.disabled = false;
        if (res.status === 402) { st.textContent = T.nocred + ' (' + (res.j.needed || '') + ')'; return; }
        if (!res.ok) { st.textContent = 'Error: ' + (res.j.error || ''); return; }
        return fetch(GS_API + 'scenes', opt).then(function (r) { return r.json(); }).then(function (rows) {
          var sc = (rows || []).sort(function (a, b) { return b.id - a.id; })[0];
          st.textContent = T.done;
          var link = location.origin + GS_ROOT + 'report?scene=' + sc.id + (sc.share_token ? ('&k=' + sc.share_token) : '') + '&lang=' + LANG;
          resultBox.classList.remove('hidden');
          resultBox.innerHTML = '<a href="' + link + '" target="_blank" rel="noopener" class="rounded-lg px-4 py-2 font-semibold text-sm" style="background:linear-gradient(180deg,#E6C572,#C9A24B);color:#241a08">' + esc(T.open) + '</a>' +
            '<button class="gsr-copy rounded-lg px-4 py-2 text-sm border" style="border-color:rgba(236,230,218,.2);color:#ECE6DA">' + esc(T.copy) + '</button>' +
            '<span class="mono text-xs" style="color:#98A199">' + esc(sc.report_code) + '</span>';
          resultBox.querySelector('.gsr-copy').onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(link); this.textContent = T.copied; };
        });
      })
      .catch(function (e) { btn.disabled = false; if (e.message !== 'auth') st.textContent = 'Error: ' + e.message; });
  }

  function applyContext(root) {
    if (ctx.horseName && !root.querySelector('.gsr-horse').value) root.querySelector('.gsr-horse').value = ctx.horseName;
    if (ctx.captureSeconds != null && !root.querySelector('.gsr-capsec').value) root.querySelector('.gsr-capsec').value = ctx.captureSeconds;
    var mbox = root.querySelector('.gsr-meas'), fbox = root.querySelector('.gsr-find');
    mbox.innerHTML = ''; fbox.innerHTML = '';
    (ctx.measurements.length ? ctx.measurements : [{}]).forEach(function (m) { measRow(root, m); });
    (ctx.findings.length ? ctx.findings : [{}]).forEach(function (f) { findRow(root, f); });
  }

  function mount(container) {
    if (!container) return;
    container.innerHTML = panelHTML();
    var root = container.querySelector('.gsr-wrap');
    root.querySelector('.gsr-add-measure').onclick = function (e) { e.preventDefault(); measRow(root, {}); };
    root.querySelector('.gsr-add-finding').onclick = function (e) { e.preventDefault(); findRow(root, {}); };
    root.querySelector('.gsr-gen').addEventListener('click', function () { generate(root, this); });
    applyContext(root);
    mounted.push(root);
    return root;
  }

  function setContext(c) {
    c = c || {};
    if (c.horseName != null) ctx.horseName = c.horseName;
    if (c.captureSeconds != null) ctx.captureSeconds = c.captureSeconds;
    if (c.gait !== undefined) ctx.gait = c.gait;
    if (c.neural !== undefined) ctx.neural = c.neural;
    if (Array.isArray(c.measurements)) ctx.measurements = c.measurements;
    if (Array.isArray(c.findings)) ctx.findings = c.findings;
    mounted.forEach(applyContext);
  }

  function autoMount() { ['gsReportBottom'].forEach(function (id) { var el = document.getElementById(id); if (el && !el.querySelector('.gsr-wrap')) mount(el); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount); else autoMount();

  window.GSReport = { mount: mount, setContext: setContext };
})();
