// public/app.js — dashboard renderer. Vanilla, no framework, no CDN.
'use strict';

(function () {
  var BASE = window.location.pathname.replace(/\/(index\.html)?$/, '');
  var API = BASE + '/api/v1';

  var $ = function (id) { return document.getElementById(id); };
  var statusEl = $('status');

  // Colour by operational layer — shelf/store/upstream keep one identity across
  // the bars, the split meter and the table pills.
  var LAYER_COLOR = { shelf: '#22d3ee', store: '#6a4bff', upstream: '#f59e0b' };

  function usd(n) {
    n = parseFloat(n) || 0;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function usd0(n) {
    n = parseFloat(n) || 0;
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function setStatus(msg) { statusEl.textContent = msg; }

  // ---- MOTIVATION: the stat tiles -----------------------------------------
  function renderTiles(d) {
    // Rate is graded against the worldwide 8.3% average from the research.
    var rate = parseFloat(d.oos_rate) || 0;
    var bench = (d.benchmarks && d.benchmarks.worldwide_oos_rate_pct) || 8.3;
    var rateClass = rate <= bench * 0.75 ? 'green' : (rate <= bench * 1.25 ? 'amber' : 'red');

    var tiles = [
      { k: 'OOS rate', v: rate.toFixed(1) + '%', c: rateClass,
        s: d.oos_count + ' of ' + d.total_skus + ' active SKUs · worldwide avg ' + bench + '%' },
      { k: 'Lost sales today', v: usd0(d.lost_sales_usd), c: 'red',
        s: usd0(d.annualized_lost_sales_usd) + ' annualized run-rate' },
      { k: 'Lost gross profit', v: usd0(d.lost_gross_profit_usd), c: 'red',
        s: usd0(d.annualized_lost_gross_profit_usd) + ' annualized' },
      { k: 'True retailer loss', v: usd0(d.net_retailer_loss_usd), c: 'amber',
        s: 'Shoppers who left or bought nothing (40%)' },
      { k: 'Recoverable', v: usd0(d.recoverable_usd), c: 'green',
        s: 'Delayed purchases, if restocked fast (15%)' },
      { k: 'Stock in back room', v: String(d.on_shelf_stockout_count || 0), c: 'cyan',
        s: 'On hand > 0 but the facing was empty' }
    ];

    $('tiles').innerHTML = tiles.map(function (t) {
      return '<div class="tile"><div class="k">' + esc(t.k) + '</div>' +
        '<div class="v ' + t.c + '">' + esc(t.v) + '</div>' +
        '<div class="s">' + esc(t.s) + '</div></div>';
    }).join('');
  }

  // ---- ATTRIBUTION: top root causes ---------------------------------------
  function renderCauses(d) {
    var mix = d.root_cause_mix || [];
    if (!mix.length) {
      $('causes').innerHTML = '<div class="empty">No classified events yet.</div>';
      return;
    }
    var max = mix[0].count || 1;
    // Top 3 is the contract; the rest render dimmed beneath so nothing hides.
    $('causes').innerHTML = mix.slice(0, 6).map(function (c, i) {
      var w = Math.max(3, Math.round((c.count / max) * 100));
      var color = LAYER_COLOR[c.layer] || '#6a4bff';
      var dim = i >= 3 ? ';opacity:.55' : '';
      return '<div class="cause" style="' + dim.slice(1) + '">' +
        '<div class="cause-top"><div class="cause-name">' + esc(c.category) +
        '<span class="pill ' + esc(c.layer) + '">' + esc(c.layer) + '</span></div>' +
        '<div class="cause-n">' + c.count + ' · ' + c.pct + '%</div></div>' +
        '<div class="bar"><i style="width:' + w + '%;background:' + color + '"></i></div>' +
        (i < 3 && c.action ? '<div class="cause-act">' + esc(c.action) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  // ---- Store vs shelf split ------------------------------------------------
  function renderSplit(d) {
    var lm = d.layer_mix || { shelf: 0, store: 0, upstream: 0, in_store_pct: 0 };
    var total = (lm.shelf + lm.store + lm.upstream) || 1;
    var pct = function (n) { return (n / total) * 100; };

    var segs = [
      { label: 'Shelf execution', n: lm.shelf, c: LAYER_COLOR.shelf },
      { label: 'Store practice', n: lm.store, c: LAYER_COLOR.store },
      { label: 'Upstream / HQ', n: lm.upstream, c: LAYER_COLOR.upstream }
    ];

    var inStore = lm.in_store_pct || 0;
    var benchmark = lm.benchmark_in_store_pct || 72.5;
    // Reading far below the benchmark usually means thin input data, not an
    // unusually well-run store — say so rather than letting it read as praise.
    var verdict = inStore >= 60
      ? 'In line with the research: most stockouts are fixable inside this building.'
      : 'Below the ' + benchmark + '% benchmark — usually a sign the feed is missing order, delivery or planogram columns rather than genuinely upstream-driven stockouts.';

    $('split').innerHTML =
      '<div style="font-size:26px;font-weight:700;letter-spacing:-1px;margin-bottom:2px">' +
        inStore.toFixed(1) + '%</div>' +
      '<div style="font-size:11.5px;color:var(--mut);margin-bottom:10px">controllable inside the store</div>' +
      '<div class="split">' + segs.map(function (s) {
        return '<i style="width:' + pct(s.n) + '%;background:' + s.c + '"></i>';
      }).join('') + '</div>' +
      '<div class="legend">' + segs.map(function (s) {
        return '<span><i class="dot" style="background:' + s.c + '"></i>' + esc(s.label) + ' ' + s.n + '</span>';
      }).join('') + '</div>' +
      '<div class="bench"><b>Benchmark ' + benchmark + '%</b> — Gruen &amp; Corsten find 70&ndash;75% of ' +
      'out-of-stocks originate at store level.<br>' + esc(verdict) + '</div>';
  }

  // ---- ACTION: the ranked worklist ----------------------------------------
  function renderTable(d) {
    var events = d.events || [];
    var body = $('rows');
    var empty = $('tblEmpty');

    if (!events.length) {
      body.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    body.innerHTML = events.slice(0, 100).map(function (e) {
      return '<tr>' +
        '<td><div class="sku">' + esc(e.sku) + '</div>' +
          '<div class="muted">' + esc(e.product_name || '') + '</div></td>' +
        '<td class="muted">' + esc(e.store_id) + '</td>' +
        '<td class="num">' + usd(e.lost_sales_usd) + '</td>' +
        '<td class="num">' + usd(e.lost_gross_profit_usd) + '</td>' +
        '<td class="num">' + (parseFloat(e.oos_days) || 0) + '</td>' +
        '<td>' + esc(e.root_cause) +
          '<span class="pill ' + esc(e.layer) + '">' + esc(e.layer) + '</span>' +
          '<div class="why">' + esc(e.why || '') + '</div></td>' +
        '</tr>';
    }).join('');
  }

  function render(d) {
    renderTiles(d);
    renderCauses(d);
    renderSplit(d);
    renderTable(d);
    var src = (d.benchmarks && d.benchmarks.source) || '';
    $('ver').textContent = d.demo ? 'demo data' : 'live data';
    setStatus((d.demo ? 'Demo day — nothing persisted. ' : '') +
      'Updated ' + new Date(d.generated_at).toLocaleTimeString() +
      (d.latest_batch ? ' · batch ' + String(d.latest_batch.batch_id).slice(0, 8) : ''));
    if (src) $('ver').title = src;
  }

  function load(url, label) {
    setStatus(label);
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(render)
      .catch(function (err) {
        setStatus('Could not load: ' + err.message);
      });
  }

  function currentStore() {
    var v = $('storeSel').value;
    return v ? '?store_id=' + encodeURIComponent(v) : '';
  }

  function loadLive() { return load(API + '/dashboard' + currentStore(), 'Loading…'); }
  function loadDemo() { return load(API + '/dashboard/demo', 'Loading demo day…'); }

  function loadStores() {
    return fetch(API + '/dashboard/stores')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var sel = $('storeSel');
        (d.stores || []).forEach(function (s) {
          if (!s) return;
          var o = document.createElement('option');
          o.value = s; o.textContent = s;
          sel.appendChild(o);
        });
      })
      .catch(function () { /* store picker is a convenience, never a blocker */ });
  }

  $('refresh').addEventListener('click', loadLive);
  $('demo').addEventListener('click', loadDemo);
  $('storeSel').addEventListener('change', loadLive);

  // Boot: show live data. If the tenant has ingested nothing yet, fall back to
  // the demo day so the page is never an empty shell on first visit.
  loadStores();
  fetch(API + '/dashboard')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.events || !d.events.length) return loadDemo();
      render(d);
    })
    .catch(function () { return loadDemo(); });
})();
