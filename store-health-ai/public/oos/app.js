// public/oos/app.js — chain dashboard with per-store drill-down.
// Vanilla, no framework, no CDN.
'use strict';

(function () {
  var API = '/aiastore/api/v1/oos';

  var $ = function (id) { return document.getElementById(id); };
  var LAYER_COLOR = { shelf: '#22d3ee', store: '#6a4bff', upstream: '#f59e0b' };

  // Currency symbols mirror lib/currency.js. Zero-decimal currencies are written
  // without cents, per their own conventions — showing "¥1,234.00" reads wrong.
  var SYMBOLS = { USD:'$', CAD:'C$', MXN:'MX$', EUR:'€', GBP:'£', AUD:'A$',
    BRL:'R$', COP:'COL$', CLP:'CLP$', ARS:'AR$', DOP:'RD$', JPY:'¥', PHP:'₱' };
  var ZERO_DEC = { JPY:1, CLP:1, COP:1 };

  // ISO-2 -> regional indicator flag. Purely decorative; falls back to the code.
  function flag(cc) {
    if (!cc || cc.length !== 2) return '';
    var A = 0x1F1E6, base = 'A'.charCodeAt(0);
    return String.fromCodePoint(A + cc.toUpperCase().charCodeAt(0) - base) +
           String.fromCodePoint(A + cc.toUpperCase().charCodeAt(1) - base);
  }

  var COUNTRY_NAMES = { US:'United States', CA:'Canada', MX:'Mexico', GB:'United Kingdom',
    DE:'Germany', FR:'France', ES:'Spain', AU:'Australia', BR:'Brazil', CO:'Colombia',
    CL:'Chile', AR:'Argentina', DO:'Dominican Republic', JP:'Japan', PH:'Philippines' };

  function money(n, ccy) {
    ccy = (ccy || 'USD').toUpperCase();
    var d = ZERO_DEC[ccy] ? 0 : 2;
    var v = parseFloat(n) || 0;
    return (SYMBOLS[ccy] || ccy + ' ') +
      v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function money0(n, ccy) {
    ccy = (ccy || 'USD').toUpperCase();
    return (SYMBOLS[ccy] || ccy + ' ') + Math.round(parseFloat(n) || 0).toLocaleString('en-US');
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function setStatus(m) { $('status').textContent = m; }

  function scoreChip(score) {
    var cls = score >= 70 ? 'good' : (score >= 40 ? 'mid' : 'bad');
    return '<span class="score ' + cls + '">' + score + '</span>';
  }

  // ---- state -------------------------------------------------------------
  var directory = { stores: [], countries: [], regions: [], districts: [], reporting_currency: 'USD' };
  var currentStore = null;   // null = chain view
  var currentCountry = '';

  // ---- shared panels (used by BOTH chain and store views) -----------------
  function renderCauses(mix, scopeLabel) {
    $('causeScope').textContent = scopeLabel || '';
    if (!mix || !mix.length) {
      $('causes').innerHTML = '<div class="empty">No classified events.</div>';
      return;
    }
    var max = mix[0].count || 1;
    $('causes').innerHTML = mix.slice(0, 6).map(function (c, i) {
      var w = Math.max(3, Math.round((c.count / max) * 100));
      var color = LAYER_COLOR[c.layer] || '#6a4bff';
      return '<div class="cause"' + (i >= 3 ? ' style="opacity:.55"' : '') + '>' +
        '<div class="cause-top"><div class="cause-name">' + esc(c.category) +
        '<span class="pill ' + esc(c.layer) + '">' + esc(c.layer) + '</span></div>' +
        '<div class="cause-n">' + c.count + ' &middot; ' + c.pct + '%</div></div>' +
        '<div class="bar"><i style="width:' + w + '%;background:' + color + '"></i></div>' +
        (i < 3 && c.action ? '<div class="cause-act">' + esc(c.action) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  function renderSplit(lm) {
    if (!lm) { $('split').innerHTML = '<div class="empty">No data.</div>'; return; }
    var total = (lm.shelf + lm.store + lm.upstream) || 1;
    var segs = [
      { label: 'Shelf execution', n: lm.shelf || 0, c: LAYER_COLOR.shelf },
      { label: 'Store practice', n: lm.store || 0, c: LAYER_COLOR.store },
      { label: 'Upstream / HQ', n: lm.upstream || 0, c: LAYER_COLOR.upstream }
    ];
    var inStore = lm.in_store_pct || 0;
    var bench = lm.benchmark_in_store_pct || 72.5;
    var verdict = inStore >= 60
      ? 'In line with the research: most stockouts are fixable inside these buildings.'
      : 'Below the ' + bench + '% benchmark — usually a sign the feed is missing order, delivery or planogram columns rather than genuinely upstream-driven stockouts.';

    $('split').innerHTML =
      '<div style="font-size:25px;font-weight:700;letter-spacing:-1px">' + inStore.toFixed(1) + '%</div>' +
      '<div style="font-size:11px;color:var(--mut);margin-bottom:9px">controllable inside the store</div>' +
      '<div class="split">' + segs.map(function (s) {
        return '<i style="width:' + ((s.n / total) * 100) + '%;background:' + s.c + '"></i>'; }).join('') + '</div>' +
      '<div class="legend">' + segs.map(function (s) {
        return '<span><i class="dot" style="background:' + s.c + '"></i>' + esc(s.label) + ' ' + s.n + '</span>'; }).join('') + '</div>' +
      '<div class="bench"><b>Benchmark ' + bench + '%</b> — Gruen &amp; Corsten find 70&ndash;75% of ' +
      'out-of-stocks originate at store level.<br>' + esc(verdict) + '</div>';
  }

  function renderFxNote(d) {
    var el = $('fxNote');
    var bits = [];
    if (d.currencies_present && d.currencies_present.length > 1) {
      bits.push('This view spans ' + d.currencies_present.length + ' currencies (' +
        d.currencies_present.join(', ') + '). Totals and the league table are normalized to ' +
        (d.reporting_currency || 'USD') + ' at <b>configured</b> rates, not live market rates.');
    }
    if (d.is_estimated) {
      bits.push('Some stores have no per-SKU price on file; those dollar figures use org defaults and are estimates.');
    }
    if (d.demo) bits.push('<b>Generated preview.</b> ' + esc(d.note || ''));
    if (!bits.length) { el.classList.add('hidden'); return; }
    el.innerHTML = bits.join('<br>');
    el.classList.remove('hidden');
  }

  // ---- CHAIN VIEW --------------------------------------------------------
  function renderChain(d) {
    currentStore = null;
    $('chainView').classList.remove('hidden');
    $('storeView').classList.add('hidden');

    var ccy = d.reporting_currency || 'USD';
    $('repCcy').textContent = ccy;

    var rate = parseFloat(d.oos_rate) || 0;
    var bench = (d.benchmarks && d.benchmarks.worldwide_oos_rate_pct) || 8.3;
    var rateClass = rate <= bench * 0.75 ? 'green' : (rate <= bench * 1.25 ? 'amber' : 'red');

    $('tiles').innerHTML = [
      { k:'Stores reporting', v:String(d.store_count||0), c:'cyan',
        s:(d.by_country?d.by_country.length:0) + ' countries · ' + (d.currencies_present||['USD']).length + ' currencies' },
      { k:'Chain OOS rate', v:rate.toFixed(2)+'%', c:rateClass,
        s:(d.oos_count||0)+' of '+(d.total_skus||0)+' SKUs · world avg '+bench+'%' },
      { k:'Lost sales today', v:money0(d.lost_sales_usd,ccy), c:'red',
        s:money0(d.annualized_lost_sales_usd,ccy)+' annualized' },
      { k:'Lost gross profit', v:money0(d.lost_gross_profit_usd,ccy), c:'red',
        s:money0(d.annualized_lost_gross_profit_usd,ccy)+' annualized' },
      { k:'In-store causes', v:((d.layer_mix&&d.layer_mix.in_store_pct)||0)+'%', c:'amber',
        s:'benchmark 70-75%' },
      { k:'Chain OSA score', v:String(d.osa_score!=null?d.osa_score:'-'), c:
        (d.osa_score>=70?'green':(d.osa_score>=40?'amber':'red')), s:'100 = perfect shelf' }
    ].map(function (t) {
      return '<div class="tile"><div class="k">'+esc(t.k)+'</div><div class="v '+t.c+'">'+esc(t.v)+
        '</div><div class="s">'+esc(t.s)+'</div></div>'; }).join('');

    renderCauses(d.root_cause_mix, currentCountry ? '· ' + currentCountry : '· chain-wide');
    renderSplit(d.layer_mix);
    renderFxNote(d);

    // by country
    var byC = d.by_country || [];
    $('countryRows').innerHTML = byC.length ? byC.map(function (c, i) {
      return '<tr class="clickable" data-country="'+esc(c.key)+'">' +
        '<td class="rank">'+(i+1)+'</td>' +
        '<td><span class="flag">'+flag(c.key)+'</span> '+esc(COUNTRY_NAMES[c.key]||c.key)+
          ' <span class="muted">'+esc(c.currencies.join(', '))+'</span></td>' +
        '<td class="num">'+c.store_count+'</td>' +
        '<td class="num">'+c.oos_rate.toFixed(2)+'%</td>' +
        '<td class="num">'+money(c.lost_sales_usd,ccy)+'</td>' +
        '<td class="num muted">'+money0(c.annualized_lost_sales_usd,ccy)+'</td>' +
        '<td class="num">'+c.in_store_pct+'%</td>' +
        '<td class="num">'+scoreChip(c.osa_score)+'</td></tr>';
    }).join('') : '<tr><td colspan="8" class="muted" style="padding:18px">No countries reporting.</td></tr>';

    Array.prototype.forEach.call(document.querySelectorAll('#countryRows tr.clickable'), function (tr) {
      tr.addEventListener('click', function () {
        $('countrySel').value = tr.getAttribute('data-country');
        currentCountry = tr.getAttribute('data-country');
        loadChain();
      });
    });

    // store league table
    var stores = d.stores_by_impact || [];
    $('storeEmpty').classList.toggle('hidden', stores.length > 0);
    $('storeRows').innerHTML = stores.map(function (s, i) {
      var nativeCell = s.fx_converted
        ? '<span class="muted">'+money(s.native.lost_sales, s.native.currency)+'</span>'
        : '<span class="muted">&mdash;</span>';
      return '<tr class="clickable" data-store="'+s.store_id+'">' +
        '<td class="rank">'+(i+1)+'</td>' +
        '<td><b>'+esc(s.store_code)+'</b><div class="muted">'+esc(s.name||'')+'</div></td>' +
        '<td class="muted"><span class="flag">'+flag(s.country)+'</span> '+
          esc([s.city, s.state].filter(Boolean).join(', '))+'</td>' +
        '<td class="num">'+(parseFloat(s.oos_rate)||0).toFixed(2)+'%</td>' +
        '<td class="num">'+money(s.lost_sales_usd,ccy)+'</td>' +
        '<td class="num">'+nativeCell+'</td>' +
        '<td>'+esc(s.top_root_cause||'—')+
          (s.is_estimated?'<span class="pill flag">est</span>':'')+'</td>' +
        '<td class="num">'+scoreChip(s.osa_score)+'</td></tr>';
    }).join('');

    Array.prototype.forEach.call(document.querySelectorAll('#storeRows tr.clickable'), function (tr) {
      tr.addEventListener('click', function () {
        var id = tr.getAttribute('data-store');
        $('storeSel').value = id;
        loadStore(id);
      });
    });

    renderCrumbs();
    setStatus((d.demo ? 'Generated preview · ' : '') + 'Chain view · ' +
      (d.snapshot_date || '') + ' · updated ' + new Date().toLocaleTimeString());
  }

  // ---- STORE DRILL-DOWN --------------------------------------------------
  function renderStore(d) {
    currentStore = d.store_id;
    $('chainView').classList.add('hidden');
    $('storeView').classList.remove('hidden');

    var st = d.store || {};
    // Store figures stay in the STORE'S OWN currency — this view belongs to the
    // person who works that building, not to chain finance.
    var ccy = d.currency || 'USD';
    $('localCcy').textContent = ccy;

    var rate = parseFloat(d.oos_rate) || 0;
    var bench = (d.benchmarks && d.benchmarks.worldwide_oos_rate_pct) || 8.3;
    var rateClass = rate <= bench * 0.75 ? 'green' : (rate <= bench * 1.25 ? 'amber' : 'red');

    $('tiles').innerHTML = [
      { k:'Store OOS rate', v:rate.toFixed(2)+'%', c:rateClass,
        s:(d.oos_count||0)+' of '+(d.total_skus||0)+' SKUs · world avg '+bench+'%' },
      { k:'Lost sales today', v:money0(d.lost_sales_usd,ccy), c:'red',
        s:money0(d.annualized_lost_sales_usd,ccy)+' annualized' },
      { k:'Lost gross profit', v:money0(d.lost_gross_profit_usd,ccy), c:'red',
        s:money0(d.annualized_lost_gross_profit_usd,ccy)+' annualized' },
      { k:'True store loss', v:money0(d.net_retailer_loss_usd,ccy), c:'amber',
        s:'Shoppers who left or bought nothing (40%)' },
      { k:'Recoverable', v:money0(d.recoverable_usd,ccy), c:'green',
        s:'Delayed purchases, if restocked fast (15%)' },
      { k:'Stock in back room', v:String(d.on_shelf_stockout_count||0), c:'cyan',
        s:'On hand > 0 but the facing was empty' }
    ].map(function (t) {
      return '<div class="tile"><div class="k">'+esc(t.k)+'</div><div class="v '+t.c+'">'+esc(t.v)+
        '</div><div class="s">'+esc(t.s)+'</div></div>'; }).join('');

    renderCauses(d.root_cause_mix, '· ' + (st.store_code || 'store'));
    renderSplit(d.layer_mix);
    renderFxNote(d);

    var fxLine = (d.fx_rate_to_reporting && ccy !== d.reporting_currency)
      ? '<div class="muted" style="margin-top:8px;font-size:11.5px">Figures in ' + esc(ccy) +
        '. Chain rollups convert at ' + d.fx_rate_to_reporting + ' ' + esc(d.reporting_currency) +
        ' per 1 ' + esc(ccy) + ' (configured rate).</div>'
      : '';

    $('storeMeta').innerHTML =
      '<h2>' + esc(st.store_code || ('Store ' + d.store_id)) +
        '<span class="sub">' + esc(d.snapshot_date || '') + '</span></h2>' +
      '<div style="font-size:17px;font-weight:700;margin-bottom:4px">' + esc(st.name || '') + '</div>' +
      '<div class="muted" style="font-size:12.5px">' +
        '<span class="flag">' + flag(st.country) + '</span> ' +
        esc([st.address, st.city, st.state, st.country].filter(Boolean).join(' · ')) +
        (st.timezone ? ' · ' + esc(st.timezone) : '') +
      '</div>' +
      (st.manager_name ? '<div class="muted" style="font-size:12.5px;margin-top:4px">Manager: ' +
        esc(st.manager_name) + (st.manager_email ? ' · ' + esc(st.manager_email) : '') + '</div>' : '') +
      (d.estimation_note ? '<div class="cause-act" style="margin-top:9px">' + esc(d.estimation_note) + '</div>' : '') +
      fxLine;

    var events = d.events || [];
    $('eventRows').innerHTML = events.length ? events.slice(0, 200).map(function (e, i) {
      return '<tr>' +
        '<td class="rank">'+(i+1)+'</td>' +
        '<td><b>'+esc(e.sku)+'</b><div class="muted">'+esc(e.product_name||'')+'</div></td>' +
        '<td class="num">'+money(e.lost_sales_usd,ccy)+'</td>' +
        '<td class="num">'+money(e.lost_gross_profit_usd,ccy)+'</td>' +
        '<td class="num">'+(parseFloat(e.oos_days)||0)+'</td>' +
        '<td>'+esc(e.root_cause)+'<span class="pill '+esc(e.layer)+'">'+esc(e.layer)+'</span>' +
          '<div class="why">'+esc(e.why||'')+'</div>' +
          '<div class="why" style="color:var(--mut)">→ '+esc(e.action||'')+'</div></td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="6" class="muted" style="padding:18px">No stockouts for this store and date.</td></tr>';

    renderCrumbs(st);
    setStatus('Store view · ' + esc(st.store_code || d.store_id) + ' · updated ' + new Date().toLocaleTimeString());
  }

  function renderCrumbs(store) {
    var parts = ['<a id="crumbChain">Chain</a>'];
    if (currentCountry) {
      parts.push('<span class="sep">/</span>');
      parts.push(store ? '<a id="crumbCountry">' + flag(currentCountry) + ' ' +
        esc(COUNTRY_NAMES[currentCountry] || currentCountry) + '</a>'
        : '<span class="here">' + flag(currentCountry) + ' ' +
          esc(COUNTRY_NAMES[currentCountry] || currentCountry) + '</span>');
    }
    if (store) {
      parts.push('<span class="sep">/</span>');
      parts.push('<span class="here">' + esc(store.store_code || '') + '</span>');
    }
    $('crumbs').innerHTML = parts.join(' ');

    var c = $('crumbChain');
    if (c) c.addEventListener('click', function () {
      currentCountry = ''; $('countrySel').value = ''; $('storeSel').value = ''; loadChain();
    });
    var cc = $('crumbCountry');
    if (cc) cc.addEventListener('click', function () { $('storeSel').value = ''; loadChain(); });
  }

  // ---- loaders -----------------------------------------------------------
  function fetchJson(url) {
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        if (j && j.success === false) throw new Error((j.error && j.error.message) || j.error || 'request failed');
        return j.data !== undefined ? j.data : j;
      });
  }

  function loadChain() {
    setStatus('Loading chain…');
    var qs = currentCountry ? '?country=' + encodeURIComponent(currentCountry) : '';
    // Real data first; fall back to the generated preview so the page is never
    // an empty shell before a POS feed is wired.
    return fetchJson(API + '/chain' + qs)
      .then(function (d) {
        if (!d.store_count) return fetchJson(API + '/chain/demo' + qs).then(renderChain);
        renderChain(d);
      })
      .catch(function () {
        return fetchJson(API + '/chain/demo' + qs).then(renderChain)
          .catch(function (e) { setStatus('Could not load: ' + e.message); });
      });
  }

  function loadStore(id) {
    setStatus('Loading store…');
    return fetchJson(API + '/store/' + encodeURIComponent(id))
      .then(renderStore)
      .catch(function (e) {
        setStatus('No data for that store on this date (' + e.message + '). Showing chain view.');
        $('storeSel').value = '';
        return loadChain();
      });
  }

  function loadDirectory() {
    return fetchJson(API + '/stores')
      .then(function (d) {
        directory = d;
        var cs = $('countrySel');
        (d.countries || []).forEach(function (c) {
          var o = document.createElement('option');
          o.value = c; o.textContent = flag(c) + ' ' + (COUNTRY_NAMES[c] || c);
          cs.appendChild(o);
        });
        var ss = $('storeSel');
        (d.stores || []).forEach(function (s) {
          var o = document.createElement('option');
          o.value = s.id;
          o.textContent = s.store_code + ' — ' + (s.name || '') + ' (' + (s.country || 'US') + ')';
          o.setAttribute('data-country', s.country || 'US');
          ss.appendChild(o);
        });
      })
      .catch(function () { /* pickers are a convenience, never a blocker */ });
  }

  // ---- wiring ------------------------------------------------------------
  $('countrySel').addEventListener('change', function () {
    currentCountry = this.value;
    // Keep the store picker consistent with the country filter.
    var opts = $('storeSel').options;
    for (var i = 1; i < opts.length; i++) {
      var oc = opts[i].getAttribute('data-country');
      opts[i].hidden = !!(currentCountry && oc !== currentCountry);
    }
    $('storeSel').value = '';
    loadChain();
  });

  $('storeSel').addEventListener('change', function () {
    if (this.value) loadStore(this.value); else loadChain();
  });

  $('refresh').addEventListener('click', function () {
    if (currentStore) loadStore(currentStore); else loadChain();
  });

  loadDirectory().then(loadChain);
})();
