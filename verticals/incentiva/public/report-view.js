/* BuyersLine report view (owner review 2026-09-15). Renders GET /api/v1/public/searches/:token under Anna's
   conversation, polls while promotions are still being checked, and ends with the contact form.
   Every figure comes from the server; this file formats, it never computes a price, payment or score.
   The consent box is ticked only by the buyer: applyVoice fills names and yes/no answers, never the box. */
(function () {
  'use strict';
  var BASE = (window.BL_BASE && window.BL_BASE.indexOf('{{') === -1) ? window.BL_BASE : '';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var L = {
    en: {
      title: 'Your BuyersLine report', for_area: 'New construction near {area}', made_on: 'Created {date}',
      print: 'Print or save as PDF', loading: 'Loading your report...', load_error: "Your report didn't load.", retry: 'Try again',
      wish: 'Your wish list', area: 'Area', budget: 'Budget', down: 'Down payment', timeline: 'Timeframe', financing: 'Paying with', skipped: 'Not given', a_month: ' a month',
      pp: 'Purchasing power',
      pp_monthly: 'A payment of {monthly} a month buys up to about {price}.',
      pp_price: 'A {price} home costs from {monthly} a month, before HOA and CDD fees.',
      pp_income: 'All your monthly debts, including the new home, should stay under {cap}% of gross income. That payment needs a yearly household income of at least {income} if you have no other monthly debts.',
      pp_cash: 'Paying cash: no loan payment. Property taxes and insurance still apply.',
      pp_none: 'Add a maximum price or monthly payment to see what you can afford.',
      pp_basis: 'Estimate at a {rate}% reference rate ({date}), 30-year fixed, with taxes and insurance. Not a loan approval.',
      pp_down_assumed: 'Assumes {pct}% down.',
      pp_calc: 'Check with your income', pp_income_in: 'Yearly household income', pp_debts_in: 'Monthly debt payments (car, student loans, cards)', pp_calc_go: 'Calculate',
      pp_calc_result: 'With {income} a year and {debts} in monthly debts, homes up to about {price} keep total debts under {cap}% of income.',
      pp_calc_capped: 'With {income} a year and {debts} in monthly debts, your income supports homes up to about {income_price} (about {income_pay} a month). Your own limit of {target} a month keeps you at about {price}.',
      pp_calc_blocked: 'Those monthly debts already use the {cap}% limit, so there is no room for a home payment yet.', pp_calc_more: 'Enter your yearly income.',
      builders: "Today's promotions by builder", builders_sub: 'Checked against builder websites. Each promotion passed our compliance review before it is shown.',
      th_builder: 'Builder', th_promo: "Today's promotion", th_from: 'From', th_expires: 'Ends',
      st_checking: 'Checking now...', st_none_found: 'No current promotion found in this area today.', st_no_promotion: 'Selling here, no promotion published today.',
      st_not_checked: "Couldn't check today. We try again early tomorrow.",
      badge_agent: 'Agent verified', badge_source: 'Source found', badge_unverified: 'Unverified',
      notice_research_stale: 'Live checking is paused, so these promotions are from our last check on {date}.',
      notice_research_unavailable: "Live checking is paused right now. The rest of your report is complete; promotions fill in when it's back.",
      notice_research_failed: "Today's check didn't finish. The rest of your report is complete.",
      notice_research_not_configured: 'Live checking is not connected yet.', notice_research_cap_reached: 'Live checking is paused for this month.',
      check_again: 'Check promotions again', checking_again: 'Checking again...', check_later: 'Live checking is still paused. Try again later.',
      progress: '{searches} searches · {builders} builders checked · {time}',
      best: 'Best deal today', best_basis_research_ranking: 'Ranked on estimated monthly payment, incentive value, cash needed and fees. Not a recommendation.', best_basis_lowest_estimated_payment: 'The lowest estimated monthly payment among current promotions. Not a recommendation.',
      best_none: 'No promotion in your range to rank yet.', est_from: 'Est. from {amount}/mo',
      communities: 'Communities and fit', fit: 'Fit', th_community: 'Community', th_price: 'Starting price', th_monthly: 'Est. monthly',
      fit_help: 'Fit weighs price (50), monthly payment (30) and location (20). Incentives never add to fit.',
      market: 'Prices in this area', lowest: 'Lowest price available', lowest_in_budget: 'Lowest in your budget', ppsf: 'Price per square foot', ppsf_median: 'median', lowest_community: 'Lowest starting price',
      homes_count: 'New-construction homes listed within {miles} miles', market_none: 'Home listings are not available for this area right now.', market_nozip: 'Add a ZIP code to see listed homes and price per square foot.',
      schools: 'School ratings', schools_none: 'Official school grades for this area are not available yet.', schools_src: 'Grade source: {src}',
      homes: 'Homes at your price point', homes_sub: '{n} listed homes, sorted by fit.', homes_none: 'No listed homes in your price range right now.', show_all: 'Show all {n} homes', beds: 'bd', baths: 'ba', sqft: 'sq ft', hoa: 'HOA',
      disclaimer: 'Builder promotions change daily and are subject to change without notice. BuyersLine is not a real estate agent or broker.',
      share: 'Working with your own agent?', share_sub: 'Send this report to them, or continue without an agent below.', share_text: 'Text it', share_email: 'Email it', share_copy: 'Copy link', copied: 'Link copied',
      share_msg: 'Here is my BuyersLine new-construction report: {url}', share_subject: 'My BuyersLine report', continue_without: 'Continue without an agent',
      contact: 'Get your report by email', contact_sub: 'Tell us where to send it.',
      first: 'First name', email: 'Email', phone: 'Phone', has_agent: 'Are you already working with a real estate agent?', visited: 'Have you already visited a new construction site?',
      yes: 'Yes', no: 'No', consent: 'Share my name, contact details and criteria with a licensed real estate agent.',
      consent_has_agent: 'Since you work with an agent, we will not share your details. Send them this report instead.',
      pref: 'Contact preference', pref_email: 'Email', pref_phone: 'Phone call', create: 'Create report', creating: 'Creating...',
      err_first: 'Enter your first name.', err_email: 'Enter a valid email.', err_phone: 'Enter a 10-digit US phone number.', err_choice: 'Choose yes or no.', err_submit: "We couldn't save that. Please try again.",
      done_title: 'Done, {name}.', done_plain: 'Your report has been created.', done_emailed: 'Your full report is on its way to your email.', done_not_emailed: 'Your report is saved. Email delivery is not connected yet, so keep this link.',
      done_referral: 'A licensed real estate agent will contact you by {pref}.', done_no_referral: 'Nobody will contact you. Your report is yours to keep.',
      countdown: 'Creating your report in {n}...', cancel: 'Cancel'
    },
    es: {
      title: 'Su informe de BuyersLine', for_area: 'Casas nuevas cerca de {area}', made_on: 'Creado el {date}',
      print: 'Imprimir o guardar como PDF', loading: 'Cargando su informe...', load_error: 'Su informe no cargó.', retry: 'Intentar de nuevo',
      wish: 'Lo que usted busca', area: 'Zona', budget: 'Presupuesto', down: 'Pago inicial', timeline: 'Plazo', financing: 'Forma de pago', skipped: 'No indicado', a_month: ' al mes',
      pp: 'Poder de compra',
      pp_monthly: 'Un pago de {monthly} al mes compra hasta unos {price}.',
      pp_price: 'Una casa de {price} cuesta desde {monthly} al mes, sin cuotas de HOA ni CDD.',
      pp_income: 'Todas sus deudas mensuales, incluida la casa nueva, deben quedar por debajo del {cap}% de su ingreso bruto. Ese pago requiere un ingreso anual del hogar de al menos {income} si no tiene otras deudas mensuales.',
      pp_cash: 'Pago de contado: sin pago de préstamo. Los impuestos y el seguro se pagan igual.',
      pp_none: 'Agregue un precio máximo o un pago mensual para ver cuánto puede pagar.',
      pp_basis: 'Estimación con una tasa de referencia de {rate}% ({date}), 30 años fija, con impuestos y seguro. No es una aprobación de préstamo.',
      pp_down_assumed: 'Supone un {pct}% de pago inicial.',
      pp_calc: 'Calcular con su ingreso', pp_income_in: 'Ingreso anual del hogar', pp_debts_in: 'Pagos mensuales de deudas (auto, préstamos estudiantiles, tarjetas)', pp_calc_go: 'Calcular',
      pp_calc_result: 'Con {income} al año y {debts} en deudas mensuales, casas de hasta unos {price} mantienen sus deudas por debajo del {cap}% del ingreso.',
      pp_calc_capped: 'Con {income} al año y {debts} de deudas mensuales, su ingreso alcanza para casas de hasta unos {income_price} (unos {income_pay} al mes). Con su propio límite de {target} al mes, llega a unos {price}.',
      pp_calc_blocked: 'Esas deudas mensuales ya usan el límite del {cap}%, así que todavía no queda espacio para un pago de casa.', pp_calc_more: 'Escriba su ingreso anual.',
      builders: 'Promociones de hoy por constructora', builders_sub: 'Revisadas en los sitios de las constructoras. Cada promoción pasó nuestra revisión de cumplimiento antes de mostrarse.',
      th_builder: 'Constructora', th_promo: 'Promoción de hoy', th_from: 'Desde', th_expires: 'Vence',
      st_checking: 'Revisando ahora...', st_none_found: 'No se encontró una promoción actual en esta zona hoy.', st_no_promotion: 'Vende aquí, sin promoción publicada hoy.',
      st_not_checked: 'No se pudo revisar hoy. Lo intentamos de nuevo mañana temprano.',
      badge_agent: 'Verificada por agente', badge_source: 'Fuente encontrada', badge_unverified: 'Sin verificar',
      notice_research_stale: 'La revisión en vivo está en pausa, así que estas promociones son de nuestra última revisión del {date}.',
      notice_research_unavailable: 'La revisión en vivo está en pausa. El resto de su informe está completo; las promociones se agregan cuando vuelva.',
      notice_research_failed: 'La revisión de hoy no terminó. El resto de su informe está completo.',
      notice_research_not_configured: 'La revisión en vivo aún no está conectada.', notice_research_cap_reached: 'La revisión en vivo está en pausa este mes.',
      check_again: 'Revisar promociones de nuevo', checking_again: 'Revisando de nuevo...', check_later: 'La revisión en vivo sigue en pausa. Inténtelo más tarde.',
      progress: '{searches} búsquedas · {builders} constructoras revisadas · {time}',
      best: 'Mejor oferta hoy', best_basis_research_ranking: 'Ordenada por pago mensual estimado, valor del incentivo, efectivo necesario y cuotas. No es una recomendación.', best_basis_lowest_estimated_payment: 'El pago mensual estimado más bajo entre las promociones actuales. No es una recomendación.',
      best_none: 'Todavía no hay una promoción en su rango para ordenar.', est_from: 'Desde {amount}/mes aprox.',
      communities: 'Comunidades y ajuste', fit: 'Ajuste', th_community: 'Comunidad', th_price: 'Precio inicial', th_monthly: 'Mensual aprox.',
      fit_help: 'El ajuste pondera precio (50), pago mensual (30) y ubicación (20). Los incentivos nunca suman al ajuste.',
      market: 'Precios en esta zona', lowest: 'Precio más bajo disponible', lowest_in_budget: 'Más bajo en su presupuesto', ppsf: 'Precio por pie cuadrado', ppsf_median: 'mediana', lowest_community: 'Precio inicial más bajo',
      homes_count: 'Casas nuevas listadas a menos de {miles} millas', market_none: 'Las casas listadas no están disponibles para esta zona en este momento.', market_nozip: 'Agregue un código postal para ver casas listadas y el precio por pie cuadrado.',
      schools: 'Calificaciones escolares', schools_none: 'Todavía no hay calificaciones escolares oficiales para esta zona.', schools_src: 'Fuente de la calificación: {src}',
      homes: 'Casas en su rango de precio', homes_sub: '{n} casas listadas, ordenadas por ajuste.', homes_none: 'No hay casas listadas en su rango de precio en este momento.', show_all: 'Ver las {n} casas', beds: 'hab', baths: 'baños', sqft: 'pies²', hoa: 'HOA',
      disclaimer: 'Las promociones de las constructoras cambian a diario y pueden cambiar sin previo aviso. BuyersLine no es un agente ni un corredor de bienes raíces.',
      share: '¿Trabaja con su propio agente?', share_sub: 'Envíele este informe, o continúe sin agente más abajo.', share_text: 'Por mensaje', share_email: 'Por correo', share_copy: 'Copiar enlace', copied: 'Enlace copiado',
      share_msg: 'Este es mi informe de casas nuevas de BuyersLine: {url}', share_subject: 'Mi informe de BuyersLine', continue_without: 'Continuar sin agente',
      contact: 'Reciba su informe por correo', contact_sub: 'Díganos a dónde enviarlo.',
      first: 'Nombre', email: 'Correo electrónico', phone: 'Teléfono', has_agent: '¿Ya trabaja con un agente de bienes raíces?', visited: '¿Ya visitó algún sitio de construcción nueva?',
      yes: 'Sí', no: 'No', consent: 'Compartir mi nombre, datos de contacto y criterios con un agente de bienes raíces con licencia.',
      consent_has_agent: 'Como trabaja con un agente, no compartiremos sus datos. Envíele este informe.',
      pref: 'Preferencia de contacto', pref_email: 'Correo electrónico', pref_phone: 'Llamada', create: 'Crear informe', creating: 'Creando...',
      err_first: 'Escriba su nombre.', err_email: 'Escriba un correo válido.', err_phone: 'Escriba un teléfono de Estados Unidos de 10 dígitos.', err_choice: 'Elija sí o no.', err_submit: 'No pudimos guardarlo. Inténtelo de nuevo, por favor.',
      done_title: 'Listo, {name}.', done_plain: 'Su informe ya fue creado.', done_emailed: 'Su informe completo va en camino a su correo.', done_not_emailed: 'Su informe está guardado. El envío por correo aún no está conectado; guarde este enlace.',
      done_referral: 'Un agente de bienes raíces con licencia se comunicará con usted por {pref}.', done_no_referral: 'Nadie lo contactará. El informe es suyo.',
      countdown: 'Creando su informe en {n}...', cancel: 'Cancelar'
    }
  };
  var TL = { en: { '0_3m': 'Within 3 months', '3_6m': '3 to 6 months', '6_12m': '6 to 12 months', '12m_plus': 'More than 12 months' }, es: { '0_3m': 'En 3 meses', '3_6m': 'De 3 a 6 meses', '6_12m': 'De 6 a 12 meses', '12m_plus': 'Más de 12 meses' } };
  var FIN = { en: { preapproved: 'Pre-approved', cash: 'Cash', needs_lender: 'Neither yet', va: 'VA loan', fha: 'FHA loan', unsure: 'Not sure' }, es: { preapproved: 'Preaprobado', cash: 'De contado', needs_lender: 'Ninguna todavía', va: 'Préstamo VA', fha: 'Préstamo FHA', unsure: 'No sé' } };

  var host = null, lang = 'en', tok = null, rep = null, poll = null, pollStart = 0, config = null, showAllHomes = false;
  var form = { first_name: '', email: '', phone: '', has_agent: null, visited_site: null, consent_referral: false, contact_preference: 'email' };
  var formUi = { errors: {}, busy: false, error: null, done: null, countdown: null };

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
  function add(el, c) { if (c == null || c === false) return; if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; } el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
  function usd(n) { return n == null ? '' : new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n); }
  function num(n) { return new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US').format(n); }
  function day(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return iso || ''; return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  function api(method, path, body) {
    var opts = { method: method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(BASE + path, opts).then(function (r) { return r.text().then(function (txt) { var d = null; try { d = txt ? JSON.parse(txt) : null; } catch (e) { d = null; } return { status: r.status, ok: r.ok, data: d }; }); });
  }
  function shareUrl() { return location.origin + BASE + '/?report=' + encodeURIComponent(tok) + '&lang=' + lang; }
  function section(id, title, sub) { var s = h('section', { class: 'rv-sec', id: id }, h('h3', { class: 'rv-h', text: title })); if (sub) s.appendChild(h('p', { class: 'rv-sub', text: sub })); return s; }

  function stopPoll() { if (poll) { clearTimeout(poll); poll = null; } }
  function load(first) {
    if (!tok) return;
    return api('GET', '/api/v1/public/searches/' + encodeURIComponent(tok) + '?lang=' + lang).then(function (r) {
      if (!r.ok || !r.data) { if (first) paintError(); return; }
      rep = r.data;
      if (rep.lead && !formUi.done) formUi.done = { name: '', referral: rep.lead.referral, emailed: true, restored: true };
      paint();
      if (first && typeof first === 'function') first(rep);
      stopPoll();
      if (rep.research && rep.research.status === 'running' && Date.now() - pollStart < 13 * 60e3) poll = setTimeout(function () { load(false); }, 4000);
    }).catch(function () { if (first) paintError(); else poll = setTimeout(function () { load(false); }, 6000); });
  }
  function paintError() {
    clearHost();
    host.appendChild(h('div', { class: 'callout callout-critical' }, h('p', { text: T('load_error') }), h('button', { type: 'button', class: 'btn btn-secondary', onclick: function () { load(true); } }, T('retry'))));
  }
  function clearHost() { while (host.firstChild) host.removeChild(host.firstChild); }

  function paint() {
    if (!host || !rep) return;
    var scrollY = window.scrollY;
    var active = document.activeElement && host.contains(document.activeElement) ? document.activeElement.id : null;
    clearHost();
    host.hidden = false; document.documentElement.classList.add("bl-report-on");
    host.setAttribute('lang', lang);
    var r = rep;
    host.appendChild(h('div', { class: 'rv-top' },
      h('div', null, h('p', { class: 'eyebrow', text: T('for_area', { area: (r.area && r.area.label) || '' }) }), h('h2', { class: 'rv-title', text: T('title') }), h('p', { class: 'small muted', text: T('made_on', { date: day(r.created_at) }) })),
      h('button', { type: 'button', class: 'btn btn-secondary no-print', onclick: function () { window.print(); } }, T('print'))));

    // 1. Wish list
    var w = r.wish || {};
    var s1 = section('rvWish', T('wish'));
    var dl = h('dl', { class: 'mch-kv' });
    [[T('area'), w.area], [T('budget'), w.max_monthly ? usd(w.max_monthly) + T('a_month') : w.max_price ? usd(w.max_price) : T('skipped')], [T('down'), w.down_payment != null ? usd(w.down_payment) : T('skipped')],
      [T('timeline'), w.move_timeline ? TL[lang][w.move_timeline] : T('skipped')], [T('financing'), w.financing_type ? FIN[lang][w.financing_type] : T('skipped')]]
      .forEach(function (kv) { dl.appendChild(h('div', null, h('dt', { text: kv[0] }), h('dd', { text: kv[1] || T('skipped') }))); });
    s1.appendChild(dl); host.appendChild(s1);

    // 2. Purchasing power
    var pp = r.purchasing_power || {};
    var s2 = section('rvPower', T('pp'));
    if (pp.cash) s2.appendChild(h('p', { text: T('pp_cash') }));
    if (pp.basis === 'monthly' && pp.price_supported) {
      s2.appendChild(h('p', { class: 'rv-big' }, T('pp_monthly', { monthly: usd(pp.monthly), price: usd(pp.price_supported) })));
      s2.appendChild(h('p', { text: T('pp_income', { cap: pp.dti_cap_pct, income: usd(pp.income_needed_annual) }) }));
    } else if (pp.basis === 'price' && pp.monthly_for_price) {
      s2.appendChild(h('p', { class: 'rv-big' }, T('pp_price', { price: usd(w.max_price), monthly: usd(pp.monthly_for_price) })));
      if (pp.income_needed_annual) s2.appendChild(h('p', { text: T('pp_income', { cap: pp.dti_cap_pct, income: usd(pp.income_needed_annual) }) }));
    } else if (!pp.cash) s2.appendChild(h('p', { text: T('pp_none') }));
    if (pp.rate != null && pp.basis !== 'none') s2.appendChild(h('p', { class: 'small muted', text: T('pp_basis', { rate: pp.rate, date: day(pp.rate_as_of) }) + (pp.assumed_down_pct != null ? ' ' + T('pp_down_assumed', { pct: pp.assumed_down_pct }) : '') }));
    s2.appendChild(calcBox(pp));
    host.appendChild(s2);

    // 3. Builders table
    var rs = r.research || {};
    var s3 = section('rvBuilders', T('builders'), T('builders_sub'));
    if (rs.status === 'running') {
      var p = rs.progress || {}, secs = Math.max(0, Math.round((Date.now() - pollStart) / 1000));
      s3.appendChild(h('div', { class: 'mch-scan', role: 'status' }, h('div', { class: 'mch-scan-bar', 'aria-hidden': 'true' }, h('span')),
        h('p', { class: 'small muted', text: T('progress', { searches: p.searches || 0, builders: p.builders_checked || 0, time: Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0') }) })));
    }
    if (rs.notice && rs.status === 'done') {
      var note = T('notice_' + rs.notice, { date: day(rs.checked_on) });
      if (note !== 'notice_' + rs.notice) {
        var c = h('div', { class: 'callout', role: 'note' }, h('p', { text: note }));
        if (rs.notice !== 'research_not_configured') c.appendChild(h('button', { type: 'button', class: 'btn btn-secondary btn-small no-print', id: 'rvCheckAgain', onclick: checkAgain }, T('check_again')));
        s3.appendChild(c);
      }
    }
    var tw = h('div', { class: 'mch-tablewrap' }), tb = h('table', { class: 'mch-table rv-builders' });
    tb.appendChild(h('thead', null, h('tr', null, h('th', { scope: 'col', text: T('th_builder') }), h('th', { scope: 'col', text: T('th_promo') }), h('th', { scope: 'col', text: T('th_from') }), h('th', { scope: 'col', text: T('th_expires') }))));
    var body = h('tbody');
    (r.builders || []).forEach(function (b) {
      var promo;
      if (b.status === 'found') {
        promo = h('div', null,
          b.community ? h('strong', { text: b.community }) : null,
          h('div', { text: [b.promotion, b.rate, b.closing_credit, b.other_incentives].filter(Boolean).join(' · ') }),
          b.restrictions ? h('div', { class: 'small muted', text: b.restrictions }) : null,
          (b.notes || []).length ? h('div', { class: 'small muted', text: b.notes.join(' ') }) : null,
          h('span', { class: 'mch-badges' }, h('span', { class: 'chip mch-badge-' + (b.badge === 'agent' ? 'agent' : b.badge === 'source' ? 'source' : 'unverified'), text: T('badge_' + b.badge) })));
      } else promo = h('span', { class: 'muted', text: T('st_' + b.status) });
      body.appendChild(h('tr', null, h('td', { 'data-label': T('th_builder') }, h('strong', { text: b.builder }), b.communities && b.communities.length > 1 ? h('div', { class: 'small muted', text: b.communities.length + (lang === 'es' ? ' comunidades' : ' communities') }) : null),
        h('td', { 'data-label': T('th_promo') }, promo), h('td', { 'data-label': T('th_from'), class: 'num', text: b.lowest_starting_price ? usd(b.lowest_starting_price) : '—' }), h('td', { 'data-label': T('th_expires'), text: b.expiration || '—' })));
    });
    tb.appendChild(body); tw.appendChild(tb); s3.appendChild(tw);
    host.appendChild(s3);

    // 4. Best deal
    var s4 = section('rvBest', T('best'));
    if (r.best_deal && r.best_deal.row) {
      var bd = r.best_deal.row;
      s4.appendChild(h('div', { class: 'card rv-best' },
        h('div', { class: 'rv-best-head' }, h('strong', { text: (bd.community || bd.builder) + ' · ' + bd.builder }), h('span', { class: 'rv-fit', title: T('fit_help') }, T('fit') + ' ' + bd.fit.score)),
        bd.starting_price ? h('p', { class: 'small', text: bd.starting_price + (bd.est_monthly_from ? ' · ' + T('est_from', { amount: usd(bd.est_monthly_from) }) : '') }) : null,
        bd.promotion ? h('p', { text: bd.promotion }) : null,
        r.best_deal.reason ? h('p', { class: 'small', text: r.best_deal.reason }) : null,
        h('p', { class: 'small muted', text: T('best_basis_' + r.best_deal.basis) })));
    } else s4.appendChild(h('p', { class: 'muted', text: rs.status === 'running' ? T('st_checking') : T('best_none') }));
    host.appendChild(s4);

    // 5. Communities with fit
    if ((r.communities || []).length) {
      var s5 = section('rvCommunities', T('communities'), T('fit_help'));
      var cw = h('div', { class: 'mch-tablewrap' }), ct = h('table', { class: 'mch-table' });
      ct.appendChild(h('thead', null, h('tr', null, [T('fit'), T('th_community'), T('th_builder'), T('th_price'), T('th_monthly'), T('th_promo')].map(function (x) { return h('th', { scope: 'col', text: x }); }))));
      var cb = h('tbody');
      r.communities.forEach(function (c) {
        cb.appendChild(h('tr', null, h('td', { 'data-label': T('fit') }, h('span', { class: 'rv-fit' }, String(c.fit.score))), h('td', { 'data-label': T('th_community'), text: c.community || '—' }), h('td', { 'data-label': T('th_builder'), text: c.builder }),
          h('td', { 'data-label': T('th_price'), text: c.starting_price || '—' }), h('td', { 'data-label': T('th_monthly'), class: 'num', text: c.est_monthly_from ? usd(c.est_monthly_from) : '—' }),
          h('td', { 'data-label': T('th_promo'), text: [c.promotion, c.rate].filter(Boolean).join(' · ') || '—' })));
      });
      ct.appendChild(cb); cw.appendChild(ct); s5.appendChild(cw); host.appendChild(s5);
    }

    // 6. Market: lowest price, price per square foot
    var m = r.market || {};
    var s6 = section('rvMarket', T('market'));
    if (m.status === 'no_zip') s6.appendChild(h('p', { class: 'muted', text: T('market_nozip') }));
    else if (!m.count && !r.lowest_community) s6.appendChild(h('p', { class: 'muted', text: T('market_none') }));
    else {
      var stats = h('div', { class: 'rv-stats' });
      if (m.lowest_price) stats.appendChild(stat(T('lowest'), usd(m.lowest_price)));
      if (m.lowest_price_in_budget && m.lowest_price_in_budget !== m.lowest_price) stats.appendChild(stat(T('lowest_in_budget'), usd(m.lowest_price_in_budget)));
      if (m.median_price_per_sqft) stats.appendChild(stat(T('ppsf') + ' (' + T('ppsf_median') + ')', '$' + num(m.median_price_per_sqft)));
      if (r.lowest_community && r.lowest_community.starting_price_usd) stats.appendChild(stat(T('lowest_community') + ': ' + (r.lowest_community.community || r.lowest_community.builder), usd(r.lowest_community.starting_price_usd)));
      s6.appendChild(stats);
      if (m.count) s6.appendChild(h('p', { class: 'small muted', text: T('homes_count', { miles: m.radius_miles }) + ': ' + m.count }));
    }
    host.appendChild(s6);

    // 7. Schools
    var s7 = section('rvSchools', T('schools'));
    var graded = (r.schools || []).filter(function (x) { return x.rating; });
    if (graded.length) {
      var ul = h('ul', { class: 'rv-schools' });
      graded.forEach(function (x) { ul.appendChild(h('li', null, h('span', { text: x.name }), h('strong', { class: 'rv-grade', text: x.rating }))); });
      s7.appendChild(ul);
      var src = graded.map(function (x) { return x.rating_source; }).filter(Boolean)[0];
      if (src) s7.appendChild(h('p', { class: 'small muted', text: T('schools_src', { src: src }) }));
    } else s7.appendChild(h('p', { class: 'muted', text: rs.status === 'running' ? T('st_checking') : T('schools_none') }));
    host.appendChild(s7);

    // 8. Homes
    var homes = r.homes || [];
    var s8 = section('rvHomes', T('homes'), homes.length ? T('homes_sub', { n: homes.length }) : null);
    if (!homes.length) s8.appendChild(h('p', { class: 'muted', text: m.status === 'no_zip' ? T('market_nozip') : T('homes_none') }));
    else {
      var list = h('ul', { class: 'rv-homes' });
      (showAllHomes ? homes : homes.slice(0, 12)).forEach(function (x) {
        list.appendChild(h('li', { class: 'rv-home' },
          h('div', { class: 'rv-home-main' }, h('strong', { text: x.address || '' }), h('span', { class: 'small muted', text: [x.beds ? x.beds + ' ' + T('beds') : '', x.baths ? x.baths + ' ' + T('baths') : '', x.sqft ? num(x.sqft) + ' ' + T('sqft') : '', x.price_per_sqft ? '$' + x.price_per_sqft + '/' + T('sqft') : '', x.hoa_monthly ? T('hoa') + ' ' + usd(x.hoa_monthly) : ''].filter(Boolean).join(' · ') }),
            x.builder ? h('span', { class: 'small', text: [x.builder, x.community].filter(Boolean).join(' · ') }) : null),
          h('div', { class: 'rv-home-side' }, h('strong', { class: 'num', text: usd(x.price) }), x.est_monthly ? h('span', { class: 'small muted', text: T('est_from', { amount: usd(x.est_monthly) }) }) : null, h('span', { class: 'rv-fit' }, T('fit') + ' ' + x.fit.score))));
      });
      s8.appendChild(list);
      if (!showAllHomes && homes.length > 12) s8.appendChild(h('button', { type: 'button', class: 'btn btn-secondary no-print', onclick: function () { showAllHomes = true; paint(); } }, T('show_all', { n: homes.length })));
    }
    host.appendChild(s8);

    // 9. Disclaimer
    host.appendChild(h('div', { class: 'callout callout-caution rv-disclaimer', role: 'note' }, h('p', { text: T('disclaimer') })));

    // 10. Share with own agent
    var url = shareUrl();
    var msg = T('share_msg', { url: url });
    host.appendChild(h('section', { class: 'rv-sec rv-share no-print', id: 'rvShare' },
      h('h3', { class: 'rv-h', text: T('share') }), h('p', { class: 'rv-sub', text: T('share_sub') }),
      h('div', { class: 'mch-chips' },
        h('a', { class: 'mch-chip', href: 'sms:?&body=' + encodeURIComponent(msg) }, T('share_text')),
        h('a', { class: 'mch-chip', href: 'mailto:?subject=' + encodeURIComponent(T('share_subject')) + '&body=' + encodeURIComponent(msg) }, T('share_email')),
        h('button', { type: 'button', class: 'mch-chip', onclick: function (e) { var b = e.currentTarget; try { navigator.clipboard.writeText(url).then(function () { b.textContent = T('copied'); }); } catch (x) { window.prompt('', url); } } }, T('share_copy')),
        h('button', { type: 'button', class: 'mch-chip', onclick: function () { var el = document.getElementById('rvContact'); if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); } }, T('continue_without')))));

    // 11. Contact and consent
    host.appendChild(contactSection());

    if (active) { var again = document.getElementById(active); if (again) { try { again.focus({ preventScroll: true }); } catch (e) { again.focus(); } } }
    if (Math.abs(window.scrollY - scrollY) > 2) window.scrollTo(0, scrollY);
  }
  function stat(label, value) { return h('div', { class: 'rv-stat' }, h('span', { class: 'small muted', text: label }), h('strong', { text: value })); }

  var calc = { income: '', debts: '', out: null };
  function calcBox(pp) {
    var box = h('details', { class: 'rv-calc no-print' + (calc.out ? ' has-out' : ''), open: calc.out ? true : null }, h('summary', { text: T('pp_calc') }));
    var inc = h('input', { id: 'rvCalcIncome', type: 'text', inputmode: 'numeric', autocomplete: 'off' }); inc.value = calc.income;
    var debts = h('input', { id: 'rvCalcDebts', type: 'text', inputmode: 'numeric', autocomplete: 'off' }); debts.value = calc.debts;
    var f = h('form', { class: 'rv-calc-form', novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      calc.income = inc.value; calc.debts = debts.value;
      var income = Number(String(inc.value).replace(/[^\d.]/g, '')), d = Number(String(debts.value).replace(/[^\d.]/g, '')) || 0;
      if (!(income > 0)) { calc.out = { text: T('pp_calc_more') }; paint(); return; }
      var w = (rep && rep.wish) || {};
      api('POST', '/api/v1/public/buying-power?lang=' + lang, { gross_income_annual: income, monthly_debts: d, down_payment: w.down_payment, target_payment: w.max_monthly || null }).then(function (res) {
        var dd = res.data || {};
        if (dd.estimate && dd.estimate.price_high && dd.limited_by === 'target' && dd.income_only && dd.income_only.price_high > dd.estimate.price_high) calc.out = { text: T('pp_calc_capped', { income: usd(income), debts: usd(d), income_price: usd(dd.income_only.price_high), income_pay: usd(dd.income_only.payment_high), target: usd(w.max_monthly), price: usd(dd.estimate.price_high) }) };
        else if (dd.estimate && dd.estimate.price_high) calc.out = { text: T('pp_calc_result', { income: usd(income), debts: usd(d), price: usd(dd.estimate.price_high), cap: 50 }) };
        else if (dd.blocked) calc.out = { text: T('pp_calc_blocked', { cap: 50 }) };
        else calc.out = { text: T('pp_calc_more') };
        paint();
      });
    } },
      h('label', { for: 'rvCalcIncome', text: T('pp_income_in') }), h('div', { class: 'input-money' }, inc),
      h('label', { for: 'rvCalcDebts', text: T('pp_debts_in') }), h('div', { class: 'input-money' }, debts),
      h('button', { type: 'submit', class: 'btn btn-secondary' }, T('pp_calc_go')));
    box.appendChild(f);
    if (calc.out) box.appendChild(h('p', { class: 'rv-calc-out', role: 'status', text: calc.out.text }));
    return box;
  }

  function checkAgain() {
    var b = document.getElementById('rvCheckAgain'); if (b) { b.disabled = true; b.textContent = T('checking_again'); }
    api('POST', '/api/v1/public/searches/' + encodeURIComponent(tok) + '/refresh').then(function (r) {
      if (r.ok && r.data && r.data.started) { pollStart = Date.now(); load(false); return; }
      if (b) { b.disabled = false; b.textContent = r.data && r.data.reason === 'unavailable' ? T('check_later') : T('check_again'); }
    });
  }

  /* ---------- contact + consent ---------- */
  function radio(name, value, label) {
    var id = 'rv_' + name + '_' + value;
    var input = h('input', { type: 'radio', name: 'rv_' + name, id: id, value: value, onchange: function () { form[name] = value; if (name === 'has_agent' && value === 'yes') form.consent_referral = false; formUi.errors[name] = null; paint(); } });
    input.checked = form[name] === value;
    return h('label', { class: 'rv-radio', for: id }, input, h('span', { text: label }));
  }
  function field(name, label, type, auto, mode) {
    var id = 'rv_' + name;
    var input = h('input', { id: id, type: type, autocomplete: auto, inputmode: mode || null, 'aria-invalid': formUi.errors[name] ? 'true' : null, 'aria-describedby': formUi.errors[name] ? id + '_err' : null,
      oninput: function (e) { form[name] = e.target.value; } });
    input.value = form[name] || '';
    return h('div', { class: 'field' }, h('label', { for: id, text: label }), input, formUi.errors[name] ? h('p', { class: 'field-error', id: id + '_err', text: formUi.errors[name] }) : null);
  }
  function contactSection() {
    var s = h('section', { class: 'rv-sec rv-contact', id: 'rvContact' });
    if (formUi.done) {
      var d = formUi.done;
      s.appendChild(h('h3', { class: 'rv-h', text: d.name ? T('done_title', { name: d.name }) : T('done_plain') }));
      if (!d.restored) s.appendChild(h('p', { text: d.emailed ? T('done_emailed') : T('done_not_emailed') }));
      s.appendChild(h('p', { text: d.referral ? T('done_referral', { pref: form.contact_preference === 'phone' ? T('pref_phone').toLowerCase() : T('pref_email').toLowerCase() }) : T('done_no_referral') }));
      return s;
    }
    s.appendChild(h('h3', { class: 'rv-h', text: T('contact') }));
    s.appendChild(h('p', { class: 'rv-sub', text: T('contact_sub') }));
    var f = h('form', { class: 'card rv-form no-print', novalidate: true, onsubmit: function (e) { e.preventDefault(); submit(); } });
    f.appendChild(h('div', { class: 'grid-2' }, field('first_name', T('first'), 'text', 'given-name'), field('email', T('email'), 'email', 'email', 'email')));
    f.appendChild(h('div', { class: 'grid-2' }, field('phone', T('phone'), 'tel', 'tel', 'tel')));
    [['has_agent', T('has_agent')], ['visited_site', T('visited')]].forEach(function (q) {
      var fs = h('fieldset', { class: 'rv-yesno' + (formUi.errors[q[0]] ? ' has-error' : '') }, h('legend', { text: q[1] }), h('div', { class: 'rv-radios' }, radio(q[0], 'yes', T('yes')), radio(q[0], 'no', T('no'))));
      if (formUi.errors[q[0]]) fs.appendChild(h('p', { class: 'field-error', text: formUi.errors[q[0]] }));
      f.appendChild(fs);
    });
    if (form.has_agent === 'yes') f.appendChild(h('p', { class: 'mch-hint', text: T('consent_has_agent') }));
    else {
      var cb = h('input', { type: 'checkbox', id: 'rv_consent', onchange: function (e) { form.consent_referral = e.target.checked; } });
      cb.checked = !!form.consent_referral;
      f.appendChild(h('label', { class: 'mch-consent', for: 'rv_consent' }, cb, h('span', { class: 'mch-consent-text', text: T('consent') })));
    }
    f.appendChild(h('fieldset', { class: 'rv-yesno' }, h('legend', { text: T('pref') }), h('div', { class: 'rv-radios' }, radio('contact_preference', 'email', T('pref_email')), radio('contact_preference', 'phone', T('pref_phone')))));
    f.appendChild(h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', class: 'mch-hp', 'aria-hidden': 'true', id: 'rv_hp' }));
    if (formUi.error) f.appendChild(h('p', { class: 'mch-err', role: 'alert', text: formUi.error }));
    f.appendChild(h('button', { type: 'submit', class: 'btn btn-primary rv-create', id: 'rvCreate', disabled: formUi.busy }, formUi.busy ? T('creating') : T('create')));
    var lc = config && config.lead_consent;
    if (lc && lc.email) f.appendChild(h('p', { class: 'small muted', text: lc.email }));
    s.appendChild(f);
    return s;
  }
  function validate() {
    var e = {};
    if (!String(form.first_name || '').trim()) e.first_name = T('err_first');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(form.email || '').trim())) e.email = T('err_email');
    var dg = String(form.phone || '').replace(/[^\d]/g, '');
    if (!(dg.length === 10 || (dg.length === 11 && dg[0] === '1'))) e.phone = T('err_phone');
    if (form.has_agent !== 'yes' && form.has_agent !== 'no') e.has_agent = T('err_choice');
    if (form.visited_site !== 'yes' && form.visited_site !== 'no') e.visited_site = T('err_choice');
    return e;
  }
  function missing() { return Object.keys(validate()); }
  function submit() {
    if (formUi.busy || formUi.done) return false;
    formUi.errors = validate(); formUi.error = null;
    if (Object.keys(formUi.errors).length) { paint(); var first = document.getElementById('rv_' + Object.keys(formUi.errors)[0]) || document.querySelector('.rv-yesno.has-error input'); if (first) first.focus(); return false; }
    formUi.busy = true; paint();
    var hp = document.getElementById('rv_hp');
    api('POST', '/api/v1/public/leads', { search_token: tok, lang: lang, first_name: form.first_name.trim(), email: form.email.trim(), phone: form.phone.trim(), has_agent: form.has_agent, visited_site: form.visited_site,
      consent_referral: form.has_agent === 'no' && !!form.consent_referral, contact_preference: form.contact_preference, website: hp ? hp.value : '' }).then(function (r) {
      formUi.busy = false;
      if (r.ok && r.data && r.data.ok) { formUi.done = { name: form.first_name.trim(), referral: !!r.data.referral, emailed: !!r.data.emailed }; paint(); var el = document.getElementById('rvContact'); if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); return; }
      formUi.error = (r.data && r.data.error) || T('err_submit'); paint();
    }).catch(function () { formUi.busy = false; formUi.error = T('err_submit'); paint(); });
    return true;
  }

  /* ---------- voice ---------- */
  function statusText() {
    if (!rep) return tok ? 'REPORT: loading.' : 'REPORT: not created yet.';
    var r = rep, rs = r.research || {};
    var b = (r.builders || []).map(function (x) { return x.builder + ': ' + (x.status === 'found' ? [x.promotion, x.rate, x.closing_credit].filter(Boolean).join(', ').slice(0, 120) + ' [' + x.badge + ']' : x.status.replace(/_/g, ' ')); }).join('; ');
    var pp = r.purchasing_power || {};
    var ppLine = pp.basis === 'monthly' && pp.price_supported ? 'payment ' + usd(pp.monthly) + ' a month buys up to about ' + usd(pp.price_supported) + '; needs yearly income of at least ' + usd(pp.income_needed_annual) + ' with no other debts (50% total-debt cap)'
      : pp.basis === 'price' && pp.monthly_for_price ? usd(r.wish.max_price) + ' home costs from ' + usd(pp.monthly_for_price) + ' a month before HOA and CDD' + (pp.income_needed_annual ? '; needs yearly income of at least ' + usd(pp.income_needed_annual) : '') : 'not calculated (no budget given)';
    var best = r.best_deal && r.best_deal.row ? (r.best_deal.row.community || r.best_deal.row.builder) + ' by ' + r.best_deal.row.builder + (r.best_deal.row.promotion ? ', ' + r.best_deal.row.promotion.slice(0, 100) : '') : 'none yet';
    var m = r.market || {};
    var miss = missing();
    return ('REPORT ON SCREEN (figures are exact; say them only as written). Promotion check: ' + rs.status + (rs.notice ? ' (' + rs.notice + ')' : '') + '. Builders: ' + b + '. Purchasing power: ' + ppLine + '. Best deal today: ' + best + '. ' +
      'Lowest listed price: ' + (m.lowest_price ? usd(m.lowest_price) : 'not available') + '; median price per sq ft: ' + (m.median_price_per_sqft ? '$' + m.median_price_per_sqft : 'not available') + '; homes in budget: ' + (r.homes || []).length + '. ' +
      'School grades: ' + ((r.schools || []).filter(function (x) { return x.rating; }).map(function (x) { return x.name + ' ' + x.rating; }).join(', ') || 'not available') + '. ' +
      'CONTACT FORM: ' + (formUi.done ? 'submitted; report emailed' + (formUi.done.referral ? '; a licensed agent will contact them' : '') : 'first name ' + (form.first_name ? '= ' + form.first_name : 'missing') + ', email ' + (form.email ? '= ' + form.email : 'missing') + ', phone ' + (form.phone ? '= ' + form.phone : 'missing') +
      ', working with an agent ' + (form.has_agent || 'not answered') + ', visited a new construction site ' + (form.visited_site || 'not answered') + ', share-with-agent box ' + (form.consent_referral ? 'ticked by the buyer' : 'not ticked (only the buyer can tick it)') + '. Still missing: ' + (miss.join(', ') || 'nothing, ready to create the report')) + '.').slice(0, 2200);
  }
  function nextPrompt(l) {
    var es = (l || lang) === 'es';
    if (formUi.done) return es ? 'Listo, su informe va en camino a su correo. ¿Algo más en lo que le pueda ayudar?' : 'All set, your report is on its way to your email. Anything else I can help with?';
    var miss = missing();
    var q = { first_name: es ? '¿Cuál es su nombre?' : "What's your first name?", email: es ? '¿A qué correo le envío el informe?' : 'What email should I send the report to?', phone: es ? '¿Cuál es su número de teléfono?' : "What's your phone number?",
      has_agent: es ? '¿Ya trabaja con un agente de bienes raíces?' : 'Are you already working with a real estate agent?', visited_site: es ? '¿Ya visitó algún sitio de construcción nueva?' : 'Have you already visited a new construction site?' };
    if (miss.length) return (es ? 'Su informe ya está en pantalla. ' : 'Your report is on the screen. ') + q[miss[0]];
    return es ? 'Todo está listo. Marque la casilla si quiere que un agente lo contacte, y presione Crear informe.' : 'Everything is filled in. Tick the box if you want an agent to contact you, then press Create report.';
  }
  function yesNo(s) {
    var t = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/\b(no|nope|not yet|never|none|todavia no|nunca|ninguno)\b/.test(t)) return 'no';
    if (/\b(yes|yeah|yep|sure|i have|i do|already|si|claro|ya)\b/.test(t)) return 'yes';
    return null;
  }
  function offlineTurn(text, l) {
    if (formUi.done || !rep) return nextPrompt(l);
    var said = String(text || '');
    var miss = missing();
    var target = miss[0];
    var em = said.replace(/\s+at\s+/gi, '@').replace(/\s+dot\s+/gi, '.').replace(/\s+arroba\s+/gi, '@').replace(/\s+punto\s+/gi, '.').match(/[^\s@]+@[^\s@]+\.[a-z]{2,}/i);
    if (em) form.email = em[0].toLowerCase();
    var ph = said.replace(/[^\d]/g, '');
    if (ph.length === 10 || (ph.length === 11 && ph[0] === '1')) form.phone = ph;
    var nm = said.match(/\b(?:my name is|i'?m|this is|me llamo|mi nombre es|soy)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ'-]{2,40})/i);
    if (nm) form.first_name = nm[1];
    else if (target === 'first_name' && /^[A-Za-zÁÉÍÓÚÑáéíóúñ'-]{2,40}\.?$/.test(said.trim())) form.first_name = said.trim().replace(/\.$/, '');
    if (target === 'has_agent' || target === 'visited_site') { var yn = yesNo(said); if (yn) { form[target] = yn; if (target === 'has_agent' && yn === 'yes') form.consent_referral = false; } }
    formUi.errors = {};
    paint();
    return nextPrompt(l);
  }

  var api_ = {
    show: function (token, opts) {
      host = document.getElementById('blReport');
      if (!host) return;
      lang = (opts && opts.lang) || lang;
      if (token !== tok) { rep = null; formUi = { errors: {}, busy: false, error: null, done: null }; showAllHomes = false; calc = { income: '', debts: '', out: null }; }
      tok = token; pollStart = Date.now();
      host.hidden = false; document.documentElement.classList.add("bl-report-on");
      clearHost();
      host.appendChild(h('p', { class: 'muted', role: 'status' }, T('loading')));
      if (!config) api('GET', '/api/v1/public/config?lang=' + lang).then(function (r) { if (r.ok) { config = r.data; if (rep) paint(); } });
      load((opts && opts.onLoad) || true);
      if (opts && opts.scroll) setTimeout(function () { host.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }, 250);
    },
    clear: function () { stopPoll(); tok = null; rep = null; if (host) { clearHost(); host.hidden = true; document.documentElement.classList.remove("bl-report-on"); } },
    setLang: function (l) { lang = l === 'es' ? 'es' : 'en'; config = null; if (tok) { api('GET', '/api/v1/public/config?lang=' + lang).then(function (r) { if (r.ok) config = r.data; load(false); }); } },
    status: statusText,
    nextPrompt: nextPrompt,
    offlineTurn: offlineTurn,
    missing: missing,
    ready: function () { return !!rep && !formUi.done && !missing().length; },
    submit: submit,
    applyVoice: function (i) {
      if (!i || formUi.done) return 0;
      var n = 0;
      if (i.first_name) { form.first_name = i.first_name; n++; }
      if (i.email) { form.email = i.email; n++; }
      if (i.phone) { form.phone = i.phone; n++; }
      if (i.working_with_agent === 'yes' || i.working_with_agent === 'no') { form.has_agent = i.working_with_agent; if (i.working_with_agent === 'yes') form.consent_referral = false; n++; }
      if (i.visited_site === 'yes' || i.visited_site === 'no') { form.visited_site = i.visited_site; n++; }
      if (i.contact_preference === 'email' || i.contact_preference === 'phone') { form.contact_preference = i.contact_preference; n++; }
      if (n && rep) { formUi.errors = {}; paint(); }
      return n;
    }
  };
  window.BLReportView = api_;
})();
