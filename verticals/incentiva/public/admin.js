/* BuyersLine agent console. Vanilla JS, no dependencies, no build.
 * Every server string passes through esc() before it reaches innerHTML.
 * Every fetch is prefixed with window.BASE (substituted server-side). */
(() => {
  'use strict';

  const RAW_BASE = typeof window.BASE === 'string' ? window.BASE : '';
  const BASE = RAW_BASE.includes('{{') ? '' : RAW_BASE.replace(/\/+$/, '');
  const API = BASE + '/api/v1';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const state = {
    me: null,
    route: null,
    seq: 0,
    cards: new Map(),
    snoozeMem: new Set(),
    counties: [],
    market: null,
  };

  /* ------------------------------------------------------------------ */
  /* Utilities                                                           */
  /* ------------------------------------------------------------------ */

  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"'`]/g, (c) => ESC_MAP[c]);
  }
  function safeUrl(u) {
    if (!u) return null;
    try {
      const x = new URL(String(u), location.href);
      return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null;
    } catch (_) { return null; }
  }
  function isBlank(v) {
    return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
  }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function humanize(s) {
    const t = String(s === null || s === undefined ? '' : s).replace(/[_-]+/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }
  function plain(v) {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.map(plain).join(', ');
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  const pad = (n) => String(n).padStart(2, '0');
  const DASH = '<span class="muted">&mdash;</span>';

  function parseDate(v) {
    if (isBlank(v)) return null;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [y, m, d] = v.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDate(v) {
    const d = parseDate(v);
    return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  }
  function fmtDateTime(v) {
    const d = parseDate(v);
    return d ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  }
  function timeTag(v, withTime) {
    const s = withTime ? fmtDateTime(v) : fmtDate(v);
    return s ? `<time class="mono" datetime="${esc(v)}">${esc(s)}</time>` : DASH;
  }
  function daysUntil(v) {
    const d = parseDate(v);
    if (!d) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const x = new Date(d.getTime()); x.setHours(0, 0, 0, 0);
    return Math.round((x - today) / 86400000);
  }
  function toDateInput(v) {
    if (isBlank(v)) return '';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const d = parseDate(v);
    return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
  }
  const USD0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const USD2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  function fmtUSD(v) {
    if (isBlank(v) || !Number.isFinite(Number(v))) return '';
    const n = Number(v);
    return Number.isInteger(n) ? USD0.format(n) : USD2.format(n);
  }
  function usdCell(v) { const s = fmtUSD(v); return s ? `<span class="mono">${esc(s)}</span>` : DASH; }
  function textCell(v) { return isBlank(v) ? DASH : esc(plain(v)); }

  function chip(label, tone, extra) {
    return `<span class="chip chip-${tone || 'neutral'}${extra ? ' ' + extra : ''}">${esc(label)}</span>`;
  }

  /* ------------------------------------------------------------------ */
  /* API                                                                 */
  /* ------------------------------------------------------------------ */

  function apiError(message, status, data) {
    const e = new Error(message);
    e.status = status;
    e.data = data;
    return e;
  }

  async function api(method, path, body) {
    const opts = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(API + path, opts);
    } catch (_) {
      throw apiError(`Network error calling ${method} ${path}. Check your connection and try again.`, 0, null);
    }
    if (res.status === 401) {
      location.href = BASE + '/admin/login';
      throw apiError('Your session has ended. Redirecting to sign in.', 401, null);
    }
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (_) { data = null; } }
    if (!res.ok) {
      const msg = (data && data.error) || `${method} ${path} failed with HTTP ${res.status}`;
      throw apiError(msg, res.status, data);
    }
    if (data === null) throw apiError(`${method} ${path} returned a response that was not JSON`, res.status, null);
    return data;
  }

  /* ------------------------------------------------------------------ */
  /* Feedback: toasts, inline status, confirm dialog                     */
  /* ------------------------------------------------------------------ */

  function toast(msg, tone) {
    const host = $('#toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast' + (tone === 'crit' ? ' toast-crit' : '');
    el.setAttribute('role', tone === 'crit' ? 'alert' : 'status');
    el.textContent = msg;
    host.appendChild(el);
    const ttl = tone === 'crit' ? 7000 : 4000;
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ttl);
  }

  function scopeOf(el) { return el ? el.closest('[data-scope]') : null; }
  function statusSlot(el) {
    const host = scopeOf(el);
    if (!host) return null;
    return $$('[data-status]', host).find((s) => s.closest('[data-scope]') === host) || null;
  }
  /* html=true means the caller has already escaped every dynamic part. */
  function setStatus(el, msg, tone, html) {
    const slot = statusSlot(el);
    if (!slot) { if (msg) toast(html ? stripTags(msg) : msg, tone === 'crit' ? 'crit' : 'ok'); return; }
    if (!msg) { slot.hidden = true; slot.textContent = ''; return; }
    slot.className = 'status status-' + (tone || 'info');
    slot.setAttribute('role', tone === 'crit' ? 'alert' : 'status');
    if (html) slot.innerHTML = msg; else slot.textContent = msg;
    slot.hidden = false;
  }
  function stripTags(s) { const d = document.createElement('div'); d.innerHTML = s; return d.textContent || ''; }

  function confirmDialog({ title, body, confirmLabel, danger }) {
    return new Promise((resolve) => {
      const d = $('#dlg');
      if (!d || typeof d.showModal !== 'function') { resolve(window.confirm(`${title}\n\n${body}`)); return; }
      $('#dlgTitle').textContent = title;
      $('#dlgBody').textContent = body;
      const ok = $('#dlgOk');
      ok.textContent = confirmLabel || 'Confirm';
      ok.className = 'btn ' + (danger ? 'btn-danger-solid' : 'btn-primary');
      d.returnValue = '';
      const onClose = () => { d.removeEventListener('close', onClose); resolve(d.returnValue === 'ok'); };
      d.addEventListener('close', onClose);
      d.showModal();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Rendering helpers                                                   */
  /* ------------------------------------------------------------------ */

  function loadingHTML(label) {
    return `<div class="loading" role="status"><span class="spin" aria-hidden="true"></span>${esc(label)}</div>`;
  }
  function errorHTML(what, err, retry) {
    return `<div class="errbox" role="alert"><strong>Could not load ${esc(what)}.</strong>${esc(err && err.message ? err.message : 'Unknown error')}${
      retry ? `<div class="formbar"><button type="button" class="btn btn-danger" data-act="retry">Try again</button></div>` : ''}</div>`;
  }
  function emptyHTML(title, body) {
    return `<div class="empty" data-empty><strong>${esc(title)}</strong>${body ? esc(body) : ''}</div>`;
  }
  function pageHead(title, sub, right) {
    return `<div class="phead"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right || ''}</div>`;
  }

  /* Remove a list item; if the list is now empty, show its empty state. */
  function dismiss(item, emptyMarkup) {
    if (!item) return;
    const list = item.parentElement;
    const section = item.closest('.section');
    item.remove();
    if (section) {
      const c = section.querySelector('[data-count]');
      if (c) c.textContent = String(Math.max(0, num(c.textContent) - 1));
    }
    if (list && !list.querySelector('[data-item]') && emptyMarkup) list.outerHTML = emptyMarkup;
  }

  const SEVERITY_TONE = { critical: 'crit', high: 'crit', block: 'crit', error: 'crit', warning: 'warn', medium: 'warn', hold: 'warn', low: 'info', info: 'info', notice: 'info' };
  function findingsHTML(findings) {
    if (!Array.isArray(findings) || !findings.length) return '<p class="muted small">No findings recorded.</p>';
    return `<ul class="findings">${findings.map((f) => `
      <li class="finding">
        <div class="chips">${chip(String(f.severity || 'unrated').toUpperCase(), SEVERITY_TONE[String(f.severity || '').toLowerCase()] || 'neutral')}${f.category ? chip(humanize(f.category), 'outline') : ''}</div>
        ${f.quote ? `<blockquote class="quote">${esc(f.quote)}</blockquote>` : ''}
        ${f.why ? `<p><strong>Why:</strong> ${esc(f.why)}</p>` : ''}
        ${f.suggested_fix ? `<p><strong>Suggested fix:</strong> ${esc(f.suggested_fix)}</p>` : ''}
      </li>`).join('')}</ul>`;
  }
  const VERDICT_TONE = { pass: 'ok', hold: 'warn', block: 'crit' };
  function verdictChip(v) { return v ? chip(String(v).toUpperCase(), VERDICT_TONE[v] || 'neutral') : chip('NOT CHECKED', 'outline'); }

  /* ------------------------------------------------------------------ */
  /* Form building                                                       */
  /* ------------------------------------------------------------------ */

  let uid = 0;
  function fieldHTML(spec, value) {
    const id = `f${++uid}`;
    const req = spec.required ? ' required' : '';
    const cls = 'field' + (spec.full ? ' full' : '');
    const label = `<span class="flabel">${esc(spec.label)}${spec.required ? ' <span class="hint">(required)</span>' : ''}${spec.hint ? ` <span class="hint">${esc(spec.hint)}</span>` : ''}</span>`;
    const ph = spec.placeholder ? ` placeholder="${esc(spec.placeholder)}"` : '';
    switch (spec.type) {
      case 'select': {
        let opts = (spec.options || []).map((o) => (Array.isArray(o) ? o : [o, humanize(o)]));
        const cur = isBlank(value) ? '' : String(value);
        if (cur && !opts.some((o) => String(o[0]) === cur)) opts = [[cur, `${humanize(cur)} (current)`]].concat(opts);
        const blank = spec.blank !== undefined ? `<option value=""${cur === '' ? ' selected' : ''}>${esc(spec.blank)}</option>` : '';
        return `<label class="${cls}" for="${id}">${label}<select id="${id}" name="${esc(spec.name)}"${req}>${blank}${opts.map((o) =>
          `<option value="${esc(o[0])}"${String(o[0]) === cur ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
      }
      case 'tri': {
        const cur = value === true ? 'yes' : value === false ? 'no' : '';
        return `<label class="${cls}" for="${id}">${label}<select id="${id}" name="${esc(spec.name)}">
          <option value=""${cur === '' ? ' selected' : ''}>Not stated</option>
          <option value="yes"${cur === 'yes' ? ' selected' : ''}>Yes</option>
          <option value="no"${cur === 'no' ? ' selected' : ''}>No</option></select></label>`;
      }
      case 'checkbox':
        return `<label class="${cls} check" for="${id}"><input type="checkbox" id="${id}" name="${esc(spec.name)}"${value ? ' checked' : ''}><span class="flabel">${esc(spec.label)}</span></label>`;
      case 'textarea':
        return `<label class="${cls}" for="${id}">${label}<textarea id="${id}" name="${esc(spec.name)}"${req}${ph}${spec.rows ? ` rows="${spec.rows}"` : ''}>${esc(isBlank(value) ? '' : plain(value))}</textarea></label>`;
      case 'date':
        return `<label class="${cls}" for="${id}">${label}<input type="date" id="${id}" name="${esc(spec.name)}" value="${esc(toDateInput(value))}"${req}></label>`;
      case 'number':
        return `<label class="${cls}" for="${id}">${label}<input type="number" inputmode="decimal" step="${esc(spec.step || 'any')}" id="${id}" name="${esc(spec.name)}" value="${esc(isBlank(value) ? '' : value)}"${req}${ph}></label>`;
      case 'schedule':
      case 'list': {
        const v = Array.isArray(value) ? value.join(spec.type === 'schedule' ? ',' : ', ') : (isBlank(value) ? '' : plain(value));
        return `<label class="${cls}" for="${id}">${label}<input type="text" id="${id}" name="${esc(spec.name)}" value="${esc(v)}"${ph}${spec.type === 'schedule' ? ' inputmode="decimal"' : ''}></label>`;
      }
      default: {
        const t = ['email', 'tel', 'url'].includes(spec.type) ? spec.type : 'text';
        return `<label class="${cls}" for="${id}">${label}<input type="${t}" id="${id}" name="${esc(spec.name)}" value="${esc(isBlank(value) ? '' : plain(value))}"${req}${ph}${t === 'email' || t === 'url' ? ' autocapitalize="off" spellcheck="false"' : ''}></label>`;
      }
    }
  }
  function fieldsHTML(specs, values) {
    return `<div class="fgrid">${specs.map((s) => fieldHTML(s, values ? values[s.name] : undefined)).join('')}</div>`;
  }
  /* Reads and normalises field values. Throws Error with a readable message on bad input. */
  function readFields(form, specs, original) {
    const out = {};
    for (const s of specs) {
      const el = form.elements.namedItem(s.name);
      if (!el) continue;
      if (s.type === 'checkbox') { out[s.name] = !!el.checked; continue; }
      const raw = String(el.value || '').trim();
      if (s.required && raw === '') throw new Error(`${s.label} is required.`);
      let v;
      switch (s.type) {
        case 'number':
          v = raw === '' ? null : Number(raw);
          if (v !== null && !Number.isFinite(v)) throw new Error(`${s.label} must be a number.`);
          break;
        case 'tri': v = raw === 'yes' ? true : raw === 'no' ? false : null; break;
        case 'schedule':
          v = raw === '' ? null : raw.split(/[\s,/]+/).filter(Boolean).map(Number);
          if (v && v.some((n) => !Number.isFinite(n))) throw new Error(`${s.label} must be numbers separated by commas, for example 2,1.`);
          break;
        case 'list': {
          const wasArray = original && Array.isArray(original[s.name]);
          if (raw === '') v = wasArray ? [] : null;
          else v = wasArray ? raw.split(',').map((x) => x.trim()).filter(Boolean) : raw;
          break;
        }
        case 'date': v = raw || null; break;
        default: v = raw === '' ? null : raw;
      }
      out[s.name] = v;
    }
    return out;
  }
  function cmpVal(v) {
    if (isBlank(v)) return null;
    if (typeof v === 'string') {
      const t = v.trim();
      if (/^\d{4}-\d{2}-\d{2}T/.test(t)) return t.slice(0, 10);
      if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
      return t;
    }
    if (Array.isArray(v)) return v.map(cmpVal);
    return v;
  }
  function sameVal(a, b) { return JSON.stringify(cmpVal(a)) === JSON.stringify(cmpVal(b)); }

  function busy(el, on) {
    const targets = el.tagName === 'FORM' ? $$('button', el) : [el];
    targets.forEach((b) => {
      if (on) {
        b.dataset.wasDisabled = b.disabled ? '1' : '';
        b.disabled = true;
        b.setAttribute('aria-busy', 'true');
      } else {
        b.disabled = b.dataset.wasDisabled === '1';
        b.removeAttribute('aria-busy');
        delete b.dataset.wasDisabled;
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Domain vocabularies                                                 */
  /* ------------------------------------------------------------------ */

  // Must match TYPES in src/engines/extractor.js
  const INCENTIVE_TYPES = [
    ['closing_cost_assistance', 'Closing cost assistance'], ['rate_buydown_permanent', 'Permanent rate buydown'],
    ['rate_buydown_temporary', 'Temporary rate buydown'], ['below_market_fixed_rate', 'Below-market fixed rate'],
    ['price_reduction', 'Price reduction'], ['flex_cash', 'Flex cash'], ['design_center_credit', 'Design center credit'],
    ['options_package', 'Included options'], ['lot_premium_waived', 'Lot premium waived'], ['hoa_or_cdd_paid', 'HOA or CDD paid'],
    ['lender_partner_offer', 'Lender partner offer'], ['broker_bonus', 'Agent bonus (disclosed, never counted for buyers)'], ['other', 'Other'],
  ];
  const USE_RESTRICTIONS = [['closing_costs_only', 'Closing costs only'], ['price_or_closing', 'Price or closing costs'], ['options_upgrades', 'Options and upgrades'], ['rate_buydown_only', 'Rate buydown only'], ['any', 'Any']];
  const COMBINABLE = [['not_stated', 'Not stated'], ['all', 'With all offers'], ['none', 'With no other offer'], ['listed', 'With listed offers']];
  const INCENTIVE_FIELDS = [
    { name: 'type', label: 'Type', type: 'select', options: INCENTIVE_TYPES, blank: 'Select type' },
    { name: 'value_usd', label: 'Value', hint: 'USD', type: 'number', step: '1' },
    { name: 'value_percent', label: 'Value', hint: '%', type: 'number' },
    { name: 'value_cap_usd', label: 'Cap', hint: 'USD', type: 'number', step: '1' },
    { name: 'rate', label: 'Rate', hint: '%', type: 'number' },
    { name: 'buydown_schedule', label: 'Buydown schedule', hint: 'e.g. 2,1', type: 'schedule', placeholder: '2,1' },
    { name: 'use_restriction', label: 'Use restriction', type: 'select', options: USE_RESTRICTIONS, blank: 'Not stated' },
    { name: 'requires_affiliated_lender', label: 'Requires affiliated lender', type: 'tri' },
    { name: 'contract_by', label: 'Contract by', type: 'date' },
    { name: 'close_by', label: 'Close by', type: 'date' },
    { name: 'expires_on', label: 'Expires on', type: 'date' },
    { name: 'combinable_with', label: 'Combinable with', type: 'select', options: COMBINABLE },
    { name: 'choice_group', label: 'Choice group', type: 'text' },
    { name: 'conditions_text', label: 'Conditions', type: 'textarea', full: true },
  ];
  const DIFF_FIELDS = [
    ['headline', 'Headline'], ['type', 'Type'], ['audience', 'Audience'], ['value_kind', 'Value kind'],
    ['value_usd', 'Value (USD)'], ['value_percent', 'Value (%)'], ['value_cap_usd', 'Cap (USD)'], ['rate', 'Rate'],
    ['buydown_schedule', 'Buydown'], ['use_restriction', 'Use restriction'], ['requires_affiliated_lender', 'Affiliated lender'],
    ['contract_by', 'Contract by'], ['close_by', 'Close by'], ['expires_on', 'Expires on'], ['combinable_with', 'Combinable with'],
    ['choice_group', 'Choice group'], ['conditions_text', 'Conditions'],
  ];
  const METHODS = [
    ['published_page_confirmed', 'Published page confirmed'],
    ['agent_confirmed_with_builder', 'Confirmed with builder'],
    ['builder_email', 'Builder email'],
    ['broker_portal_viewed', 'Broker portal viewed'],
    ['flyer', 'Flyer'],
  ];
  const METHOD_FOR_SOURCE = {
    promo_page: 'published_page_confirmed', community_page: 'published_page_confirmed', qmi_page: 'published_page_confirmed',
    broker_email: 'builder_email', builder_email: 'builder_email', flyer: 'flyer', sales_rep_note: 'agent_confirmed_with_builder',
    broker_portal: 'broker_portal_viewed',
  };
  const CHANGE_KIND = {
    new: ['NEW', 'info'], increase: ['INCREASE', 'ok'], decrease: ['DECREASE', 'warn'],
    removed: ['REMOVED', 'crit'], terms_changed: ['TERMS CHANGED', 'warn'], reconfirmed: ['RECONFIRMED', 'ok'],
  };
  const COMMUNITY_STATUSES = [['selling', 'Selling'], ['coming_soon', 'Coming soon'], ['closeout', 'Closeout'], ['sold_out', 'Sold out']];
  const FEE_TYPES = [['hoa', 'HOA'], ['cdd_om', 'CDD O&M'], ['cdd_debt', 'CDD debt'], ['amenity', 'Amenity'], ['other', 'Other']];
  const FEE_PERIODS = [['month', 'Monthly'], ['year', 'Yearly'], ['one_time', 'One time']];
  const HOME_STATUSES = [['available', 'Available'], ['under_contract', 'Under contract'], ['sold', 'Sold'], ['removed', 'Removed']];
  const SOURCE_KINDS = [['promo_page', 'Promo page'], ['community_page', 'Community page'], ['qmi_page', 'Quick move-in page']];
  const PASTE_KINDS = [['broker_email', 'Broker email'], ['flyer', 'Flyer'], ['sales_rep_note', 'Sales rep note'], ['promo_page', 'Promo page text']];
  const ACCESS_OPTIONS = [['unknown', 'Unknown, not reviewed'], ['allowed', 'Allowed (public pages, robots permit)'], ['permission_granted', 'Permission granted by builder'], ['blocked', 'Blocked (robots, terms or bot protection)']];
  const BUYER_STAGES = ['intake_complete', 'report_sent', 'consult_booked', 'consult_held', 'has_other_agent'];
  const INCENTIVE_STATUSES = ['verified', 'pending', 'withdrawn', 'expired', 'rejected'];
  const STATUS_TONE = { verified: 'ok', pending: 'warn', withdrawn: 'neutral', expired: 'neutral', rejected: 'crit' };

  function methodSelect(defaultMethod, disabled) {
    const id = `m${++uid}`;
    return `<label class="field" for="${id}"><span class="flabel">Verification method</span><select id="${id}" data-method${disabled ? ' disabled' : ''}>${METHODS.map(([v, l]) =>
      `<option value="${v}"${v === defaultMethod ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  }
  function canVerify() { return !!(state.me && state.me.can_verify); }
  const NO_VERIFY_TITLE = 'Only a licensed agent account can confirm incentives';

  /* ------------------------------------------------------------------ */
  /* Router                                                              */
  /* ------------------------------------------------------------------ */

  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const qi = h.indexOf('?');
    const p = qi === -1 ? h : h.slice(0, qi);
    const q = qi === -1 ? '' : h.slice(qi + 1);
    const parts = p.split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch (_) { return x; } });
    if (!parts.length) parts.push('today');
    return { parts, params: new URLSearchParams(q), key: h || 'today' };
  }

  const TITLES = {
    today: 'Today', verify: 'Verify', reports: 'Reports', compliance: 'Compliance', buyers: 'Buyers',
    registry: 'Registry', incentives: 'Incentives', billing: 'Billing', settings: 'Settings', more: 'More',
  };
  const TAB_GROUP = { today: 'today', verify: 'verify', buyers: 'buyers', registry: 'registry' };

  function setActiveNav(name) {
    $$('[data-nav]').forEach((a) => { if (a.dataset.nav === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const tab = TAB_GROUP[name] || 'more';
    $$('[data-tab]').forEach((a) => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }

  async function render() {
    const r = parseHash();
    const name = r.parts[0];
    const main = $('#main');
    const same = state.route && state.route.key === r.key;
    const keepOpen = same ? $$('details[data-key][open]', main).map((d) => d.dataset.key) : [];
    const keepY = same ? window.scrollY : 0;
    state.route = r;
    const seq = ++state.seq;
    setActiveNav(name);
    document.title = `${TITLES[name] || 'Not found'} · BuyersLine agent console`;

    const view = VIEWS[name];
    if (!view) {
      main.innerHTML = pageHead('Page not found') + emptyHTML('There is no console view at this address.', '') +
        '<div class="formbar"><a class="btn btn-primary" href="#/today">Go to Today</a></div>';
      return;
    }
    if (!same) {
      main.innerHTML = loadingHTML(`Loading ${(TITLES[name] || name).toLowerCase()}`);
      window.scrollTo(0, 0);
    }
    let html;
    try {
      html = await view(r);
    } catch (err) {
      if (seq !== state.seq) return;
      if (err && err.status === 401) return;
      main.innerHTML = pageHead(TITLES[name] || name) + errorHTML(TITLES[name] ? TITLES[name].toLowerCase() : 'this view', err, true);
      return;
    }
    if (seq !== state.seq) return;
    main.innerHTML = html;
    keepOpen.forEach((k) => { const d = main.querySelector(`details[data-key="${CSS.escape(k)}"]`); if (d) d.open = true; });
    if (same) window.scrollTo(0, keepY);
  }
  const refresh = () => render();

  /* ------------------------------------------------------------------ */
  /* Top bar + badges                                                    */
  /* ------------------------------------------------------------------ */

  function renderWho() {
    const u = state.me || {};
    const role = u.role === 'admin' ? chip('ADMIN', 'accent') : chip(String(u.role || 'agent').toUpperCase(), 'outline');
    $('#who').innerHTML = `<span class="who-name">${esc(u.name || u.email || 'Signed in')}</span>${role}${
      u.license_no ? `<span class="chip chip-outline hide-sm" title="License number">LIC ${esc(u.license_no)}</span>` : ''}<button type="button" class="btn btn-ghost btn-sm hide-sm" data-act="signout">Sign out</button>`;
    $('#verifyNotice').hidden = canVerify();
    measureChrome();
  }
  function measureChrome() {
    const c = $('#chrome');
    if (c) document.documentElement.style.setProperty('--top-h', c.offsetHeight + 'px');
  }
  function setBadge(key, n) {
    $$(`[data-badge="${key}"]`).forEach((b) => { b.textContent = n > 99 ? '99+' : String(n); b.hidden = !(n > 0); });
  }
  function updateBadges(t) {
    if (!t) return;
    const v = num(t.verification && t.verification.total);
    setBadge('verify', v);
    setBadge('reports', num(t.reports_pending));
    setBadge('compliance', num(t.compliance_holds));
    setBadge('leads', num(t.new_leads));
    setBadge('more', num(t.reports_pending) + num(t.compliance_holds));
  }
  function refreshBadges() { api('GET', '/agent/today').then(updateBadges).catch(() => {}); }

  /* ------------------------------------------------------------------ */
  /* View: Today                                                         */
  /* ------------------------------------------------------------------ */

  async function viewToday() {
    const t = await api('GET', '/agent/today');
    updateBadges(t);
    const v = t.verification || {};
    const total = num(v.total);
    const reports = num(t.reports_pending);
    const holds = num(t.compliance_holds);
    const est = total + reports + holds;
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const kindChip = (label, n, tone) => `<span class="chip chip-${tone}${num(n) ? '' : ' dim'}">${esc(label)} <b>${num(n)}</b></span>`;

    let deadlines = '';
    const dl = t.deadlines;
    if (Array.isArray(dl)) {
      const items = dl.slice(0, 5).map((d) => {
        const label = d.headline || d.label || d.title || d.community || 'Deadline';
        const when = d.date || d.deadline || d.due_on || d.expires_on || d.close_by || d.contract_by;
        const where = d.community && d.community !== label ? ` <span class="muted">· ${esc(d.community)}</span>` : '';
        return `<li><span>${esc(label)}${where}</span>${timeTag(when)}</li>`;
      }).join('');
      deadlines = qcard('Deadlines, next 21 days', dl.length, items ? `<ul class="dl-list">${items}</ul>` : '<p>No incentive deadlines in the next 21 days.</p>', '#/incentives', 'See incentives');
    } else {
      deadlines = qcard('Deadlines, next 21 days', num(dl), '<p>Incentive contract, close and expiry dates coming up.</p>', '#/incentives', 'See incentives');
    }

    return `
      ${pageHead('Today', esc(today))}
      <p class="estimate"><span>Estimated review time: about <span class="mono">${est}</span> min</span><span class="small">estimate, 1 min per card, report and hold</span></p>
      <div class="qgrid section">
        <section class="card qcard lead">
          <div class="qhead"><div><h2>Verification queue</h2><p>Incentive changes waiting for a licensed confirmation before buyers see them.</p></div><span class="big${total ? '' : ' zero'}">${total}</span></div>
          <div class="chips">
            ${kindChip('NEW', v.new, 'info')}
            ${kindChip('INCREASE', v.increase, 'ok')}
            ${kindChip('DECREASE HIDDEN', v.decrease_hidden, 'warn')}
            ${kindChip('TERMS', v.terms, 'warn')}
            ${v.removed !== undefined ? kindChip('REMOVED', v.removed, 'crit') : ''}
            ${kindChip('RECONFIRM', v.reconfirm, 'outline')}
          </div>
          <a class="btn btn-primary" href="#/verify">${total ? 'Start verifying' : 'Open verification'}</a>
        </section>
        ${qcard('Reports awaiting review', reports, '<p>Buyer reports that need your approval before they are shared.</p>', '#/reports', 'Review reports', reports > 0)}
        ${qcard('Compliance holds', holds, '<p>Items stopped by the compliance check. Release requires a note.</p>', '#/compliance', 'Review holds', holds > 0)}
        ${qcard('Buyers stopped at the gate', num(t.gate_stops), '<p>Buyers who did not pass intake, for example another agent or a prior builder visit.</p>', '#/buyers?stage=has_other_agent', 'See buyers')}
        ${qcard('Consult requests', num(t.consult_requests), '<p>Buyers asking to talk with you.</p>', '#/buyers?stage=consult_booked', 'See buyers', num(t.consult_requests) > 0)}
        ${deadlines}
        ${qcard('Billable consults this month', num(t.billable_consults_month), '<p>Consults marked held that count toward this month\'s invoice.</p>', '#/billing', 'Open billing')}
      </div>`;
  }
  function qcard(title, n, body, href, cta, primary) {
    return `<section class="card qcard"><div class="qhead"><h2>${esc(title)}</h2><span class="big${n ? '' : ' zero'}">${num(n)}</span></div>${body}<a class="btn${primary ? ' btn-primary' : ''}" href="${href}">${esc(cta)}</a></section>`;
  }

  /* ------------------------------------------------------------------ */
  /* View: Verify                                                        */
  /* ------------------------------------------------------------------ */

  const SNOOZE_KEY = 'incentiva_snoozed_cards';
  function getSnoozed() {
    try { return new Set(JSON.parse(sessionStorage.getItem(SNOOZE_KEY) || '[]').map(String)); }
    catch (_) { return new Set(state.snoozeMem); }
  }
  function setSnoozed(set) {
    state.snoozeMem = new Set(set);
    try { sessionStorage.setItem(SNOOZE_KEY, JSON.stringify(Array.from(set))); } catch (_) { /* memory only */ }
  }

  const EMPTY_CARDS = emptyHTML('No verification cards.', 'Paste a builder email or fetch a source in Registry.');
  const EMPTY_RECONFIRM = emptyHTML('Nothing is due for reconfirmation.', 'Verified incentives appear here when their freshness window runs out.');

  async function viewVerify() {
    const d = await api('GET', '/agent/verifications');
    const cards = Array.isArray(d.cards) ? d.cards : [];
    const reconfirm = Array.isArray(d.reconfirm) ? d.reconfirm : [];
    state.cards = new Map(cards.map((c) => [String(c.version_id), c]));
    const snoozed = getSnoozed();
    const visible = cards.filter((c) => !snoozed.has(String(c.version_id)));
    const hidden = cards.length - visible.length;

    const snoozeBar = hidden
      ? `<div class="snoozebar"><span><span class="mono">${hidden}</span> snoozed on this device for this browser tab only. Nothing was saved on the server.</span><button type="button" class="btn btn-sm" data-act="unsnooze">Show snoozed</button></div>`
      : '';

    return `
      ${pageHead('Verify', 'Confirm what the source actually says. Nothing reaches a buyer until a licensed agent confirms it.', '<a class="btn" href="#/registry">Add a source</a>')}
      <section class="section" style="margin-top:0">
        <div class="shead"><h2>Changes to review <span class="count" data-count>${visible.length}</span></h2></div>
        ${snoozeBar}
        ${visible.length ? `<div class="vlist">${visible.map(vcardHTML).join('')}</div>` : (cards.length ? emptyHTML('All cards are snoozed.', 'Use Show snoozed to bring them back.') : EMPTY_CARDS)}
      </section>
      <section class="section">
        <div class="shead"><h2>Reconfirm <span class="count" data-count>${reconfirm.length}</span></h2><span class="small muted">Verified incentives whose freshness window has run out.</span></div>
        ${reconfirm.length ? `<ul class="rlist card">${reconfirm.map(reconfirmRowHTML).join('')}</ul>` : EMPTY_RECONFIRM}
      </section>`;
  }

  function fmtField(key, v) {
    if (isBlank(v)) return DASH;
    switch (key) {
      case 'value_usd': case 'value_cap_usd': return usdCell(v);
      case 'value_percent': case 'rate': return `<span class="mono">${esc(v)}%</span>`;
      case 'buydown_schedule': return `<span class="mono">${esc(Array.isArray(v) ? v.join('-') : v)}</span>`;
      case 'requires_affiliated_lender': return v === true ? 'Yes' : v === false ? 'No' : DASH;
      case 'contract_by': case 'close_by': case 'expires_on': return timeTag(v);
      case 'type': case 'audience': case 'value_kind': case 'use_restriction': return esc(humanize(plain(v)));
      default: return esc(plain(v));
    }
  }

  function excerptHTML(src) {
    const ex = String(src.excerpt || '');
    if (!ex) return '<p class="muted small">No excerpt stored for this source.</p>';
    let note = '';
    if (Array.isArray(src.span) && src.span.length === 2 && Number.isFinite(Number(src.span[0])) && Number.isFinite(Number(src.span[1]))) {
      const off = num(src.excerpt_offset);
      let s = Number(src.span[0]) - off;
      let e = Number(src.span[1]) - off;
      if (e <= 0 || s >= ex.length || e <= s) {
        note = '<p class="small muted">The extracted span falls outside the stored excerpt.</p>';
      } else {
        s = Math.max(0, s); e = Math.min(ex.length, e);
        return `<pre class="excerpt">${esc(ex.slice(0, s))}<mark>${esc(ex.slice(s, e))}</mark>${esc(ex.slice(e))}</pre><p class="small muted">Highlighted: the text the extraction came from.</p>`;
      }
    } else {
      note = '<p class="small muted">No extracted span recorded for this card.</p>';
    }
    return `<pre class="excerpt">${esc(ex)}</pre>${note}`;
  }

  function confidenceHTML(c) {
    if (c === null || c === undefined || !Number.isFinite(Number(c))) return '<p class="small muted">Extraction confidence not recorded.</p>';
    let n = Number(c);
    if (n > 1) n = n / 100;
    n = Math.max(0, Math.min(1, n));
    const pct = Math.round(n * 100);
    const tone = n < 0.6 ? 'crit' : n < 0.8 ? 'warn' : 'ok';
    return `<div class="row" style="gap:10px"><span class="small muted">Extraction confidence</span><div class="meter" role="meter" aria-label="Extraction confidence" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span class="tone-${tone}" style="width:${pct}%"></span></div><span class="mono small">${pct}%</span></div>`;
  }

  function vcardHTML(c) {
    const vid = String(c.version_id);
    const after = c.after || {};
    const before = c.before || null;
    const src = c.source || {};
    const [kindLabel, kindTone] = CHANGE_KIND[c.change_kind] || [String(c.change_kind || 'change').toUpperCase(), 'neutral'];
    const downward = c.change_kind === 'decrease' || c.change_kind === 'removed';
    let visibility = '';
    if (c.hidden_from_buyers === true || (downward && c.hidden_from_buyers !== false)) visibility = chip('Already hidden from buyers', 'outline');
    else if (downward && c.hidden_from_buyers === false) visibility = chip('Still visible to buyers', 'crit');

    const rows = DIFF_FIELDS.filter(([k]) => !isBlank(after[k]) || (before && !isBlank(before[k])));
    const changedCount = before ? rows.filter(([k]) => !sameVal(before[k], after[k])).length : 0;
    const diff = rows.length ? `
      <div class="tablewrap"><table class="rtable difftable">
        <thead><tr><th>Field</th>${before ? '<th>Before</th>' : ''}<th>${before ? 'After' : 'Extracted'}</th></tr></thead>
        <tbody>${rows.map(([k, label]) => {
          const changed = before && !sameVal(before[k], after[k]);
          return `<tr${changed ? ' class="changed"' : ''}><td data-label="">${esc(label)}${changed ? ' <span class="chip chip-warn">CHANGED</span>' : ''}</td>${
            before ? `<td data-label="Before"${changed ? ' class="was"' : ''}>${fmtField(k, before[k])}</td>` : ''}<td data-label="${before ? 'After' : 'Extracted'}" class="after">${fmtField(k, after[k])}</td></tr>`;
        }).join('')}</tbody>
      </table></div>` : '<p class="muted">No fields were extracted for this card.</p>';

    const url = safeUrl(src.url);
    const questions = Array.isArray(c.verifier_questions) ? c.verifier_questions.filter((q) => !isBlank(q)) : [];
    const cv = canVerify();
    const dis = cv ? '' : ` disabled title="${NO_VERIFY_TITLE}"`;
    const defaultMethod = METHOD_FOR_SOURCE[src.kind] || 'published_page_confirmed';
    const changeNote = before ? `<span class="small muted">${changedCount} field${changedCount === 1 ? '' : 's'} changed</span>` : '<span class="small muted">New incentive, no prior version</span>';

    return `
    <article class="card vcard" data-scope data-item data-vid="${esc(vid)}">
      <header class="vhead">
        <div><div class="eyebrow">${esc(c.builder || 'Unknown builder')} &middot; ${esc(c.community || 'Unknown community')}</div><h3>${esc(after.headline || 'Untitled incentive')}</h3></div>
        <div class="chips">${chip(kindLabel, kindTone)}${visibility}</div>
      </header>
      <div class="vbody">
        <div class="row" style="justify-content:space-between">${changeNote}<span class="small muted">Card created ${timeTag(c.created_at, true)}</span></div>
        ${diff}
        <div class="vsplit">
          <div class="source">
            <div class="meta">${chip(humanize(src.kind || 'source'), 'outline')}${url ? `<a class="break" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open source</a>` : '<span>No link</span>'}<span>Snapshot ${timeTag(src.fetched_at, true)}</span></div>
            ${url ? `<p class="mono small break muted" style="margin-bottom:8px">${esc(url)}</p>` : ''}
            ${excerptHTML(src)}
          </div>
          <div class="stack">
            ${confidenceHTML(c.extraction_confidence)}
            <div><h4>Questions for the verifier</h4>${questions.length ? `<ol class="questions">${questions.map((q) => `<li>${esc(plain(q))}</li>`).join('')}</ol>` : '<p class="small muted">None raised by the extraction.</p>'}</div>
          </div>
        </div>
        <details class="fold" data-key="edit-${esc(vid)}">
          <summary>Edit fields before confirming</summary>
          <div class="fold-body">
            <form data-form="confirmEdits" data-vid="${esc(vid)}" novalidate>
              ${fieldsHTML(INCENTIVE_FIELDS, after)}
              <div class="formbar"><button type="submit" class="btn btn-primary"${dis}>Save edits and confirm</button><span class="small muted">Only changed fields are sent, with the verification method selected below.</span></div>
            </form>
          </div>
        </details>
      </div>
      <div class="vactions">
        ${methodSelect(defaultMethod, false)}
        <button type="button" class="btn btn-primary" data-act="confirm"${dis}>Confirm</button>
        <button type="button" class="btn btn-danger" data-act="rejectOpen">Reject</button>
        <button type="button" class="btn btn-ghost" data-act="snooze" title="Hides this card in this browser tab only. Nothing is saved.">Snooze (this tab only)</button>
      </div>
      <form class="rejectbox" data-form="reject" data-vid="${esc(vid)}" hidden novalidate>
        <label class="field"><span class="flabel">Reason for rejecting (required)</span><textarea name="reason" rows="3" placeholder="For example: the source does not state an expiry, or the offer applies to a different community."></textarea></label>
        <div class="formbar"><button type="submit" class="btn btn-danger-solid">Reject card</button><button type="button" class="btn btn-ghost" data-act="rejectCancel">Cancel</button></div>
      </form>
      <p data-status hidden></p>
    </article>`;
  }

  function reconfirmRowHTML(r) {
    const days = daysUntil(r.fresh_until);
    const staleNote = days === null ? 'No freshness date' : days < 0 ? `Stale for ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}` : days === 0 ? 'Goes stale today' : `Fresh for ${days} more day${days === 1 ? '' : 's'}`;
    const cv = canVerify();
    return `<li data-scope data-item data-iid="${esc(r.incentive_id)}">
      <div class="grow" style="min-width:220px">
        <div class="eyebrow">${esc(r.builder || '')} &middot; ${esc(r.community || '')}</div>
        <div style="font-weight:600">${esc(r.headline || 'Untitled incentive')}</div>
        <div class="small muted">Last verified ${timeTag(r.last_verified_at, true)} &middot; <span class="mono">${esc(staleNote)}</span></div>
      </div>
      ${methodSelect('published_page_confirmed', false)}
      <button type="button" class="btn btn-primary" data-act="reconfirm"${cv ? '' : ` disabled title="${NO_VERIFY_TITLE}"`}>Reconfirm</button>
      <p data-status hidden style="flex-basis:100%"></p>
    </li>`;
  }

  /* ------------------------------------------------------------------ */
  /* View: Reports                                                       */
  /* ------------------------------------------------------------------ */

  const EMPTY_REPORTS = emptyHTML('No reports awaiting review.', 'New buyer reports land here before anyone outside the console can read them.');

  async function viewReports() {
    const d = await api('GET', '/agent/reports?status=pending_review');
    const reports = Array.isArray(d.reports) ? d.reports : [];
    return `
      ${pageHead('Reports', 'Buyer reports waiting for your approval.')}
      <section class="section" style="margin-top:0">
        <div class="shead"><h2>Awaiting review <span class="count" data-count>${reports.length}</span></h2></div>
        ${reports.length ? `<div class="vlist">${reports.map(reportCardHTML).join('')}</div>` : EMPTY_REPORTS}
      </section>`;
  }
  function reportCardHTML(r) {
    const comp = r.compliance || {};
    const href = r.token ? `${BASE}/r/${encodeURIComponent(r.token)}?preview=${encodeURIComponent(r.id)}` : null;
    return `<article class="card" data-scope data-item data-rid="${esc(r.id)}">
      <div class="qhead" style="flex-wrap:wrap">
        <div><h3>${esc(r.buyer_first_name || 'Buyer')}</h3><p class="small muted">Created ${timeTag(r.created_at, true)} &middot; <span class="mono">${num(r.items_count)}</span> item${num(r.items_count) === 1 ? '' : 's'}</p></div>
        <div class="chips"><span class="small muted">Compliance</span>${verdictChip(comp.verdict)}</div>
      </div>
      <div class="section" style="margin-top:12px"><h4 style="margin-bottom:8px">Findings</h4>${findingsHTML(comp.findings)}</div>
      <div data-extra></div>
      <div class="formbar">
        ${href ? `<a class="btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Preview report</a>` : '<span class="small muted">No report link available</span>'}
        <button type="button" class="btn btn-primary" data-act="approveReport">Approve</button>
        <button type="button" class="btn btn-danger" data-act="holdOpen">Hold</button>
      </div>
      <form data-form="holdReport" data-rid="${esc(r.id)}" hidden novalidate style="margin-top:12px">
        <label class="field"><span class="flabel">Hold note (required)</span><textarea name="note" rows="3" placeholder="What needs to change before this report can go out?"></textarea></label>
        <div class="formbar"><button type="submit" class="btn btn-danger-solid">Place on hold</button><button type="button" class="btn btn-ghost" data-act="holdCancel">Cancel</button></div>
      </form>
      <p data-status hidden></p>
    </article>`;
  }

  /* ------------------------------------------------------------------ */
  /* View: Compliance                                                    */
  /* ------------------------------------------------------------------ */

  const EMPTY_HOLDS = emptyHTML('No compliance holds.', 'Anything the compliance check stops will appear here with its findings.');

  async function viewCompliance() {
    const d = await api('GET', '/agent/compliance');
    const holds = Array.isArray(d.holds) ? d.holds : [];
    return `
      ${pageHead('Compliance', 'Items stopped by the compliance check. A hold can be released with a note; a block cannot.')}
      <section class="section" style="margin-top:0">
        <div class="shead"><h2>Open holds <span class="count" data-count>${holds.length}</span></h2></div>
        ${holds.length ? `<div class="vlist">${holds.map(holdCardHTML).join('')}</div>` : EMPTY_HOLDS}
      </section>`;
  }
  function holdCardHTML(h) {
    const blocked = h.verdict === 'block';
    return `<article class="card" data-scope data-item data-hid="${esc(h.id)}">
      <div class="qhead" style="flex-wrap:wrap">
        <div><h3>${esc(humanize(h.subject_type || 'item'))} <span class="mono muted">#${esc(h.subject_id)}</span></h3><p class="small muted">Flagged ${timeTag(h.created_at, true)}</p></div>
        ${verdictChip(h.verdict)}
      </div>
      <div style="margin-top:12px">${findingsHTML(h.findings)}</div>
      ${blocked
        ? '<p class="status status-crit">This is a block. Blocks cannot be released; fix the underlying content so it is checked again.</p>'
        : `<form data-form="releaseHold" data-hid="${esc(h.id)}" novalidate style="margin-top:14px">
            <label class="field"><span class="flabel">Release note (required)</span><textarea name="note" rows="3" placeholder="Why this is acceptable to release, and what you checked."></textarea></label>
            <div class="formbar"><button type="submit" class="btn btn-primary">Release</button></div>
          </form>`}
      <p data-status hidden></p>
    </article>`;
  }

  /* ------------------------------------------------------------------ */
  /* View: Buyers                                                        */
  /* ------------------------------------------------------------------ */

  const STAGE_TONE = (s) => {
    s = String(s || '');
    if (/lost|withdrawn|closed_lost/.test(s)) return 'neutral';
    if (/contract|closed/.test(s)) return 'ok';
    if (/consult/.test(s)) return 'info';
    if (/gate|hold/.test(s)) return 'warn';
    return 'accent';
  };

  /* ------------------------------------------------------------------ */
  /* View: Leads (Ana conversational intake)                          */
  /* ------------------------------------------------------------------ */

  const LEAD_STATUSES = [['new', 'New'], ['contacted', 'Contacted'], ['working', 'Working'], ['closed', 'Closed'], ['lost', 'Lost']];
  const LEAD_TONE = { new: 'info', contacted: 'warn', working: 'warn', closed: 'ok', lost: 'neutral' };
  const TL_LABEL = { '0_3m': 'Within 3 months', '3_6m': '3 to 6 months', '6_12m': '6 to 12 months', '12m_plus': 'More than 12 months' };
  const FIN_LABEL = { preapproved: 'Pre-approved', cash: 'Cash', needs_lender: 'Needs a lender', va: 'VA loan', fha: 'FHA loan', unsure: 'Not sure yet' };
  const AGENT_LABEL = { no: 'No agent', yes_under_agreement: 'Signed with another agent', yes_informal: 'Has an agent, nothing signed' };

  function leadFlags(l) {
    const f = [];
    if (l.agent_agreement_signed || l.has_agent === 'yes_under_agreement') f.push(chip('Under agreement: do not contact', 'crit'));
    else if (l.has_agent === 'yes_informal') f.push(chip('Has an agent, nothing signed', 'warn'));
    if (num(l.visited_count) > 0) f.push(chip(`Visited ${num(l.visited_count)} sales office${num(l.visited_count) === 1 ? '' : 's'}`, 'warn'));
    if (!l.referral_consent) f.push(chip('Report only: no outreach consent', 'outline'));
    return f;
  }

  async function viewLeads(r) {
    if (r.parts[1]) return viewLeadDetail(r.parts[1]);
    const status = r.params.get('status') || '';
    const d = await api('GET', '/agent/leads' + (status ? `?status=${encodeURIComponent(status)}` : ''));
    const leads = Array.isArray(d.leads) ? d.leads : [];
    const counts = d.counts || {};
    const filter = `<label class="field" style="min-width:220px"><span class="flabel">Status</span><select data-change="leadFilter">
      <option value="">All statuses</option>${LEAD_STATUSES.map(([v, l]) => `<option value="${v}"${v === status ? ' selected' : ''}>${esc(l)} (${num(counts[v])})</option>`).join('')}</select></label>`;
    const table = leads.length ? `<div class="tablewrap card" style="padding:4px 8px"><table class="rtable">
      <thead><tr><th>Lead</th><th>Status</th><th>Area</th><th class="num">Max price</th><th>Move</th><th>Paying</th><th>Picked</th><th>Assigned</th><th>Created</th><th>Flags</th></tr></thead>
      <tbody>${leads.map((l) => `<tr>
        <td data-label="Lead"><a href="#/leads/${encodeURIComponent(l.id)}" style="font-weight:600">${esc(l.first_name || 'Lead')}</a> <span class="mono small muted">${esc(String(l.lang || '').toUpperCase())}</span></td>
        <td data-label="Status">${chip(humanize(l.status), LEAD_TONE[l.status])}</td>
        <td data-label="Area">${textCell([l.city, l.zip].filter(Boolean).join(' '))}</td>
        <td data-label="Max price" class="num">${usdCell(l.max_price)}</td>
        <td data-label="Move">${textCell(TL_LABEL[l.move_timeline])}</td>
        <td data-label="Paying">${textCell(FIN_LABEL[l.financing_type])}</td>
        <td data-label="Picked"><span class="mono">${num(l.selected_count)}</span></td>
        <td data-label="Assigned">${textCell(l.assigned_agent_name)}</td>
        <td data-label="Created">${timeTag(l.created_at, true)}</td>
        <td data-label="Flags"><div class="chips">${leadFlags(l).join('')}</div></td>
      </tr>`).join('')}</tbody></table></div>`
      : emptyHTML(status ? `No leads with status "${humanize(status)}".` : 'No leads yet.', 'Leads appear here when a buyer finishes the conversation with Ana on the public site.');
    return `${pageHead('Leads', `<span class="mono">${leads.length}</span> shown`, filter)}${table}`;
  }

  async function viewLeadDetail(id) {
    const d = await api('GET', `/agent/leads/${encodeURIComponent(id)}`);
    const l = d.lead || {};
    const isAdmin = state.me && state.me.role === 'admin';
    const under = l.agent_agreement_signed || l.has_agent === 'yes_under_agreement';
    const visits = Array.isArray(d.visited_offices) ? d.visited_offices : [];
    const rows = Array.isArray(d.research_rows) ? d.research_rows : [];
    const selIds = new Set((Array.isArray(d.selections) ? d.selections : []).map((s) => s.id));
    const run = d.research_run || null;

    const repBox = under
      ? `<div class="errbox" role="alert"><strong>Signed with another agent. Do not contact or solicit this buyer.</strong>No email or phone was stored and every consent was recorded as not granted.</div>`
      : l.has_agent === 'yes_informal'
        ? `<div class="status status-warn" role="note"><strong>The buyer has an agent but nothing is signed.</strong> Confirm before you register them with any builder.</div>`
        : `<div class="status status-ok" role="note"><strong>No agent.</strong> The buyer can still be represented, subject to the sales offices below.</div>`;
    const visitsBox = visits.length
      ? `<div class="status status-warn" role="alert"><strong>Already visited ${visits.length} sales office${visits.length === 1 ? '' : 's'}.</strong> Check each builder's registration rule before you represent this buyer there.</div>
        <ul class="plain">${visits.map((v) => `<li><div><div style="font-weight:600">${esc(v.community || 'Community not given')}</div><div class="small muted">${esc(v.builder || 'Builder not given')}</div></div></li>`).join('')}</ul>`
      : '<p class="muted">The buyer reported no sales office visits.</p>';

    const kv = [['Area', [l.area_input && l.area_input !== l.zip ? l.area_input : null, l.city, l.county ? l.county + ' County' : null, l.zip].filter(Boolean).join(' · ')], ['Max price', fmtUSD(l.max_price)], ['Max monthly', l.max_monthly != null ? fmtUSD(l.max_monthly) : 'Not given'],
      ['Down payment', l.down_payment != null ? fmtUSD(l.down_payment) : 'Not given'], ['Move', TL_LABEL[l.move_timeline] || l.move_timeline], ['Paying', FIN_LABEL[l.financing_type] || l.financing_type], ['Language', String(l.lang || '').toUpperCase()]];
    const email = l.email ? `<a href="mailto:${esc(encodeURIComponent(l.email).replace(/%40/g, '@'))}">${esc(l.email)}</a>` : DASH;
    const phone = l.phone ? `<a class="mono" href="tel:${esc(String(l.phone).replace(/[^\d+]/g, ''))}">${esc(l.phone)}</a>` : DASH;

    const consents = Array.isArray(d.consents) ? d.consents : [];
    const consentHTML = consents.length ? `<ul class="plain">${consents.map((c) => `<li><div class="grow stack" style="min-width:240px">
      <div class="row">${chip(humanize(c.channel), 'outline')}${c.revoked_at ? chip('REVOKED', 'crit') : c.granted ? chip('GRANTED', 'ok') : chip('NOT GRANTED', 'neutral')}</div>
      <blockquote class="quote">${esc(c.consent_text)}</blockquote>
      <p class="small muted">${timeTag(c.granted_at, true)} &middot; version <span class="mono">${esc(c.consent_version)}</span> &middot; IP <span class="mono">${esc(c.ip || 'not recorded')}</span>${c.revoked_at ? ` &middot; revoked ${timeTag(c.revoked_at, true)} via ${esc(humanize(c.revoked_via || ''))}` : ''}</p>
      ${c.user_agent ? `<p class="small muted">${esc(c.user_agent)}</p>` : ''}</div></li>`).join('')}</ul>` : '<p class="muted">No consent records.</p>';

    const rowCells = (x) => {
      const src = safeUrl(x.source_url);
      const badge = x.origin === 'agent_verified' ? chip('Agent verified', 'ok') : x.verified ? chip('Source seen in search', 'info') : chip('Unverified', 'warn');
      return `<td data-label="Builder / community"><strong>${esc(x.community || '')}</strong><div class="small muted">${esc(x.builder)}</div><div class="chips">${badge}${x.hidden_reason ? chip('Hidden from buyer: ' + humanize(x.hidden_reason), 'crit') : ''}${selIds.has(x.id) ? chip('Buyer picked', 'ok') : ''}</div></td>
        <td data-label="Starting price">${textCell(x.starting_price)}</td>
        <td data-label="Promotion">${textCell(x.promotion)}${x.other_incentives ? `<div class="small muted">${esc(x.other_incentives)}</div>` : ''}</td>
        <td data-label="Rate / closing">${textCell([x.rate, x.closing_credit].filter(Boolean).join(' · '))}</td>
        <td data-label="Expiration">${textCell(x.expiration)}</td>
        <td data-label="Restrictions">${textCell(x.restrictions)}</td>
        <td data-label="HOA / CDD">${textCell([x.hoa, x.cdd].filter(Boolean).join(' · '))}</td>
        <td data-label="Source">${src ? `<a href="${esc(src)}" target="_blank" rel="noopener noreferrer">${esc(new URL(src).hostname)}</a>` : DASH}<div class="small muted">Checked ${esc(x.date_checked || 'unknown')}</div></td>`;
    };
    const tableOf = (list) => list.length ? `<div class="tablewrap"><table class="rtable"><thead><tr><th>Builder / community</th><th>Starting price</th><th>Promotion</th><th>Rate / closing</th><th>Expiration</th><th>Restrictions</th><th>HOA / CDD</th><th>Source</th></tr></thead>
      <tbody>${list.map((x) => `<tr>${rowCells(x)}</tr>`).join('')}</tbody></table></div>` : '<p class="muted">None.</p>';
    const picked = rows.filter((x) => selIds.has(x.id));
    const runMeta = run ? `<p class="small muted">Run #${esc(run.id)} for ${esc(run.area_label || run.zip || '')} &middot; ${esc(humanize(run.source))}${run.model ? ' &middot; ' + esc(run.model) : ''} &middot; ${num(run.searches)} searches &middot; finished ${timeTag(run.finished_at, true)}${run.notice ? ' &middot; ' + esc(humanize(run.notice)) : ''}${run.error ? ' &middot; error: ' + esc(run.error) : ''}</p>` : '<p class="muted">No research run is attached to this lead.</p>';
    const inv = run && Array.isArray(run.inventory) && run.inventory.length ? `<ul class="plain">${run.inventory.map((h) => { const src = safeUrl(h.source_url); return `<li><div><strong>${esc([h.builder, h.community].filter(Boolean).join(' · '))}</strong> ${esc(h.home || '')} ${esc(h.price || '')}<div class="small muted">${esc(h.note || '')}</div></div>${src ? `<a class="small" href="${esc(src)}" target="_blank" rel="noopener noreferrer">Source</a>` : ''}</li>`; }).join('')}</ul>` : '<p class="muted">No motivated inventory listed.</p>';

    const agents = Array.isArray(d.agents) ? d.agents : [];
    const statusSel = `<label class="field" style="min-width:180px"><span class="flabel">Status</span><select data-change="leadStatus" data-lid="${esc(l.id)}">${LEAD_STATUSES.map(([v, t]) => `<option value="${v}"${v === l.status ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    const assignSel = isAdmin ? `<label class="field" style="min-width:220px"><span class="flabel">Assigned agent</span><select data-change="leadAssign" data-lid="${esc(l.id)}"><option value="">Unassigned</option>${agents.map((a) => `<option value="${esc(a.id)}"${Number(a.id) === Number(l.assigned_agent_id) ? ' selected' : ''}>${esc(a.name)} (${esc(a.role)})</option>`).join('')}</select></label>` : `<p class="small muted">Assigned to ${esc(l.assigned_agent ? l.assigned_agent.name : 'nobody')}</p>`;
    const notes = Array.isArray(d.notifications) ? d.notifications : [];
    const notesHTML = notes.length ? `<ul class="plain">${notes.map((n) => `<li><div><strong>${esc(humanize(n.action))}</strong> <span class="small muted">${timeTag(n.created_at, true)}</span></div></li>`).join('')}</ul>` : `<p class="muted">${l.referral_consent ? 'No notification recorded yet.' : 'No notifications: the buyer did not agree to agent contact.'}</p>`;

    return `
      <a class="crumb" href="#/leads">Back to all leads</a>
      ${pageHead(l.first_name || 'Lead', `${chip(humanize(l.status), LEAD_TONE[l.status])} ${l.referral_consent ? chip('Agent contact allowed', 'ok') : chip('Report only: no outreach consent', 'outline')} &middot; since ${timeTag(l.created_at)}`, `<div class="row" data-scope>${statusSel}${assignSel}<p data-status hidden></p></div>`)}
      <div class="stack">
        <section class="card"><h4 style="margin-bottom:10px">Representation</h4>${repBox}<h4 style="margin:14px 0 8px">Sales offices already visited</h4>${visitsBox}</section>
        <section class="card"><h4 style="margin-bottom:10px">Contact</h4><dl class="kv"><div><dt>Email</dt><dd>${email}</dd></div><div><dt>Phone</dt><dd>${phone}</dd></div></dl></section>
        <section class="card"><h4 style="margin-bottom:10px">Criteria</h4><dl class="kv">${kv.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v || '')}</dd></div>`).join('')}</dl></section>
        <section class="card"><h4 style="margin-bottom:10px">Communities the buyer picked (${picked.length})</h4>${tableOf(picked)}</section>
        <section class="card"><h4 style="margin-bottom:6px">Full research snapshot</h4>${runMeta}${tableOf(rows)}<h4 style="margin:14px 0 8px">Motivated inventory</h4>${inv}</section>
        <section class="card"><h4 style="margin-bottom:10px">Consent records</h4>${consentHTML}</section>
        <section class="card"><h4 style="margin-bottom:10px">Notifications</h4>${notesHTML}</section>
      </div>`;
  }

  async function viewBuyers(r) {
    if (r.parts[1]) return viewBuyerDetail(r.parts[1]);
    const stage = r.params.get('stage') || '';
    const d = await api('GET', '/agent/buyers' + (stage ? `?stage=${encodeURIComponent(stage)}` : ''));
    const buyers = Array.isArray(d.buyers) ? d.buyers : [];
    const stages = BUYER_STAGES.slice();
    buyers.forEach((b) => { if (b.stage && !stages.includes(b.stage)) stages.push(b.stage); });
    if (stage && !stages.includes(stage)) stages.push(stage);

    const filter = `<label class="field" style="min-width:220px"><span class="flabel">Stage</span><select data-change="buyerStage">
      <option value="">All stages</option>${stages.map((s) => `<option value="${esc(s)}"${s === stage ? ' selected' : ''}>${esc(humanize(s))}</option>`).join('')}</select></label>`;

    const table = buyers.length ? `<div class="tablewrap card" style="padding:4px 8px"><table class="rtable">
      <thead><tr><th>Buyer</th><th>Stage</th><th>Area</th><th class="num">Budget</th><th>Timeline</th><th>Financing</th><th>Lang</th><th>Last activity</th><th>Gate flags</th></tr></thead>
      <tbody>${buyers.map((b) => {
        const flags = [];
        if (b.has_other_agent) flags.push(chip('Has another agent', 'crit'));
        if (num(b.prior_visits_count) > 0) flags.push(chip(`${num(b.prior_visits_count)} prior builder visit${num(b.prior_visits_count) === 1 ? '' : 's'}`, 'warn'));
        return `<tr>
          <td data-label="Buyer"><a href="#/buyers/${encodeURIComponent(b.id)}" style="font-weight:600">${esc(b.first_name || 'Unnamed buyer')}</a></td>
          <td data-label="Stage">${chip(humanize(b.stage || 'unknown'), STAGE_TONE(b.stage))}</td>
          <td data-label="Area">${textCell(b.area)}</td>
          <td data-label="Budget" class="num">${isBlank(b.budget_max) ? DASH : `up to ${esc(fmtUSD(b.budget_max))}`}</td>
          <td data-label="Timeline">${textCell(b.timeline_label)}</td>
          <td data-label="Financing">${textCell(b.financing_label)}</td>
          <td data-label="Language"><span class="mono">${esc(String(b.language || '').toUpperCase()) || DASH}</span></td>
          <td data-label="Last activity">${timeTag(b.last_activity_at, true)}</td>
          <td data-label="Gate flags">${flags.length ? `<div class="chips">${flags.join('')}</div>` : '<span class="muted small">None</span>'}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`
      : emptyHTML(stage ? `No buyers at stage "${humanize(stage)}".` : 'No buyers yet.', stage ? 'Choose All stages to see everyone.' : 'Buyers appear here once they start intake on the public site.');

    return `${pageHead('Buyers', `<span class="mono">${buyers.length}</span> ${stage ? 'at this stage' : 'total'}`, filter)}${table}`;
  }

  async function viewBuyerDetail(id) {
    const d = await api('GET', `/agent/buyers/${encodeURIComponent(id)}`);
    const b = d.buyer || {};
    const consents = Array.isArray(d.consents) ? d.consents : [];
    const reports = Array.isArray(d.reports) ? d.reports : [];
    const appts = Array.isArray(d.appointments) ? d.appointments : [];
    const visits = Array.isArray(d.prior_builder_visits) ? d.prior_builder_visits : [];
    const activity = (Array.isArray(d.activity) ? d.activity.slice() : []).sort((a, z) => (parseDate(z.occurred_at) || 0) - (parseDate(a.occurred_at) || 0));

    const criteria = d.criteria && typeof d.criteria === 'object' ? Object.entries(d.criteria).filter(([, v]) => !isBlank(v)) : [];
    const criteriaHTML = criteria.length
      ? `<dl class="kv">${criteria.map(([k, v]) => `<div><dt>${esc(humanize(k))}</dt><dd>${/budget|price|payment|down_payment_usd|amount/.test(k) && Number.isFinite(Number(v)) && typeof v !== 'boolean' ? `<span class="mono">${esc(fmtUSD(v))}</span>` : esc(plain(v))}</dd></div>`).join('')}</dl>`
      : '<p class="muted">No search criteria recorded.</p>';

    const email = b.email ? `<a href="mailto:${esc(encodeURIComponent(b.email).replace(/%40/g, '@'))}">${esc(b.email)}</a>` : DASH;
    const phone = b.phone ? `<a class="mono" href="tel:${esc(String(b.phone).replace(/[^\d+]/g, ''))}">${esc(b.phone)}</a>` : DASH;

    const consentHTML = consents.length ? `<ul class="plain">${consents.map((c) => {
      const tone = c.revoked_at ? chip('REVOKED', 'crit') : c.granted ? chip('GRANTED', 'ok') : chip('NOT GRANTED', 'neutral');
      return `<li><div class="grow stack" style="min-width:240px">
        <div class="row">${chip(humanize(c.channel || 'channel'), 'outline')}${tone}</div>
        ${c.consent_text ? `<blockquote class="quote">${esc(c.consent_text)}</blockquote>` : '<p class="small muted">Exact consent text not recorded.</p>'}
        <p class="small muted">Granted ${timeTag(c.granted_at, true)}${c.revoked_at ? ` &middot; Revoked ${timeTag(c.revoked_at, true)}` : ''}</p>
      </div></li>`;
    }).join('')}</ul>` : '<p class="muted">No consents on file. Do not contact this buyer by any channel that needs consent.</p>';

    const reportsHTML = reports.length ? `<ul class="plain">${reports.map((r) => `<li>
      <div><span class="mono">#${esc(r.id)}</span> ${chip(humanize(r.status || 'unknown'), r.status === 'approved' || r.status === 'sent' ? 'ok' : r.status === 'held' || r.status === 'pending_review' ? 'warn' : 'neutral')} <span class="small muted">${timeTag(r.created_at, true)}</span></div>
      ${r.token ? `<a class="btn btn-sm" href="${esc(BASE + '/r/' + encodeURIComponent(r.token))}" target="_blank" rel="noopener noreferrer">Open report</a>` : ''}
    </li>`).join('')}</ul>` : '<p class="muted">No reports yet.</p>';

    const apptHTML = appts.length ? `<div class="tablewrap"><table class="rtable">
      <thead><tr><th>Kind</th><th>Status</th><th>Preferred times</th><th>Channel</th><th>Requested</th><th>Held</th><th></th></tr></thead>
      <tbody>${appts.map((a) => {
        const held = !isBlank(a.held_at) || a.status === 'held';
        const closed = /cancel|no_show|declined/.test(String(a.status || ''));
        const pref = Array.isArray(a.preferred_times) ? a.preferred_times.map(plain).join('; ') : plain(a.preferred_times);
        return `<tr data-scope>
          <td data-label="Kind">${esc(humanize(a.kind || 'appointment'))}</td>
          <td data-label="Status">${chip(humanize(a.status || 'unknown'), held ? 'ok' : closed ? 'neutral' : 'info')}</td>
          <td data-label="Preferred times">${pref ? esc(pref) : DASH}</td>
          <td data-label="Channel">${textCell(humanize(a.channel || ''))}</td>
          <td data-label="Requested">${timeTag(a.created_at, true)}</td>
          <td data-label="Held">${timeTag(a.held_at, true)}</td>
          <td data-label="">${held || closed ? '' : `<button type="button" class="btn btn-sm btn-primary" data-act="markHeld" data-aid="${esc(a.id)}">Mark consult held</button>`}<p data-status hidden></p></td>
        </tr>`;
      }).join('')}</tbody></table></div>` : '<p class="muted">No appointments requested.</p>';

    const visitsHTML = visits.length ? `<ul class="plain">${visits.map((v) => `<li>
      <div><div style="font-weight:600">${esc(v.community || 'Unknown community')}</div><div class="small muted">${esc(v.builder || '')}</div></div>
      ${v.signed_guest_card ? chip('Signed guest card', 'warn') : chip('No guest card signed', 'outline')}
    </li>`).join('')}</ul>` : '<p class="muted">No prior builder visits reported.</p>';

    const activityHTML = activity.length ? `<ol class="timeline">${activity.map((a) => {
      let payload = '';
      if (a.payload && (typeof a.payload !== 'object' || Object.keys(a.payload).length)) {
        const s = typeof a.payload === 'object' ? JSON.stringify(a.payload) : String(a.payload);
        payload = `<span class="payload">${esc(s.length > 280 ? s.slice(0, 280) + '...' : s)}</span>`;
      }
      return `<li><div><strong>${esc(humanize(a.event || 'event'))}</strong> <span class="small muted">by ${esc(humanize(a.actor_type || 'system'))} &middot; ${timeTag(a.occurred_at, true)}</span></div>${payload}</li>`;
    }).join('')}</ol>` : '<p class="muted">No activity recorded.</p>';

    return `
      <a class="crumb" href="#/buyers">Back to all buyers</a>
      ${pageHead(b.first_name || 'Buyer', `${chip(humanize(b.stage || 'unknown'), STAGE_TONE(b.stage))} <span class="mono">${esc(String(b.language || '').toUpperCase())}</span> &middot; since ${timeTag(b.created_at)}`)}
      <div class="stack">
        <section class="card"><h4 style="margin-bottom:10px">Contact</h4><dl class="kv"><div><dt>Email</dt><dd>${email}</dd></div><div><dt>Phone</dt><dd>${phone}</dd></div></dl></section>
        <section class="card"><h4 style="margin-bottom:10px">Criteria</h4>${criteriaHTML}</section>
        <section class="card"><h4 style="margin-bottom:10px">Consents</h4>${consentHTML}</section>
        <section class="card"><h4 style="margin-bottom:10px">Prior builder visits</h4>${visitsHTML}</section>
        <section class="card"><h4 style="margin-bottom:10px">Appointments</h4>${apptHTML}</section>
        <section class="card"><h4 style="margin-bottom:10px">Reports</h4>${reportsHTML}</section>
        <section class="card"><h4 style="margin-bottom:14px">Activity</h4>${activityHTML}</section>
      </div>`;
  }

  /* ------------------------------------------------------------------ */
  /* View: Registry                                                      */
  /* ------------------------------------------------------------------ */

  const BUILDER_FIELDS = [
    { name: 'name', label: 'Builder name', type: 'text', required: true },
    { name: 'website', label: 'Website', type: 'url', placeholder: 'https://' },
    { name: 'co_broke_percent', label: 'Co-broke', hint: '%', type: 'number' },
    { name: 'registration_valid_days', label: 'Registration valid', hint: 'days', type: 'number', step: '1' },
    { name: 'automated_access', label: 'Automated access', type: 'select', options: ACCESS_OPTIONS },
    { name: 'requires_first_visit_registration', label: 'Agent must register the buyer on the first visit', type: 'checkbox', full: true },
  ];
  function communityFields() {
    const counties = state.counties.length
      ? { name: 'county', label: 'County', type: 'select', options: state.counties.map((c) => [c, c]), blank: 'Select county' }
      : { name: 'county', label: 'County', type: 'text' };
    return [
      { name: 'name', label: 'Community name', type: 'text', required: true },
      { name: 'status', label: 'Status', type: 'select', options: COMMUNITY_STATUSES },
      { name: 'city', label: 'City', type: 'text' },
      counties,
      { name: 'zip', label: 'ZIP', type: 'text' },
      { name: 'lat', label: 'Latitude', type: 'number' },
      { name: 'lng', label: 'Longitude', type: 'number' },
      { name: 'url', label: 'Community page', type: 'url', placeholder: 'https://' },
      { name: 'sales_counselor_name', label: 'Sales counselor', type: 'text' },
      { name: 'sales_counselor_phone', label: 'Counselor phone', type: 'tel' },
      { name: 'sales_counselor_email', label: 'Counselor email', type: 'email' },
      { name: 'co_broke_display', label: 'Co-broke as shown', type: 'text', placeholder: 'e.g. 3% to registered agents' },
      { name: 'age_restricted', label: 'Age restricted (55+)', type: 'checkbox', full: true },
    ];
  }
  const FEE_FIELDS = [
    { name: 'fee_type', label: 'Fee type', type: 'select', options: FEE_TYPES },
    { name: 'amount_usd', label: 'Amount', hint: 'USD, blank = not confirmed', type: 'number' },
    { name: 'period', label: 'Period', type: 'select', options: FEE_PERIODS },
  ];
  const HOME_FIELDS = [
    { name: 'label', label: 'Label', type: 'text', placeholder: 'Lot 42' },
    { name: 'plan_name', label: 'Plan name', type: 'text' },
    { name: 'beds', label: 'Beds', type: 'number', step: '1' },
    { name: 'baths', label: 'Baths', type: 'number', step: '0.5' },
    { name: 'sqft', label: 'Sq ft', type: 'number', step: '1' },
    { name: 'list_price', label: 'List price', hint: 'USD', type: 'number', step: '1' },
    { name: 'est_completion', label: 'Est. completion', type: 'date' },
    { name: 'status', label: 'Status', type: 'select', options: HOME_STATUSES },
  ];
  const SOURCE_FIELDS = [
    { name: 'kind', label: 'Kind', type: 'select', options: SOURCE_KINDS },
    { name: 'url', label: 'URL', type: 'url', required: true, placeholder: 'https://' },
    { name: 'css_scope', label: 'CSS scope', hint: 'optional', type: 'text', placeholder: '.promo-banner' },
  ];
  const MANUAL_INCENTIVE_FIELDS = [{ name: 'headline', label: 'Headline', type: 'text', full: true, placeholder: 'e.g. $15,000 toward closing costs with preferred lender' }].concat(INCENTIVE_FIELDS);

  async function loadCounties() {
    if (!state.market) {
      try {
        const m = await api('GET', '/agent/settings/market');
        state.market = m.market || null;
      } catch (e) {
        if (e.status === 401) throw e;
        state.market = null;
      }
    }
    const raw = state.market && Array.isArray(state.market.counties) ? state.market.counties : [];
    state.counties = raw.map((c) => (typeof c === 'string' ? c : (c && (c.name || c.county || c.slug)) || '')).filter(Boolean);
  }

  async function viewRegistry() {
    const [bd, cd] = await Promise.all([api('GET', '/agent/builders'), api('GET', '/agent/communities'), loadCounties()]);
    const builders = Array.isArray(bd.builders) ? bd.builders : [];
    const communities = Array.isArray(cd.communities) ? cd.communities : [];
    const byBuilder = new Map();
    communities.forEach((c) => {
      const k = String(c.builder_id);
      if (!byBuilder.has(k)) byBuilder.set(k, []);
      byBuilder.get(k).push(c);
    });
    const knownIds = new Set(builders.map((b) => String(b.id)));
    const orphans = communities.filter((c) => !knownIds.has(String(c.builder_id)));

    const addForms = `
      <div class="card" style="padding:10px">
        <details class="fold" data-key="add-builder">
          <summary>Add builder</summary>
          <div class="fold-body"><form data-form="addBuilder" data-scope novalidate>${fieldsHTML(BUILDER_FIELDS, { automated_access: 'unknown' })}
            <div class="formbar"><button type="submit" class="btn btn-primary">Add builder</button></div><p data-status hidden></p></form></div>
        </details>
        <details class="fold" data-key="add-community">
          <summary>Add community</summary>
          <div class="fold-body">${builders.length ? `<form data-form="addCommunity" data-scope novalidate>
            ${fieldsHTML([{ name: 'builder_id', label: 'Builder', type: 'select', required: true, options: builders.map((b) => [String(b.id), b.name]), blank: 'Select builder' }].concat(communityFields()), { status: 'selling' })}
            <div class="formbar"><button type="submit" class="btn btn-primary">Add community</button></div><p data-status hidden></p></form>` : '<p class="muted">Add a builder first.</p>'}</div>
        </details>
      </div>`;

    const builderSections = builders.map((b) => {
      const p = b.co_broke_policy || {};
      const site = safeUrl(b.website);
      const list = byBuilder.get(String(b.id)) || [];
      const reg = p.requires_first_visit_registration
        ? `First-visit registration required${isBlank(p.registration_valid_days) ? '' : `, valid <span class="mono">${esc(p.registration_valid_days)}</span> days`}`
        : 'No first-visit registration rule';
      return `<section class="builder">
        <div class="bhead"><div><h2>${esc(b.name)}</h2>
          <div class="bmeta">${site ? `<a href="${esc(site)}" target="_blank" rel="noopener noreferrer" class="break">${esc(b.website)}</a>` : ''}
            <span>Co-broke ${isBlank(p.percent) ? 'not stated' : `<span class="mono">${esc(p.percent)}%</span>`}</span><span>${reg}</span></div></div>
          <div class="chips">${chip('Access: ' + humanize(b.automated_access || 'unknown'), b.automated_access === 'allowed' ? 'ok' : b.automated_access === 'disallowed' ? 'crit' : 'outline')}${chip(`${list.length} communit${list.length === 1 ? 'y' : 'ies'}`, 'outline')}</div>
        </div>
        ${list.length ? list.map(communityHTML).join('') : emptyHTML('No communities for this builder yet.', 'Use Add community above.')}
      </section>`;
    }).join('');

    const orphanSection = orphans.length ? `<section class="builder"><div class="bhead"><h2>Other communities</h2></div>${orphans.map(communityHTML).join('')}</section>` : '';
    const isAdmin = state.me && state.me.role === 'admin';

    return `
      ${pageHead('Registry', `<span class="mono">${builders.length}</span> builders &middot; <span class="mono">${communities.length}</span> communities`)}
      ${addForms}
      ${builders.length || orphans.length ? builderSections + orphanSection
        : `<div class="section">${emptyHTML('No builders yet.', isAdmin ? 'Add one above, or load sample data in Settings.' : 'Add one above to start tracking communities and incentives.')}</div>`}`;
  }

  function communityHTML(c) {
    const cid = String(c.id);
    const fees = Array.isArray(c.fees) ? c.fees : [];
    const homes = Array.isArray(c.homes) ? c.homes : [];
    const sources = Array.isArray(c.sources) ? c.sources : [];
    const statusTone = c.status === 'selling' ? 'ok' : c.status === 'coming_soon' ? 'info' : c.status === 'closeout' ? 'warn' : 'neutral';
    const place = [c.city, c.county ? `${c.county} County` : '', c.zip].filter(Boolean).join(', ');

    const feesHTML = fees.length ? `<div class="tablewrap"><table class="rtable"><thead><tr><th>Type</th><th class="num">Amount</th><th>Period</th></tr></thead><tbody>${fees.map((f) =>
      `<tr><td data-label="Type">${esc((FEE_TYPES.find((x) => x[0] === f.fee_type) || [0, humanize(f.fee_type)])[1])}</td><td data-label="Amount" class="num">${isBlank(f.amount_usd) ? chip('NOT CONFIRMED', 'warn') : usdCell(f.amount_usd)}</td><td data-label="Period">${textCell(humanize(f.period || ''))}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted small">No fees recorded. Buyers see fees as not confirmed until you add them.</p>';

    const homesHTML = homes.length ? `<div class="tablewrap"><table class="rtable"><thead><tr><th>Home</th><th>Plan</th><th class="num">Beds</th><th class="num">Baths</th><th class="num">Sq ft</th><th class="num">List price</th><th>Est. completion</th><th>Status</th></tr></thead><tbody>${homes.map((h) =>
      `<tr><td data-label="Home">${textCell(h.label)}</td><td data-label="Plan">${textCell(h.plan_name)}</td><td data-label="Beds" class="num">${textCell(h.beds)}</td><td data-label="Baths" class="num">${textCell(h.baths)}</td><td data-label="Sq ft" class="num">${isBlank(h.sqft) ? DASH : esc(Number(h.sqft).toLocaleString('en-US'))}</td><td data-label="List price" class="num">${usdCell(h.list_price)}</td><td data-label="Est. completion">${timeTag(h.est_completion)}</td><td data-label="Status">${chip(humanize(h.status || 'unknown'), h.status === 'available' ? 'ok' : h.status === 'sold' ? 'neutral' : 'info')}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted small">No quick move-in homes listed.</p>';

    const healthTone = (h) => { h = String(h || ''); return /ok|healthy|good/.test(h) ? 'ok' : /block|fail|error|broken/.test(h) ? 'crit' : /stale|degraded|warn/.test(h) ? 'warn' : 'outline'; };
    const sourcesHTML = sources.length ? `<ul class="plain">${sources.map((s) => {
      const u = safeUrl(s.url);
      return `<li data-scope><div class="grow" style="min-width:220px">
          <div class="chips">${chip(humanize(s.kind || 'source'), 'outline')}${chip('Health: ' + humanize(s.health || 'unknown'), healthTone(s.health))}</div>
          ${u ? `<a class="mono small break" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(s.url)}</a>` : `<span class="mono small break">${esc(s.url || 'No URL')}</span>`}
          <div class="small muted">Scope ${s.css_scope ? `<code>${esc(s.css_scope)}</code>` : 'whole page'} &middot; Fetched ${timeTag(s.last_fetched_at, true)} &middot; Changed ${timeTag(s.last_changed_at, true)}</div>
        </div>
        <button type="button" class="btn btn-sm" data-act="fetchSource" data-sid="${esc(s.id)}">Fetch now</button>
        <p data-status hidden></p></li>`;
    }).join('')}</ul>` : '<p class="muted small">No sources yet. Add the builder\'s promo page so changes are picked up.</p>';

    return `<details class="comm" data-key="comm-${esc(cid)}">
      <summary>
        <div><div class="sname">${esc(c.name || 'Unnamed community')}</div><div class="small muted">${esc(place || 'Location not set')}</div></div>
        <div class="chips">${chip(humanize(c.status || 'unknown'), statusTone)}${c.age_restricted ? chip('55+', 'info') : ''}${chip(`${sources.length} src`, 'outline')}${chip(`${homes.length} QMI`, 'outline')}</div>
      </summary>
      <div class="commbody">
        <section>
          <h4>Details</h4>
          <dl class="kv">
            <div><dt>Sales counselor</dt><dd>${textCell(c.sales_counselor_name)}${c.sales_counselor_phone ? `<br><span class="mono small">${esc(c.sales_counselor_phone)}</span>` : ''}${c.sales_counselor_email ? `<br><span class="small break">${esc(c.sales_counselor_email)}</span>` : ''}</dd></div>
            <div><dt>Co-broke as shown</dt><dd>${textCell(c.co_broke_display)}</dd></div>
            <div><dt>Coordinates</dt><dd class="mono small">${isBlank(c.lat) || isBlank(c.lng) ? DASH : `${esc(c.lat)}, ${esc(c.lng)}`}</dd></div>
            <div><dt>Community page</dt><dd>${safeUrl(c.url) ? `<a class="break small" href="${esc(safeUrl(c.url))}" target="_blank" rel="noopener noreferrer">${esc(c.url)}</a>` : DASH}</dd></div>
          </dl>
          <details class="fold" data-key="comm-${esc(cid)}-edit" style="margin-top:12px">
            <summary>Edit community</summary>
            <div class="fold-body"><form data-form="editCommunity" data-cid="${esc(cid)}" data-scope novalidate>${fieldsHTML(communityFields(), c)}
              <div class="formbar"><button type="submit" class="btn btn-primary">Save community</button></div><p data-status hidden></p></form></div>
          </details>
        </section>
        <section>
          <h4>Fees</h4>${feesHTML}
          <details class="fold" data-key="comm-${esc(cid)}-fee" style="margin-top:10px"><summary>Add fee</summary>
            <div class="fold-body"><form data-form="addFee" data-cid="${esc(cid)}" data-scope novalidate>${fieldsHTML(FEE_FIELDS, { fee_type: 'hoa', period: 'month' })}
              <div class="formbar"><button type="submit" class="btn btn-primary">Add fee</button></div><p data-status hidden></p></form></div></details>
        </section>
        <section>
          <h4>Quick move-in homes</h4>${homesHTML}
          <details class="fold" data-key="comm-${esc(cid)}-home" style="margin-top:10px"><summary>Add home</summary>
            <div class="fold-body"><form data-form="addHome" data-cid="${esc(cid)}" data-scope novalidate>${fieldsHTML(HOME_FIELDS, { status: 'available' })}
              <div class="formbar"><button type="submit" class="btn btn-primary">Add home</button></div><p data-status hidden></p></form></div></details>
        </section>
        <section>
          <h4>Sources</h4>${sourcesHTML}
          <details class="fold" data-key="comm-${esc(cid)}-src" style="margin-top:10px"><summary>Add source</summary>
            <div class="fold-body"><form data-form="addSource" data-cid="${esc(cid)}" data-scope novalidate>${fieldsHTML(SOURCE_FIELDS, { kind: 'promo_page' })}
              <div class="formbar"><button type="submit" class="btn btn-primary">Add source</button></div><p data-status hidden></p></form></div></details>
          <details class="fold" data-key="comm-${esc(cid)}-paste"><summary>Paste source text</summary>
            <div class="fold-body"><form data-form="ingestText" data-cid="${esc(cid)}" data-scope novalidate>
              ${fieldsHTML([{ name: 'kind', label: 'Kind', type: 'select', options: PASTE_KINDS }, { name: 'text', label: 'Source text', type: 'textarea', full: true, required: true, rows: 7, placeholder: 'Paste the flyer, broker email or sales rep note exactly as received.' }], { kind: 'broker_email' })}
              <div class="formbar"><button type="submit" class="btn btn-primary">Extract incentives</button><span class="small muted">Creates verification cards. Nothing reaches buyers until confirmed.</span></div><p data-status hidden></p></form></div></details>
        </section>
        <section>
          <details class="fold" data-key="comm-${esc(cid)}-inc"><summary>Add incentive manually</summary>
            <div class="fold-body"><form data-form="addIncentive" data-cid="${esc(cid)}" data-scope novalidate>
              ${fieldsHTML(MANUAL_INCENTIVE_FIELDS, {})}
              <div class="fgrid" style="margin-top:12px">${methodSelect('agent_confirmed_with_builder', false)}</div>
              <div class="formbar"><button type="submit" class="btn btn-primary">Create pending card</button><span class="small muted">It goes to Verify like any other card.</span></div><p data-status hidden></p></form></div></details>
        </section>
      </div>
    </details>`;
  }

  /* ------------------------------------------------------------------ */
  /* View: Incentives                                                    */
  /* ------------------------------------------------------------------ */

  async function viewIncentives(r) {
    const status = r.params.get('status') || '';
    const d = await api('GET', '/agent/incentives' + (status ? `?status=${encodeURIComponent(status)}` : ''));
    const list = Array.isArray(d.incentives) ? d.incentives : [];
    const filters = `<div class="chips" role="navigation" aria-label="Filter by status">${[''].concat(INCENTIVE_STATUSES).map((s) =>
      `<a class="btn btn-sm${s === status ? ' btn-primary' : ''}" href="#/incentives${s ? `?status=${s}` : ''}"${s === status ? ' aria-current="true"' : ''}>${esc(s ? humanize(s) : 'All')}</a>`).join('')}</div>`;

    const table = list.length ? `<div class="tablewrap card" style="padding:4px 8px"><table class="rtable">
      <thead><tr><th>Incentive</th><th>Type</th><th>Status</th><th>Freshness</th><th>Last verified</th><th>Expires</th></tr></thead>
      <tbody>${list.map((i) => `<tr>
        <td data-label="Incentive"><div style="font-weight:600">${esc(i.headline || 'Untitled incentive')}</div><div class="small muted">${esc(i.community || '')}${i.builder ? ` &middot; ${esc(i.builder)}` : ''}</div></td>
        <td data-label="Type">${textCell(humanize(i.type || ''))}</td>
        <td data-label="Status">${chip(String(i.status || 'unknown').toUpperCase(), STATUS_TONE[i.status] || 'neutral')}</td>
        <td data-label="Freshness">${freshHTML(i)}</td>
        <td data-label="Last verified">${timeTag(i.last_verified_at, true)}</td>
        <td data-label="Expires">${expiresHTML(i.expires_on)}</td>
      </tr>`).join('')}</tbody></table></div>`
      : emptyHTML(status ? `No ${status} incentives.` : 'No incentives yet.', status ? 'Try another status filter.' : 'Fetch a source or paste builder text in Registry to create verification cards.');

    return `${pageHead('Incentives', `<span class="mono">${list.length}</span> shown`)}${filters}<div class="section" style="margin-top:14px">${table}</div>`;
  }
  function freshHTML(i) {
    if (i.status !== 'verified' && isBlank(i.fresh_until)) return '<span class="small muted">Not verified</span>';
    const days = daysUntil(i.fresh_until);
    if (days === null) return '<span class="small muted">No freshness date</span>';
    const scale = 30;
    const pct = Math.round(Math.max(0, Math.min(1, days / scale)) * 100);
    const tone = days <= 0 ? 'crit' : days <= 5 ? 'warn' : 'ok';
    const label = days < 0 ? `stale ${Math.abs(days)}d` : days === 0 ? 'stale today' : `${days}d left`;
    return `<div class="fresh" title="Fresh until ${esc(fmtDate(i.fresh_until))}"><div class="bar" role="meter" aria-label="Days until reconfirmation needed" aria-valuemin="0" aria-valuemax="${scale}" aria-valuenow="${Math.max(0, days)}"><span class="tone-${tone}" style="width:${days <= 0 ? 100 : pct}%"></span></div><small>${esc(label)}</small></div>`;
  }
  function expiresHTML(v) {
    if (isBlank(v)) return '<span class="small muted">No expiry stated</span>';
    const d = daysUntil(v);
    const soon = d !== null && d >= 0 && d <= 21;
    return `${timeTag(v)}${d !== null && d < 0 ? ` ${chip('PAST', 'neutral')}` : soon ? ` ${chip(`${d}d`, 'warn')}` : ''}`;
  }

  /* ------------------------------------------------------------------ */
  /* View: Billing                                                       */
  /* ------------------------------------------------------------------ */

  async function viewBilling() {
    const d = await api('GET', '/agent/billing');
    const plan = d.plan || {};
    const events = Array.isArray(d.events) ? d.events : [];
    const inv = d.invoice_preview || {};
    let monthLabel = d.month || '';
    if (/^\d{4}-\d{2}$/.test(monthLabel)) {
      const [y, m] = monthLabel.split('-').map(Number);
      monthLabel = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    const table = events.length ? `<div class="tablewrap card" style="padding:4px 8px"><table class="rtable">
      <thead><tr><th>Buyer</th><th>Occurred</th><th>Billable</th><th class="num">Fee</th><th>Waiver reason</th></tr></thead>
      <tbody>${events.map((e) => `<tr>
        <td data-label="Buyer">${esc(e.buyer_first_name || 'Buyer')}</td>
        <td data-label="Occurred">${timeTag(e.occurred_at, true)}</td>
        <td data-label="Billable">${e.billable ? chip('BILLABLE', 'ok') : chip('WAIVED', 'neutral')}</td>
        <td data-label="Fee" class="num">${usdCell(e.fee_usd)}</td>
        <td data-label="Waiver reason">${textCell(e.waiver_reason)}</td>
      </tr>`).join('')}</tbody></table></div>`
      : emptyHTML('No consult events this month.', 'An event is created when you mark a consult held on a buyer\'s page.');

    return `
      ${pageHead('Billing', esc(monthLabel))}
      <div class="qgrid">
        <section class="card qcard"><h2>Plan</h2><dl class="kv">
          <div><dt>Billable event</dt><dd>${esc(humanize(plan.event || 'consult_held'))}</dd></div>
          <div><dt>Fee per event</dt><dd>${usdCell(plan.fee_usd)}</dd></div>
          <div><dt>Monthly cap</dt><dd>${isBlank(plan.monthly_cap) ? 'No cap' : `<span class="mono">${esc(plan.monthly_cap)}</span>`}</dd></div>
        </dl></section>
        <section class="card qcard"><div class="qhead"><h2>Invoice preview</h2><span class="big">${esc(fmtUSD(num(inv.total_usd)))}</span></div>
          <p><span class="mono">${num(inv.billable_count)}</span> billable event${num(inv.billable_count) === 1 ? '' : 's'} this month.</p>
          ${inv.capped ? chip('MONTHLY CAP APPLIED', 'warn') : ''}
          <p class="small">Preview only. The final invoice is issued at month end.</p>
        </section>
      </div>
      <section class="section"><div class="shead"><h2>Consult events <span class="count">${events.length}</span></h2></div>${table}</section>`;
  }

  /* ------------------------------------------------------------------ */
  /* View: Settings                                                      */
  /* ------------------------------------------------------------------ */

  const MARKET_FIELDS = [
    { name: 'reference_rate', label: 'Reference rate', hint: '%', type: 'number' },
    { name: 'reference_rate_source', label: 'Rate source', type: 'text', placeholder: 'e.g. Freddie Mac PMMS 30-year' },
    { name: 'reference_rate_as_of', label: 'Rate as of', type: 'date' },
    { name: 'down_payment_pct_default', label: 'Default down payment', hint: '%', type: 'number' },
    { name: 'insurance_monthly', label: 'Insurance', hint: 'USD / month', type: 'number' },
    { name: 'pmi_rate_annual', label: 'PMI rate', hint: '% / year', type: 'number' },
    { name: 'closing_cost_pct', label: 'Closing costs', hint: '% of price', type: 'number' },
    { name: 'fresh_days_with_expiry', label: 'Fresh days, offer has expiry', type: 'number', step: '1' },
    { name: 'fresh_days_no_expiry', label: 'Fresh days, no expiry', type: 'number', step: '1' },
  ];
  function taxRowHTML(county, rate) {
    const a = `f${++uid}`, b = `f${++uid}`;
    return `<div class="row" data-taxrow style="align-items:flex-end">
      <label class="field grow" for="${a}" style="min-width:160px"><span class="flabel">County</span><input type="text" id="${a}" data-tax-county value="${esc(county || '')}"></label>
      <label class="field" for="${b}" style="width:160px"><span class="flabel">Tax rate <span class="hint">decimal</span></span><input type="number" inputmode="decimal" step="any" id="${b}" data-tax-rate value="${esc(isBlank(rate) ? '' : rate)}" placeholder="0.0180"></label>
      <button type="button" class="btn btn-ghost" data-act="removeTaxRow" aria-label="Remove county row">Remove</button>
    </div>`;
  }

  async function viewSettings() {
    let market = null, marketErr = null;
    try {
      const m = await api('GET', '/agent/settings/market');
      market = m.market || {};
      state.market = market;
    } catch (e) {
      if (e.status === 401) throw e;
      marketErr = e;
    }
    const isAdmin = state.me && state.me.role === 'admin';
    let theme = 'light';
    try { theme = localStorage.getItem('incentiva_theme') === 'dark' ? 'dark' : 'light'; } catch (_) { /* default */ }

    let marketHTML;
    if (marketErr) {
      marketHTML = errorHTML('market assumptions', marketErr, true);
    } else {
      const s = market.settings || {};
      const taxes = s.tax_rate_by_county && typeof s.tax_rate_by_county === 'object' ? s.tax_rate_by_county : {};
      const counties = (Array.isArray(market.counties) ? market.counties : []).map((c) => (typeof c === 'string' ? c : (c && (c.name || c.county || c.slug)) || '')).filter(Boolean);
      const names = Array.from(new Set(counties.concat(Object.keys(taxes))));
      marketHTML = `<form class="card" data-form="saveMarket" data-scope novalidate>
        <div class="row" style="justify-content:space-between;margin-bottom:12px"><div><h2>${esc(market.name || 'Market')}</h2><p class="small muted">Assumptions used for buyer cost estimates. Market <span class="mono">${esc(market.slug || '')}</span></p></div></div>
        ${fieldsHTML(MARKET_FIELDS, s)}
        <h4 style="margin:20px 0 8px">Property tax rate by county</h4>
        <div data-taxrows class="stack">${names.length ? names.map((n) => taxRowHTML(n, taxes[n])).join('') : taxRowHTML('', '')}</div>
        <div class="formbar"><button type="button" class="btn btn-sm" data-act="addTaxRow">Add county</button></div>
        <div class="formbar"><button type="submit" class="btn btn-primary">Save assumptions</button></div>
        <p data-status hidden></p>
      </form>`;
    }

    return `
      ${pageHead('Settings')}
      <section class="section" style="margin-top:0">${marketHTML}</section>
      ${isAdmin ? `<section class="section"><form class="card" data-form="seedDemo" data-scope novalidate>
        <h2>Sample data</h2>
        <p class="muted" style="margin:6px 0 10px">Loads sample builders, communities and incentives so the console can be demonstrated. Admin only.</p>
        <label class="field check"><input type="checkbox" name="reset"><span class="flabel">Remove existing sample data first</span></label>
        <div class="formbar"><button type="submit" class="btn">Load sample data</button></div>
        <p data-status hidden></p>
      </form></section>` : ''}
      <section class="section"><div class="card">
        <h2>Appearance</h2>
        <label class="field" style="max-width:260px;margin-top:10px"><span class="flabel">Theme</span><select data-change="theme">
          ${[['light', 'Light (default)'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}"${v === theme ? ' selected' : ''}>${l}</option>`).join('')}
        </select></label>
      </div></section>
      <section class="section"><div class="card row" style="justify-content:space-between">
        <div><h2>Account</h2><p class="small muted">${esc(state.me ? state.me.email || '' : '')}${state.me && state.me.license_no ? ` &middot; License <span class="mono">${esc(state.me.license_no)}</span>` : ''}</p></div>
        <button type="button" class="btn btn-danger" data-act="signout">Sign out</button>
      </div></section>`;
  }

  /* ------------------------------------------------------------------ */
  /* View: More (phone)                                                  */
  /* ------------------------------------------------------------------ */

  async function viewMore() {
    const items = [
      ['#/registry', 'Registry', 'Builders, communities and fees', ''],
      ['#/reports', 'Reports', 'Buyer reports awaiting review', 'reports'],
      ['#/compliance', 'Compliance', 'Holds and findings', 'compliance'],
      ['#/incentives', 'Incentives', 'Every incentive and its freshness', ''],
      ['#/billing', 'Billing', 'Plan, consult events, invoice preview', ''],
      ['#/settings', 'Settings', 'Market assumptions, theme, account', ''],
    ];
    const html = `${pageHead('More')}
      <ul class="morelist">${items.map(([href, label, desc, badge]) => `<li><a href="${href}"><span>${esc(label)}<span class="desc">${esc(desc)}</span></span>${badge ? `<span class="badge" data-badge="${badge}" hidden></span>` : ''}</a></li>`).join('')}
        <li><button type="button" data-act="signout">Sign out<span class="desc"></span></button></li>
      </ul>`;
    refreshBadges();
    return html;
  }

  const VIEWS = {
    today: viewToday, leads: viewLeads, verify: viewVerify, reports: viewReports, compliance: viewCompliance, buyers: viewBuyers,
    registry: viewRegistry, incentives: viewIncentives, billing: viewBilling, settings: viewSettings, more: viewMore,
  };

  /* ------------------------------------------------------------------ */
  /* Actions (click)                                                     */
  /* ------------------------------------------------------------------ */

  const actions = {
    retry: () => refresh(),

    signout: async () => {
      try { await api('POST', '/auth/logout'); } catch (_) { /* leave anyway */ }
      location.href = BASE + '/admin/login';
    },

    confirm: async (el) => {
      const card = el.closest('[data-vid]');
      const vid = card.dataset.vid;
      const method = card.querySelector('[data-method]').value;
      setStatus(el, '');
      try {
        await api('POST', `/agent/verifications/${encodeURIComponent(vid)}/confirm`, { verification_method: method });
        const c = state.cards.get(vid);
        toast(`Confirmed: ${(c && c.after && c.after.headline) || 'incentive'}`);
        dismiss(card, EMPTY_CARDS);
        refreshBadges();
      } catch (e) {
        if (e.status !== 401) setStatus(el, `Confirm failed: ${e.message}`, 'crit');
      }
    },

    rejectOpen: (el) => {
      const card = el.closest('[data-vid]');
      const f = card.querySelector('form[data-form="reject"]');
      f.hidden = false;
      f.querySelector('textarea').focus();
    },
    rejectCancel: (el) => { const f = el.closest('form'); f.hidden = true; setStatus(el, ''); },

    snooze: (el) => {
      const card = el.closest('[data-vid]');
      const set = getSnoozed();
      set.add(card.dataset.vid);
      setSnoozed(set);
      toast('Snoozed in this browser tab only. Nothing was saved on the server.');
      refresh();
    },
    unsnooze: () => { setSnoozed(new Set()); refresh(); },

    reconfirm: async (el) => {
      const row = el.closest('[data-iid]');
      const method = row.querySelector('[data-method]').value;
      setStatus(el, '');
      try {
        await api('POST', `/agent/incentives/${encodeURIComponent(row.dataset.iid)}/reconfirm`, { verification_method: method });
        toast('Reconfirmed.');
        dismiss(row, EMPTY_RECONFIRM);
        refreshBadges();
      } catch (e) {
        if (e.status !== 401) setStatus(el, `Reconfirm failed: ${e.message}`, 'crit');
      }
    },

    approveReport: async (el) => {
      const card = el.closest('[data-rid]');
      const extra = card.querySelector('[data-extra]');
      extra.innerHTML = '';
      setStatus(el, '');
      try {
        await api('POST', `/agent/reports/${encodeURIComponent(card.dataset.rid)}/approve`);
        toast('Report approved.');
        dismiss(card, EMPTY_REPORTS);
        refreshBadges();
      } catch (e) {
        if (e.status === 401) return;
        if (e.status === 409) {
          setStatus(el, `Not approved: ${e.message}`, 'crit');
          const f = e.data && Array.isArray(e.data.findings) ? e.data.findings : null;
          if (f && f.length) extra.innerHTML = `<div class="section" style="margin-top:12px"><h4 style="margin-bottom:8px">Blocking findings</h4>${findingsHTML(f)}</div>`;
        } else {
          setStatus(el, `Approve failed: ${e.message}`, 'crit');
        }
      }
    },
    holdOpen: (el) => {
      const card = el.closest('[data-rid]');
      const f = card.querySelector('form[data-form="holdReport"]');
      f.hidden = false;
      f.querySelector('textarea').focus();
    },
    holdCancel: (el) => { el.closest('form').hidden = true; },

    markHeld: async (el) => {
      const ok = await confirmDialog({
        title: 'Mark this consult as held?',
        body: 'This records that the consultation actually took place and creates a billable conversion event under the platform agreement.\n\nOnly mark it held after the meeting happened. It cannot be undone from the console.',
        confirmLabel: 'Mark held, create event',
      });
      if (!ok) return;
      try {
        const d = await api('POST', `/agent/appointments/${encodeURIComponent(el.dataset.aid)}/held`);
        const conv = d.conversion || {};
        toast(conv.billable ? `Consult marked held. Billable event created: ${fmtUSD(num(conv.fee_usd))}.` : 'Consult marked held. The event is not billable.');
        refresh();
      } catch (e) {
        if (e.status !== 401) setStatus(el, `Could not mark held: ${e.message}`, 'crit');
      }
    },

    fetchSource: async (el) => {
      setStatus(el, 'Fetching source...', 'info');
      try {
        const d = await api('POST', `/agent/sources/${encodeURIComponent(el.dataset.sid)}/fetch`);
        const r = d.result || {};
        const n = num(r.cards_created);
        const cardsTxt = n ? ` <a href="#/verify"><span class="mono">${n}</span> verification card${n === 1 ? '' : 's'} created. Review now.</a>` : ' No cards created.';
        const reason = r.reason ? ` Reason: ${esc(r.reason)}.` : '';
        if (r.status === 'changed') setStatus(el, `Page changed.${cardsTxt}`, 'ok', true);
        else if (r.status === 'unchanged') setStatus(el, `No change since the last fetch.${n ? cardsTxt : ''}`, 'info', true);
        else if (r.status === 'blocked') setStatus(el, `Blocked, not fetched.${reason} Use Paste source text instead.`, 'warn', true);
        else if (r.status === 'failed') setStatus(el, `Fetch failed.${reason}`, 'crit', true);
        else setStatus(el, `Result: ${esc(r.status || 'unknown')}.${reason}${cardsTxt}`, 'info', true);
        if (n) refreshBadges();
      } catch (e) {
        if (e.status !== 401) setStatus(el, `Fetch failed: ${e.message}`, 'crit');
      }
    },

    addTaxRow: (el) => {
      const host = el.closest('form').querySelector('[data-taxrows]');
      host.insertAdjacentHTML('beforeend', taxRowHTML('', ''));
      const rows = host.querySelectorAll('[data-taxrow]');
      rows[rows.length - 1].querySelector('input').focus();
    },
    removeTaxRow: (el) => { el.closest('[data-taxrow]').remove(); },
  };

  /* ------------------------------------------------------------------ */
  /* Forms (submit)                                                      */
  /* ------------------------------------------------------------------ */

  const forms = {
    confirmEdits: async (form) => {
      const vid = form.dataset.vid;
      const card = form.closest('[data-vid]');
      const c = state.cards.get(vid) || { after: {} };
      let values;
      try { values = readFields(form, INCENTIVE_FIELDS, c.after); } catch (e) { setStatus(card, e.message, 'crit'); return; }
      const edits = {};
      Object.keys(values).forEach((k) => { if (!sameVal(values[k], c.after[k])) edits[k] = values[k]; });
      const method = card.querySelector('[data-method]').value;
      const body = { verification_method: method };
      if (Object.keys(edits).length) body.edits = edits;
      setStatus(card, '');
      try {
        await api('POST', `/agent/verifications/${encodeURIComponent(vid)}/confirm`, body);
        const n = Object.keys(edits).length;
        toast(n ? `Confirmed with ${n} edited field${n === 1 ? '' : 's'}.` : 'No fields were changed. Confirmed as extracted.');
        dismiss(card, EMPTY_CARDS);
        refreshBadges();
      } catch (e) {
        if (e.status !== 401) setStatus(card, `Confirm failed: ${e.message}`, 'crit');
      }
    },

    reject: async (form) => {
      const card = form.closest('[data-vid]');
      const reason = form.elements.namedItem("reason").value.trim();
      if (!reason) { setStatus(card, 'A reason is required to reject a card.', 'crit'); form.elements.namedItem("reason").focus(); return; }
      setStatus(card, '');
      try {
        await api('POST', `/agent/verifications/${encodeURIComponent(form.dataset.vid)}/reject`, { reason });
        toast('Card rejected.');
        dismiss(card, EMPTY_CARDS);
        refreshBadges();
      } catch (e) {
        if (e.status !== 401) setStatus(card, `Reject failed: ${e.message}`, 'crit');
      }
    },

    holdReport: async (form) => {
      const card = form.closest('[data-rid]');
      const note = form.elements.namedItem("note").value.trim();
      if (!note) { setStatus(card, 'A note is required to place a report on hold.', 'crit'); form.elements.namedItem("note").focus(); return; }
      try {
        await api('POST', `/agent/reports/${encodeURIComponent(form.dataset.rid)}/hold`, { note });
        toast('Report placed on hold.');
        dismiss(card, EMPTY_REPORTS);
        refreshBadges();
      } catch (e) {
        if (e.status !== 401) setStatus(card, `Hold failed: ${e.message}`, 'crit');
      }
    },

    releaseHold: async (form) => {
      const card = form.closest('[data-hid]');
      const note = form.elements.namedItem("note").value.trim();
      if (!note) { setStatus(card, 'A note is required to release a hold.', 'crit'); form.elements.namedItem("note").focus(); return; }
      try {
        await api('POST', `/agent/compliance/${encodeURIComponent(form.dataset.hid)}/release`, { note });
        toast('Hold released.');
        dismiss(card, EMPTY_HOLDS);
        refreshBadges();
      } catch (e) {
        if (e.status !== 401) setStatus(card, `Release failed: ${e.message}`, 'crit');
      }
    },

    addBuilder: async (form) => {
      let v;
      try { v = readFields(form, BUILDER_FIELDS); } catch (e) { setStatus(form, e.message, 'crit'); return; }
      const policy = { percent: v.co_broke_percent, requires_first_visit_registration: v.requires_first_visit_registration, registration_valid_days: v.registration_valid_days };
      const body = Object.assign({ name: v.name, website: v.website, automated_access: v.automated_access || 'unknown', co_broke_policy: policy }, policy);
      try {
        const d = await api('POST', '/agent/builders', body);
        toast(`Builder added: ${(d.builder && d.builder.name) || v.name}`);
        refresh();
      } catch (e) {
        if (e.status !== 401) setStatus(form, `Could not add builder: ${e.message}`, 'crit');
      }
    },

    addCommunity: async (form) => {
      let v;
      try { v = readFields(form, [{ name: 'builder_id', label: 'Builder', type: 'text', required: true }].concat(communityFields())); } catch (e) { setStatus(form, e.message, 'crit'); return; }
      if (/^\d+$/.test(String(v.builder_id))) v.builder_id = Number(v.builder_id);
      try {
        const d = await api('POST', '/agent/communities', v);
        toast(`Community added: ${(d.community && d.community.name) || v.name}`);
        refresh();
      } catch (e) {
        if (e.status !== 401) setStatus(form, `Could not add community: ${e.message}`, 'crit');
      }
    },

    editCommunity: async (form) => {
      let v;
      try { v = readFields(form, communityFields()); } catch (e) { setStatus(form, e.message, 'crit'); return; }
      try {
        await api('PATCH', `/agent/communities/${encodeURIComponent(form.dataset.cid)}`, v);
        toast('Community saved.');
        refresh();
      } catch (e) {
        if (e.status !== 401) setStatus(form, `Could not save community: ${e.message}`, 'crit');
      }
    },

    addFee: async (form) => {
      let v;
      try { v = readFields(form, FEE_FIELDS); } catch (e) { setStatus(form, e.message, 'crit'); return; }
      try {
        await api('POST', `/agent/communities/${encodeURIComponent(form.dataset.cid)}/fees`, { fee_type: v.fee_type, amount_usd: v.amount_usd, period: v.period });
        toast(v.amount_usd === null ? 'Fee added as not confirmed.' : 'Fee added.');
        refresh();
      } catch (e) {
        if (e.status !== 401) setStatus(form, `Could not add fee: ${e.message}`, 'crit');
      }
    },

    addHome: async (form) => {
      let v;
      try { v = readFields(form, HOME_FIELDS); } catch (e) { setStatus(form, e.message, 'crit'); return; }
      if (!v.label && !v.plan_name) { setStatus(form, 'Give the home a label or a plan name.', 'crit'); return; }
      try {
        await api('POST', `/agent/communities/${encodeURIComponent(form.dataset.cid)}/homes`, v);
        toast('Home added.');
        refresh();
      } catch (e) {
        if (e.status !== 401) setStatus(form, `Could not add home: ${e.message}`, 'crit');
      }
    },

    addSource: async (form) => {
      let v;
      try { v = readFields(form, SOURCE_FIELDS); } catch (e) { setStatus(form, e.message, 'crit'); return; }
      if (!safeUrl(v.url)) { setStatus(form, 'URL must start with http:// or https://', 'crit'); return; }
      const cid = form.dataset.cid;
      try {
        await api('POST', '/agent/sources', { community_id: /^\d+$/.test(cid) ? Number(cid) : cid, kind: v.kind, url: v.url, css_scope: v.css_scope });
        toast('Source added. Use Fetch now to read it.');
        refresh();
      } catch (e) {
        if (e.status !== 401) setStatus(form, `Could not add source: ${e.message}`, 'crit');
      }
    },

    ingestText: async (form) => {
      const kind = form.elements.namedItem('kind').value;
      const textEl = form.elements.namedItem('text');
      const text = textEl.value.trim();
      if (!text) { setStatus(form, 'Paste the source text first.', 'crit'); textEl.focus(); return; }
      const cid = form.dataset.cid;
      setStatus(form, 'Extracting incentives...', 'info');
      try {
        const d = await api('POST', '/agent/ingest/text', { community_id: /^\d+$/.test(cid) ? Number(cid) : cid, kind, text });
        const n = num(d.cards_created);
        const by = d.extracted_by === 'heuristic' ? ' Extracted by the keyword fallback (no model), so check each field closely.' : d.extracted_by === 'model' ? ' Extracted by the model.' : '';
        const notes = d.notes ? ` Notes: ${esc(d.notes)}` : '';
        setStatus(form, n
          ? `<a href="#/verify"><span class="mono">${n}</span> verification card${n === 1 ? '' : 's'} created. Review now.</a>${esc(by)}${notes}`
          : `No incentives found in that text, so no cards were created.${esc(by)}${notes}`, n ? 'ok' : 'warn', true);
        if (n) { textEl.value = ''; refreshBadges(); }
      } catch (e) {
        if (e.status !== 401) setStatus(form, `Extraction failed: ${e.message}`, 'crit');
      }
    },

    addIncentive: async (form) => {
      let v;
      try { v = readFields(form, MANUAL_INCENTIVE_FIELDS); } catch (e) { setStatus(form, e.message, 'crit'); return; }
      if (!v.type) { setStatus(form, 'Choose an incentive type.', 'crit'); return; }
      const cid = form.dataset.cid;
      const body = Object.assign({ community_id: /^\d+$/.test(cid) ? Number(cid) : cid }, v, { verification_method: form.querySelector('[data-method]').value });
      try {
        const d = await api('POST', '/agent/incentives', body);
        setStatus(form, `Pending card created${isBlank(d.version_id) ? '' : ` (version <span class="mono">${esc(d.version_id)}</span>)`}. <a href="#/verify">Review it in Verify.</a>`, 'ok', true);
        form.reset();
        refreshBadges();
      } catch (e) {
        if (e.status !== 401) setStatus(form, `Could not create incentive: ${e.message}`, 'crit');
      }
    },

    saveMarket: async (form) => {
      let v;
      try { v = readFields(form, MARKET_FIELDS); } catch (e) { setStatus(form, e.message, 'crit'); return; }
      const taxes = {};
      for (const row of $$('[data-taxrow]', form)) {
        const county = row.querySelector('[data-tax-county]').value.trim();
        const rateRaw = row.querySelector('[data-tax-rate]').value.trim();
        if (!county && !rateRaw) continue;
        if (!county) { setStatus(form, 'Every tax rate needs a county name.', 'crit'); return; }
        if (rateRaw === '') continue;
        const rate = Number(rateRaw);
        if (!Number.isFinite(rate) || rate < 0) { setStatus(form, `Tax rate for ${county} must be a positive number.`, 'crit'); return; }
        if (rate > 1) { setStatus(form, `Tax rate for ${county} looks like a percent. Enter it as a decimal, for example 0.0180.`, 'crit'); return; }
        taxes[county] = rate;
      }
      const current = (state.market && state.market.settings) || {};
      const settings = Object.assign({}, current, v, { tax_rate_by_county: taxes });
      try {
        const d = await api('PUT', '/agent/settings/market', { settings });
        if (d.market) state.market = d.market;
        setStatus(form, 'Assumptions saved.', 'ok');
      } catch (e) {
        if (e.status !== 401) setStatus(form, `Could not save assumptions: ${e.message}`, 'crit');
      }
    },

    seedDemo: async (form) => {
      const reset = form.elements.namedItem('reset').checked;
      const ok = await confirmDialog({
        title: 'Load sample data?',
        body: `This adds sample builders, communities and incentives to this market for demonstration.${reset ? '\n\nExisting sample data is removed first.' : ''}\n\nSample records are not real offers.`,
        confirmLabel: 'Load sample data',
        danger: reset,
      });
      if (!ok) return;
      setStatus(form, 'Loading sample data...', 'info');
      try {
        const d = await api('POST', '/agent/demo/seed', { reset });
        const c = d.created || {};
        setStatus(form, `Created ${num(c.builders)} builders, ${num(c.communities)} communities and ${num(c.incentives)} incentives.`, 'ok');
        state.market = null;
        refreshBadges();
      } catch (e) {
        if (e.status === 401) return;
        setStatus(form, e.status === 403 ? `Not allowed: ${e.message}` : `Sample data failed: ${e.message}`, 'crit');
      }
    },
  };

  /* ------------------------------------------------------------------ */
  /* Change handlers                                                     */
  /* ------------------------------------------------------------------ */

  const changes = {
    leadFilter: (el) => { location.hash = '#/leads' + (el.value ? `?status=${encodeURIComponent(el.value)}` : ''); },
    leadStatus: async (el) => {
      try { await api('PATCH', `/agent/leads/${encodeURIComponent(el.dataset.lid)}`, { status: el.value }); toast(`Status set to ${humanize(el.value)}.`); refreshBadges(); }
      catch (e) { if (e.status !== 401) toast(`Status change failed: ${e.message}`, 'crit'); }
    },
    leadAssign: async (el) => {
      try { await api('PATCH', `/agent/leads/${encodeURIComponent(el.dataset.lid)}`, { assigned_agent_id: el.value ? Number(el.value) : null }); toast(el.value ? 'Agent assigned.' : 'Lead unassigned.'); refresh(); }
      catch (e) { if (e.status !== 401) toast(`Assignment failed: ${e.message}`, 'crit'); }
    },
    buyerStage: (el) => { location.hash = '#/buyers' + (el.value ? `?stage=${encodeURIComponent(el.value)}` : ''); },
    theme: (el) => {
      const v = el.value === 'dark' ? 'dark' : 'light';
      if (window.BuyersLineTheme) window.BuyersLineTheme.set(v);
      else { document.documentElement.setAttribute('data-theme', v); try { localStorage.setItem('incentiva_theme', v); } catch (_) { /* session only */ } }
    },
  };

  /* ------------------------------------------------------------------ */
  /* Wiring + boot                                                       */
  /* ------------------------------------------------------------------ */

  async function runBusy(el, fn) {
    if (el.getAttribute('aria-busy') === 'true') return;
    busy(el, true);
    try { await fn(el); }
    catch (e) { toast(`Something went wrong: ${e && e.message ? e.message : e}`, 'crit'); }
    finally { if (el.isConnected) busy(el, false); }
  }

  function bind() {
    document.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-act]');
      if (!el || !actions[el.dataset.act]) return;
      ev.preventDefault();
      if (el.disabled) return;
      runBusy(el, actions[el.dataset.act]);
    });
    document.addEventListener('submit', (ev) => {
      const form = ev.target.closest('form[data-form]');
      if (!form || !forms[form.dataset.form]) return;
      ev.preventDefault();
      runBusy(form, forms[form.dataset.form]);
    });
    document.addEventListener('change', (ev) => {
      const el = ev.target.closest('[data-change]');
      if (el && changes[el.dataset.change]) changes[el.dataset.change](el);
    });
    window.addEventListener('hashchange', render);
    window.addEventListener('resize', measureChrome);
    if (typeof ResizeObserver === 'function' && $('#chrome')) new ResizeObserver(measureChrome).observe($('#chrome'));
  }

  async function boot() {
    bind();
    let me;
    try {
      me = await api('GET', '/auth/me');
    } catch (e) {
      if (e.status === 401) return;
      $('#main').innerHTML = pageHead('Agent console') + `<div class="errbox" role="alert"><strong>Could not load your account.</strong>${esc(e.message)}<div class="formbar"><a class="btn btn-danger" href="${esc(BASE + '/admin/login')}">Go to sign in</a></div></div>`;
      return;
    }
    if (!me || !me.user) { location.href = BASE + '/admin/login'; return; }
    state.me = me.user;
    renderWho();
    if (!location.hash || location.hash === '#' || location.hash === '#/') history.replaceState(null, '', '#/today');
    await render();
    if (parseHash().parts[0] !== 'today') refreshBadges();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
