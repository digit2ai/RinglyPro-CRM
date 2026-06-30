// Vanilla JS — fetch summary/transactions (JWT), render, lang toggle.
// Token comes from ?token= in the URL or localStorage['token'] (CRM SSO mirror).
(function () {
  var BASE = location.pathname.replace(/\/(dashboard|privacy).*$/, '') || '';
  var I = window.__I18N || {};
  var LANG = window.__LANG || 'es';

  function getToken() {
    var u = new URLSearchParams(location.search);
    var t = u.get('token');
    if (t) { try { localStorage.setItem('token', t); } catch (e) {} return t; }
    try { return localStorage.getItem('token') || ''; } catch (e) { return ''; }
  }
  var TOKEN = getToken();

  function fmt(n) {
    return new Intl.NumberFormat(LANG === 'en' ? 'en-US' : 'es-CO',
      { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(Number(n) || 0);
  }
  function authHeaders(extra) {
    var h = extra || {};
    if (TOKEN) h['Authorization'] = 'Bearer ' + TOKEN;
    return h;
  }
  function typeLabel(t) { return I[t] || t; }

  function setNeedToken(show) {
    var el = document.getElementById('needToken');
    if (el) el.classList.toggle('hidden', !show);
  }

  function loadSummary() {
    return fetch(BASE + '/api/v1/summary', { headers: authHeaders() })
      .then(function (r) { if (r.status === 401) { setNeedToken(true); throw new Error('401'); } return r.json(); })
      .then(function (j) {
        setNeedToken(false);
        document.getElementById('s_sales').textContent = fmt(j.total_sales_usd);
        document.getElementById('s_purchases').textContent = fmt(j.total_purchases_usd);
        var m = document.getElementById('s_margin');
        m.textContent = fmt(j.gross_margin_usd);
        m.style.color = (Number(j.gross_margin_usd) >= 0) ? 'var(--green)' : 'var(--rose)';
        document.getElementById('s_net').textContent = fmt(j.net_position_usd);
      }).catch(function () {});
  }

  function loadTx() {
    return fetch(BASE + '/api/v1/transactions', { headers: authHeaders() })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        var rows = (j.data || []);
        var body = document.getElementById('txBody');
        var empty = document.getElementById('txEmpty');
        body.innerHTML = '';
        empty.style.display = rows.length ? 'none' : 'block';
        rows.forEach(function (r) {
          var tr = document.createElement('tr');
          tr.className = 'border-t';
          tr.style.borderColor = 'var(--line)';
          tr.innerHTML =
            '<td class="py-2">' + typeLabel(r.type) + '</td>' +
            '<td class="py-2 text-right fig">' + fmt(r.amount_usd) + '</td>' +
            '<td class="py-2">' + (r.counterparty ? escapeHtml(r.counterparty) : '—') + '</td>' +
            '<td class="py-2 text-xs" style="color:var(--mut)">' + (r.source || 'form') + '</td>';
          body.appendChild(tr);
        });
      }).catch(function () {});
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function refresh() { loadSummary(); loadTx(); }

  // manual form
  var txForm = document.getElementById('txForm');
  if (txForm) txForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var body = {
      type: document.getElementById('f_type').value,
      amount_usd: parseFloat(document.getElementById('f_amount').value || '0'),
      counterparty: document.getElementById('f_party').value || null
    };
    fetch(BASE + '/api/v1/transactions', { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) })
      .then(function (r) { if (r.status === 401) { setNeedToken(true); return; } document.getElementById('f_amount').value = ''; document.getElementById('f_party').value = ''; refresh(); });
  });

  // voice form
  var voiceForm = document.getElementById('voiceForm');
  if (voiceForm) voiceForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var transcript = document.getElementById('v_transcript').value.trim();
    if (!transcript) return;
    fetch(BASE + '/api/v1/voice', { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ transcript: transcript }) })
      .then(function (r) { if (r.status === 401) { setNeedToken(true); return null; } return r.json(); })
      .then(function (j) {
        if (!j) return;
        var p = j.parsed || {};
        document.getElementById('v_parsed').textContent = p.type ? ('→ ' + typeLabel(p.type) + ' · ' + fmt(p.amount_usd) + (p.counterparty ? ' · ' + p.counterparty : '')) : '';
        document.getElementById('v_transcript').value = '';
        refresh();
      });
  });

  // lang toggle
  var lt = document.getElementById('langToggle');
  if (lt) lt.addEventListener('click', function () {
    var next = LANG === 'en' ? 'es' : 'en';
    var u = new URLSearchParams(location.search); u.set('lang', next);
    location.search = u.toString();
  });

  refresh();
})();
