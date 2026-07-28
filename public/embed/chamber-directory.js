/**
 * CamaraVirtual — Embeddable chamber member directory
 * ---------------------------------------------------
 * Renders a chamber's PUBLIC member directory inside any external page
 * (WordPress, GoHighLevel, Squarespace, plain HTML). Self-contained: no
 * jQuery, no framework, no build step, styles namespaced under .cvdir-*.
 *
 * Usage — drop this into a WordPress "Custom HTML" block:
 *
 *   <div data-cv-directory data-slug="cv-105"></div>
 *   <script src="https://aiagent.ringlypro.com/embed/chamber-directory.js"></script>
 *
 * Data attributes (on the container div):
 *   data-slug     required. Chamber slug, e.g. "cv-105".
 *   data-base     optional. API origin. Default https://aiagent.ringlypro.com
 *   data-lang     optional. "es" | "en". Default "es".
 *   data-limit    optional. Members per page, 1-100. Default 24.
 *   data-search   optional. "0" hides the search + sector filter bar.
 *   data-join-url optional. URL for the "Join" button. Omit to hide it.
 *
 * The endpoint it reads is unauthenticated and PII-stripped (no emails, no
 * phone numbers) and must be enabled per chamber via
 * chambers.theme_config.public_directory = true.
 */
