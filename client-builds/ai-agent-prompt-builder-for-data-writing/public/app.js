/* =====================================================
   app.js — wizard binding, live preview, copy/download, gallery.

   Vanilla JS, no build step. Serves BOTH pages (index.html and gallery.html);
   each block no-ops when its anchor element is absent.

   The preview is built by window.PromptBuilder — the server's own
   lib/promptBuilder.js, shipped to the browser by GET /promptBuilder.js. The
   pane, the clipboard, the downloaded file and POST /api/v1/agents/generate
   therefore all run the same code. That is the point: a preview that disagrees
   with the export teaches the user to distrust the tool.

   Auth: the JWT is read from localStorage['token'], the same key the CRM and
   the Projects Hub mirror their session into. No token means Save is disabled
   and says so — copy and download still work with no session at all, which is
   the path most users take.
   ===================================================== */

(function () {
  'use strict';

  // Base path works under /ai-agent-prompt-builder-for-data-writing/ AND under
  // any alias the main app might mount later, because every URL is relative to
  // the directory this script was loaded from.
  var BASE = (function () {
    var s = document.currentScript || (function () {
      var all = document.getElementsByTagName('script');
      return all[all.length - 1];
    })();
    var src = (s && s.src) || '';
    return src.slice(0, src.lastIndexOf('/') + 1) || './';
  })();

  var API = BASE + 'api/v1/';
  var DRAFT_KEY = 'apb_draft_v1';
  var PENDING_KEY = 'apb_pending_template';

  var strings = null;

  // ---------------------------------------------------------------- helpers

  function $(id) { return document.getElementById(id); }

  function token() {
    try { return localStorage.getItem('token') || ''; } catch (e) { return ''; }
  }

  function authHeaders() {
    var t = token();
    var h = { 'Content-Type': 'application/json' };
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }

  function toast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  function t(key, fallback) {
    if (strings && Object.prototype.hasOwnProperty.call(strings, key)) return strings[key];
    return fallback || key;
  }

  /** Apply the fetched dictionary to every [data-i18n] node. */
  function applyStrings() {
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var k = nodes[i].getAttribute('data-i18n');
      if (strings && Object.prototype.hasOwnProperty.call(strings, k)) {
        nodes[i].textContent = strings[k];
      }
    }
  }

  function loadStrings() {
    var lang = new URLSearchParams(location.search).get('lang') || 'en';
    return fetch(API + 'i18n?lang=' + encodeURIComponent(lang))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.strings) { strings = d.strings; applyStrings(); } })
      .catch(function () { /* the HTML already carries English defaults */ });
  }

  /** Escape for safe insertion as text content inside generated HTML. */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ------------------------------------------------------- JSON highlighting

  /**
   * Token-colour a JSON string. Operates on the SERIALIZED text, so it can
   * never alter the payload — the pane shows exactly the bytes that get
   * copied and downloaded, just tinted.
   */
  function highlight(json) {
    var escaped = esc(json);
    return escaped.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      function (match) {
        var cls = 'tok-num';
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? 'tok-key' : 'tok-str';
        } else if (/true|false/.test(match)) {
          cls = 'tok-bool';
        } else if (/null/.test(match)) {
          cls = 'tok-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
      }
    );
  }

  // ============================================================== THE WIZARD

  function initWizard() {
    var form = $('wizard');
    var pane = $('json-preview');
    if (!form || !pane) return;

    var fields = form.querySelectorAll('[data-bind]');
    var statusPill = $('preview-status');
    var lastPayload = null;

    /** Read the form into the shape promptBuilder expects. */
    function collect() {
      var out = {};
      for (var i = 0; i < fields.length; i++) {
        var el = fields[i];
        var v = el.value;
        // List fields stay as raw text here; promptBuilder.toList splits on
        // newlines, so there is exactly one place that decides what a "line" is.
        out[el.name] = v;
      }
      return out;
    }

    function render() {
      var input = collect();
      var payload;
      try {
        payload = window.PromptBuilder.buildPrompt(input);
      } catch (e) {
        // buildPrompt is defensive, but a broken bundle must not blank the page.
        pane.textContent = '// preview unavailable: ' + e.message;
        return;
      }
      lastPayload = payload;

      var text = JSON.stringify(payload, null, 2);

      // Preserve scroll — the timestamp changes on every keystroke, and a pane
      // that jumps to the top while you type is unusable.
      var top = pane.scrollTop;
      pane.innerHTML = highlight(text);
      pane.scrollTop = top;

      var warn = payload.warnings && payload.warnings.length;
      if (statusPill) {
        statusPill.className = 'status-pill ' + (warn ? 'status-bad' : 'status-ok');
        statusPill.textContent = warn
          ? t('preview_invalid', 'Schema is not valid JSON')
          : t('preview_valid', 'Valid JSON');
      }

      saveDraft(input);
    }

    // --- draft persistence (localStorage) ---
    // A wizard the user is ten minutes into must survive an accidental reload.
    function saveDraft(input) {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(input)); } catch (e) { /* quota/private mode */ }
    }

    function loadDraft() {
      try {
        var raw = localStorage.getItem(DRAFT_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }

    /** Fill the form from a wizard-shaped definition (template or draft). */
    function fill(def) {
      if (!def) return;
      for (var i = 0; i < fields.length; i++) {
        var el = fields[i];
        var v = def[el.name];
        if (v === undefined || v === null) { el.value = ''; continue; }
        if (Array.isArray(v)) {
          el.value = v.map(function (x) {
            return typeof x === 'object' ? JSON.stringify(x) : String(x);
          }).join('\n');
        } else if (typeof v === 'object') {
          el.value = JSON.stringify(v, null, 2);
        } else {
          el.value = String(v);
        }
      }
    }

    // --- bind every input -> live preview ---
    for (var i = 0; i < fields.length; i++) {
      fields[i].addEventListener('input', render);
      fields[i].addEventListener('change', render);
    }

    // --- copy ---
    $('btn-copy').addEventListener('click', function () {
      var btn = this;
      var text = JSON.stringify(lastPayload, null, 2);
      var done = function () {
        var was = btn.textContent;
        btn.textContent = t('btn_copied', 'Copied');
        btn.classList.add('btn-ok');
        setTimeout(function () { btn.textContent = was; btn.classList.remove('btn-ok'); }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallbackCopy);
      } else {
        fallbackCopy();
      }
      // Clipboard API needs a secure context; a plain-HTTP preview host would
      // otherwise silently do nothing.
      function fallbackCopy() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed — select the pane manually.'); }
        document.body.removeChild(ta);
      }
    });

    // --- download ---
    $('btn-download').addEventListener('click', function () {
      var text = JSON.stringify(lastPayload, null, 2);
      var name = ((lastPayload && lastPayload.agent && lastPayload.agent.name) || 'agent')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent';
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name + '.prompt.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });

    // --- save (JWT) ---
    var saveBtn = $('btn-save');
    var saveNote = $('save-note');

    function refreshSaveState() {
      if (!token()) {
        saveBtn.disabled = true;
        if (saveNote) saveNote.textContent = t('saved_needs_auth', 'Sign in to the CRM to save agents to your tenant.');
      } else {
        saveBtn.disabled = false;
        if (saveNote) saveNote.textContent = '';
      }
    }

    saveBtn.addEventListener('click', function () {
      var input = collect();
      if (!String(input.name || '').trim()) {
        toast(t('err_name_required', 'Agent name is required before saving.'));
        $('f-name').focus();
        return;
      }
      saveBtn.disabled = true;
      var body = Object.assign({}, input);
      try {
        var pending = localStorage.getItem(PENDING_KEY + '_slug');
        if (pending) body.source_template = pending;
      } catch (e) { /* ignore */ }

      fetch(API + 'agents', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; });
        })
        .then(function (res) {
          saveBtn.disabled = false;
          if (res.status === 201) {
            toast(t('btn_saved', 'Saved') + ' — id ' + res.body.id);
            loadSaved();
          } else if (res.status === 401) {
            toast(t('err_auth_required', 'A CRM session is required to save. Copy or download instead.'));
            refreshSaveState();
          } else {
            var detail = (res.body.errors && res.body.errors.join('; ')) || res.body.detail || res.status;
            toast(t('err_save_failed', 'Save failed') + ': ' + detail);
          }
        })
        .catch(function (e) {
          saveBtn.disabled = false;
          toast(t('err_save_failed', 'Save failed') + ': ' + e.message);
        });
    });

    // --- saved agents list ---
    function loadSaved() {
      var box = $('saved-list');
      if (!box) return;
      if (!token()) {
        box.innerHTML = '<p class="hint" style="margin:0">' +
          esc(t('saved_needs_auth', 'Sign in to the CRM to save agents to your tenant.')) + '</p>';
        return;
      }
      fetch(API + 'agents', { headers: authHeaders() })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.agents || !d.agents.length) {
            box.innerHTML = '<p class="hint" style="margin:0">' +
              esc(t('saved_none', 'No saved agents yet.')) + '</p>';
            return;
          }
          box.innerHTML = d.agents.map(function (a) {
            return '<div class="saved-row">' +
              '<span>' + esc(a.name) + '</span>' +
              '<span class="meta">#' + esc(a.id) + ' · ' + esc(String(a.created_at).slice(0, 10)) + '</span>' +
              '</div>';
          }).join('');
        })
        .catch(function () {
          box.innerHTML = '<p class="hint" style="margin:0">Could not load saved agents.</p>';
        });
    }

    // --- reset ---
    $('btn-reset').addEventListener('click', function () {
      for (var i = 0; i < fields.length; i++) fields[i].value = '';
      try {
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem(PENDING_KEY + '_slug');
      } catch (e) { /* ignore */ }
      render();
    });

    // --- boot: a template handed over from the gallery wins over the draft ---
    var handoff = null;
    try {
      var raw = localStorage.getItem(PENDING_KEY);
      if (raw) { handoff = JSON.parse(raw); localStorage.removeItem(PENDING_KEY); }
    } catch (e) { /* ignore */ }

    fill(handoff || loadDraft());
    if (handoff) toast(t('toast_loaded', 'Template loaded into the wizard.'));

    render();
    refreshSaveState();
    loadSaved();
  }

  // ============================================================== THE GALLERY

  function initGallery() {
    var grid = $('tpl-grid');
    if (!grid) return;

    fetch(API + 'templates')
      .then(function (r) { return r.json(); })
      .then(function (list) {
        if (!Array.isArray(list) || !list.length) {
          var empty = $('tpl-empty');
          if (empty) empty.style.display = 'block';
          return;
        }
        grid.innerHTML = list.map(function (tpl) {
          return '' +
            '<article class="tpl-card">' +
              '<span class="tag">' + esc(tpl.category || 'template') + '</span>' +
              '<h2 class="text-base font-bold">' + esc(tpl.title) + '</h2>' +
              '<p class="text-sm flex-1" style="color:var(--mut)">' + esc(tpl.summary) + '</p>' +
              '<p class="hint" style="margin:0">' +
                esc((tpl.definition.instructions || []).length) + ' instructions · ' +
                esc((tpl.definition.constraints || []).length) + ' constraints · ' +
                esc((tpl.definition.dataSources || []).length) + ' sources' +
              '</p>' +
              '<button class="btn btn-primary mt-2" data-slug="' + esc(tpl.slug) + '">' +
                esc(t('btn_load_template', 'Load into wizard')) +
              '</button>' +
            '</article>';
        }).join('');

        // Hand the definition to the wizard through localStorage rather than a
        // query string — these payloads run to a few KB and would not survive
        // a URL intact.
        grid.addEventListener('click', function (ev) {
          var btn = ev.target.closest('[data-slug]');
          if (!btn) return;
          var slug = btn.getAttribute('data-slug');
          var tpl = list.find(function (x) { return x.slug === slug; });
          if (!tpl) return;
          try {
            localStorage.setItem(PENDING_KEY, JSON.stringify(tpl.definition));
            localStorage.setItem(PENDING_KEY + '_slug', slug);
          } catch (e) { /* private mode — fall through to the wizard anyway */ }
          location.href = './';
        });
      })
      .catch(function () {
        var empty = $('tpl-empty');
        if (empty) empty.style.display = 'block';
      });
  }

  // ====================================================================== GO

  function boot() {
    loadStrings().then(function () {
      applyStrings();
      initWizard();
      initGallery();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
