/* =====================================================
   app.js — the one box, the advanced editor, and the gallery.

   Vanilla JS, no build step. Serves ALL THREE pages (index.html, advanced.html
   and gallery.html); each block no-ops when its anchor element is absent.

   The main path is initBox(): one textarea, optionally dictated, POSTed to
   /api/v1/agents/compose, and the answer rendered as a paste-ready command.
   initWizard() is the same field-by-field editor as before, now living at
   /advanced and reachable from the result — the escape hatch for when the
   composer got a field wrong, not the front door.

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
  var BOX_KEY = 'apb_box_v1';

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
    // Placeholders carry a full example sentence, so they need translating too.
    var ph = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < ph.length; j++) {
      var pk = ph[j].getAttribute('data-i18n-placeholder');
      if (strings && Object.prototype.hasOwnProperty.call(strings, pk)) {
        ph[j].setAttribute('placeholder', strings[pk]);
      }
    }
  }

  function lang() {
    return new URLSearchParams(location.search).get('lang') === 'es' ? 'es' : 'en';
  }

  /**
   * Copy text to the clipboard, flashing the button that asked for it.
   * The execCommand fallback matters: the Clipboard API needs a secure context,
   * and a plain-HTTP preview host would otherwise silently do nothing.
   */
  function copyText(text, btn) {
    var done = function () {
      if (!btn) { toast(t('btn_copied', 'Copied')); return; }
      var was = btn.textContent;
      btn.textContent = t('btn_copied', 'Copied');
      btn.classList.add('btn-ok');
      setTimeout(function () { btn.textContent = was; btn.classList.remove('btn-ok'); }, 1600);
    };
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { toast('Copy failed — select the pane manually.'); }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  /** Download a string as a file. */
  function download(text, filename, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function slugOf(payload) {
    return ((payload && payload.agent && payload.agent.name) || 'agent')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent';
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

  // ============================================================== THE ONE BOX

  function initBox() {
    var box = $('one-box');
    if (!box) return;

    var pane = $('json-preview');
    var statusPill = $('preview-status');
    var thinking = $('thinking');
    var result = $('result');
    var composeBtn = $('btn-compose');

    var last = null;      // the whole compose response
    var view = 'command'; // command | json | prompt

    // --- restore the last description so a reload does not lose the sentence
    try {
      var kept = localStorage.getItem(BOX_KEY);
      if (kept) box.value = kept;
    } catch (e) { /* private mode */ }

    box.addEventListener('input', function () {
      try { localStorage.setItem(BOX_KEY, box.value); } catch (e) { /* quota */ }
    });

    // ---------------------------------------------------------- dictation
    // Web Speech API, on-device, no key and no audio upload — the same "ear"
    // the voice orb uses elsewhere in the repo. Absent (Firefox, older Safari)
    // it degrades to a disabled mic and a one-line explanation; typing is the
    // primary input either way, so nothing is gated behind it.
    (function mic() {
      var btn = $('btn-mic');
      var note = $('mic-note');
      if (!btn) return;

      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        btn.disabled = true;
        btn.title = t('mic_unsupported', 'Dictation needs Chrome, Edge or Safari. Typing works everywhere.');
        if (note) note.textContent = t('mic_unsupported', 'Dictation needs Chrome, Edge or Safari. Typing works everywhere.');
        return;
      }

      var rec = new SR();
      rec.lang = lang() === 'es' ? 'es-ES' : 'en-US';
      rec.continuous = true;
      rec.interimResults = true;

      var listening = false;
      var base = '';      // text already committed before this dictation began

      rec.onresult = function (ev) {
        var finalTxt = '', interim = '';
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var r = ev.results[i];
          if (r.isFinal) finalTxt += r[0].transcript;
          else interim += r[0].transcript;
        }
        if (finalTxt) base = (base ? base.replace(/\s+$/, '') + ' ' : '') + finalTxt.trim();
        // Interim text is shown but never committed, so a mid-word pause does
        // not leave a fragment behind in the box.
        box.value = (base + (interim ? ' ' + interim : '')).trim();
        try { localStorage.setItem(BOX_KEY, box.value); } catch (e) { /* quota */ }
      };

      rec.onerror = function (ev) {
        stop();
        if (ev && ev.error === 'not-allowed') {
          if (note) note.textContent = t('mic_denied', 'Microphone blocked. Allow it in the address bar, or just type.');
        } else if (note) {
          if (note) note.textContent = t('mic_failed', 'Dictation stopped. You can keep typing.');
        }
      };

      rec.onend = function () { if (listening) stop(); };

      function start() {
        base = box.value.trim();
        try { rec.start(); } catch (e) { return; }
        listening = true;
        btn.classList.add('listening');
        btn.setAttribute('aria-pressed', 'true');
        if (note) note.textContent = t('mic_listening', 'Listening — tap the mic again to stop.');
      }

      function stop() {
        listening = false;
        try { rec.stop(); } catch (e) { /* already stopped */ }
        btn.classList.remove('listening');
        btn.setAttribute('aria-pressed', 'false');
        if (note && note.textContent === t('mic_listening', 'Listening — tap the mic again to stop.')) note.textContent = '';
        box.focus();
      }

      btn.addEventListener('click', function () { listening ? stop() : start(); });
      // Never leave the mic hot on a page the user has navigated away from.
      window.addEventListener('pagehide', function () { if (listening) stop(); });
    })();

    // ------------------------------------------------------------ rendering

    function renderView() {
      if (!last) return;
      var text;
      if (view === 'json') {
        text = JSON.stringify(last.payload, null, 2);
        pane.classList.remove('wrap');
        pane.innerHTML = highlight(text);
      } else {
        text = view === 'prompt' ? (last.payload.system_prompt || '') : last.command;
        pane.classList.add('wrap');
        pane.textContent = text;
      }
      pane.scrollTop = 0;

      var copyBtn = $('btn-copy');
      if (copyBtn) {
        copyBtn.textContent = view === 'json'
          ? t('btn_copy', 'Copy JSON')
          : view === 'prompt'
            ? t('btn_copy_prompt', 'Copy system prompt')
            : t('btn_copy_command', 'Copy VS Code command');
      }
    }

    function renderResult(data) {
      last = data;
      result.hidden = false;

      // Assumptions are the honesty surface — they are shown ABOVE the artifact
      // on purpose, so nobody pastes a spec into a build agent without having
      // seen what the composer supplied on their behalf.
      var notes = (data.assumptions || []).slice();
      (data.clarifications || []).forEach(function (q) { notes.push(q); });
      (data.unverified || []).forEach(function (id) {
        notes.push(t('unverified_prefix', 'Not in your description — confirm this name exists: ') + id);
      });

      var card = $('assumptions-card');
      var list = $('assumptions-list');
      if (notes.length) {
        list.innerHTML = notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');
        card.hidden = false;
      } else {
        card.hidden = true;
      }

      var warn = data.payload && data.payload.warnings && data.payload.warnings.length;
      if (statusPill) {
        statusPill.className = 'status-pill ' + (warn ? 'status-bad' : data.is_simulated ? 'status-warn' : 'status-ok');
        statusPill.textContent = warn
          ? t('preview_invalid', 'Schema is not valid JSON')
          : data.is_simulated
            ? t('preview_heuristic', 'Written without a model')
            : t('preview_valid', 'Valid JSON');
      }

      var src = $('source-note');
      if (src) {
        src.textContent = data.is_simulated
          ? t('source_heuristic', 'No model key is configured, so this was assembled from your own sentences. Read it before you run it.')
          : t('source_model', 'Composed by ') + data.model + '.';
      }

      renderView();
      refreshSaveState();
      result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // --------------------------------------------------------------- compose

    function run() {
      var text = box.value.trim();
      if (!text) {
        toast(t('err_empty', 'Describe the agent first.'));
        box.focus();
        return;
      }

      composeBtn.disabled = true;
      thinking.hidden = false;
      result.hidden = true;

      fetch(API + 'agents/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, lang: lang() })
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; })
            .then(function (j) { return { status: r.status, body: j }; });
        })
        .then(function (res) {
          composeBtn.disabled = false;
          thinking.hidden = true;
          if (res.status === 200 && res.body && res.body.payload) {
            renderResult(res.body);
          } else if (res.status === 429) {
            toast(res.body.detail || t('err_rate', 'Too many compositions this hour. Try again later.'));
          } else {
            toast(t('err_compose', 'Could not build the prompt') + ': ' + (res.body.detail || res.status));
          }
        })
        .catch(function (e) {
          composeBtn.disabled = false;
          thinking.hidden = true;
          toast(t('err_compose', 'Could not build the prompt') + ': ' + e.message);
        });
    }

    composeBtn.addEventListener('click', run);

    // Cmd/Ctrl+Enter submits — the box is multi-line, so plain Enter has to
    // stay a newline.
    box.addEventListener('keydown', function (ev) {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') { ev.preventDefault(); run(); }
    });

    $('btn-clear').addEventListener('click', function () {
      box.value = '';
      try { localStorage.removeItem(BOX_KEY); } catch (e) { /* ignore */ }
      result.hidden = true;
      last = null;
      box.focus();
    });

    // ------------------------------------------------------------ tabs + CTAs

    var tabs = document.querySelectorAll('.tab[data-tab]');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        view = this.getAttribute('data-tab');
        for (var j = 0; j < tabs.length; j++) tabs[j].classList.toggle('is-on', tabs[j] === this);
        renderView();
      }.bind(tabs[i]));
    }

    $('btn-copy').addEventListener('click', function () {
      if (!last) return;
      var text = view === 'json'
        ? JSON.stringify(last.payload, null, 2)
        : view === 'prompt' ? (last.payload.system_prompt || '') : last.command;
      copyText(text, this);
    });

    $('btn-download').addEventListener('click', function () {
      if (!last) return;
      download(JSON.stringify(last.payload, null, 2), slugOf(last.payload) + '.prompt.json');
    });

    // Hand the composed definition to the advanced editor through localStorage
    // rather than a query string — these payloads run to a few KB and would not
    // survive a URL intact. Same channel the gallery already uses.
    $('btn-edit').addEventListener('click', function () {
      if (!last) return;
      try { localStorage.setItem(PENDING_KEY, JSON.stringify(last.definition)); }
      catch (e) { /* private mode — the editor still opens, just empty */ }
      location.href = 'advanced';
    });

    // ------------------------------------------------------------------ save

    var saveBtn = $('btn-save');
    var saveNote = $('save-note');

    function refreshSaveState() {
      if (!saveBtn) return;
      if (!token()) {
        saveBtn.disabled = true;
        if (saveNote) saveNote.textContent = t('saved_needs_auth', 'Sign in to the CRM to save agents to your tenant.');
      } else {
        saveBtn.disabled = false;
        if (saveNote) saveNote.textContent = '';
      }
    }

    saveBtn.addEventListener('click', function () {
      if (!last) return;
      saveBtn.disabled = true;
      fetch(API + 'agents', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(last.definition)
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; })
            .then(function (j) { return { status: r.status, body: j }; });
        })
        .then(function (res) {
          saveBtn.disabled = false;
          if (res.status === 201) toast(t('btn_saved', 'Saved') + ' — id ' + res.body.id);
          else if (res.status === 401) { toast(t('err_auth_required', 'A CRM session is required to save. Copy or download instead.')); refreshSaveState(); }
          else toast(t('err_save_failed', 'Save failed') + ': ' + (res.body.detail || res.status));
        })
        .catch(function (e) {
          saveBtn.disabled = false;
          toast(t('err_save_failed', 'Save failed') + ': ' + e.message);
        });
    });

    refreshSaveState();
  }

  // ========================================================= ADVANCED EDITOR

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

    // --- copy: the paste-ready command, and the raw payload ---
    // Same ending as the one-box path, so hand-tuning a field does not drop the
    // operator back into "now what do I do with this JSON".
    $('btn-copy-command').addEventListener('click', function () {
      copyText(window.PromptBuilder.architectCommand(lastPayload), this);
    });

    $('btn-copy').addEventListener('click', function () {
      copyText(JSON.stringify(lastPayload, null, 2), this);
    });

    // --- download ---
    $('btn-download').addEventListener('click', function () {
      download(JSON.stringify(lastPayload, null, 2), slugOf(lastPayload) + '.prompt.json');
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
      initBox();
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
