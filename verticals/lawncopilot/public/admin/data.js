/* Lawn Co-Pilot admin — data layer. Live API only, no mock values. */
(function () {
  'use strict';
  /* The app is served under TWO shapes and the slug must resolve in both:
   *   aiagent.ringlypro.com/lawncopilot/<slug>/admin   (path-mounted)
   *   lawncopilot.com/<slug>/admin                     (custom domain, root)
   * Assuming the /lawncopilot prefix left SLUG empty on the custom domain, and
   * the resulting '/lawncopilot//api/...' got its prefix stripped down to
   * '//api/...' — a protocol-relative URL the browser resolved as host "api".
   * That is what made every admin call fail with ERR_NAME_NOT_RESOLVED. */
  var PATH = location.pathname;
  var PREFIX = /^\/lawncopilot(\/|$)/i.test(PATH) ? '/lawncopilot' : '';
  var SLUG = (PATH.slice(PREFIX.length).match(/^\/([a-z0-9_-]+)/i) || [])[1] || '';
  var BASE = PREFIX + '/' + SLUG;          // e.g. '/orbup' or '/lawncopilot/orbup'
  var API = BASE + '/api/v1/admin';

  function req(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 401) { window.location.href = BASE + '/admin/login'; throw new Error('unauth'); }
      return r.json();
    });
  }

  var A = {
    // Pages build their own links from these — never hardcode /lawncopilot,
    // it does not exist on the custom domain.
    slug: SLUG,
    base: BASE,
    get: function (p) { return req('GET', p); },
    post: function (p, b) { return req('POST', p, b || {}); },
    patch: function (p, b) { return req('PATCH', p, b || {}); },
    del: function (p) { return req('DELETE', p); },

    money: function (c) { return '$' + (Number(c || 0) / 100).toFixed(2); },
    num: function (v) { return Number(v || 0).toLocaleString('en-US'); },
    date: function (d) {
      if (!d) return '';
      var dt = new Date(String(d).length === 10 ? d + 'T12:00:00' : d);
      return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    },
    time: function (d) {
      if (!d) return '';
      var dt = new Date(d);
      return isNaN(dt) ? '' : dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    },
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    empty: function (m) { return '<div class="empty">' + A.esc(m) + '</div>'; },

    /* ── Navigation ────────────────────────────────────────────────────────
       ONE source of truth for both shells. The left rail (desktop) shows every
       function grouped; the bottom bar (phone) shows the five that belong under
       a thumb. `primary: true` marks the ones that appear in both. */
    NAV: [
      { group: 'Operations', items: [
        { id: 'inicio', label: 'Today', primary: true, icon: 'M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z' },
        { id: 'despacho', label: 'Dispatch', primary: true, icon: 'M3 6h18M3 6v14h18V6M8 3v4M16 3v4' },
        { id: 'leads', label: 'Leads', primary: true, icon: 'M16 21v-2a4 4 0 00-8 0v2M12 11a4 4 0 100-8 4 4 0 000 8z' },
        { id: 'mediciones', label: 'Measure', primary: true, icon: 'M4 20V9l8-6 8 6v11M9 20v-6h6v6' }
      ]},
      { group: 'Your AI staff', items: [
        { id: 'ai-staff', label: 'AI Staff', primary: true, icon: 'M12 2a5 5 0 015 5v3a5 5 0 01-10 0V7a5 5 0 015-5zM4 21a8 8 0 0116 0' }
      ]},
      { group: 'Business', items: [
        { id: 'billing', label: 'Plan & billing', icon: 'M3 7h18v11H3zM3 11h18' },
        { id: 'google-listing', label: 'Get on Google', icon: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3a15 15 0 010 18a15 15 0 010-18' }
      ]}
    ],

    /* Bottom bar — phones only. */
    tabs: function (active) {
      var items = [];
      A.NAV.forEach(function (g) {
        g.items.forEach(function (i) { if (i.primary) items.push(i); });
      });
      return '<nav class="tabs">' + items.map(function (i) {
        return '<a href="' + BASE + '/admin/' + i.id + '"' + (i.id === active ? ' class="is-on"' : '') + '>' +
          '<svg viewBox="0 0 24 24"><path d="' + i.icon + '"/></svg>' + i.label + '</a>';
      }).join('') + '</nav>';
    },

    /* Left rail — desktop. Every function, grouped. */
    sidenav: function (active) {
      var html = '<aside class="sidenav">' +
        '<div class="sidenav__brand">' +
          '<img src="/lawncopilot/logo.png" alt="Lawn Co-Pilot" width="112" height="43"></div>' +
        '<div class="sidenav__co" id="sideCo">Your company<span>Office</span></div>' +
        '<div class="sidenav__scroll">';
      A.NAV.forEach(function (g) {
        html += '<div class="sidenav__group">' + A.esc(g.group) + '</div>';
        g.items.forEach(function (i) {
          html += '<a href="' + BASE + '/admin/' + i.id + '"' + (i.id === active ? ' class="is-on"' : '') + '>' +
            '<svg viewBox="0 0 24 24"><path d="' + i.icon + '"/></svg>' + A.esc(i.label) + '</a>';
        });
      });
      html += '</div>' +
        '<div class="sidenav__foot">' +
          '<div class="sidenav__who" id="sideWho"><b>&nbsp;</b><span></span></div>' +
          '<button class="sidenav__out" id="sideOut" type="button">Sign out</button>' +
        '</div></aside>';
      return html;
    },

    shell: function (active) {
      var t = document.getElementById('tabs');
      if (t) t.outerHTML = A.tabs(active);
      if (!document.querySelector('.sidenav')) {
        document.body.insertAdjacentHTML('afterbegin', A.sidenav(active));
      }

      var out = document.getElementById('sideOut');
      if (out) {
        out.addEventListener('click', function () {
          fetch(BASE + '/api/v1/auth/staff/logout', { method: 'POST', credentials: 'same-origin' })
            .then(function () { window.location.href = BASE + '/admin/login'; })
            .catch(function () { window.location.href = BASE + '/admin/login'; });
        });
      }

      fetch(BASE + '/api/v1/auth/staff/me', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (r) {
          if (!r.success || !r.user) return;
          var name = r.user.name || r.user.email || '';
          var w = document.getElementById('who');
          if (w) w.textContent = name + ' (' + r.user.role + ')';
          var sw = document.getElementById('sideWho');
          if (sw) sw.innerHTML = '<b>' + A.esc(name) + '</b><span>' + A.esc(r.user.role) + '</span>';

          var co = document.getElementById('sideCo');
          if (co && r.company && r.company.name) {
            co.innerHTML = A.esc(r.company.name) + '<span>Office</span>';
          }
        })
        .catch(function () { /* the rail still navigates without a name */ });
    }
  };

  window.A = A;
})();
