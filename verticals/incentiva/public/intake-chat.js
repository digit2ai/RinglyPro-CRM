/* BuyersLine: Martha, the conversational intake.
   One question at a time, six stages, answers editable, progress kept in this
   browser (localStorage) so a refresh does not lose it. Stage 03 runs the builder
   promotion research on the server and polls it. The server re-validates every
   answer; nothing here is trusted for consent wording, which always comes from
   /api/v1/public/config (lead_consent). No consent box is ever ticked by script. */
(function () {
  'use strict';
  var BASE = (window.BL_BASE && window.BL_BASE.indexOf('{{') === -1) ? window.BL_BASE : '';
  var KEY = 'bl_martha_v1';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var L = {
    en: {
      martha: 'Martha', role: 'BuyersLine assistant',
      stages: ['Where', 'Money and timing', 'Promotions', 'About you', 'Protect you', 'Contact'],
      step_of: 'Stage {n} of 6', back: 'Back', edit: 'Edit', send: 'Send', skip: 'Skip', typing: 'Martha is typing',
      restart: 'Start a new search', optional: 'Optional', start_over: 'Start over', restart_confirm: 'Start over? Your answers so far will be cleared.',
      hello: "Hi, I'm Martha. I'll ask a few quick questions, then pull the current builder promotions for your area.",
      q_area: 'Where are you looking? A ZIP code, city or neighborhood works.', ph_area: 'For example 33578 or Wesley Chapel',
      checking_area: 'Checking that area...',
      err_area_invalid_zip: "That ZIP code doesn't exist. Please check the five digits.",
      err_area_outside_florida: 'BuyersLine covers Tampa Bay, Florida for now. Try a Florida ZIP or city.',
      err_area_not_found: "I couldn't find that place. Try a ZIP code instead.",
      err_area_empty: 'Tell me a ZIP code, city or neighborhood.', err_area_error: "I couldn't check that right now. Try again.",
      ack_area: 'Got it: {place}.', ack_area_unconfirmed: "Got it: {place}. I couldn't confirm the city just now, but we can continue.",
      q_max_price: "What's the most you want to pay for the home?", ph_money: 'For example 450,000',
      q_max_monthly: "Is there a monthly payment you don't want to go over? You can skip this.",
      q_down: 'How much do you have for a down payment? You can skip this too.',
      q_timeline: 'When do you want to move?',
      q_financing: 'How will you pay?',
      err_money: 'Please enter an amount in dollars, like 450,000.', err_price_range: 'Please enter a home price between $50,000 and $20,000,000.',
      err_monthly_range: 'Please enter a monthly amount between $300 and $50,000.',
      ack_money: 'Noted: {amount}.', ack_skip: 'No problem, skipped.',
      research_intro: "Thanks. I'm pulling current builder promotions for {place} now. This usually takes two to five minutes the first time someone searches an area.",
      research_cached: 'I already have current promotions for {place}.',
      research_searching: 'Searching builder websites', research_searches: 'Searches run', research_builders: 'Builders checked', research_found: 'Found',
      research_elapsed: 'Elapsed', research_stay: 'You can stay on this page while I work.',
      research_failed: "The research didn't finish. You can try again, or continue and our agent will research for you.",
      retry: 'Try again', continue_without: 'Continue without choosing',
      research_notice_research_not_configured: "Live research isn't available right now, so I'm showing communities our licensed agent has already verified.",
      research_notice_research_cap_reached: "Live research is paused for this month, so I'm showing communities our licensed agent has already verified.",
      research_notice_research_failed: "Live research didn't finish, so I'm showing communities our licensed agent has already verified.",
      results_title: 'Promotions I found for {place}', results_none: "I didn't find promotions I can show for this area and budget. Continue, and our agent will research it for you.",
      results_disclaimer: 'Researched from builders\' public websites on {date}. Promotions change often and are not confirmed by a licensed agent until your agent checks them. Estimates are not loan offers.',
      results_filtered: '{n} more were above your price or monthly payment, so I left them out.',
      pick_prompt: 'Tap the communities you are interested in. Pick at least one.',
      top_title: 'Top deals', top_reason_default: 'A current promotion in your price range.',
      th_pick: 'Pick', th_builder: 'Builder', th_community: 'Community', th_price: 'Starting price', th_promo: 'Promotion', th_rate: 'Interest rate',
      th_cc: 'Closing cost credit', th_other: 'Other incentives', th_exp: 'Expiration', th_restr: 'Restrictions',
      badge_agent: 'Agent verified', badge_source: 'Source found', badge_unverified: 'Unverified', badge_price: 'Price not confirmed', badge_metro: 'Metro-wide',
      inventory_title: 'Move-in-ready homes builders may negotiate on', continue_picked: 'Continue with {n} selected', select: 'Select', selected: 'Selected',
      q_first: "Now a little about you. What's your first name?", ph_first: 'First name', err_first: 'Please tell me your first name.',
      ack_first: 'Nice to meet you, {name}.',
      q_email: "What's your email? I'll use it for your report.", ph_email: 'you@example.com', err_email: "That email doesn't look right. Please check it.",
      q_phone: "Mobile phone, if you'd like. It's only needed if you agree to text messages.", ph_phone: '(813) 555-0100', err_phone: 'Please enter a 10-digit US mobile number, or skip.',
      protect_intro: 'Two questions that protect you. Builders have registration rules, and honest answers here keep your options open.',
      q_agent: 'Are you already working with a real estate agent?',
      agent_no: 'No', agent_yes_agreement: 'Yes, and I signed an agreement with them', agent_yes_informal: 'Yes, but nothing is signed',
      ack_agent_agreement: "Thank you for telling me. Since you signed with an agent, please work with them. We won't contact you, and you'll still get your report.",
      ack_agent_informal: 'Thanks. If you later decide to work with our agent, say so before you visit any sales office.',
      q_visits: 'Have you already visited a new-construction sales office? Some builders won\'t work with a buyer\'s agent if you visited or signed a guest card first, so our agent needs to know.',
      visits_none: 'No, none', visits_add: 'Add one', visits_done: "That's all", visit_builder: 'Builder', visit_community: 'Community name', visit_save: 'Add this visit', visit_remove: 'Remove',
      visits_empty_hint: 'Add each builder and community you visited.', err_visit: 'Add the builder or the community name.',
      ack_visits_none: "Good, you haven't visited any.", ack_visits: 'Noted {n} visit(s).',
      q_consent: 'Last step: how may we contact you? Each one is your choice.',
      consent_referral_note: 'Without it, you still get your report.', consent_sms_needs_phone: 'Add a mobile number to allow text messages.', add_phone: 'Add a phone number',
      closing_title: 'Before you visit any sales office', closing_body: 'Many builders only work with a buyer\'s agent who registers you before your first visit. Get your report and talk to our agent first, so you keep your representation at no cost to you.',
      submit: 'Send and create my report', submitting: 'Creating your report...', err_submit: "I couldn't save your answers. Please try again.",
      err_selections: 'Please choose at least one community first.',
      done_title: 'Your report, {name}', done_referral: 'Our licensed agent will reach out about your search.', done_no_referral: "You didn't ask to be contacted, so nobody will reach out. Your report is below.",
      done_emailed: 'We also emailed it to you.', done_gated: "Because you signed with another agent, we won't contact you. You're welcome to share this report with your agent.",
      done_agent: 'Your agent: {name}', your_criteria: 'What you asked for', your_picks: 'Communities you chose', all_found: 'Everything I found', print: 'Print or save as PDF',
      tl_0_3m: 'Within 3 months', tl_3_6m: '3 to 6 months', tl_6_12m: '6 to 12 months', tl_12m_plus: 'More than 12 months',
      fin_preapproved: 'Pre-approved', fin_cash: 'Cash', fin_needs_lender: 'Needs a lender', fin_va: 'VA loan', fin_fha: 'FHA loan', fin_unsure: 'Not sure yet',
      lbl_area: 'Area', lbl_max_price: 'Maximum price', lbl_max_monthly: 'Maximum monthly', lbl_down: 'Down payment', lbl_timeline: 'Move', lbl_financing: 'Paying with',
      countdown: 'Sending your answers in {n}...', cancel: 'Cancel', none: 'None', skipped: 'Skipped'
    },
    es: {
      martha: 'Martha', role: 'Asistente de BuyersLine',
      stages: ['Dónde', 'Dinero y plazos', 'Promociones', 'Sobre usted', 'Su protección', 'Contacto'],
      step_of: 'Etapa {n} de 6', back: 'Atrás', edit: 'Editar', send: 'Enviar', skip: 'Omitir', typing: 'Martha está escribiendo',
      restart: 'Empezar una búsqueda nueva', optional: 'Opcional', start_over: 'Empezar de nuevo', restart_confirm: '¿Empezar de nuevo? Se borrarán sus respuestas.',
      hello: 'Hola, soy Martha. Le haré unas preguntas rápidas y luego buscaré las promociones actuales de las constructoras en su zona.',
      q_area: '¿Dónde está buscando? Sirve un código postal, una ciudad o un vecindario.', ph_area: 'Por ejemplo 33578 o Wesley Chapel',
      checking_area: 'Revisando esa zona...',
      err_area_invalid_zip: 'Ese código postal no existe. Revise los cinco dígitos, por favor.',
      err_area_outside_florida: 'Por ahora BuyersLine cubre Tampa Bay, Florida. Pruebe con un código postal o una ciudad de Florida.',
      err_area_not_found: 'No encontré ese lugar. Pruebe con un código postal.',
      err_area_empty: 'Dígame un código postal, una ciudad o un vecindario.', err_area_error: 'No pude revisarlo en este momento. Inténtelo de nuevo.',
      ack_area: 'Entendido: {place}.', ack_area_unconfirmed: 'Entendido: {place}. No pude confirmar la ciudad ahora, pero podemos continuar.',
      q_max_price: '¿Cuánto es lo máximo que quiere pagar por la casa?', ph_money: 'Por ejemplo 450,000',
      q_max_monthly: '¿Hay un pago mensual que no quiere superar? Puede omitir esta pregunta.',
      q_down: '¿Cuánto tiene para el pago inicial? También puede omitirla.',
      q_timeline: '¿Cuándo quiere mudarse?',
      q_financing: '¿Cómo va a pagar?',
      err_money: 'Escriba una cantidad en dólares, por ejemplo 450,000.', err_price_range: 'Escriba un precio entre 50.000 y 20.000.000 de dólares.',
      err_monthly_range: 'Escriba un pago mensual entre 300 y 50.000 dólares.',
      ack_money: 'Anotado: {amount}.', ack_skip: 'Sin problema, lo omitimos.',
      research_intro: 'Gracias. Estoy buscando ahora las promociones actuales de las constructoras en {place}. La primera búsqueda de una zona suele tardar de dos a cinco minutos.',
      research_cached: 'Ya tengo las promociones actuales de {place}.',
      research_searching: 'Buscando en los sitios de las constructoras', research_searches: 'Búsquedas', research_builders: 'Constructoras revisadas', research_found: 'Encontradas',
      research_elapsed: 'Tiempo', research_stay: 'Puede quedarse en esta página mientras trabajo.',
      research_failed: 'La búsqueda no terminó. Puede intentarlo de nuevo, o continuar y nuestro agente investigará por usted.',
      retry: 'Intentar de nuevo', continue_without: 'Continuar sin elegir',
      research_notice_research_not_configured: 'La búsqueda en vivo no está disponible ahora, así que le muestro comunidades que nuestro agente con licencia ya verificó.',
      research_notice_research_cap_reached: 'La búsqueda en vivo está en pausa este mes, así que le muestro comunidades que nuestro agente con licencia ya verificó.',
      research_notice_research_failed: 'La búsqueda en vivo no terminó, así que le muestro comunidades que nuestro agente con licencia ya verificó.',
      results_title: 'Promociones que encontré en {place}', results_none: 'No encontré promociones que pueda mostrar para esta zona y presupuesto. Continúe, y nuestro agente lo investigará por usted.',
      results_disclaimer: 'Investigado en los sitios públicos de las constructoras el {date}. Las promociones cambian a menudo y un agente con licencia no las confirma hasta que su agente las revisa. Las estimaciones no son ofertas de préstamo.',
      results_filtered: 'Otras {n} superaban su precio o pago mensual, así que no las incluí.',
      pick_prompt: 'Toque las comunidades que le interesan. Elija al menos una.',
      top_title: 'Mejores opciones', top_reason_default: 'Una promoción actual dentro de su rango de precio.',
      th_pick: 'Elegir', th_builder: 'Constructora', th_community: 'Comunidad', th_price: 'Precio inicial', th_promo: 'Promoción', th_rate: 'Tasa de interés',
      th_cc: 'Crédito para gastos de cierre', th_other: 'Otros incentivos', th_exp: 'Vencimiento', th_restr: 'Restricciones',
      badge_agent: 'Verificado por agente', badge_source: 'Fuente encontrada', badge_unverified: 'Sin verificar', badge_price: 'Precio sin confirmar', badge_metro: 'Toda el área',
      inventory_title: 'Casas listas en las que la constructora podría negociar', continue_picked: 'Continuar con {n} seleccionadas', select: 'Elegir', selected: 'Elegida',
      q_first: 'Ahora un poco sobre usted. ¿Cuál es su nombre?', ph_first: 'Nombre', err_first: 'Dígame su nombre, por favor.',
      ack_first: 'Mucho gusto, {name}.',
      q_email: '¿Cuál es su correo electrónico? Lo usaré para su informe.', ph_email: 'usted@ejemplo.com', err_email: 'Ese correo no parece correcto. Revíselo, por favor.',
      q_phone: 'Su celular, si quiere. Solo hace falta si acepta recibir mensajes de texto.', ph_phone: '(813) 555-0100', err_phone: 'Escriba un número de celular de Estados Unidos de 10 dígitos, u omítalo.',
      protect_intro: 'Dos preguntas que lo protegen. Las constructoras tienen reglas de registro, y responder con sinceridad mantiene abiertas sus opciones.',
      q_agent: '¿Ya trabaja con un agente de bienes raíces?',
      agent_no: 'No', agent_yes_agreement: 'Sí, y firmé un acuerdo con esa persona', agent_yes_informal: 'Sí, pero no hay nada firmado',
      ack_agent_agreement: 'Gracias por decírmelo. Como firmó con un agente, trabaje con esa persona. No lo contactaremos, y de todos modos recibirá su informe.',
      ack_agent_informal: 'Gracias. Si luego decide trabajar con nuestro agente, dígalo antes de visitar cualquier oficina de ventas.',
      q_visits: '¿Ya visitó alguna oficina de ventas de casas nuevas? Algunas constructoras no trabajan con el agente del comprador si usted visitó o firmó una tarjeta de visita antes, así que nuestro agente necesita saberlo.',
      visits_none: 'No, ninguna', visits_add: 'Agregar una', visits_done: 'Eso es todo', visit_builder: 'Constructora', visit_community: 'Nombre de la comunidad', visit_save: 'Agregar esta visita', visit_remove: 'Quitar',
      visits_empty_hint: 'Agregue cada constructora y comunidad que visitó.', err_visit: 'Agregue la constructora o el nombre de la comunidad.',
      ack_visits_none: 'Bien, no ha visitado ninguna.', ack_visits: 'Anoté {n} visita(s).',
      q_consent: 'Último paso: ¿cómo podemos contactarlo? Cada opción es su decisión.',
      consent_referral_note: 'Sin esta opción, igual recibe su informe.', consent_sms_needs_phone: 'Agregue un celular para permitir mensajes de texto.', add_phone: 'Agregar un teléfono',
      closing_title: 'Antes de visitar cualquier oficina de ventas', closing_body: 'Muchas constructoras solo trabajan con el agente del comprador que lo registra antes de su primera visita. Obtenga su informe y hable primero con nuestro agente, para conservar su representación sin costo para usted.',
      submit: 'Enviar y crear mi informe', submitting: 'Creando su informe...', err_submit: 'No pude guardar sus respuestas. Inténtelo de nuevo, por favor.',
      err_selections: 'Primero elija al menos una comunidad, por favor.',
      done_title: 'Su informe, {name}', done_referral: 'Nuestro agente con licencia se comunicará con usted sobre su búsqueda.', done_no_referral: 'No pidió que lo contactaran, así que nadie lo hará. Su informe está abajo.',
      done_emailed: 'También se lo enviamos por correo.', done_gated: 'Como firmó con otro agente, no lo contactaremos. Puede compartir este informe con su agente.',
      done_agent: 'Su agente: {name}', your_criteria: 'Lo que usted pidió', your_picks: 'Comunidades que eligió', all_found: 'Todo lo que encontré', print: 'Imprimir o guardar como PDF',
      tl_0_3m: 'En los próximos 3 meses', tl_3_6m: 'De 3 a 6 meses', tl_6_12m: 'De 6 a 12 meses', tl_12m_plus: 'Más de 12 meses',
      fin_preapproved: 'Preaprobado', fin_cash: 'De contado', fin_needs_lender: 'Necesito un prestamista', fin_va: 'Préstamo VA', fin_fha: 'Préstamo FHA', fin_unsure: 'Aún no sé',
      lbl_area: 'Zona', lbl_max_price: 'Precio máximo', lbl_max_monthly: 'Pago mensual máximo', lbl_down: 'Pago inicial', lbl_timeline: 'Mudanza', lbl_financing: 'Forma de pago',
      countdown: 'Enviando sus respuestas en {n}...', cancel: 'Cancelar', none: 'Ninguno', skipped: 'Omitido'
    }
  };

  var STEPS = [
    { id: 'area', stage: 1, required: true },
    { id: 'max_price', stage: 2, required: true },
    { id: 'max_monthly', stage: 2 },
    { id: 'down_payment', stage: 2 },
    { id: 'move_timeline', stage: 2, required: true },
    { id: 'financing_type', stage: 2, required: true },
    { id: 'research', stage: 3, required: true },
    { id: 'first_name', stage: 4, required: true },
    { id: 'email', stage: 4, required: true },
    { id: 'phone', stage: 4 },
    { id: 'has_agent', stage: 5, required: true },
    { id: 'visits', stage: 5 },
    { id: 'consents', stage: 6 }
  ];
  var TIMELINE = ['0_3m', '3_6m', '6_12m', '12m_plus'];
  var FINANCING = ['preapproved', 'cash', 'needs_lender', 'va', 'fha', 'unsure'];
  var AGENT = ['no', 'yes_under_agreement', 'yes_informal'];

  var root = null, lang = 'en', config = null, state = null, ui = { typing: false, research: null, poll: null, pollStart: 0, busy: false, error: null, visitForm: false, countdown: null, reportRun: null };

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
  function fmtDay(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return iso || '';
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function parseMoney(s) {
    var str = String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!str) return null;
    var mult = 1;
    if (/\d\s*(k|mil|thousand)\b/.test(str)) mult = 1000;
    if (/\d\s*(m|mm|million|millones?)\b/.test(str)) mult = 1000000;
    var m = str.replace(/[$,]/g, '').match(/\d+(\.\d+)?/);
    if (!m) return NaN;
    return Math.round(Number(m[0]) * mult);
  }
  function api(method, path, body) {
    var opts = { method: method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(BASE + path, opts).then(function (r) {
      return r.text().then(function (txt) { var d = null; try { d = txt ? JSON.parse(txt) : null; } catch (e) { d = null; } return { status: r.status, ok: r.ok, data: d }; });
    });
  }
  function fresh() { return { v: 1, step: 'area', answers: { visited_offices: [] }, done: {}, research: null, selections: [], consents: { email: false, sms: false, agent_referral: false }, hp: '', lead: null }; }
  // Progress survives a refresh, but not forever: after 12 idle hours the next visit starts fresh.
  var IDLE_MS = 12 * 3600e3;
  function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.v === 1 && (!s.savedAt || Date.now() - s.savedAt < IDLE_MS)) return s; } catch (e) { /* storage blocked */ } return fresh(); }
  function save() { try { state.savedAt = Date.now(); localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* session only */ } }
  function restart() {
    stopPoll(); state = fresh(); ui.research = null; ui.error = null; ui.busy = false; save();
    var url = new URL(location.href); url.searchParams.delete('lead');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    render(true);
  }
  function stepIndex(id) { for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return i; return -1; }
  function gated() { return state.answers.has_agent === 'yes_under_agreement'; }
  function skipped(id) { return (id === 'visits' || id === 'consents') && gated(); }
  function placeLabel() {
    var a = state.answers.area || {};
    var parts = [a.city, a.county ? a.county + (lang === 'es' ? '' : ' County') : null].filter(Boolean);
    if (lang === 'es' && a.county) parts[parts.length - 1] = 'condado de ' + a.county;
    return parts.length ? parts.join(', ') + (a.zip ? ' ' + a.zip : '') : (a.label || a.input || '');
  }
  function answered(id) {
    var a = state.answers;
    switch (id) {
      case 'area': return !!(a.area && (a.area.zip || a.area.input));
      case 'research': return !!state.done.research;
      case 'visits': return !!state.done.visits;
      case 'consents': return false;
      default: return !!state.done[id];
    }
  }
  function nextStep(fromId) {
    var i = stepIndex(fromId);
    for (var j = i + 1; j < STEPS.length; j++) if (!skipped(STEPS[j].id)) return STEPS[j].id;
    return 'submit';
  }
  function firstOpen() {
    for (var i = 0; i < STEPS.length; i++) { var s = STEPS[i]; if (skipped(s.id)) continue; if (!answered(s.id)) return s.id; }
    return gated() ? 'submit' : 'consents';
  }
  function go(id) { state.step = id; ui.error = null; ui.visitForm = false; save(); render(true); }
  function afterAnswer(id) {
    var editing = state.editing;
    state.editing = null;
    go(editing ? firstOpen() : nextStep(id));
  }
  function invalidate(id) {
    if (id === 'area') { state.research = null; state.selections = []; state.done.research = false; }
    if (['max_price', 'max_monthly', 'down_payment', 'financing_type'].indexOf(id) !== -1 && state.done.research) { state.selections = []; state.done.research = false; }
    if (id === 'phone' && !state.answers.phone) state.consents.sms = false;
  }

  /* ---------- rendering ---------- */
  function render(animate) {
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    root.setAttribute('lang', lang);
    if (state.lead) { renderDone(); return; }
    var cur = STEPS[stepIndex(state.step)] || { id: state.step, stage: 6 };
    root.appendChild(header(cur.stage));
    var log = h('div', { class: 'mch-log' });
    log.appendChild(bubble('m', T('hello')));
    var curIdx = state.step === 'submit' ? STEPS.length : stepIndex(state.step);
    STEPS.forEach(function (s) {
      if (s.id === state.step || skipped(s.id) || stepIndex(s.id) >= curIdx) return;
      if (s.id === 'research') { if (state.done.research) log.appendChild(answerRow(s.id, researchSummary())); return; }
      if (!answered(s.id) && !state.done[s.id]) return;
      log.appendChild(bubble('m', question(s.id), true));
      log.appendChild(answerRow(s.id, display(s.id)));
    });
    root.appendChild(log);
    log.scrollTop = log.scrollHeight;
    var turn = h('div', { class: 'mch-turn', 'aria-live': 'polite' });
    root.appendChild(turn);
    if (animate && !reduce && state.step !== 'research') {
      turn.appendChild(h('div', { class: 'mch-typing', 'aria-label': T('typing') }, h('span'), h('span'), h('span')));
      setTimeout(function () { while (turn.firstChild) turn.removeChild(turn.firstChild); renderTurn(turn); focusComposer(); }, 420);
    } else { renderTurn(turn); if (animate) focusComposer(); }
  }
  function focusComposer() {
    var el = root && root.querySelector('.mch-composer input:not([type=hidden]), .mch-chips button');
    if (el && root.getBoundingClientRect().top < window.innerHeight && root.getBoundingClientRect().bottom > 0) {
      try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
      // Keep the answer box above the floating voice button in the bottom corner.
      var bottom = el.getBoundingClientRect().bottom;
      if (bottom > window.innerHeight - 110) window.scrollBy({ top: bottom - window.innerHeight + 120, behavior: reduce ? 'auto' : 'smooth' });
    }
  }
  function header(stage) {
    var stages = T('stages');
    var bar = h('ol', { class: 'mch-progress', 'aria-label': T('step_of', { n: stage }) });
    for (var i = 1; i <= 6; i++) bar.appendChild(h('li', { class: i < stage ? 'is-done' : i === stage ? 'is-current' : '', 'aria-current': i === stage ? 'step' : null }, h('span', { class: 'mch-dot', text: String(i) }), h('span', { class: 'mch-stage', text: stages[i - 1] })));
    var prev = previousStep();
    return h('div', { class: 'mch-head' },
      h('div', { class: 'mch-id' },
        h('span', { class: 'mch-avatar', 'aria-hidden': 'true' }, avatarSvg()),
        h('span', null, h('strong', { text: T('martha') }), h('span', { class: 'mch-role', text: T('role') })),
        h('span', { class: 'mch-count', text: T('step_of', { n: stage }) }),
        state.step !== 'area' || answered('area') ? h('button', { type: 'button', class: 'mch-restart', onclick: function () { if (window.confirm(T('restart_confirm'))) restart(); } }, T('start_over')) : null),
      bar,
      prev ? h('button', { type: 'button', class: 'mch-back', onclick: function () { go(prev); } }, h('span', { 'aria-hidden': 'true', text: '← ' }), T('back')) : null);
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
  function previousStep() {
    var i = stepIndex(state.step);
    if (state.step === 'submit') i = STEPS.length;
    for (var j = i - 1; j >= 0; j--) if (!skipped(STEPS[j].id)) return STEPS[j].id;
    return null;
  }
  function bubble(who, text, small) { return h('div', { class: 'mch-b mch-b-' + who + (small ? ' mch-b-small' : '') }, text); }
  function answerRow(id, text) {
    return h('div', { class: 'mch-a' }, h('div', { class: 'mch-b mch-b-u' }, text),
      h('button', { type: 'button', class: 'mch-edit', 'aria-label': T('edit') + ': ' + text, onclick: function () { state.editing = id; go(id); } }, T('edit')));
  }
  function question(id) {
    return { area: T('q_area'), max_price: T('q_max_price'), max_monthly: T('q_max_monthly'), down_payment: T('q_down'), move_timeline: T('q_timeline'),
      financing_type: T('q_financing'), first_name: T('q_first'), email: T('q_email'), phone: T('q_phone'), has_agent: T('q_agent'), visits: T('q_visits') }[id] || '';
  }
  function display(id) {
    var a = state.answers;
    switch (id) {
      case 'area': return placeLabel();
      case 'max_price': case 'max_monthly': case 'down_payment': return a[id] != null ? money(a[id]) : T('skipped');
      case 'move_timeline': return T('tl_' + a.move_timeline);
      case 'financing_type': return T('fin_' + a.financing_type);
      case 'phone': return a.phone || T('skipped');
      case 'has_agent': return T({ no: 'agent_no', yes_under_agreement: 'agent_yes_agreement', yes_informal: 'agent_yes_informal' }[a.has_agent]);
      case 'visits': return (a.visited_offices || []).length ? (a.visited_offices || []).map(function (v) { return [v.builder, v.community].filter(Boolean).join(' · '); }).join('; ') : T('visits_none');
      default: return a[id] || '';
    }
  }
  function ackFor(prevId) {
    var a = state.answers;
    if (!prevId || !state.done[prevId] && prevId !== 'area') return null;
    switch (prevId) {
      case 'area': return a.area ? T(a.area.resolved === false ? 'ack_area_unconfirmed' : 'ack_area', { place: placeLabel() }) : null;
      case 'max_price': return a.max_price ? T('ack_money', { amount: money(a.max_price) }) : null;
      case 'max_monthly': case 'down_payment': return a[prevId] != null ? T('ack_money', { amount: money(a[prevId]) }) : T('ack_skip');
      case 'first_name': return T('ack_first', { name: a.first_name });
      case 'has_agent': return a.has_agent === 'yes_under_agreement' ? T('ack_agent_agreement') : a.has_agent === 'yes_informal' ? T('ack_agent_informal') : null;
      case 'visits': return (a.visited_offices || []).length ? T('ack_visits', { n: a.visited_offices.length }) : T('ack_visits_none');
      default: return null;
    }
  }
  function renderTurn(turn) {
    var id = state.step;
    var prev = previousStep();
    var ack = prev ? ackFor(prev) : null;
    if (id === 'research') { renderResearch(turn); return; }
    if (id === 'consents') { if (ack) turn.appendChild(bubble('m', ack)); renderConsents(turn); return; }
    if (id === 'submit') { renderGatedSubmit(turn, ack); return; }
    var q = question(id);
    if (id === 'has_agent') q = T('protect_intro') + ' ' + q;
    turn.appendChild(bubble('m', ack ? ack + ' ' + q : q));
    if (id === 'move_timeline') return turn.appendChild(chips(TIMELINE.map(function (k) { return [k, T('tl_' + k)]; }), function (k) { state.answers.move_timeline = k; state.done.move_timeline = true; afterAnswer(id); }, state.answers.move_timeline));
    if (id === 'financing_type') return turn.appendChild(chips(FINANCING.map(function (k) { return [k, T('fin_' + k)]; }), function (k) { state.answers.financing_type = k; state.done.financing_type = true; invalidate(id); afterAnswer(id); }, state.answers.financing_type));
    if (id === 'has_agent') return turn.appendChild(chips(AGENT.map(function (k) { return [k, T({ no: 'agent_no', yes_under_agreement: 'agent_yes_agreement', yes_informal: 'agent_yes_informal' }[k])]; }), function (k) { state.answers.has_agent = k; state.done.has_agent = true; afterAnswer(id); }, state.answers.has_agent));
    if (id === 'visits') return renderVisits(turn);
    turn.appendChild(textComposer(id));
  }
  function chips(opts, pick, current) {
    var wrap = h('div', { class: 'mch-chips', role: 'group' });
    opts.forEach(function (o) { wrap.appendChild(h('button', { type: 'button', class: 'mch-chip' + (o[0] === current ? ' is-on' : ''), 'aria-pressed': o[0] === current ? 'true' : 'false', onclick: function () { pick(o[0]); } }, o[1])); });
    return wrap;
  }
  function textComposer(id) {
    var a = state.answers;
    var cfg = {
      area: { type: 'text', ph: T('ph_area'), val: a.area ? (a.area.input || a.area.zip || '') : '', auto: 'postal-code' },
      max_price: { type: 'text', ph: T('ph_money'), val: a.max_price ? String(a.max_price) : '', mode: 'numeric', prefix: '$' },
      max_monthly: { type: 'text', ph: T('ph_money').replace('450,000', '2,800'), val: a.max_monthly ? String(a.max_monthly) : '', mode: 'numeric', prefix: '$', optional: true },
      down_payment: { type: 'text', ph: T('ph_money').replace('450,000', '25,000'), val: a.down_payment != null ? String(a.down_payment) : '', mode: 'numeric', prefix: '$', optional: true },
      first_name: { type: 'text', ph: T('ph_first'), val: a.first_name || '', auto: 'given-name' },
      email: { type: 'email', ph: T('ph_email'), val: a.email || '', mode: 'email', auto: 'email' },
      phone: { type: 'tel', ph: T('ph_phone'), val: a.phone || '', mode: 'tel', auto: 'tel', optional: true }
    }[id];
    var inputId = 'mch_in_' + id;
    var input = h('input', { id: inputId, type: cfg.type, placeholder: cfg.ph, inputmode: cfg.mode || null, autocomplete: cfg.auto || 'off', 'aria-label': question(id), 'aria-invalid': ui.error ? 'true' : null, 'aria-describedby': ui.error ? 'mch_err' : null });
    input.value = cfg.val;
    var form = h('form', { class: 'mch-composer', novalidate: true, onsubmit: function (e) { e.preventDefault(); submitText(id, input.value); } },
      cfg.prefix ? h('span', { class: 'mch-prefix', 'aria-hidden': 'true', text: cfg.prefix }) : null,
      input,
      id === 'first_name' ? h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', class: 'mch-hp', 'aria-hidden': 'true', oninput: function (e) { state.hp = e.target.value; } }) : null,
      h('button', { type: 'submit', class: 'btn btn-primary mch-send', disabled: ui.busy }, ui.busy ? T('checking_area') : T('send')));
    var box = h('div', null, form);
    if (ui.error) box.appendChild(h('p', { class: 'mch-err', id: 'mch_err', role: 'alert', text: ui.error }));
    if (cfg.optional) box.appendChild(h('button', { type: 'button', class: 'mch-skip', onclick: function () { submitText(id, ''); } }, T('skip')));
    return box;
  }
  function submitText(id, raw) {
    var a = state.answers, v = String(raw || '').trim();
    ui.error = null;
    if (id === 'area') {
      if (!v) { ui.error = T('err_area_empty'); render(false); return; }
      ui.busy = true; render(false);
      api('POST', '/api/v1/public/area', { input: v }).then(function (r) {
        ui.busy = false;
        var d = r.data || {};
        if (!r.ok || !d.ok) { ui.error = T('err_area_' + (d.reason || 'error')); render(false); return; }
        var changed = !a.area || (a.area.zip || a.area.input) !== (d.zip || d.input);
        a.area = { input: d.input || v, zip: d.zip || null, city: d.city || null, county: d.county || null, state: d.state || 'FL', label: d.label || v, resolved: d.resolved !== false };
        if (changed) invalidate('area');
        afterAnswer('area');
      }).catch(function () { ui.busy = false; ui.error = T('err_area_error'); render(false); });
      return;
    }
    if (id === 'max_price' || id === 'max_monthly' || id === 'down_payment') {
      if (!v) {
        if (id === 'max_price') { ui.error = T('err_money'); render(false); return; }
        a[id] = null; state.done[id] = true; invalidate(id); afterAnswer(id); return;
      }
      var n = parseMoney(v);
      if (!(n >= 0) || isNaN(n)) { ui.error = T('err_money'); render(false); return; }
      if (id === 'max_price' && (n < 50000 || n > 20000000)) { ui.error = T('err_price_range'); render(false); return; }
      if (id === 'max_monthly' && (n < 300 || n > 50000)) { ui.error = T('err_monthly_range'); render(false); return; }
      if (id === 'down_payment' && n > 10000000) { ui.error = T('err_money'); render(false); return; }
      a[id] = n; state.done[id] = true; invalidate(id); afterAnswer(id); return;
    }
    if (id === 'first_name') { if (!v) { ui.error = T('err_first'); render(false); return; } a.first_name = v.slice(0, 60); state.done.first_name = true; afterAnswer(id); return; }
    if (id === 'email') { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { ui.error = T('err_email'); render(false); return; } a.email = v.toLowerCase(); state.done.email = true; afterAnswer(id); return; }
    if (id === 'phone') {
      var d = v.replace(/[^\d]/g, '');
      if (v && !(d.length === 10 || (d.length === 11 && d[0] === '1'))) { ui.error = T('err_phone'); render(false); return; }
      a.phone = v || null; state.done.phone = true; invalidate('phone'); afterAnswer(id);
    }
  }

  /* ---------- stage 03: research ---------- */
  function criteriaQuery() {
    var a = state.answers, q = [];
    if (a.max_price) q.push('max_price=' + encodeURIComponent(a.max_price));
    if (a.max_monthly) q.push('max_monthly=' + encodeURIComponent(a.max_monthly));
    if (a.down_payment != null) q.push('down_payment=' + encodeURIComponent(a.down_payment));
    if (a.financing_type) q.push('financing=' + encodeURIComponent(a.financing_type));
    q.push('lang=' + lang);
    return '?' + q.join('&');
  }
  function stopPoll() { if (ui.poll) { clearTimeout(ui.poll); ui.poll = null; } }
  function startResearch(force) {
    stopPoll();
    ui.research = { status: 'starting' };
    if (force) state.research = null;
    var a = state.answers;
    var p = state.research && state.research.token && !force ? Promise.resolve({ ok: true, data: { token: state.research.token } })
      : api('POST', '/api/v1/public/research', { area: a.area });
    p.then(function (r) {
      if (!r.ok || !r.data || !r.data.token) { ui.research = { status: 'failed', error: (r.data && r.data.error) || '' }; paintResearch(); return; }
      state.research = { token: r.data.token, cached: r.data.fresh === false && r.data.status === 'done' };
      save();
      ui.pollStart = Date.now();
      poll();
    }).catch(function () { ui.research = { status: 'failed' }; paintResearch(); });
  }
  function poll() {
    if (!state.research || state.step !== 'research') return;
    api('GET', '/api/v1/public/research/' + encodeURIComponent(state.research.token) + criteriaQuery()).then(function (r) {
      if (state.step !== 'research') return;
      if (r.status === 404) { state.research = null; startResearch(true); return; }
      if (!r.ok || !r.data) { ui.research = { status: 'failed' }; paintResearch(); return; }
      ui.research = r.data;
      paintResearch();
      if (r.data.status === 'running' && Date.now() - ui.pollStart < 13 * 60e3) ui.poll = setTimeout(poll, 3000);
    }).catch(function () { ui.poll = setTimeout(poll, 5000); });
  }
  function renderResearch(turn) {
    turn.appendChild(h('div', { class: 'mch-research', id: 'mchResearch' }));
    if (!ui.research || !state.research) startResearch(false); else paintResearch();
  }
  function paintResearch() {
    var host = document.getElementById('mchResearch');
    if (!host) return;
    while (host.firstChild) host.removeChild(host.firstChild);
    var r = ui.research || { status: 'starting' };
    var place = placeLabel();
    if (r.status === 'starting' || r.status === 'running') {
      host.appendChild(bubble('m', state.research && state.research.cached ? T('research_cached', { place: place }) : T('research_intro', { place: place })));
      var p = r.progress || {};
      var secs = Math.max(0, Math.round((Date.now() - (ui.pollStart || Date.now())) / 1000));
      host.appendChild(h('div', { class: 'mch-scan', role: 'status' },
        h('div', { class: 'mch-scan-bar', 'aria-hidden': 'true' }, h('span')),
        h('p', { class: 'mch-scan-title', text: T('research_searching') }),
        h('div', { class: 'mch-scan-stats' },
          stat(T('research_searches'), p.searches || 0), stat(T('research_builders'), p.builders_checked || 0),
          stat(T('research_elapsed'), Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'))),
        h('p', { class: 'small muted', text: T('research_stay') })));
      return;
    }
    if (r.status === 'failed') {
      host.appendChild(bubble('m', T('research_failed')));
      host.appendChild(h('div', { class: 'mch-chips' },
        h('button', { type: 'button', class: 'mch-chip', onclick: function () { startResearch(true); } }, T('retry')),
        h('button', { type: 'button', class: 'mch-chip', onclick: function () { state.selections = []; state.done.research = true; afterAnswer('research'); } }, T('continue_without'))));
      return;
    }
    // done
    if (r.notice && T('research_notice_' + r.notice) !== 'research_notice_' + r.notice) host.appendChild(h('div', { class: 'callout', role: 'note' }, h('p', { text: T('research_notice_' + r.notice) })));
    var rows = r.rows || [];
    if (!rows.length) {
      host.appendChild(bubble('m', T('results_none')));
      if (r.filtered_out) host.appendChild(h('p', { class: 'small muted', text: T('results_filtered', { n: r.filtered_out }) }));
      host.appendChild(h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { state.selections = []; state.done.research = true; afterAnswer('research'); } }, T('continue_without')));
      return;
    }
    host.appendChild(bubble('m', T('results_title', { place: place }) + '. ' + T('pick_prompt')));
    host.appendChild(h('p', { class: 'mch-disclaimer', text: T('results_disclaimer', { date: fmtDay(r.checked_on) }) }));
    host.appendChild(resultsView(r, true));
    var n = state.selections.length;
    host.appendChild(h('div', { class: 'mch-stickybar' },
      h('button', { type: 'button', class: 'btn btn-primary', disabled: !n, onclick: function () { if (!state.selections.length) return; state.done.research = true; afterAnswer('research'); } }, n ? T('continue_picked', { n: n }) : T('pick_prompt'))));
  }
  function stat(label, value) { return h('div', { class: 'mch-stat' }, h('strong', { text: String(value) }), h('span', { text: label })); }
  function badges(row) {
    var out = [];
    if (row.origin === 'agent_verified') out.push(h('span', { class: 'chip mch-badge-agent', text: T('badge_agent') }));
    else if (row.verified) out.push(h('span', { class: 'chip mch-badge-source', text: T('badge_source') }));
    else out.push(h('span', { class: 'chip mch-badge-unverified', text: T('badge_unverified') }));
    if (!row.price_known) out.push(h('span', { class: 'chip', text: T('badge_price') }));
    if (row.scope === 'metro') out.push(h('span', { class: 'chip', text: T('badge_metro') }));
    return out;
  }
  function toggleSel(id) {
    var i = state.selections.indexOf(id);
    if (i === -1) state.selections.push(id); else state.selections.splice(i, 1);
    save();
    paintResearch();
  }
  function resultsView(r, selectable, onlyIds) {
    var box = h('div', { class: 'mch-results' });
    var rows = (r.rows || []).filter(function (x) { return !onlyIds || onlyIds.indexOf(x.id) !== -1; });
    var byId = {}; rows.forEach(function (x) { byId[x.id] = x; });
    var top = (r.top_deals || []).filter(function (t) { return byId[t.row_id]; });
    if (top.length && !onlyIds) {
      box.appendChild(h('h4', { class: 'mch-h', text: T('top_title') }));
      var grid = h('div', { class: 'mch-top' });
      top.forEach(function (t, i) {
        var row = byId[t.row_id], on = state.selections.indexOf(row.id) !== -1;
        grid.appendChild(h(selectable ? 'button' : 'div', { type: selectable ? 'button' : null, class: 'mch-deal' + (on ? ' is-on' : ''), 'aria-pressed': selectable ? (on ? 'true' : 'false') : null, onclick: selectable ? function () { toggleSel(row.id); } : null },
          h('span', { class: 'mch-rank', text: String(i + 1) }),
          h('strong', { text: row.community || row.builder }), h('span', { class: 'mch-sub', text: row.builder + (row.starting_price ? ' · ' + row.starting_price : '') }),
          row.promotion ? h('span', { class: 'mch-promo', text: row.promotion }) : null,
          h('span', { class: 'mch-reason', text: t.reason || T('top_reason_default') }),
          h('span', { class: 'mch-badges' }, badges(row)),
          selectable ? h('span', { class: 'mch-pick', text: on ? T('selected') : T('select') }) : null));
      });
      box.appendChild(grid);
    }
    var cols = [['builder', 'th_builder'], ['community', 'th_community'], ['starting_price', 'th_price'], ['promotion', 'th_promo'], ['rate', 'th_rate'], ['closing_credit', 'th_cc'], ['other_incentives', 'th_other'], ['expiration', 'th_exp'], ['restrictions', 'th_restr']];
    var table = h('table', { class: 'mch-table' });
    var trh = h('tr');
    if (selectable) trh.appendChild(h('th', { scope: 'col', text: T('th_pick') }));
    cols.forEach(function (c) { trh.appendChild(h('th', { scope: 'col', text: T(c[1]) })); });
    table.appendChild(h('thead', null, trh));
    var tb = h('tbody');
    rows.forEach(function (row) {
      var on = state.selections.indexOf(row.id) !== -1;
      var tr = h('tr', { class: on ? 'is-on' : '' });
      if (selectable) {
        var cbId = 'mch_sel_' + row.id;
        var cb = h('input', { type: 'checkbox', id: cbId, 'aria-label': T('select') + ': ' + (row.community || row.builder), onchange: function () { toggleSel(row.id); } });
        cb.checked = on;
        tr.appendChild(h('td', { class: 'mch-pickcell', 'data-label': T('th_pick') }, cb));
      }
      cols.forEach(function (c, ci) {
        var td = h('td', { 'data-label': T(c[1]) }, row[c[0]] || h('span', { class: 'muted', text: '—' }));
        if (ci === 1) td.appendChild(h('span', { class: 'mch-badges' }, badges(row)));
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    box.appendChild(h('div', { class: 'mch-tablewrap' }, table));
    if (r.filtered_out && !onlyIds) box.appendChild(h('p', { class: 'small muted', text: T('results_filtered', { n: r.filtered_out }) }));
    if ((r.inventory || []).length && !onlyIds) {
      box.appendChild(h('h4', { class: 'mch-h', text: T('inventory_title') }));
      var ul = h('ul', { class: 'mch-inv' });
      r.inventory.forEach(function (x) { ul.appendChild(h('li', null, h('strong', { text: [x.builder, x.community].filter(Boolean).join(' · ') }), x.home ? ' ' + x.home : '', x.price ? ' · ' + x.price : '', x.note ? h('span', { class: 'mch-sub', text: x.note }) : null)); });
      box.appendChild(ul);
    }
    return box;
  }
  function researchSummary() {
    var n = state.selections.length;
    return n ? T('continue_picked', { n: n }).replace(/^[^0-9]*/, '').replace(/^/, '') : T('continue_without');
  }

  /* ---------- stage 05: visits ---------- */
  function renderVisits(turn) {
    var ack = ackFor(previousStep());
    turn.appendChild(bubble('m', (ack ? ack + ' ' : '') + T('q_visits')));
    var list = state.answers.visited_offices || (state.answers.visited_offices = []);
    if (list.length) {
      var ul = h('ul', { class: 'mch-visits' });
      list.forEach(function (v, i) {
        ul.appendChild(h('li', null, h('span', { text: [v.builder, v.community].filter(Boolean).join(' · ') }),
          h('button', { type: 'button', class: 'mch-edit', onclick: function () { list.splice(i, 1); save(); render(false); } }, T('visit_remove'))));
      });
      turn.appendChild(ul);
    }
    if (ui.visitForm) {
      var b = h('input', { id: 'mch_v_builder', type: 'text', placeholder: T('visit_builder'), 'aria-label': T('visit_builder'), autocomplete: 'off' });
      var c = h('input', { id: 'mch_v_comm', type: 'text', placeholder: T('visit_community'), 'aria-label': T('visit_community'), autocomplete: 'off' });
      turn.appendChild(h('form', { class: 'mch-composer mch-visitform', novalidate: true, onsubmit: function (e) {
        e.preventDefault();
        var bv = b.value.trim().slice(0, 160), cv = c.value.trim().slice(0, 200);
        if (!bv && !cv) { ui.error = T('err_visit'); render(false); return; }
        if (list.length >= 10) return;
        list.push({ builder: bv || null, community: cv || null }); ui.visitForm = false; ui.error = null; save(); render(false);
      } }, b, c, h('button', { type: 'submit', class: 'btn btn-primary mch-send' }, T('visit_save'))));
      if (ui.error) turn.appendChild(h('p', { class: 'mch-err', role: 'alert', text: ui.error }));
      setTimeout(function () { b.focus(); }, 30);
      return;
    }
    var opts = list.length ? [['done', T('visits_done')], ['add', T('visits_add')]] : [['none', T('visits_none')], ['add', T('visits_add')]];
    turn.appendChild(chips(opts, function (k) {
      if (k === 'add') { ui.visitForm = true; render(false); return; }
      if (k === 'none') state.answers.visited_offices = [];
      state.done.visits = true; afterAnswer('visits');
    }));
  }

  /* ---------- stage 06: consents + submit ---------- */
  function renderConsents(turn) {
    turn.appendChild(bubble('m', T('q_consent')));
    var lc = (config && config.lead_consent) || null;
    var form = h('form', { class: 'mch-consents', novalidate: true, onsubmit: function (e) { e.preventDefault(); submitLead(false); } });
    if (!lc) { form.appendChild(h('p', { class: 'mch-err', text: T('err_submit') })); turn.appendChild(form); return; }
    [['email', lc.email], ['sms', lc.sms], ['agent_referral', lc.agent_referral]].forEach(function (row) {
      var ch = row[0], id = 'mch_c_' + ch;
      var noPhone = ch === 'sms' && !state.answers.phone;
      var cb = h('input', { type: 'checkbox', id: id, disabled: noPhone, onchange: function (e) { state.consents[ch] = e.target.checked; save(); } });
      cb.checked = !!state.consents[ch] && !noPhone;
      var card = h('label', { class: 'mch-consent' + (noPhone ? ' is-disabled' : ''), for: id }, cb, h('span', { class: 'mch-consent-text', text: row[1] }));
      form.appendChild(card);
      if (ch === 'sms' && noPhone) form.appendChild(h('p', { class: 'mch-hint' }, T('consent_sms_needs_phone') + ' ', h('button', { type: 'button', class: 'mch-linkbtn', onclick: function () { state.editing = 'phone'; go('phone'); } }, T('add_phone'))));
      if (ch === 'agent_referral') form.appendChild(h('p', { class: 'mch-hint', text: T('consent_referral_note') }));
    });
    form.appendChild(closingCallout());
    if (ui.error) form.appendChild(h('p', { class: 'mch-err', role: 'alert', text: ui.error }));
    form.appendChild(h('button', { type: 'submit', class: 'btn btn-primary mch-submit', id: 'mchSubmit', disabled: ui.busy }, ui.busy ? T('submitting') : T('submit')));
    turn.appendChild(form);
  }
  function renderGatedSubmit(turn, ack) {
    if (ack) turn.appendChild(bubble('m', ack));
    turn.appendChild(closingCallout());
    if (ui.error) turn.appendChild(h('p', { class: 'mch-err', role: 'alert', text: ui.error }));
    turn.appendChild(h('button', { type: 'button', class: 'btn btn-primary mch-submit', id: 'mchSubmit', disabled: ui.busy, onclick: function () { submitLead(false); } }, ui.busy ? T('submitting') : T('submit')));
  }
  function closingCallout() { return h('div', { class: 'callout callout-caution mch-closing' }, h('h4', { text: T('closing_title') }), h('p', { text: T('closing_body') })); }
  function missingRequired() {
    var out = [];
    STEPS.forEach(function (s) { if (s.required && !skipped(s.id) && !answered(s.id)) out.push(s.id); });
    return out;
  }
  function submitLead() {
    if (ui.busy) return false;
    var miss = missingRequired();
    if (miss.length) { go(miss[0]); return false; }
    ui.busy = true; ui.error = null; render(false);
    var a = state.answers;
    var body = {
      lang: lang, website: state.hp || '', research_token: state.research ? state.research.token : null, selections: state.selections,
      answers: { area: a.area, max_price: a.max_price, max_monthly: a.max_monthly, down_payment: a.down_payment, move_timeline: a.move_timeline, financing_type: a.financing_type,
        first_name: a.first_name, email: a.email, phone: a.phone, has_agent: a.has_agent, visited_offices: gated() ? [] : (a.visited_offices || []) },
      consents: gated() ? { email: false, sms: false, agent_referral: false } : { email: !!state.consents.email, sms: !!state.consents.sms && !!a.phone, agent_referral: !!state.consents.agent_referral }
    };
    api('POST', '/api/v1/public/leads', body).then(function (r) {
      ui.busy = false;
      if (r.ok && r.data && r.data.token) {
        state.lead = { token: r.data.token, gated: !!r.data.gated, referral: !!r.data.referral, emailed: !!r.data.emailed };
        save(); render(false);
        if (root) root.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        return;
      }
      var d = r.data || {};
      if (r.status === 400 && d.missing && d.missing.length) {
        var map = { area: 'area', max_price: 'max_price', move_timeline: 'move_timeline', financing_type: 'financing_type', first_name: 'first_name', email: 'email', has_agent: 'has_agent', selections: 'research' };
        var target = map[d.missing[0]];
        if (target === 'research') { state.done.research = false; ui.error = T('err_selections'); }
        else if (target) state.done[target] = false;
        if (target) { go(target); return; }
      }
      ui.error = (d && d.error) || T('err_submit'); render(false);
    }).catch(function () { ui.busy = false; ui.error = T('err_submit'); render(false); });
    return true;
  }

  /* ---------- final report ---------- */
  function renderDone() {
    var lead = state.lead, a = state.answers;
    var box = h('div', { class: 'mch-done' });
    box.appendChild(h('div', { class: 'mch-id' }, h('span', { class: 'mch-avatar', 'aria-hidden': 'true' }, avatarSvg()), h('span', null, h('strong', { text: T('martha') }), h('span', { class: 'mch-role', text: T('role') }))));
    box.appendChild(h('h3', { class: 'mch-done-title', text: T('done_title', { name: a.first_name || '' }) }));
    var msgs = [lead.gated ? T('done_gated') : lead.referral ? T('done_referral') : T('done_no_referral')];
    if (lead.emailed) msgs.push(T('done_emailed'));
    box.appendChild(bubble('m', msgs.join(' ')));
    if (lead.referral && config && config.agent && config.agent.name) {
      var ag = config.agent;
      box.appendChild(h('p', { class: 'mch-agent', text: T('done_agent', { name: ag.name }) + (ag.license_no ? ' · License ' + ag.license_no : '') + (ag.brokerage_name ? ' · ' + ag.brokerage_name : '') }));
    }
    var dl = h('dl', { class: 'mch-kv' });
    [['lbl_area', placeLabel()], ['lbl_max_price', a.max_price ? money(a.max_price) : null], ['lbl_max_monthly', a.max_monthly ? money(a.max_monthly) : T('none')], ['lbl_down', a.down_payment != null ? money(a.down_payment) : T('none')],
      ['lbl_timeline', a.move_timeline ? T('tl_' + a.move_timeline) : null], ['lbl_financing', a.financing_type ? T('fin_' + a.financing_type) : null]]
      .forEach(function (kv) { if (kv[1]) dl.appendChild(h('div', null, h('dt', { text: T(kv[0]) }), h('dd', { text: kv[1] }))); });
    box.appendChild(h('h4', { class: 'mch-h', text: T('your_criteria') }));
    box.appendChild(dl);
    var resHost = h('div', { id: 'mchDoneResearch' });
    box.appendChild(resHost);
    box.appendChild(closingCallout());
    box.appendChild(h('div', { class: 'mch-chips no-print' },
      h('button', { type: 'button', class: 'mch-chip', onclick: function () { window.print(); } }, T('print')),
      h('button', { type: 'button', class: 'mch-chip', onclick: restart }, T('restart'))));
    root.appendChild(box);
    if (state.research && state.research.token) {
      api('GET', '/api/v1/public/research/' + encodeURIComponent(state.research.token) + criteriaQuery()).then(function (r) {
        if (!r.ok || !r.data || r.data.status !== 'done' || !document.getElementById('mchDoneResearch')) return;
        var host = document.getElementById('mchDoneResearch');
        if (state.selections.length) { host.appendChild(h('h4', { class: 'mch-h', text: T('your_picks') })); host.appendChild(resultsView(r.data, false, state.selections)); }
        host.appendChild(h('h4', { class: 'mch-h', text: T('all_found') }));
        host.appendChild(h('p', { class: 'mch-disclaimer', text: T('results_disclaimer', { date: fmtDay(r.data.checked_on) }) }));
        host.appendChild(resultsView(r.data, false));
      });
    }
  }

  /* ---------- config + boot ---------- */
  function loadConfig() {
    return api('GET', '/api/v1/public/config?lang=' + lang).then(function (r) { if (r.ok && r.data) { config = r.data; render(false); } });
  }
  function restoreLead(tok) {
    return api('GET', '/api/v1/public/leads/' + encodeURIComponent(tok)).then(function (r) {
      if (!r.ok || !r.data) return;
      var d = r.data;
      state = fresh();
      state.answers.first_name = d.first_name;
      state.answers.area = { input: d.area.input, zip: d.area.zip, city: d.area.city, county: d.area.county, label: d.area.input };
      state.answers.max_price = d.criteria.max_price; state.answers.max_monthly = d.criteria.max_monthly; state.answers.down_payment = d.criteria.down_payment;
      state.answers.move_timeline = d.criteria.move_timeline; state.answers.financing_type = d.criteria.financing_type;
      state.research = d.research_token ? { token: d.research_token } : null;
      state.selections = d.selections || [];
      state.lead = { token: tok, gated: !!d.gated, referral: !!d.referral, emailed: false };
      save(); render(false);
    });
  }

  var api_ = {
    init: function (opts) {
      root = opts && opts.el ? opts.el : document.getElementById('blChat');
      if (!root) return;
      lang = (opts && opts.lang) || (document.documentElement.lang || 'en').slice(0, 2);
      if (lang !== 'es') lang = 'en';
      state = load();
      var qs = new URLSearchParams(location.search);
      var tok = qs.get('lead');
      render(false);
      loadConfig();
      if (tok && /^[A-Za-z0-9_-]{20,64}$/.test(tok) && (!state.lead || state.lead.token !== tok)) restoreLead(tok);
      var zip = qs.get('zip');
      if (zip && /^\d{5}$/.test(zip) && !state.answers.area && !state.lead) api_.prefillArea(zip);
    },
    setLang: function (l) { lang = l === 'es' ? 'es' : 'en'; if (root) { loadConfig(); render(false); } },
    prefillArea: function (zip) {
      if (!root || state.lead || state.step !== 'area') return;
      submitText('area', zip);
    },
    setAnswer: function (key, value) {
      if (!root || state.lead) return;
      if (key === 'max_price' && value > 0) { state.answers.max_price = Math.round(value); state.done.max_price = true; invalidate('max_price'); if (state.step === 'max_price') afterAnswer('max_price'); else { save(); render(false); } }
    },
    /* Voice (Martha orb) fills answers she heard. Consents and selections are never touched here. */
    applyVoice: function (i) {
      if (!root || state.lead || !i) return 0;
      var a = state.answers, n = 0;
      function mark(id) { state.done[id] = true; invalidate(id); n++; }
      if (i.budget_max) { a.max_price = i.budget_max; mark('max_price'); }
      if (i.monthly_max) { a.max_monthly = i.monthly_max; mark('max_monthly'); }
      if (i.down_payment != null) { a.down_payment = i.down_payment; mark('down_payment'); }
      if (TIMELINE.indexOf(i.timeline) !== -1) { a.move_timeline = i.timeline; mark('move_timeline'); }
      if (FINANCING.indexOf(i.financing) !== -1) { a.financing_type = i.financing; mark('financing_type'); }
      if (i.first_name) { a.first_name = i.first_name; mark('first_name'); }
      if (i.email) { a.email = i.email; mark('email'); }
      if (i.phone) { a.phone = i.phone; mark('phone'); }
      if (AGENT.indexOf(i.working_with_agent) !== -1) { a.has_agent = i.working_with_agent; mark('has_agent'); }
      var area = (i.zip_codes && i.zip_codes[0]) || i.place;
      if (area && (!a.area || (a.area.zip || a.area.input) !== area)) {
        state.step = 'area'; state.editing = 'voice'; save();
        submitText('area', area);
        return n + 1;
      }
      if (n) { state.editing = 'voice'; afterAnswer(state.step); }
      return n;
    },
    status: function () {
      if (!state) return '';
      var a = state.answers, have = [], missing = [];
      var labels = { area: 'area', max_price: 'maximum home price', max_monthly: 'maximum monthly payment (optional)', down_payment: 'down payment (optional)', move_timeline: 'move timing', financing_type: 'how they will pay',
        research: 'choose at least one community on screen (only the buyer can)', first_name: 'first name', email: 'email', phone: 'mobile phone (optional)', has_agent: 'working with an agent', visits: 'sales offices already visited (optional list)' };
      STEPS.forEach(function (s) { if (s.id === 'consents' || skipped(s.id)) return; if (answered(s.id)) { if (s.id !== 'research') have.push(labels[s.id] + ' = ' + display(s.id)); } else if (s.required) missing.push(labels[s.id]); });
      var r = ui.research;
      var researchLine = !state.research ? 'not started' : !r ? 'loading' : r.status === 'running' || r.status === 'starting' ? 'running now, the buyer waits on screen' : r.status === 'done' ? (r.rows || []).length + ' communities shown, ' + state.selections.length + ' selected by the buyer' : r.status;
      return 'MARTHA CHAT STATUS (live; read this first). Current question: ' + (state.lead ? 'finished, report shown' : (labels[state.step] || state.step)) + '. ' +
        'Answered: ' + (have.join('; ') || 'nothing yet') + '. Required still missing: ' + (missing.join(', ') || 'none') + '. ' +
        'Promotion research: ' + researchLine + '. ' +
        'Contact choices, ticked only by the buyer: email ' + (state.consents.email ? 'ticked' : 'not ticked') + '; text messages ' + (state.consents.sms ? 'ticked' : 'not ticked') + '; share with the agent ' + (state.consents.agent_referral ? 'ticked' : 'not ticked') + '. ' +
        'Report: ' + (state.lead ? 'created' : ui.busy ? 'being created' : 'not created') + '.';
    },
    missing: function () { return state ? missingRequired() : []; },
    atFinalStep: function () { return !!state && !state.lead && (state.step === 'consents' || state.step === 'submit'); },
    submit: function () { return submitLead(); }
  };
  window.BLChat = api_;
})();
