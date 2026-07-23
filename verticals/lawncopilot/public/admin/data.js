/* Lawn Co-Pilot admin — data layer. Live API only, no mock values. */
(function () {
  'use strict';
  var API = '/lawncopilot/api/v1/admin';

  function req(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 401) { window.location.href = '/lawncopilot/admin/login'; throw new Error('unauth'); }
      return r.json();
    });
  }

  var A = {
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

    tabs: function (active) {
      var items = [
        ['inicio', 'Today', 'M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z'],
        ['leads', 'Leads', 'M16 21v-2a4 4 0 00-8 0v2M12 11a4 4 0 100-8 4 4 0 000 8z'],
        ['despacho', 'Dispatch', 'M3 6h18M3 6v14h18V6M8 3v4M16 3v4'],
        ['mediciones', 'Measure', 'M4 20V9l8-6 8 6v11M9 20v-6h6v6'],
        ['ai-staff', 'AI Staff', 'M12 2a5 5 0 015 5v3a5 5 0 01-10 0V7a5 5 0 015-5zM4 21a8 8 0 0116 0']
      ];
      return '<nav class="tabs">' + items.map(function (i) {
        return '<a href="/lawncopilot/admin/' + i[0] + '"' + (i[0] === active ? ' class="is-on"' : '') + '>' +
          '<svg viewBox="0 0 24 24"><path d="' + i[2] + '"/></svg>' + i[1] + '</a>';
      }).join('') + '</nav>';
    },

    shell: function (active) {
      var t = document.getElementById('tabs');
      if (t) t.outerHTML = A.tabs(active);
      fetch('/lawncopilot/api/v1/auth/staff/me', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (r) {
          var w = document.getElementById('who');
          if (w && r.success) w.textContent = r.user.name + ' (' + r.user.role + ')';
        });
    }
  };

  window.A = A;
})();
