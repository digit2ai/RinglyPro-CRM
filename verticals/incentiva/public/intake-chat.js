/* BuyersLine: Anna, the conversational intake (owner review 2026-09-15).
   Five questions, one at a time, every one skippable except where the buyer is looking. The moment the
   fifth is answered (or skipped) the page creates a search on the server and the report renders below
   the conversation (report-view.js); contact details and consent come after the report, never before.
   Every page load starts a new conversation; a report comes back only through /?report=<token> or the
   emailed /?lead=<token>. The server re-validates every answer.
   offlineTurn() understands a spoken answer with no model at all, so Anna never repeats a question she
   was already given when the voice model is unreachable. */
(function () {
  'use strict';
  var BASE = (window.BL_BASE && window.BL_BASE.indexOf('{{') === -1) ? window.BL_BASE : '';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var L = {
    en: {
      anna: 'Anna', role: 'BuyersLine assistant', step_of: 'Question {n} of 5', back: 'Back', edit: 'Edit', send: 'Send', skip: 'Skip', typing: 'Anna is typing',
      start_over: 'Start over', restart_confirm: 'Start over? Your answers will be cleared.', restart: 'Start a new search',
      hello: "Hi, I'm Anna. Five quick questions and your report appears right below. Only the first one is required.",
      q_area: 'Where are you looking? A ZIP code, city or neighborhood works.', ph_area: 'For example 33543 or Zephyrhills',
      checking: 'Checking...', err_area_invalid_zip: "That ZIP code doesn't exist. Please check the five digits.",
      err_area_outside_florida: 'BuyersLine covers Tampa Bay, Florida for now. Try a Florida ZIP or city.',
      err_area_not_found: "I couldn't find that place. Try a ZIP code instead.", err_area_empty: 'Tell me a ZIP code, city or neighborhood.',
      err_area_error: "I couldn't check that right now. Try again.",
      ack_area: 'Got it: {place}.', ack_skip: 'No problem, skipped.', ack_money: 'Noted: {amount}.', ack_monthly: 'Noted: {amount} a month.',
      q_budget: "What's your maximum price, or the most you want to pay each month?", ph_budget: 'For example 450,000 or 2,800 a month',
      err_budget: 'Enter a price like 450,000 or a monthly payment like 2,800 a month.',
      q_down: 'How much do you have for a down payment?', ph_down: 'For example 25,000', err_down: 'Enter an amount in dollars, like 25,000.',
      q_timeline: 'When do you want to buy?', q_financing: 'Are you pre-approved, paying cash, or neither yet?',
      tl_0_3m: 'Within 3 months', tl_3_6m: '3 to 6 months', tl_6_12m: '6 to 12 months', tl_12m_plus: 'More than 12 months',
      fin_preapproved: 'Pre-approved', fin_cash: 'Cash', fin_needs_lender: 'Neither yet', fin_va: 'VA loan', fin_fha: 'FHA loan', fin_unsure: 'Not sure',
      creating: 'Creating your report...', done: 'Your report is ready below. Promotions keep filling in while I check the builders.',
      err_create: "I couldn't create your report. Please try again.", retry: 'Try again', see_report: 'See my report',
      lbl_area: 'Area', lbl_budget: 'Budget', lbl_down: 'Down payment', lbl_timeline: 'Timeframe', lbl_financing: 'Paying with', skipped: 'Skipped',
      monthly_suffix: ' a month', talk: 'Talk instead'
    },
    es: {
      anna: 'Anna', role: 'Asistente de BuyersLine', step_of: 'Pregunta {n} de 5', back: 'Atrás', edit: 'Editar', send: 'Enviar', skip: 'Omitir', typing: 'Anna está escribiendo',
      start_over: 'Empezar de nuevo', restart_confirm: '¿Empezar de nuevo? Se borrarán sus respuestas.', restart: 'Empezar una búsqueda nueva',
      hello: 'Hola, soy Anna. Cinco preguntas rápidas y su informe aparece aquí abajo. Solo la primera es obligatoria.',
      q_area: '¿Dónde está buscando? Sirve un código postal, una ciudad o un vecindario.', ph_area: 'Por ejemplo 33543 o Zephyrhills',
      checking: 'Revisando...', err_area_invalid_zip: 'Ese código postal no existe. Revise los cinco dígitos, por favor.',
      err_area_outside_florida: 'Por ahora BuyersLine cubre Tampa Bay, Florida. Pruebe con un código postal o una ciudad de Florida.',
      err_area_not_found: 'No encontré ese lugar. Pruebe con un código postal.', err_area_empty: 'Dígame un código postal, una ciudad o un vecindario.',
      err_area_error: 'No pude revisarlo en este momento. Inténtelo de nuevo.',
      ack_area: 'Entendido: {place}.', ack_skip: 'Sin problema, la omitimos.', ack_money: 'Anotado: {amount}.', ack_monthly: 'Anotado: {amount} al mes.',
      q_budget: '¿Cuál es su precio máximo, o lo máximo que quiere pagar al mes?', ph_budget: 'Por ejemplo 450,000 o 2,800 al mes',
      err_budget: 'Escriba un precio como 450,000 o un pago mensual como 2,800 al mes.',
      q_down: '¿Cuánto tiene para el pago inicial?', ph_down: 'Por ejemplo 25,000', err_down: 'Escriba una cantidad en dólares, por ejemplo 25,000.',
      q_timeline: '¿Cuándo quiere comprar?', q_financing: '¿Tiene preaprobación, paga de contado, o ninguna de las dos todavía?',
      tl_0_3m: 'En los próximos 3 meses', tl_3_6m: 'De 3 a 6 meses', tl_6_12m: 'De 6 a 12 meses', tl_12m_plus: 'Más de 12 meses',
      fin_preapproved: 'Preaprobado', fin_cash: 'De contado', fin_needs_lender: 'Ninguna todavía', fin_va: 'Préstamo VA', fin_fha: 'Préstamo FHA', fin_unsure: 'No sé',
      creating: 'Creando su informe...', done: 'Su informe está listo aquí abajo. Las promociones se siguen completando mientras reviso las constructoras.',
      err_create: 'No pude crear su informe. Inténtelo de nuevo, por favor.', retry: 'Intentar de nuevo', see_report: 'Ver mi informe',
      lbl_area: 'Zona', lbl_budget: 'Presupuesto', lbl_down: 'Pago inicial', lbl_timeline: 'Plazo', lbl_financing: 'Forma de pago', skipped: 'Omitido',
      monthly_suffix: ' al mes', talk: 'Hablar en vez de escribir'
    }
  };

  var STEPS = ['area', 'budget', 'down_payment', 'move_timeline', 'financing_type'];
  var TIMELINE = ['0_3m', '3_6m', '6_12m', '12m_plus'];
  var FINANCING = ['preapproved', 'cash', 'needs_lender'];
  var FIN_ALL = ['preapproved', 'cash', 'needs_lender', 'va', 'fha', 'unsure'];

  var root = null, lang = 'en', state = null, ui = { busy: false, error: null, pending: null };

  /* ---------- utils ---------- */
  function T(key, vars) {
    var s = (L[lang] && L[lang][key] != null) ? L[lang][key] : (L.en[key] != null ? L.en[key] : key);
    if (vars) Object.keys(vars).forEach(function (k) { s = String(s).split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  function money(n) { return new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n); }
  function api(method, path, body) {
    var opts = { method: method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(BASE + path, opts).then(function (r) {
      return r.text().then(function (txt) { var d = null; try { d = txt ? JSON.parse(txt) : null; } catch (e) { d = null; } return { status: r.status, ok: r.ok, data: d }; });
    });
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  /** "450k", "$2,800 a month", "2.5 million", "cuatrocientos mil" is not parsed (the model handles words). */
  function parseAmount(s) {
    var str = norm(s).replace(/\s+/g, ' ').trim();
    if (!str) return null;
    var m = str.replace(/[$,]/g, '').match(/(\d+(?:\.\d+)?)\s*(k|thousand|mil|m|mm|million|millones?|millon)?\b/);
    if (!m) return NaN;
    var n = Number(m[1]);
    var unit = m[2] || '';
    if (/^(k|thousand|mil)$/.test(unit)) n *= 1000;
    else if (/^(m|mm|million|millones?|millon)$/.test(unit)) n *= 1000000;
    return Math.round(n);
  }
  function isMonthly(s) { return /\b(a |per |each |\/)?(month|mo|monthly|mensual(es)?|al mes|por mes|cada mes)\b|\/mo\b/.test(norm(s)); }
  function isSkip(s) {
    var t = norm(s).trim();
    return /^(skip|pass|next|no|nope|none|not sure|i don'?t know|dont know|prefer not|rather not|omitir|omite|siguiente|paso|ninguno|ninguna|no se|prefiero no)\b/.test(t) || /\b(skip( it| that| this)?|omitir|omitala|omitelo|next question|siguiente pregunta)\b/.test(t);
  }

  function fresh() { return { step: 'area', answers: {}, done: {}, search: null, editing: null }; }
  function stepIndex(id) { return STEPS.indexOf(id); }
  function answered(id) { return !!state.done[id]; }
  function nextOpen() { for (var i = 0; i < STEPS.length; i++) if (!answered(STEPS[i])) return STEPS[i]; return 'finish'; }
  function placeLabel() { var a = state.answers.area || {}; return a.label || a.zip || a.input || ''; }
  function display(id) {
    var a = state.answers;
    switch (id) {
      case 'area': return placeLabel();
      case 'budget': return a.max_monthly ? money(a.max_monthly) + T('monthly_suffix') : a.max_price ? money(a.max_price) : T('skipped');
      case 'down_payment': return a.down_payment != null ? money(a.down_payment) : T('skipped');
      case 'move_timeline': return a.move_timeline ? T('tl_' + a.move_timeline) : T('skipped');
      case 'financing_type': return a.financing_type ? T('fin_' + a.financing_type) : T('skipped');
    }
    return '';
  }
  function question(id) { return { area: T('q_area'), budget: T('q_budget'), down_payment: T('q_down'), move_timeline: T('q_timeline'), financing_type: T('q_financing') }[id] || ''; }
  function ackFor(id) {
    var a = state.answers;
    if (!id || !answered(id)) return null;
    if (id === 'area') return T('ack_area', { place: placeLabel() });
    if (id === 'budget') return a.max_monthly ? T('ack_monthly', { amount: money(a.max_monthly) }) : a.max_price ? T('ack_money', { amount: money(a.max_price) }) : T('ack_skip');
    if (id === 'down_payment') return a.down_payment != null ? T('ack_money', { amount: money(a.down_payment) }) : T('ack_skip');
    if (id === 'move_timeline' || id === 'financing_type') return a[id] ? null : T('ack_skip');
    return null;
  }

  /* ---------- flow ---------- */
  function go(id) { state.step = id; ui.error = null; render(true); }
  function afterAnswer(id) {
    var next = nextOpen();
    if (state.search && next === 'finish') { state.editing = null; createSearch(); return; }
    state.editing = null;
    if (next === 'finish') { createSearch(); return; }
    go(next);
  }
  function setAnswer(id, fields) {
    Object.keys(fields).forEach(function (k) { state.answers[k] = fields[k]; });
    state.done[id] = true;
    // Changing an answer after the report exists refreshes the report.
    if (state.search) state.searchDirty = true;
  }
  function restart() {
    state = fresh(); ui.error = null; ui.busy = false;
    var url = new URL(location.href); url.searchParams.delete('lead'); url.searchParams.delete('report');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    if (window.BLReportView) window.BLReportView.clear();
    render(true);
  }

  function createSearch() {
    if (ui.busy) return Promise.resolve(false);
    ui.busy = true; ui.error = null; state.step = 'finish'; render(false);
    var a = state.answers;
    var body = { lang: lang, area: a.area ? (a.area.zip || a.area.input) : '', max_price: a.max_price || null, max_monthly: a.max_monthly || null,
      down_payment: a.down_payment != null ? a.down_payment : null, move_timeline: a.move_timeline || null, financing_type: a.financing_type || null };
    return api('POST', '/api/v1/public/searches', body).then(function (r) {
      ui.busy = false;
      if (!r.ok || !r.data || !r.data.token) { ui.error = (r.data && r.data.error) || T('err_create'); render(false); return false; }
      state.search = { token: r.data.token }; state.searchDirty = false;
      var url = new URL(location.href); url.searchParams.set('report', r.data.token); url.searchParams.delete('lead');
      history.replaceState(null, '', url.pathname + url.search + '#intake');
      render(false);
      if (window.BLReportView) window.BLReportView.show(r.data.token, { lang: lang, scroll: true });
      return true;
    }).catch(function () { ui.busy = false; ui.error = T('err_create'); render(false); return false; });
  }

  /* ---------- rendering ---------- */
  function render(animate) {
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    root.setAttribute('lang', lang);
    var cur = state.step === 'finish' ? 5 : stepIndex(state.step) + 1;
    root.appendChild(header(cur));
    var log = h('div', { class: 'mch-log' });
    log.appendChild(bubble('m', T('hello')));
    STEPS.forEach(function (id) {
      if (id === state.step || !answered(id)) return;
      if (state.step !== 'finish' && stepIndex(id) > stepIndex(state.step)) return;
      log.appendChild(bubble('m', question(id), true));
      log.appendChild(answerRow(id, display(id)));
    });
    root.appendChild(log);
    log.scrollTop = log.scrollHeight;
    var turn = h('div', { class: 'mch-turn', 'aria-live': 'polite' });
    root.appendChild(turn);
    if (animate && !reduce && state.step !== 'finish') {
      turn.appendChild(h('div', { class: 'mch-typing', 'aria-label': T('typing') }, h('span'), h('span'), h('span')));
      setTimeout(function () { while (turn.firstChild) turn.removeChild(turn.firstChild); renderTurn(turn); focusComposer(); }, 380);
    } else { renderTurn(turn); if (animate) focusComposer(); }
  }
  function focusComposer() {
    var el = root && root.querySelector('.mch-composer input:not(.mch-hp), .mch-chips button');
    if (!el) return;
    var box = root.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
  }
  function header(n) {
    var bar = h('ol', { class: 'mch-progress', 'aria-label': T('step_of', { n: n }) });
    for (var i = 1; i <= 5; i++) bar.appendChild(h('li', { class: i < n || state.step === 'finish' ? 'is-done' : i === n ? 'is-current' : '', 'aria-current': i === n && state.step !== 'finish' ? 'step' : null }, h('span', { class: 'mch-dot', text: String(i) })));
    var prevId = state.step === 'finish' ? 'financing_type' : STEPS[stepIndex(state.step) - 1];
    return h('div', { class: 'mch-head' },
      h('div', { class: 'mch-id' },
        h('span', { class: 'mch-avatar', 'aria-hidden': 'true' }, avatarSvg()),
        h('span', null, h('strong', { text: T('anna') }), h('span', { class: 'mch-role', text: T('role') })),
        h('span', { class: 'mch-count', text: state.step === 'finish' ? '' : T('step_of', { n: n }) }),
        answered('area') ? h('button', { type: 'button', class: 'mch-restart', onclick: function () { if (window.confirm(T('restart_confirm'))) restart(); } }, T('start_over')) : null),
      bar,
      prevId && state.step !== 'area' && !state.search ? h('button', { type: 'button', class: 'mch-back', onclick: function () { state.editing = prevId; go(prevId); } }, h('span', { 'aria-hidden': 'true', text: '← ' }), T('back')) : null);
  }
  function avatarSvg() {
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', 'M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z');
    p.setAttribute('fill', 'currentColor');
    svg.appendChild(p);
    return svg;
  }
  /* The send control is an arrow in a dark circle, so the only text it has is its aria-label. */
  function sendSvg() {
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', 'M12 19V6M6 12l6-6 6 6');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2.2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
    return svg;
  }
  function bubble(who, text, small) { return h('div', { class: 'mch-b mch-b-' + who + (small ? ' mch-b-small' : '') }, text); }
  function answerRow(id, text) {
    return h('div', { class: 'mch-a' }, h('div', { class: 'mch-b mch-b-u' }, text),
      h('button', { type: 'button', class: 'mch-edit', 'aria-label': T('edit') + ': ' + text, onclick: function () { state.editing = id; go(id); } }, T('edit')));
  }
  function renderTurn(turn) {
    var id = state.step;
    if (id === 'finish') {
      if (ui.busy) { turn.appendChild(bubble('m', T('creating'))); return; }
      if (ui.error) {
        turn.appendChild(h('p', { class: 'mch-err', role: 'alert', text: ui.error }));
        turn.appendChild(h('div', { class: 'mch-chips' }, h('button', { type: 'button', class: 'mch-chip', onclick: createSearch }, T('retry'))));
        return;
      }
      if (state.search) {
        turn.appendChild(bubble('m', T('done')));
        turn.appendChild(h('div', { class: 'mch-chips' },
          h('button', { type: 'button', class: 'mch-chip', onclick: function () { var el = document.getElementById('blReport'); if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); } }, T('see_report')),
          h('button', { type: 'button', class: 'mch-chip', onclick: restart }, T('restart'))));
      }
      return;
    }
    var prevIdx = stepIndex(id) - 1;
    var ack = prevIdx >= 0 && !state.editing ? ackFor(STEPS[prevIdx]) : null;
    turn.appendChild(bubble('m', ack ? ack + ' ' + question(id) : question(id)));
    if (id === 'move_timeline') { turn.appendChild(chips(TIMELINE.map(function (k) { return [k, T('tl_' + k)]; }), function (k) { setAnswer(id, { move_timeline: k }); afterAnswer(id); }, state.answers.move_timeline)); turn.appendChild(skipBtn(id)); return; }
    if (id === 'financing_type') { turn.appendChild(chips(FINANCING.map(function (k) { return [k, T('fin_' + k)]; }), function (k) { setAnswer(id, { financing_type: k }); afterAnswer(id); }, state.answers.financing_type)); turn.appendChild(skipBtn(id)); return; }
    turn.appendChild(textComposer(id));
  }
  function skipBtn(id) { return h('button', { type: 'button', class: 'mch-skip', onclick: function () { skip(id); } }, T('skip')); }
  function skip(id) {
    if (id === 'area') return;
    var f = {};
    if (id === 'budget') { f.max_price = null; f.max_monthly = null; }
    else f[id] = null;
    setAnswer(id, f); afterAnswer(id);
  }
  function chips(opts, pick, current) {
    var wrap = h('div', { class: 'mch-chips', role: 'group' });
    opts.forEach(function (o) { wrap.appendChild(h('button', { type: 'button', class: 'mch-chip' + (o[0] === current ? ' is-on' : ''), 'aria-pressed': o[0] === current ? 'true' : 'false', onclick: function () { pick(o[0]); } }, o[1])); });
    return wrap;
  }
  function textComposer(id) {
    var a = state.answers;
    var cfg = {
      area: { ph: T('ph_area'), val: a.area ? (a.area.input || a.area.zip || '') : '', auto: 'postal-code' },
      budget: { ph: T('ph_budget'), val: a.max_monthly ? String(a.max_monthly) + T('monthly_suffix') : a.max_price ? String(a.max_price) : '', prefix: '$' },
      down_payment: { ph: T('ph_down'), val: a.down_payment != null ? String(a.down_payment) : '', mode: 'numeric', prefix: '$' }
    }[id];
    var input = h('input', { id: 'mch_in_' + id, type: 'text', placeholder: cfg.ph, inputmode: cfg.mode || null, autocomplete: cfg.auto || 'off', 'aria-label': question(id), 'aria-invalid': ui.error ? 'true' : null, 'aria-describedby': ui.error ? 'mch_err' : null });
    input.value = cfg.val;
    var form = h('form', { class: 'mch-composer', novalidate: true, onsubmit: function (e) { e.preventDefault(); submitText(id, input.value); } },
      cfg.prefix ? h('span', { class: 'mch-prefix', 'aria-hidden': 'true', text: cfg.prefix }) : null,
      input,
      h('button', { type: 'submit', class: 'btn btn-primary mch-send', disabled: ui.busy, title: ui.busy ? T('checking') : T('send'), 'aria-label': ui.busy ? T('checking') : T('send') }, sendSvg()));
    var box = h('div', null, form);
    if (ui.error) box.appendChild(h('p', { class: 'mch-err', id: 'mch_err', role: 'alert', text: ui.error }));
    if (id !== 'area') box.appendChild(skipBtn(id));
    return box;
  }

  /** Apply a typed or spoken answer to a step. Returns a Promise<boolean> (true when accepted). */
  function submitText(id, raw) {
    var v = String(raw || '').trim();
    ui.error = null;
    if (id === 'area') {
      if (!v) { ui.error = T('err_area_empty'); render(false); return Promise.resolve(false); }
      ui.busy = true; render(false);
      return api('POST', '/api/v1/public/area', { input: v }).then(function (r) {
        ui.busy = false;
        var d = r.data || {};
        if (!r.ok || !d.ok) { ui.error = T('err_area_' + (d.reason || 'error')); render(false); return false; }
        setAnswer('area', { area: { input: d.zip || d.input || v, zip: d.zip || null, city: d.city || null, county: d.county || null, label: d.label || v } });
        afterAnswer('area');
        return true;
      }).catch(function () { ui.busy = false; ui.error = T('err_area_error'); render(false); return false; });
    }
    if (id === 'budget') {
      if (!v || (isSkip(v) && !(parseAmount(v) > 0))) { skip('budget'); return Promise.resolve(true); }
      var n = parseAmount(v);
      if (!(n > 0)) { ui.error = T('err_budget'); render(false); return Promise.resolve(false); }
      var monthly = isMonthly(v) || n < 20000;
      if (monthly && (n < 300 || n > 50000)) { ui.error = T('err_budget'); render(false); return Promise.resolve(false); }
      if (!monthly && (n < 50000 || n > 20000000)) { ui.error = T('err_budget'); render(false); return Promise.resolve(false); }
      setAnswer('budget', monthly ? { max_monthly: n, max_price: null } : { max_price: n, max_monthly: null });
      afterAnswer('budget');
      return Promise.resolve(true);
    }
    if (id === 'down_payment') {
      if (!v || (isSkip(v) && !(parseAmount(v) >= 0))) { skip('down_payment'); return Promise.resolve(true); }
      var d = parseAmount(v);
      if (!(d >= 0) || isNaN(d) || d > 10000000) { ui.error = T('err_down'); render(false); return Promise.resolve(false); }
      setAnswer('down_payment', { down_payment: d });
      afterAnswer('down_payment');
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  /* ---------- no-model understanding (voice fallback) ---------- */
  function parseTimeline(s) {
    var t = norm(s);
    if (/next year|more than (a|one|12) ?(year|months)|over a year|two years|2 years|18 months|el proximo ano|mas de (un|1) ano|dos anos/.test(t)) return '12m_plus';
    var m = t.match(/(\d+)\s*(month|mes)/);
    if (m) { var n = Number(m[1]); return n <= 3 ? '0_3m' : n <= 6 ? '3_6m' : n <= 12 ? '6_12m' : '12m_plus'; }
    if (/\b(asap|right away|immediately|now|soon|this month|next month|couple of months|few weeks|ya|pronto|inmediato|este mes|un par de meses|three months|tres meses)\b/.test(t)) return '0_3m';
    if (/\b(six months|half a year|seis meses|medio ano|four months|five months|cuatro meses|cinco meses)\b/.test(t)) return '3_6m';
    if (/\b(a year|this year|within a year|one year|nine months|un ano|este ano|nueve meses)\b/.test(t)) return '6_12m';
    return null;
  }
  function parseFinancing(s) {
    var t = norm(s);
    if (/pre ?-?approv|preaprob|already approved|aprobad/.test(t)) return 'preapproved';
    if (/\bcash\b|contado|efectivo/.test(t)) return 'cash';
    if (/neither|none|not yet|need a lender|need (a )?loan|no lender|ninguna|ninguno|todavia no|necesito (un )?prestamo/.test(t)) return 'needs_lender';
    return null;
  }
  var NUMWORDS = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, cero: 0, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9 };
  function extractArea(s) {
    var words = norm(s).replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine|cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g, function (m) { return String(NUMWORDS[m]); });
    var wordZip = words.replace(/(\d)[\s,-]+(?=\d)/g, '$1').match(/\b(3\d{4})\b/);
    var zip = String(s).match(/\b(\d{5})\b/) || wordZip;
    if (zip) return zip[1];
    var spoken = String(s).replace(/(\d)[\s-]+(?=\d)/g, '$1').match(/\b(3\d{4})\b/);
    if (spoken) return spoken[1];
    var t = String(s).replace(/^\s*(i'?m|i am|we'?re|we are|looking|searching|buscando|estoy|estamos|busco|buscamos)\b[^,]*?\b(in|at|near|around|en|cerca de|por)\s+/i, '')
      .replace(/^\s*(in|at|near|around|en|cerca de|por)\s+/i, '').replace(/[.!?]+$/, '').trim();
    return t.length >= 3 && t.length <= 80 ? t : null;
  }
  function pendingQuestionText() {
    var id = state.step;
    if (id === 'finish') return window.BLReportView ? window.BLReportView.nextPrompt(lang) : '';
    return question(id);
  }
  /** Understand one utterance with no model. Resolves to what Anna should say next. */
  function offlineTurn(text) {
    if (!root || !state) return Promise.resolve('');
    var id = state.step;
    var said = String(text || '');
    function then(ok) {
      if (!ok) return ui.error || question(state.step);
      var prev = STEPS[stepIndex(id)];
      var ack = ackFor(prev) || '';
      return (ack + ' ' + pendingQuestionText()).trim();
    }
    if (id === 'finish') return Promise.resolve(window.BLReportView ? window.BLReportView.offlineTurn(said, lang) : '');
    if (id === 'area') { var place = extractArea(said); if (!place) return Promise.resolve(T('q_area')); return submitText('area', place).then(then); }
    if (id === 'budget' || id === 'down_payment') return submitText(id, said).then(then);
    if (id === 'move_timeline') {
      if (isSkip(said)) { skip(id); return Promise.resolve(then(true)); }
      var tl = parseTimeline(said); if (!tl) return Promise.resolve(T('q_timeline'));
      setAnswer(id, { move_timeline: tl }); afterAnswer(id); return Promise.resolve(then(true));
    }
    if (id === 'financing_type') {
      if (isSkip(said) && !parseFinancing(said)) { skip(id); return Promise.resolve(then(true)); }
      var fin = parseFinancing(said); if (!fin) return Promise.resolve(T('q_financing'));
      setAnswer(id, { financing_type: fin }); afterAnswer(id); return Promise.resolve(then(true));
    }
    return Promise.resolve(question(id));
  }

  /* ---------- boot ---------- */
  function restoreLead(tok) {
    return api('GET', '/api/v1/public/leads/' + encodeURIComponent(tok)).then(function (r) {
      if (!r.ok || !r.data || !r.data.search_token) return;
      restoreSearch(r.data.search_token);
    });
  }
  function restoreSearch(tok) {
    state = fresh();
    state.search = { token: tok }; state.step = 'finish';
    STEPS.forEach(function (s) { state.done[s] = true; });
    if (window.BLReportView) window.BLReportView.show(tok, { lang: lang, scroll: false, onLoad: function (rep) {
      var w = rep.wish || {};
      state.answers = { area: { input: w.area, label: w.area, zip: rep.area && rep.area.zip }, max_price: w.max_price, max_monthly: w.max_monthly, down_payment: w.down_payment,
        move_timeline: w.move_timeline, financing_type: w.financing_type };
      render(false);
    } });
    render(false);
  }

  var api_ = {
    init: function (opts) {
      root = opts && opts.el ? opts.el : document.getElementById('blChat');
      if (!root) return;
      lang = (opts && opts.lang) || (document.documentElement.lang || 'en').slice(0, 2);
      if (lang !== 'es') lang = 'en';
      state = fresh();
      var qs = new URLSearchParams(location.search);
      var rep = qs.get('report'), lead = qs.get('lead');
      render(false);
      if (rep && /^[A-Za-z0-9_-]{20,64}$/.test(rep)) restoreSearch(rep);
      else if (lead && /^[A-Za-z0-9_-]{20,64}$/.test(lead)) restoreLead(lead);
      var zip = qs.get('zip');
      if (zip && /^\d{5}$/.test(zip) && !rep && !lead) submitText('area', zip);
    },
    setLang: function (l) { lang = l === 'es' ? 'es' : 'en'; if (root) render(false); if (window.BLReportView) window.BLReportView.setLang(lang); },
    prefillArea: function (zip) { if (root && state.step === 'area') submitText('area', zip); },
    start: function () { if (!root) return; var el = document.getElementById('intake'); if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); setTimeout(focusComposer, reduce ? 0 : 450); },
    /* Voice (model path): fills answers the buyer said. Contact details and yes/no answers go to the report's
       contact form, where the buyer still ticks the consent box and presses Create report. */
    applyVoice: function (i) {
      if (!root || !i) return 0;
      var n = 0;
      var skips = Array.isArray(i.skip) ? i.skip : [];
      if (i.budget_max) { setAnswer('budget', { max_price: i.budget_max, max_monthly: null }); n++; }
      else if (i.monthly_max) { setAnswer('budget', { max_monthly: i.monthly_max, max_price: null }); n++; }
      else if (skips.indexOf('budget') !== -1 && !answered('budget')) { setAnswer('budget', { max_price: null, max_monthly: null }); n++; }
      if (i.down_payment != null) { setAnswer('down_payment', { down_payment: i.down_payment }); n++; }
      else if (skips.indexOf('down_payment') !== -1 && !answered('down_payment')) { setAnswer('down_payment', { down_payment: null }); n++; }
      if (TIMELINE.indexOf(i.timeline) !== -1) { setAnswer('move_timeline', { move_timeline: i.timeline }); n++; }
      else if (skips.indexOf('move_timeline') !== -1 && !answered('move_timeline')) { setAnswer('move_timeline', { move_timeline: null }); n++; }
      if (FIN_ALL.indexOf(i.financing) !== -1) { setAnswer('financing_type', { financing_type: i.financing }); n++; }
      else if (skips.indexOf('financing_type') !== -1 && !answered('financing_type')) { setAnswer('financing_type', { financing_type: null }); n++; }
      if (window.BLReportView) n += window.BLReportView.applyVoice(i);
      var area = (i.zip_codes && i.zip_codes[0]) || i.place;
      if (area && (!state.answers.area || (state.answers.area.zip || state.answers.area.input) !== area)) {
        state.step = 'area';
        submitText('area', area);
        return n + 1;
      }
      if (n && !state.search) afterAnswer(state.step === 'finish' ? 'financing_type' : state.step);
      else if (n && state.searchDirty) createSearch();
      return n;
    },
    offlineTurn: offlineTurn,
    status: function () {
      if (!state) return '';
      var have = [], open = [];
      var labels = { area: 'area (required)', budget: 'maximum price or maximum monthly payment', down_payment: 'down payment', move_timeline: 'timeframe to buy', financing_type: 'pre-approved, cash, or neither' };
      STEPS.forEach(function (id) { if (answered(id)) have.push(labels[id] + ' = ' + display(id)); else open.push(labels[id]); });
      var onScreen = state.step === 'finish' ? (state.search ? 'the report, with the contact form under it' : ui.busy ? 'creating the report' : 'create the report') : question(state.step);
      var fallback = state.step === 'finish' ? (window.BLReportView ? window.BLReportView.nextPrompt(lang) : '') : question(state.step);
      return ('ANNA CHAT STATUS (live; read this first). Fallback reply (offline mode only, ignore): [' + String(fallback).replace(/[\[\]]/g, '').slice(0, 180) + ']. ' +
        'Intake: five questions, only the area is required, every other one can be skipped. On screen now: ' + onScreen + '. ' +
        'Answered: ' + (have.join('; ') || 'nothing yet') + '. Not answered yet: ' + (open.join(', ') || 'none') + '. ' +
        'Report: ' + (state.search ? 'created and shown below the conversation' : 'not created yet; it is created automatically after the fifth question') + '.').slice(0, 1800);
    },
    answers: function () { return state ? JSON.parse(JSON.stringify(state.answers)) : {}; }
  };
  window.BLChat = api_;
})();
