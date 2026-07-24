/* Lawn Co-Pilot portal — the data layer.
 *
 * Wired to the live API from the first commit. There is no mock mode and no
 * hardcoded demo numbers anywhere in this file (the Planea lesson: a portal
 * that ships static has to be rewired later, and looks broken until it is).
 */
(function () {
  'use strict';

  var SLUG = (location.pathname.match(/^\/lawncopilot\/([a-z0-9_-]+)/i) || [])[1] || '';
  var API = '/lawncopilot/' + SLUG + '/api/v1/me';

  function req(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 401) { window.location.href = '/lawncopilot/' + SLUG + '/login'; throw new Error('unauth'); }
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

    /**
     * Draw the lot to scale from the measurement. Used when there is no
     * satellite imagery, so the customer always sees the shape of what they
     * are paying for rather than an empty box.
     */
    drawDiagram: function (node, p) {
      var lot = Math.max(Number(p.lot_sqft) || 0, 1);
      var house = Number(p.building_footprint_sqft) || 0;
      var excl = Number(p.excluded_sqft) || 0;
      var pad = 9, lw = 100 - pad * 2, lh = 100 - pad * 2, lotArea = lw * lh;
      var hArea = (house / lot) * lotArea, eArea = (excl / lot) * lotArea;

      var hw = Math.min(lw * 0.62, Math.sqrt(hArea * 1.7));
      var hh = hArea / Math.max(hw, 1);
      if (hh > lh * 0.55) { hh = lh * 0.55; hw = hArea / hh; }
      var hx = pad + (lw - hw) / 2, hy = pad + lh * 0.12;

      var dw = Math.min(lw * 0.3, Math.max(eArea / Math.max(lh * 0.5, 1), lw * 0.13));
      var dh = Math.min(lh - (hy + hh) + 2, Math.max(eArea / Math.max(dw, 1), lh * 0.2));
      var dx = pad + lw * 0.14, dy = pad + lh - dh;

      var s = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" ' +
        'aria-label="Scaled diagram of your lot, house, driveway and serviced lawn">';
      s += '<rect x="' + pad + '" y="' + pad + '" width="' + lw + '" height="' + lh +
        '" rx="1.5" fill="rgba(61,156,85,.42)" stroke="#f59e0b" stroke-width="2" vector-effect="non-scaling-stroke"/>';
      for (var i = 0; i < 9; i++) {
        s += '<rect x="' + pad + '" y="' + (pad + (lh / 9) * i).toFixed(2) + '" width="' + lw +
          '" height="' + (lh / 18).toFixed(2) + '" fill="rgba(255,255,255,.035)"/>';
      }
      if (excl > 0) {
        s += '<rect x="' + dx.toFixed(2) + '" y="' + dy.toFixed(2) + '" width="' + dw.toFixed(2) +
          '" height="' + dh.toFixed(2) + '" rx="0.8" fill="rgba(148,163,184,.55)" stroke="rgba(203,213,225,.5)" ' +
          'stroke-width="1" vector-effect="non-scaling-stroke"/>';
      }
      if (house > 0) {
        s += '<rect x="' + hx.toFixed(2) + '" y="' + hy.toFixed(2) + '" width="' + hw.toFixed(2) +
          '" height="' + hh.toFixed(2) + '" rx="1" fill="rgba(148,163,184,.92)" stroke="#64748b" ' +
          'stroke-width="1.5" vector-effect="non-scaling-stroke"/>';
      }
      node.insertAdjacentHTML('beforeend', s + '</svg>');
    },

    /* Shared property map renderer — same projection as the landing orb. */
    drawMap: function (node, property, geometry) {
      if (!node) return;
      node.innerHTML = '';
      var p = property || {};
      if (p.imagery_url) {
        var img = document.createElement('img');
        img.src = p.imagery_url;
        img.alt = 'Satellite view of ' + (p.address || 'your property');
        img.loading = 'lazy';
        img.onerror = function () { node.innerHTML = ''; LC.drawDiagram(node, p); };
        node.appendChild(img);
      } else {
        LC.drawDiagram(node, p);
      }
      node.insertAdjacentHTML('beforeend',
        '<span class="propmap__tag">' + (p.imagery_url ? 'Satellite view' : 'Scaled property diagram') + '</span>' +
        '<div class="propmap__figure"><b>' +
        Number(p.approved_sqft || p.effective_sqft || p.serviceable_sqft || 0).toLocaleString() +
        '</b><span>sq ft of lawn</span></div>');
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
        return '<a href="/lawncopilot/' + SLUG + '/portal/' + i[0] + '"' + (i[0] === active ? ' class="is-on"' : '') + '>' +
          '<svg viewBox="0 0 24 24"><path d="' + i[2] + '"/></svg>' + i[1] + '</a>';
      }).join('') + '</nav>';
    },

    shell: function (activeTab) {
      var t = document.getElementById('tabs');
      if (t) t.outerHTML = LC.tabs(activeTab);
      LC.assistant();
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/lawncopilot/portal/sw.js', { scope: '/lawncopilot/' }).catch(function () {});
      }
    }
  };

  window.LC = LC;
})();
