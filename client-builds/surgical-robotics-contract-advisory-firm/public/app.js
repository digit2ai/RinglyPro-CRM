/* =====================================================
   RoboNegotiate — the five tabs.

   THIS FILE CONTAINS NO BUSINESS NUMBERS. Defaults, benchmarks, provenance,
   watchouts and every projected figure arrive from the server. The only numeric
   literals here are UI slider bounds and layout geometry, which are properties
   of the interface rather than claims about the market.

   Re-render is total: one model response repaints all five tabs from the same
   object, so the dashboard and the scenario table cannot disagree the way the
   teaser simulator's did.
   ===================================================== */

'use strict';

(function () {
  var BASE = document.body.getAttribute('data-base') || '';
  var VERSION = document.body.getAttribute('data-version') || '';
  var MODEL_VERSION = document.body.getAttribute('data-model-version') || '';

  var boot = null;      // GET /api/v1/benchmarks
  var inputs = null;    // live, user-editable
  var latest = null;    // last /calculate response
  var session = { signed_in: false, email_masked: null };
  var recomputeTimer = null;

  // ---------------------------------------------------------------- helpers

  function $(id) { return document.getElementById(id); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  // Currency, scaled. The suffix is chosen from the magnitude at render time,
  // so no pre-formatted total is written down anywhere in this build.
  function usd(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var sign = v < 0 ? '-' : '';
    var a = Math.abs(v);
    var THOUSAND = 1e3, MILLION = 1e6, BILLION = 1e9;
    if (a >= BILLION) return sign + '$' + (a / BILLION).toFixed(2) + 'B';
    if (a >= MILLION) return sign + '$' + (a / MILLION).toFixed(1) + 'M';
    if (a >= THOUSAND) return sign + '$' + (a / THOUSAND).toFixed(0) + 'K';
    return sign + '$' + a.toFixed(0);
  }

  function pct(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return (v * 100).toFixed(digits === undefined ? 1 : digits) + '%';
  }

  function count(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return Math.round(v * 10) / 10;
  }

  function monthsToText(m) {
    if (m === null || m === undefined || !isFinite(m)) return 'not reached inside the modelled horizon';
    var y = Math.floor(m / 12);
    var r = Math.round(m % 12);
    if (y <= 0) return r + ' months';
    return y + ' years ' + r + ' months';
  }

  var SOURCED_BASES = ['public_filing', 'analyst_report', 'cms_data', 'client_stated'];

  function chipFor(basis) {
    var cls = 'chip';
    if (SOURCED_BASES.indexOf(basis) >= 0) cls += ' sourced';
    else if (basis === 'assumption') cls += ' assumption';
    else if (basis === 'user_input') cls += ' override';
    else if (basis === 'derived') cls += ' derived';
    return el('span', { class: cls, text: String(basis).replace(/_/g, ' ') });
  }

  function toast(message) {
    var t = $('toast');
    t.textContent = message;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function api(path, options) {
    var opts = options || {};
    return fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
      credentials: 'same-origin',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
    });
  }

  // ------------------------------------------------------------------ table

  function table(headers, rows, footer, caption) {
    var thead = el('thead', null, [el('tr', null, headers.map(function (h) {
      return el('th', { class: h.num ? 'num' : '', text: h.label });
    }))]);
    var tbody = el('tbody', null, rows.map(function (r) {
      return el('tr', null, r.map(function (c, i) {
        var cell = el('td', { class: headers[i] && headers[i].num ? 'num' : '' });
        if (c && c.nodeType) cell.appendChild(c);
        else cell.textContent = c === null || c === undefined ? '' : String(c);
        return cell;
      }));
    }));
    var kids = [];
    if (caption) kids.push(el('caption', { text: caption }));
    kids.push(thead, tbody);
    if (footer) {
      kids.push(el('tfoot', null, [el('tr', null, footer.map(function (c, i) {
        return el('td', { class: headers[i] && headers[i].num ? 'num' : '', text: c === null ? '' : String(c) });
      }))]));
    }
    return el('table', null, kids);
  }

  // ------------------------------------------------------------------ chart

  // Dependency-free bar chart. Geometry constants below are layout, not data.
  function barChart(series, opts) {
    var options = opts || {};
    var W = 720, H = 220, padL = 54, padR = 12, padT = 14, padB = 34;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var values = series.map(function (s) { return s.value; });
    var maxV = Math.max.apply(null, values.concat([0]));
    var minV = Math.min.apply(null, values.concat([0]));
    var span = (maxV - minV) || 1;
    var zeroY = padT + innerH * (maxV / span);
    var slot = innerW / Math.max(1, series.length);
    var barW = Math.max(6, slot * 0.62);

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', options.label || 'Chart');

    function svgEl(name, attrs) {
      var n = document.createElementNS('http://www.w3.org/2000/svg', name);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      return n;
    }

    svg.appendChild(svgEl('line', { class: 'axis', x1: padL, y1: zeroY, x2: W - padR, y2: zeroY }));

    series.forEach(function (s, i) {
      var x = padL + i * slot + (slot - barW) / 2;
      var h = Math.abs(s.value) / span * innerH;
      var y = s.value >= 0 ? zeroY - h : zeroY;
      var cls = 'bar' + (s.value < 0 ? ' neg' : (s.alt ? ' alt' : ''));
      var rect = svgEl('rect', { class: cls, x: x, y: y, width: barW, height: Math.max(1, h), rx: 3 });
      rect.appendChild(svgEl('title', {})).textContent = s.label + ': ' + (options.format || usd)(s.value);
      svg.appendChild(rect);

      var lbl = svgEl('text', { class: 'glabel', x: x + barW / 2, y: H - 12, 'text-anchor': 'middle' });
      lbl.textContent = s.label;
      svg.appendChild(lbl);

      var val = svgEl('text', {
        class: 'vlabel',
        x: x + barW / 2,
        y: s.value >= 0 ? y - 4 : y + h + 11,
        'text-anchor': 'middle'
      });
      val.textContent = (options.format || usd)(s.value);
      svg.appendChild(val);
    });

    return svg;
  }

  // --------------------------------------------------------------- controls

  // Slider bounds are interface properties. Values come from the server.
  var FIELDS = [
    { path: 'savings.capture_pct', label: 'Savings capture', type: 'pct', min: 0, max: 0.35, step: 0.005 },
    { path: 'fee.pct', label: 'Fee on savings', type: 'pct', min: 0, max: 0.35, step: 0.005 },
    { path: 'engagement.annual_churn_pct', label: 'Annual client churn', type: 'pct', min: 0, max: 0.5, step: 0.01 },
    { path: 'fee.realization_lag_months', label: 'Fee realisation lag (months)', type: 'int', min: 0, max: 24, step: 1 },
    { path: 'market.adoption_lag_months', label: 'Ottava / Hugo adoption lag (months)', type: 'int', min: 0, max: 36, step: 1 },
    { path: 'savings.pre_leverage_share', label: 'Capture before multi-vendor leverage', type: 'pct', min: 0, max: 1, step: 0.05 },
    { path: 'market.start_month', label: 'Start month within year one', type: 'int', min: 0, max: 11, step: 1 },
    { group: 'Delivery capacity' },
    { path: 'costs.clients_per_partner', label: 'Engagements per partner', type: 'int', min: 1, max: 10, step: 1 },
    { path: 'costs.loaded_cost_per_partner_yr', label: 'Loaded cost per partner', type: 'usd', min: 0, max: 1200000, step: 10000 },
    { path: 'costs.ga_usd_yr', label: 'General and administrative', type: 'usd', min: 0, max: 1000000, step: 10000 },
    { group: 'Scope toggles (from the triage open questions)' },
    { path: 'market.cofounder', label: 'VP Regional joins as co-founder', type: 'bool' },
    { path: 'market.ortho_in_scope', label: 'Orthopedic robotics in scope', type: 'bool' },
    { path: 'view', label: 'Investor view (range and sensitivity first)', type: 'view' }
  ];

  function getPath(obj, dotted) {
    return dotted.split('.').reduce(function (a, k) { return (a === null || a === undefined) ? undefined : a[k]; }, obj);
  }

  function setPath(obj, dotted, value) {
    var parts = dotted.split('.');
    var cursor = obj;
    for (var i = 0; i < parts.length - 1; i += 1) cursor = cursor[parts[i]];
    cursor[parts[parts.length - 1]] = value;
  }

  function formatFieldValue(f, v) {
    if (f.type === 'pct') return pct(v);
    if (f.type === 'usd') return usd(v);
    return String(v);
  }

  function renderControls() {
    var host = $('control-fields');
    clear(host);

    FIELDS.forEach(function (f) {
      if (f.group) {
        host.appendChild(el('div', { class: 'field-group' }, [el('h3', { text: f.group })]));
        return;
      }

      if (f.type === 'bool' || f.type === 'view') {
        var checkbox = el('input', { type: 'checkbox' });
        checkbox.checked = f.type === 'view'
          ? getPath(inputs, 'view') === 'investor'
          : !!getPath(inputs, f.path);
        checkbox.addEventListener('change', function () {
          if (f.type === 'view') setPath(inputs, 'view', checkbox.checked ? 'investor' : 'personal');
          else setPath(inputs, f.path, checkbox.checked);
          scheduleRecompute();
        });
        host.appendChild(el('div', { class: 'field toggle' }, [checkbox, el('label', { text: f.label })]));
        return;
      }

      var value = getPath(inputs, f.path);
      var readout = el('span', { class: 'val', text: formatFieldValue(f, value) });
      var range = el('input', { type: 'range', min: f.min, max: f.max, step: f.step });
      range.value = value;
      range.addEventListener('input', function () {
        var v = Number(range.value);
        setPath(inputs, f.path, v);
        readout.textContent = formatFieldValue(f, v);
        scheduleRecompute();
      });
      host.appendChild(el('div', { class: 'field' }, [
        el('label', null, [document.createTextNode(f.label), readout]),
        range
      ]));
    });
  }

  function renderPresets() {
    var host = $('preset-row');
    clear(host);
    boot.scenario_presets.forEach(function (p) {
      var active = Math.abs(inputs.savings.capture_pct - p.savings_capture_pct) < 1e-9
        && Math.abs(inputs.fee.pct - p.fee_pct) < 1e-9;
      var btn = el('button', {
        type: 'button',
        class: 'btn tiny preset' + (active ? ' on' : ''),
        title: p.note + ' — capture ' + pct(p.savings_capture_pct, 0) + ', fee ' + pct(p.fee_pct, 0)
      }, [p.label + ' · ' + pct(p.savings_capture_pct, 0) + ' / ' + pct(p.fee_pct, 0)]);
      btn.addEventListener('click', function () {
        inputs.savings.capture_pct = p.savings_capture_pct;
        inputs.fee.pct = p.fee_pct;
        renderControls();
        renderPresets();
        recompute();
      });
      host.appendChild(btn);
    });
  }

  // --------------------------------------------------------------- rendering

  function kpi(label, value, sub, tone) {
    return el('div', { class: 'kpi' + (tone ? ' ' + tone : '') }, [
      el('div', { class: 'kpi-label', text: label }),
      el('div', { class: 'kpi-value', text: value }),
      sub ? el('div', { class: 'kpi-sub', text: sub }) : null
    ]);
  }

  function renderDashboard(d) {
    var host = $('dash-kpis');
    clear(host);
    var investor = d.inputs.view === 'investor';

    host.appendChild(kpi(
      'Modelled market, annual',
      usd(d.tam_usd),
      'Across ' + d.perTier.reduce(function (a, t) { return a + t.idn_count; }, 0) + ' IDNs in three tiers'
    ));
    host.appendChild(kpi(
      'Fee per engaged IDN, annual',
      usd(d.unit_economics.fee_per_client_year_usd),
      'At full multi-vendor leverage'
    ));
    host.appendChild(kpi(
      'Year one revenue',
      usd(d.cumulative.y1),
      'Assumes an adoption lag of ' + d.inputs.market.adoption_lag_months + ' months and a fee realisation lag of ' + d.inputs.fee.realization_lag_months + ' months'
    ));
    host.appendChild(kpi(
      'Five-year cumulative revenue',
      usd(d.cumulative.y5),
      'Sum of five distinct years, not five times year one'
    ));

    if (investor) {
      host.appendChild(kpi('Ten-year cumulative revenue', usd(d.cumulative.y10), 'Ramp continues to the modelled ceiling'));
      var top = d.sensitivity[0];
      host.appendChild(kpi('Largest single swing', usd(top.swing_usd), 'From ' + top.label.toLowerCase() + ' alone, over five years', 'warn'));
    } else {
      host.appendChild(kpi(
        'Five-year net contribution',
        usd(d.cumulative.net_y5),
        'After partner cost, general and administrative, and travel',
        d.cumulative.net_y5 >= 0 ? 'good' : 'bad'
      ));
      host.appendChild(kpi(
        'Break-even',
        monthsToText(d.netContribution.break_even_month),
        'From practice start',
        d.netContribution.break_even_month === null ? 'bad' : 'good'
      ));
    }

    // Reconciliation
    var rec = $('dash-reconciliation');
    clear(rec);
    d.reconciliation.forEach(function (r) {
      var box = el('div', { class: 'notice ' + (r.status === 'exceeds' ? 'warn' : 'good') }, [
        el('h3', { text: r.status === 'exceeds' ? 'The modelled market exceeds a public anchor' : 'Reconciles against a public anchor' }),
        el('p', { text: 'Modelled market ' + usd(r.tam_usd) + ' against ' + r.anchor_label.toLowerCase() + ' of ' + usd(r.anchor_usd) + '.' }),
        el('p', { text: r.note }),
        el('div', null, [chipFor(r.basis), document.createTextNode(' '), el('span', { class: 'note', text: 'As of ' + r.anchor_as_of + '. ' + r.anchor_source })])
      ]);
      rec.appendChild(box);
    });

    // What has to be true
    var truth = $('dash-truth');
    clear(truth);
    var list = el('div', { class: 'card' }, [
      el('h2', { text: 'What has to be true' }),
      el('p', { class: 'note', text: 'The inputs this outcome is most hostage to, ranked by how far they move the five-year figure.' })
    ]);
    d.what_has_to_be_true.forEach(function (w) {
      list.appendChild(el('div', { class: 'item', style: 'border:0;padding:8px 0;background:transparent' }, [
        el('div', { class: 'item-head' }, [
          el('strong', { text: w.driver }),
          w.swing_usd === null ? null : el('span', { class: 'num note', text: usd(w.swing_usd) + ' swing' })
        ]),
        el('div', { class: 'item-body', text: w.claim }),
        el('div', { class: 'note', text: w.why_it_matters })
      ]));
    });
    truth.appendChild(list);

    // Revenue by year
    var chart = $('dash-chart');
    clear(chart);
    chart.appendChild(el('h2', { text: 'Projected annual consulting revenue' }));
    chart.appendChild(el('p', { class: 'note', text: 'Each bar is computed from the active engagements in that year, discounted by the leverage ramp and the first-year realisation factor.' }));
    chart.appendChild(barChart(d.perYear.map(function (r) {
      return { label: 'Y' + r.year, value: r.revenue_usd };
    }), { label: 'Projected annual revenue by year' }));
  }

  function renderMarket(d) {
    var summary = $('market-summary');
    clear(summary);
    summary.appendChild(kpi('Modelled market, annual', usd(d.tam_usd), 'Sum of the three tiers below'));
    summary.appendChild(kpi(
      'Blended spend per engaged IDN',
      usd(d.unit_economics.blended_spend_per_client_usd),
      d.unit_economics.blended_spend_is_override
        ? 'Overridden. The tier mix derives ' + usd(d.unit_economics.blended_spend_derived_usd) + '.'
        : 'Derived from the tier mix, never typed',
      d.unit_economics.blended_spend_is_override ? 'warn' : null
    ));
    summary.appendChild(kpi(
      'Orthopedic layer',
      d.inputs.market.ortho_in_scope ? 'In scope' : 'Out of scope',
      d.inputs.market.ortho_in_scope
        ? 'Applies an uplift of ' + pct(d.inputs.market.ortho_uplift_pct, 0) + ' to every tier'
        : 'Mako, ROSA and CORI excluded from the market figure'
    ));

    var chart = $('market-chart');
    clear(chart);
    chart.appendChild(el('h2', { text: 'Annual robotic surgery spend by IDN tier' }));
    chart.appendChild(barChart(d.perTier.map(function (t) {
      return { label: t.label.split(' ')[0], value: t.annual_spend_total_usd, alt: true };
    }), { label: 'Annual spend by tier' }));

    var tbl = $('market-table');
    clear(tbl);
    tbl.appendChild(el('h2', { text: 'Tier detail' }));
    tbl.appendChild(table(
      [{ label: 'Tier' }, { label: 'IDNs', num: true }, { label: 'Annual spend per IDN', num: true },
        { label: 'Tier total, annual', num: true }, { label: 'Share of market', num: true }],
      d.perTier.map(function (t) {
        return [t.label, t.idn_count, usd(t.annual_spend_per_idn_usd), usd(t.annual_spend_total_usd), pct(t.share_of_tam)];
      }),
      ['Total', d.perTier.reduce(function (a, t) { return a + t.idn_count; }, 0), '', usd(d.tam_usd), pct(1)],
      'Per-IDN spend is derived from the tier total and the IDN count. A typed average that disagrees with its own tier table is the defect this model removes.'
    ));

    var comp = $('market-components');
    clear(comp);
    comp.appendChild(el('h2', { text: 'Spend breakdown by contract category' }));
    comp.appendChild(table(
      [{ label: 'Category' }, { label: 'Unit' }, { label: 'Low', num: true }, { label: 'High', num: true }, { label: 'Note' }],
      boot.spend_components.map(function (c) {
        return [c.label, c.unit, usd(c.low_usd), usd(c.high_usd), c.note];
      })
    ));

    var prov = $('market-provenance');
    clear(prov);
    prov.appendChild(el('h2', { text: 'Provenance' }));
    prov.appendChild(el('p', {
      class: 'note',
      text: d.provenance.sourced + ' of ' + d.provenance.total + ' inputs are traced to public data or to a stated client fact. '
        + d.provenance.assumptions + ' are labelled assumptions. '
        + d.provenance.overrides + ' have been typed over.'
    }));
    prov.appendChild(table(
      [{ label: 'Input' }, { label: 'Value', num: true }, { label: 'Basis' }, { label: 'As of' }, { label: 'Source' }],
      d.provenance.entries.map(function (e) {
        var v = Array.isArray(e.value) ? e.value.join(', ')
          : (e.unit === 'fraction' ? pct(e.value) : (/USD/.test(e.unit) ? usd(e.value) : String(e.value)));
        return [e.label, v, chipFor(e.basis), e.as_of, e.source];
      })
    ));
  }

  function renderRevenue(d) {
    var chain = $('revenue-chain');
    clear(chain);
    chain.appendChild(el('h2', { text: 'The chain, per engaged IDN' }));
    var u = d.unit_economics;
    chain.appendChild(table(
      [{ label: 'Step' }, { label: 'Value', num: true }, { label: 'How it is reached' }],
      [
        ['Blended annual spend', usd(u.blended_spend_per_client_usd), u.blended_spend_is_override ? 'Operator override' : 'Weighted by the tier mix'],
        ['Savings delivered, annual', usd(u.savings_per_client_year_usd), 'Spend times savings capture of ' + pct(d.inputs.savings.capture_pct)],
        ['Consulting fee, annual', usd(u.fee_per_client_year_usd), 'Savings times fee of ' + pct(d.inputs.fee.pct)],
        ['Five-year client value', usd(u.client_value_5yr_usd), 'At full leverage, before churn and lag']
      ]
    ));
    chain.appendChild(el('p', {
      class: 'note',
      text: 'First-year realisation factor is ' + pct(u.first_year_realization_factor, 0)
        + ', because savings must be verified against a baseline before a fee-on-savings invoice is defensible.'
    }));

    var chart = $('revenue-chart');
    clear(chart);
    chart.appendChild(el('h2', { text: 'Net contribution by year' }));
    chart.appendChild(barChart(d.perYear.map(function (r) {
      return { label: 'Y' + r.year, value: r.net_usd };
    }), { label: 'Net contribution by year' }));
    chart.appendChild(el('p', {
      class: 'note',
      text: 'Break-even at ' + monthsToText(d.netContribution.break_even_month)
        + '. Cost includes the partners the ramp actually requires, not the partners planned.'
    }));

    var tbl = $('revenue-table');
    clear(tbl);
    tbl.appendChild(el('h2', { text: 'Year by year' }));
    tbl.appendChild(table(
      [{ label: 'Year', num: true }, { label: 'Active', num: true }, { label: 'New needed', num: true },
        { label: 'Leverage', num: true }, { label: 'Fee per client', num: true }, { label: 'Revenue', num: true },
        { label: 'Cost', num: true }, { label: 'Net', num: true }, { label: 'Partners', num: true },
        { label: 'Cumulative revenue', num: true }],
      d.perYear.map(function (r) {
        return [r.year, count(r.active_clients), count(r.arrivals_needed), pct(r.leverage_factor, 0),
          usd(r.effective_fee_per_client_usd), usd(r.revenue_usd), usd(r.cost_usd), usd(r.net_usd),
          r.required_partners, usd(r.cumulative_revenue_usd)];
      }),
      null,
      'Churn does not reduce the target headcount, it increases how many new logos must be won to hold it. "New needed" is that number.'
    ));

    var cap = $('revenue-capacity');
    clear(cap);
    cap.appendChild(el('h2', { text: 'Delivery capacity' }));
    var capNotice = el('div', { class: 'notice ' + (d.capacity_exceeded ? 'warn' : 'good') }, [
      el('p', {
        text: d.capacity_exceeded
          ? 'The ramp requires ' + d.capacity.peak_required_partners + ' partners at peak against ' + d.capacity.partners_planned + ' planned. The cost line already prices the partners the ramp requires, so the net figure is honest — but the hiring has to happen or the client ramp does not.'
          : 'The ramp is deliverable at ' + d.capacity.partners_planned + ' partners, carrying ' + d.capacity.clients_per_partner + ' engagements each.'
      }),
      el('p', {
        class: 'note',
        text: d.capacity.cofounder_included
          ? 'Includes the VP Regional colleague as a co-founder.'
          : 'Solo practice. Switch on the co-founder toggle to add a second partner.'
      })
    ]);
    cap.appendChild(capNotice);

    var sens = $('revenue-sensitivity');
    clear(sens);
    sens.appendChild(el('h2', { text: 'Sensitivity, ranked' }));
    sens.appendChild(el('p', { class: 'note', text: 'Each driver moved across its plausible range with everything else held. One number is a guess; a ranked range is an argument.' }));
    sens.appendChild(table(
      [{ label: 'Driver' }, { label: 'Low', num: true }, { label: 'High', num: true },
        { label: 'Five-year low', num: true }, { label: 'Five-year high', num: true }, { label: 'Swing', num: true }],
      d.sensitivity.map(function (s) {
        var fmt = function (v) { return s.format === 'pct' ? pct(v, 0) : String(v); };
        return [s.label, fmt(s.low_input), fmt(s.high_input), usd(s.low_y5_usd), usd(s.high_y5_usd), usd(s.swing_usd)];
      })
    ));
  }

  function renderPipeline(d) {
    var note = $('pipeline-note');
    clear(note);
    note.appendChild(el('h2', { text: 'Named account pipeline' }));
    note.appendChild(el('p', {
      text: 'A market map, not a call list. Accounts previously managed on the vendor side carry tortious-interference exposure; see Watchouts before any approach.'
    }));
    var tcvAccounts = d.pipeline.filter(function (a) { return a.spend_was_tcv; });
    if (tcvAccounts.length) {
      note.appendChild(el('div', { class: 'notice warn' }, [
        el('h3', { text: 'Total contract value, annualised' }),
        el('p', {
          text: tcvAccounts.map(function (a) {
            return a.name + ' was entered as ' + usd(a.entered_usd) + ' of total contract value over '
              + a.tcv_years + ' years, and is shown here as ' + usd(a.annual_spend_usd) + ' a year.';
          }).join(' ')
        }),
        el('p', { class: 'note', text: 'The teaser simulator printed the contract value as an annual figure, which inflated the National tier and the whole market by roughly five times on its largest line.' })
      ]));
    }

    var host = $('pipeline-list');
    clear(host);
    ['national', 'regional', 'academic'].forEach(function (tier) {
      var rows = d.pipeline.filter(function (a) { return a.tier === tier; });
      if (!rows.length) return;
      var tierMeta = d.perTier.filter(function (t) { return t.key === tier; })[0];
      var card = el('div', { class: 'card' }, [
        el('h2', { text: tierMeta ? tierMeta.label : tier }),
        table(
          [{ label: 'Account' }, { label: 'Systems', num: true }, { label: 'Annual spend', num: true },
            { label: 'Entered as' }, { label: 'Note' }],
          rows.map(function (a) {
            return [a.name, a.systems, usd(a.annual_spend_usd),
              a.spend_was_tcv ? 'Contract value over ' + a.tcv_years + ' years' : 'Annual',
              a.tcv_note || a.contract_note || ''];
          })
        )
      ]);
      host.appendChild(card);
    });
  }

  function renderWatchouts() {
    var w = boot.watchouts;

    var next = $('watchouts-next');
    clear(next);
    next.appendChild(el('div', { class: 'notice bad' }, [
      el('h3', { text: w.next_step.headline }),
      el('p', { text: w.next_step.body }),
      el('div', { class: 'note', text: 'Owner: ' + w.next_step.owner + '. Timing: ' + w.next_step.timing + '.' }),
      el('div', { class: 'disclaimer', text: w.next_step.disclaimer })
    ]));

    var host = $('watchouts-list');
    clear(host);
    w.items.forEach(function (item) {
      host.appendChild(el('div', { class: 'item ' + item.severity }, [
        el('div', { class: 'item-head' }, [
          el('strong', { text: item.title }),
          el('span', { class: 'chip ' + (item.severity === 'critical' ? 'assumption' : ''), text: item.category })
        ]),
        el('div', { class: 'item-body', text: item.body }),
        el('dl', null, [
          el('dt', { text: 'Mitigation' }), el('dd', { text: item.mitigation }),
          el('dt', { text: 'Guardrail' }), el('dd', { text: item.guardrail })
        ]),
        el('div', { class: 'disclaimer', text: item.disclaimer })
      ]));
    });
  }

  function renderAll(d) {
    latest = d;
    renderDashboard(d);
    renderMarket(d);
    renderRevenue(d);
    renderPipeline(d);
    renderWatchouts();

    $('provenance-pill').textContent = d.provenance.sourced + ' of ' + d.provenance.total + ' inputs sourced';
    $('provenance-pill').title = d.provenance.assumptions + ' labelled assumptions, ' + d.provenance.overrides + ' operator overrides';
    $('foot-version').textContent = 'App ' + VERSION + ' · model ' + MODEL_VERSION;

    document.title = 'RoboNegotiate — ' + usd(d.cumulative.y5) + ' five-year, ' + pct(d.inputs.savings.capture_pct, 0)
      + ' capture, ' + pct(d.inputs.fee.pct, 0) + ' fee';
  }

  // ------------------------------------------------------------- recompute

  function scheduleRecompute() {
    clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(recompute, 120);
  }

  function recompute() {
    return api('/api/v1/calculate', { method: 'POST', body: { inputs: inputs } })
      .then(function (r) {
        if (!r.ok || !r.body.success) throw new Error(r.body.error || 'Model error');
        renderAll(r.body);
        renderPresets();
      })
      .catch(function (err) { toast(err.message); });
  }

  // ----------------------------------------------------------------- auth

  function refreshSession() {
    return api('/api/v1/auth/me').then(function (r) {
      session = r.body || { signed_in: false };
      $('signin-btn').textContent = session.signed_in ? ('Signed in · ' + session.email_masked) : 'Sign in';
      if (session.signed_in) loadScenarios();
      return session;
    }).catch(function () { return session; });
  }

  function loadScenarios() {
    return api('/api/v1/scenarios').then(function (r) {
      var host = $('scenario-list');
      clear(host);
      if (!r.ok || !r.body.success) {
        host.appendChild(el('div', { class: 'note', text: 'Sign in to save and list scenarios.' }));
        return;
      }
      if (!r.body.data.length) {
        host.appendChild(el('div', { class: 'note', text: 'No saved scenarios yet.' }));
        return;
      }
      r.body.data.forEach(function (s) {
        host.appendChild(el('div', { class: 'scenario-row' }, [
          el('span', { text: s.name }),
          el('span', null, [
            el('span', { class: 'num note', text: usd(s.cumulative ? s.cumulative.y5 : null) }),
            document.createTextNode(' '),
            el('a', { href: BASE + '/api/v1/scenarios/' + s.id + '/export.csv', text: 'CSV' })
          ])
        ]));
      });
    });
  }

  // ------------------------------------------------------------------ boot

  function wireTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        tabs.forEach(function (x) { x.classList.remove('active'); x.setAttribute('aria-selected', 'false'); });
        t.classList.add('active');
        t.setAttribute('aria-selected', 'true');
        Array.prototype.slice.call(document.querySelectorAll('.panel')).forEach(function (p) {
          p.classList.toggle('active', p.id === 'panel-' + t.getAttribute('data-tab'));
        });
      });
    });
  }

  function wireActions() {
    $('reset-btn').addEventListener('click', function () {
      inputs = JSON.parse(JSON.stringify(boot.defaults));
      renderControls();
      renderPresets();
      recompute();
      toast('Reset to the seeded defaults');
    });

    $('print-btn').addEventListener('click', function () {
      var stamp = new Date().toISOString().slice(0, 10);
      document.title = 'robonegotiate-model-' + stamp;
      window.print();
    });

    $('save-btn').addEventListener('click', function () {
      var name = window.prompt('Name this scenario');
      if (!name) return;
      api('/api/v1/scenarios', { method: 'POST', body: { name: name, inputs: inputs } })
        .then(function (r) {
          if (r.status === 401) {
            $('save-note').textContent = 'Sign in first to save a scenario.';
            $('save-note').className = 'note error';
            openSignin();
            return;
          }
          if (!r.ok || !r.body.success) throw new Error(r.body.error || 'Could not save');
          $('save-note').textContent = 'Saved.';
          $('save-note').className = 'note ok';
          loadScenarios();
        })
        .catch(function (err) {
          $('save-note').textContent = err.message;
          $('save-note').className = 'note error';
        });
    });

    $('signin-btn').addEventListener('click', openSignin);
    $('signin-close').addEventListener('click', function () { $('signin-modal').hidden = true; });
    $('signin-send').addEventListener('click', function () {
      var email = $('signin-email').value.trim();
      var out = $('signin-result');
      clear(out);
      api('/api/v1/auth/magic-link', { method: 'POST', body: { email: email } })
        .then(function (r) {
          if (!r.ok || !r.body.success) throw new Error(r.body.error || 'Could not create a link');
          out.appendChild(el('div', { text: r.body.delivery_note }));
          if (r.body.verify_url) {
            var link = el('a', { class: 'link-out', href: r.body.verify_url + '&redirect=1', text: r.body.verify_url });
            out.appendChild(link);
          } else {
            out.appendChild(el('div', { class: 'note', text: 'If that address is recognised, a sign-in link has been created for it.' }));
          }
        })
        .catch(function (err) {
          out.appendChild(el('div', { class: 'note error', text: err.message }));
        });
    });
  }

  function openSignin() {
    $('signin-modal').hidden = false;
    $('signin-email').focus();
  }

  function start() {
    wireTabs();
    api('/api/v1/benchmarks')
      .then(function (r) {
        if (!r.ok || !r.body.success) throw new Error('Could not load benchmarks');
        boot = r.body;
        inputs = JSON.parse(JSON.stringify(boot.defaults));
        renderControls();
        renderPresets();
        wireActions();
        return recompute();
      })
      .then(refreshSession)
      .then(function () { return api('/health'); })
      .then(function (r) {
        if (r.ok && r.body) {
          $('backend-pill').textContent = r.body.db_backend === 'postgres' ? 'saved to database' : 'in-memory only';
          $('backend-pill').title = r.body.db_backend === 'postgres'
            ? 'Scenarios persist.'
            : 'No database on this deployment. Scenarios live in this process and do not survive a restart. ' + (r.body.db_error || '');
        }
      })
      .catch(function (err) { toast(err.message); });

    if (/[?&]signed_in=1/.test(window.location.search)) {
      toast('Signed in');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
