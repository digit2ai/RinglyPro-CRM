/* Lawn Co-Pilot portal — the data layer.
 *
 * Wired to the live API from the first commit. There is no mock mode and no
 * hardcoded demo numbers anywhere in this file (the Planea lesson: a portal
 * that ships static has to be rewired later, and looks broken until it is).
 */
(function () {
  'use strict';

  var API = '/lawncopilot/api/v1/me';

  function req(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 401) { window.location.href = '/lawncopilot/login'; throw new Error('unauth'); }
      return r.json();
    });
  }

  var LC = {
    get: function (p) { return req('GET', p); },
    post: function (p, b) { return req('POST', p, b || {}); },
    patch: function (p, b) { return req('PATCH', p, b || {}); },
    del: function (p) { return req('DELETE', p); },

    dashboard: function () { return req('GET', '/dashboard'); },
    property: function () { return req('GET', '/property'); },
    schedule: function () { return req('GET', '/schedule'); },
    history: function () { return req('GET', '/history'); },
    invoices: function () { return req('GET', '/invoices'); },
    messages: function () { return req('GET', '/messages'); },
    paymentMethods: function () { return req('GET', '/payment-methods'); },
    availability: function () { return req('GET', '/availability'); },

    money: function (cents) { return '$' + (Number(cents || 0) / 100).toFixed(2); },
    num: function (v) { return Number(v || 0).toLocaleString('en-US'); },
    date: function (d) {
      if (!d) return '';
      var dt = new Date(String(d).length === 10 ? d + 'T12:00:00' : d);
      if (isNaN(dt)) return String(d);
      return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    },
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    empty: function (msg) { return '<div class="empty">' + LC.esc(msg) + '</div>'; },

    /* Shared property map renderer — same projection as the landing orb. */
    drawMap: function (node, property, geometry) {
      if (!node) return;
      node.innerHTML = '';
      if (property && property.imagery_url) {
        var img = document.createElement('img');
        img.src = property.imagery_url;
        img.alt = 'Satellite view of ' + (property.address || 'your property');
        img.loading = 'lazy';
        node.appendChild(img);
      }
      if (!geometry) return;
      var parcel = geometry.parcel_geojson, building = geometry.building_geojson;
      var pts = [];
      [parcel, building].forEach(function (poly) {
        if (poly && poly.coordinates && poly.coordinates[0]) {
          poly.coordinates[0].forEach(function (c) { pts.push(c); });
        }
      });
      if (!pts.length) return;
      var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
      var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
      var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
      var px = (maxX - minX) * 0.18 || 0.0002, py = (maxY - minY) * 0.18 || 0.0002;
      minX -= px; maxX += px; minY -= py; maxY += py;
      function pr(c) {
        return (((c[0] - minX) / (maxX - minX)) * 100).toFixed(2) + ',' +
               (100 - ((c[1] - minY) / (maxY - minY)) * 100).toFixed(2);
      }
      var svg = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">';
      if (parcel && parcel.coordinates) {
        svg += '<polygon points="' + parcel.coordinates[0].map(pr).join(' ') +
          '" fill="rgba(34,197,94,.26)" stroke="#f59e0b" stroke-width="0.7" vector-effect="non-scaling-stroke"/>';
      }
      if (building && building.coordinates) {
        svg += '<polygon points="' + building.coordinates[0].map(pr).join(' ') +
          '" fill="rgba(148,163,184,.85)" stroke="#64748b" stroke-width="0.5" vector-effect="non-scaling-stroke"/>';
      }
      node.insertAdjacentHTML('beforeend', svg + '</svg>');
    },

    /* The resident assistant — same crew, already knows who you are. */
    assistant: function () {
      var fab = document.querySelector('.fab');
      var box = document.querySelector('.asst');
      if (!fab || !box) return;
      var log = box.querySelector('.asst__log');
      var input = box.querySelector('input');
      fab.addEventListener('click', function () {
        box.classList.toggle('is-open');
        if (box.classList.contains('is-open')) input.focus();
      });
      input.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var t = input.value.trim();
        if (!t) return;
        input.value = '';
        log.insertAdjacentHTML('beforeend', '<div class="u">' + LC.esc(t) + '</div>');
        log.scrollTop = log.scrollHeight;
        LC.post('/assistant', { text: t }).then(function (r) {
          log.insertAdjacentHTML('beforeend', '<div class="a">' + LC.esc(r.reply || '...') + '</div>');
          log.scrollTop = log.scrollHeight;
        });
      });
    },

    tabs: function (active) {
      var items = [
        ['inicio', 'Home', 'M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z'],
        ['calendario', 'Schedule', 'M3 6h18M3 6v14h18V6M8 3v4M16 3v4'],
        ['mi-propiedad', 'Property', 'M4 20V9l8-6 8 6v11M9 20v-6h6v6'],
        ['facturacion', 'Billing', 'M3 7h18v11H3zM3 11h18'],
        ['mensajes', 'Messages', 'M21 15a2 2 0 01-2 2H8l-5 4V5a2 2 0 012-2h14a2 2 0 012 2z']
      ];
      return '<nav class="tabs">' + items.map(function (i) {
        return '<a href="/lawncopilot/portal/' + i[0] + '"' + (i[0] === active ? ' class="is-on"' : '') + '>' +
          '<svg viewBox="0 0 24 24"><path d="' + i[2] + '"/></svg>' + i[1] + '</a>';
      }).join('') + '</nav>';
    },

    shell: function (activeTab) {
      var t = document.getElementById('tabs');
      if (t) t.outerHTML = LC.tabs(activeTab);
      LC.assistant();
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/lawncopilot/portal/sw.js').catch(function () {});
      }
    }
  };

  window.LC = LC;
})();