(function () {
  'use strict';

  var DEFAULT_BASE = 'https://aiagent.ringlypro.com';
  var STYLE_ID = 'cvdir-styles';

  var I18N = {
    es: {
      search: 'Buscar por nombre, empresa o sector',
      allSectors: 'Todos los sectores',
      allCountries: 'Todos los paises',
      members: 'miembros',
      member: 'miembro',
      verified: 'Verificado',
      website: 'Sitio web',
      linkedin: 'LinkedIn',
      prev: 'Anterior',
      next: 'Siguiente',
      page: 'Pagina',
      of: 'de',
      empty: 'No se encontraron miembros con esos criterios.',
      error: 'No se pudo cargar el directorio en este momento.',
      loading: 'Cargando directorio...',
      join: 'Unete a la camara',
      years: 'anos de experiencia'
    },
    en: {
      search: 'Search by name, company or sector',
      allSectors: 'All sectors',
      allCountries: 'All countries',
      members: 'members',
      member: 'member',
      verified: 'Verified',
      website: 'Website',
      linkedin: 'LinkedIn',
      prev: 'Previous',
      next: 'Next',
      page: 'Page',
      of: 'of',
      empty: 'No members matched those filters.',
      error: 'The directory could not be loaded right now.',
      loading: 'Loading directory...',
      join: 'Join the chamber',
      years: 'years of experience'
    }
  };

  var CSS = [
    '.cvdir{--cvdir-fg:#14213d;--cvdir-muted:#6b7280;--cvdir-line:#e5e7eb;--cvdir-accent:#c9a227;--cvdir-bg:#fff;',
    'font-family:inherit;color:var(--cvdir-fg);box-sizing:border-box}',
    '.cvdir *,.cvdir *:before,.cvdir *:after{box-sizing:inherit}',
    '.cvdir-bar{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 18px}',
    '.cvdir-bar input,.cvdir-bar select{flex:1 1 200px;min-width:0;padding:10px 12px;border:1px solid var(--cvdir-line);',
    'border-radius:8px;font:inherit;font-size:15px;background:var(--cvdir-bg);color:inherit}',
    '.cvdir-bar input:focus,.cvdir-bar select:focus{outline:2px solid var(--cvdir-accent);outline-offset:1px}',
    '.cvdir-count{font-size:14px;color:var(--cvdir-muted);margin:0 0 14px}',
    '.cvdir-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}',
    '.cvdir-card{border:1px solid var(--cvdir-line);border-radius:12px;padding:18px;background:var(--cvdir-bg);',
    'display:flex;flex-direction:column;gap:8px}',
    '.cvdir-card h3{margin:0;font-size:17px;line-height:1.3;font-weight:700}',
    '.cvdir-person{font-size:14px;color:var(--cvdir-muted);margin:0}',
    '.cvdir-tags{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 0}',
    '.cvdir-tag{font-size:12px;padding:3px 9px;border-radius:999px;background:#f3f4f6;color:#374151;white-space:nowrap}',
    '.cvdir-tag.is-verified{background:#ecfdf5;color:#065f46}',
    '.cvdir-tag.is-role{background:#eef2ff;color:#3730a3}',
    '.cvdir-bio{font-size:14px;line-height:1.5;color:#4b5563;margin:4px 0 0}',
    '.cvdir-links{display:flex;gap:14px;margin-top:auto;padding-top:10px;font-size:14px}',
    '.cvdir-links a{color:#1d4ed8;text-decoration:none;font-weight:600}',
    '.cvdir-links a:hover{text-decoration:underline}',
    '.cvdir-pager{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:22px;font-size:14px}',
    '.cvdir-pager button{padding:8px 16px;border:1px solid var(--cvdir-line);background:var(--cvdir-bg);',
    'border-radius:8px;font:inherit;cursor:pointer}',
    '.cvdir-pager button[disabled]{opacity:.45;cursor:default}',
    '.cvdir-msg{padding:26px;text-align:center;color:var(--cvdir-muted);font-size:15px}',
    '.cvdir-join{display:inline-block;margin-top:20px;padding:12px 26px;border-radius:8px;',
    'background:var(--cvdir-accent);color:#14213d;font-weight:700;text-decoration:none}',
    '@media (prefers-color-scheme:dark){.cvdir{--cvdir-fg:#e5e7eb;--cvdir-line:#374151;--cvdir-muted:#9ca3af;--cvdir-bg:transparent}',
    '.cvdir-tag{background:#1f2937;color:#d1d5db}.cvdir-bio{color:#cbd5e1}}'
  ].join('');

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Only http(s) links are rendered — a stored javascript: URL must never
  // become a clickable anchor on a customer's site.
  function safeUrl(u) {
    if (!u) return '';
    var t = String(u).trim();
    if (!/^https?:\/\//i.test(t)) {
      if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(t)) t = 'https://' + t;
      else return '';
    }
    return t;
  }

  function titleize(s) {
    if (!s) return '';
    return String(s).replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function Directory(el) {
    var slug = el.getAttribute('data-slug');
    if (!slug) { el.textContent = 'chamber-directory: missing data-slug'; return; }

    var base = (el.getAttribute('data-base') || DEFAULT_BASE).replace(/\/+$/, '');
    var lang = el.getAttribute('data-lang') === 'en' ? 'en' : 'es';
    var t = I18N[lang];
    var limit = Math.min(100, Math.max(1, parseInt(el.getAttribute('data-limit'), 10) || 24));
    var showSearch = el.getAttribute('data-search') !== '0';
    var joinUrl = safeUrl(el.getAttribute('data-join-url'));

    var state = { page: 1, search: '', sector: '', timer: null };

    el.className = (el.className ? el.className + ' ' : '') + 'cvdir';
    el.innerHTML = '<div class="cvdir-msg">' + esc(t.loading) + '</div>';

    var bar = null, body = document.createElement('div');

    function api(path, params) {
      var qs = Object.keys(params || {})
        .filter(function (k) { return params[k] !== '' && params[k] != null; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
        .join('&');
      return fetch(base + '/' + encodeURIComponent(slug) + '/api' + path + (qs ? '?' + qs : ''), {
        headers: { Accept: 'application/json' }
      }).then(function (r) { return r.json(); });
    }

    function buildBar(facets) {
      bar = document.createElement('div');
      bar.className = 'cvdir-bar';

      var input = document.createElement('input');
      input.type = 'search';
      input.placeholder = t.search;
      input.setAttribute('aria-label', t.search);
      input.addEventListener('input', function () {
        clearTimeout(state.timer);
        state.timer = setTimeout(function () {
          state.search = input.value.trim();
          state.page = 1;
          load();
        }, 300);
      });
      bar.appendChild(input);

      var sel = document.createElement('select');
      sel.setAttribute('aria-label', t.allSectors);
      var opt0 = document.createElement('option');
      opt0.value = ''; opt0.textContent = t.allSectors;
      sel.appendChild(opt0);
      (facets || []).forEach(function (f) {
        var o = document.createElement('option');
        o.value = f.sector;
        o.textContent = titleize(f.sector) + ' (' + f.count + ')';
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () {
        state.sector = sel.value; state.page = 1; load();
      });
      bar.appendChild(sel);

      el.innerHTML = '';
      el.appendChild(bar);
      el.appendChild(body);
    }

    function card(m) {
      var name = [m.first_name, m.last_name].filter(Boolean).join(' ');
      var heading = m.company_name || name || '';
      var tags = [];
      if (m.sector) tags.push('<span class="cvdir-tag">' + esc(titleize(m.sector)) + '</span>');
      if (m.country) tags.push('<span class="cvdir-tag">' + esc(m.country) + '</span>');
      if (m.governance_role && m.governance_role !== 'member') {
        tags.push('<span class="cvdir-tag is-role">' + esc(titleize(m.governance_role)) + '</span>');
      }
      if (m.verified) tags.push('<span class="cvdir-tag is-verified">' + esc(t.verified) + '</span>');
      if (m.years_experience) {
        tags.push('<span class="cvdir-tag">' + esc(m.years_experience) + ' ' + esc(t.years) + '</span>');
      }

      var links = [];
      var w = safeUrl(m.website_url);
      var l = safeUrl(m.linkedin_url);
      if (w) links.push('<a href="' + esc(w) + '" target="_blank" rel="noopener nofollow">' + esc(t.website) + '</a>');
      if (l) links.push('<a href="' + esc(l) + '" target="_blank" rel="noopener nofollow">' + esc(t.linkedin) + '</a>');

      return '<article class="cvdir-card">' +
        '<h3>' + esc(heading) + '</h3>' +
        (heading !== name && name ? '<p class="cvdir-person">' + esc(name) + '</p>' : '') +
        (tags.length ? '<div class="cvdir-tags">' + tags.join('') + '</div>' : '') +
        (m.bio ? '<p class="cvdir-bio">' + esc(m.bio) + '</p>' : '') +
        (links.length ? '<div class="cvdir-links">' + links.join('') + '</div>' : '') +
        '</article>';
    }

    function render(d) {
      var total = d.total || 0;
      var pages = (d.pagination && d.pagination.pages) || 1;
      var html = '<p class="cvdir-count">' + total + ' ' + esc(total === 1 ? t.member : t.members) + '</p>';

      if (!d.members || !d.members.length) {
        html += '<div class="cvdir-msg">' + esc(t.empty) + '</div>';
      } else {
        html += '<div class="cvdir-grid">' + d.members.map(card).join('') + '</div>';
      }
      if (pages > 1) {
        html += '<div class="cvdir-pager">' +
          '<button type="button" data-cvdir-prev' + (state.page <= 1 ? ' disabled' : '') + '>' + esc(t.prev) + '</button>' +
          '<span>' + esc(t.page) + ' ' + state.page + ' ' + esc(t.of) + ' ' + pages + '</span>' +
          '<button type="button" data-cvdir-next' + (state.page >= pages ? ' disabled' : '') + '>' + esc(t.next) + '</button>' +
          '</div>';
      }
      if (joinUrl) {
        html += '<div style="text-align:center"><a class="cvdir-join" href="' + esc(joinUrl) +
          '" target="_blank" rel="noopener">' + esc(t.join) + '</a></div>';
      }
      body.innerHTML = html;

      var prev = body.querySelector('[data-cvdir-prev]');
      var next = body.querySelector('[data-cvdir-next]');
      if (prev) prev.addEventListener('click', function () { state.page--; load(true); });
      if (next) next.addEventListener('click', function () { state.page++; load(true); });
    }

    function load(scroll) {
      api('/public/members', { page: state.page, limit: limit, search: state.search, sector: state.sector })
        .then(function (r) {
          if (!r || !r.success) throw new Error((r && r.error) || 'load failed');
          render(r.data);
          if (scroll && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        })
        .catch(function (e) {
          body.innerHTML = '<div class="cvdir-msg">' + esc(t.error) + '</div>';
          if (window.console) console.warn('[chamber-directory]', e && e.message);
        });
    }

    injectStyles();
    if (showSearch) {
      api('/public/members/facets', {})
        .then(function (r) { buildBar(r && r.success ? r.data.sectors : []); })
        .catch(function () { buildBar([]); })
        .then(load);
    } else {
      el.innerHTML = '';
      el.appendChild(body);
      load();
    }
  }

  function boot() {
    var nodes = document.querySelectorAll('[data-cv-directory]');
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i].getAttribute('data-cvdir-ready')) {
        nodes[i].setAttribute('data-cvdir-ready', '1');
        Directory(nodes[i]);
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Re-scan for containers injected later (page builders, AJAX tabs).
  window.CVChamberDirectory = { refresh: boot };
})();
