/* BuyersLine ecosystem map: Ana as the brain, six AI agents, the buyer and the licensed agent.
   ONE component for the landing section and the architecture page, so the two pictures cannot drift.
   Usage: <div data-ecomap></div> + ecosystem-map.css + this script.
   API: window.EcosystemMap.setLang('en'|'es'), .onSelect(fn(id)) (the architecture page opens its
   roster card), data-caption="0" hides the built-in caption. Carries no figures: nothing here counts
   buyers, prices or results. Reduced motion draws everything and moves nothing. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var NODES = [
    { id: 'buyer', x: 100, y: 380, human: true },
    { id: 'researcher', x: 246, y: 175 },
    { id: 'reader', x: 600, y: 90 },
    { id: 'writer', x: 954, y: 175 },
    { id: 'licensed', x: 1100, y: 380, human: true },
    { id: 'handoff', x: 954, y: 585, setup: true },
    { id: 'scheduler', x: 600, y: 670 },
    { id: 'rachel', x: 246, y: 585, setup: true }
  ];
  var SEQ = ['buyer', 'researcher', 'reader', 'writer', 'handoff', 'licensed', 'scheduler', 'rachel'];

  var T = {
    en: {
      aria: 'BuyersLine brain and agents diagram',
      brain: 'BUYERSLINE BRAIN', live: 'LIVE', note: "The buyer's only conversational contact",
      r1: 'CORE · LIVE CONTEXT', r1t: 'Reads the page state every turn', r2: 'CORE · PAGE ACTIONS', r2t: 'Fill · choose · estimate · scroll · create report',
      orch: 'ORCHESTRATOR · 7 AGENTS · 1 HUMAN', now: 'NOW', all: 'ALL', allText: 'ONE BRAIN, EVERY AGENT', buyerToAna: 'BUYER TO ANA',
      human: 'HUMAN', loop: 'HUMAN IN THE LOOP',
      foot: '7 AI AGENTS · 1 LICENSED HUMAN · RULES DECIDE EVERY NUMBER',
      legend: ['Data link', 'Active signal', 'Human', 'Live', 'Needs setup'],
      tap: 'Tap any node to see what it does.',
      n: {
        ana: ['Ana', 'voice · chat'], buyer: ['Buyer', 'web chat · voice'], researcher: ['Promotions Researcher', 'web search · builders'],
        reader: ['Incentive Reader', 'builder pages · emails'], writer: ['Report Writer', 'EN/ES · plain language'], licensed: ['Licensed Agent', 'verify · approve · meet'],
        handoff: ['Hand-off', 'readiness · agent brief'], scheduler: ['Scheduler', 'booking · reminders · feedback'], rachel: ['Rachel Follow-up', 'email · SMS · 90 days']
      },
      d: {
        ana: "Ana is the buyer's only conversational contact, by voice or chat, in English and Spanish. She reads the page, records answers and guides every step to the free report.",
        buyer: 'The buyer talks to Ana, chooses the communities they like and makes every contact choice themselves.',
        researcher: "Searches builder websites for current promotions near the buyer's area. Results are shared for 24 hours and are not confirmed until the licensed agent checks them.",
        reader: 'Reads builder pages and broker emails. Anything that is not written in the source becomes a question for the licensed agent.',
        writer: "Writes the report's plain-language explanation in English and Spanish. It never writes a price or a payment; those are calculated by fixed rules.",
        licensed: 'A licensed Florida sales associate verifies promotions, approves reports and meets the buyer at no cost to them.',
        handoff: 'Scores how ready a buyer is with fixed rules and sends the licensed agent a brief within about a minute, without the buyer\'s contact details.',
        scheduler: 'Lets the buyer book a free 30-minute consult, sends reminders and asks buyer and agent how it went.',
        rachel: 'Follows up for 90 days only on the channels the buyer confirmed, and flags when a promotion in a chosen community changes.'
      }
    },
    es: {
      aria: 'Diagrama del cerebro y los agentes de BuyersLine',
      brain: 'CEREBRO DE BUYERSLINE', live: 'EN VIVO', note: 'El único contacto conversacional del comprador',
      r1: 'NÚCLEO · CONTEXTO EN VIVO', r1t: 'Lee el estado de la página en cada turno', r2: 'NÚCLEO · ACCIONES', r2t: 'Llenar · elegir · estimar · desplazar · crear informe',
      orch: 'ORQUESTADOR · 7 AGENTES · 1 HUMANO', now: 'AHORA', all: 'TODOS', allText: 'UN CEREBRO, TODOS LOS AGENTES', buyerToAna: 'COMPRADOR A ANA',
      human: 'HUMANO', loop: 'HUMANO EN EL CIRCUITO',
      foot: '7 AGENTES DE IA · 1 HUMANO CON LICENCIA · LAS REGLAS DECIDEN CADA CIFRA',
      legend: ['Enlace de datos', 'Señal activa', 'Humano', 'En vivo', 'Falta configurar'],
      tap: 'Toque cualquier nodo para ver qué hace.',
      n: {
        ana: ['Ana', 'voz · chat'], buyer: ['Comprador', 'chat · voz'], researcher: ['Investigador de promociones', 'búsqueda web · constructoras'],
        reader: ['Lector de incentivos', 'sitios · correos'], writer: ['Redactor de informes', 'EN/ES · lenguaje claro'], licensed: ['Agente con licencia', 'verifica · aprueba · reúne'],
        handoff: ['Enlace con el agente', 'preparación · resumen'], scheduler: ['Agenda', 'reservas · recordatorios · opinión'], rachel: ['Rachel · seguimiento', 'correo · SMS · 90 días']
      },
      d: {
        ana: 'Ana es el único contacto conversacional del comprador, por voz o chat, en inglés y español. Lee la página, registra las respuestas y guía cada paso hasta el informe gratuito.',
        buyer: 'El comprador habla con Ana, elige las comunidades que le gustan y toma él mismo cada decisión de contacto.',
        researcher: 'Busca en los sitios de las constructoras las promociones actuales cerca de la zona del comprador. Los resultados se comparten 24 horas y no están confirmados hasta que el agente con licencia los revisa.',
        reader: 'Lee los sitios de las constructoras y los correos de corredores. Todo lo que no esté escrito en la fuente se convierte en una pregunta para el agente con licencia.',
        writer: 'Redacta la explicación del informe en lenguaje claro, en inglés y español. Nunca escribe un precio ni un pago; eso lo calculan reglas fijas.',
        licensed: 'Un asociado de ventas con licencia en Florida verifica las promociones, aprueba los informes y se reúne con el comprador sin costo para él.',
        handoff: 'Mide con reglas fijas qué tan listo está el comprador y envía al agente con licencia un resumen en cerca de un minuto, sin los datos de contacto del comprador.',
        scheduler: 'Permite reservar una consulta gratuita de 30 minutos, envía recordatorios y pregunta al comprador y al agente cómo les fue.',
        rachel: 'Da seguimiento durante 90 días solo por los canales que el comprador confirmó y avisa cuando cambia una promoción en una comunidad elegida.'
      }
    }
  };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svg(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }

  var maps = [];
  var selectHandlers = [];

  function build(root) {
    var lang = (root.getAttribute('data-lang') || document.documentElement.lang || 'en').slice(0, 2) === 'es' ? 'es' : 'en';
    var L = T[lang];
    root.classList.add('em');
    while (root.firstChild) root.removeChild(root.firstChild);
    var wrap = el('div', 'em-diagram'); wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', L.aria);
    var stage = el('div', 'em-stage');
    var bg = svg('svg', { 'class': 'em-bg', viewBox: '0 0 1200 760', 'aria-hidden': 'true', focusable: 'false' });
    var uid = 'em' + Math.random().toString(36).slice(2, 8);
    var defs = svg('defs', {});
    var rg = svg('radialGradient', { id: uid + 'g', cx: '50%', cy: '50%', r: '50%' });
    rg.appendChild(svg('stop', { offset: '0', 'stop-color': '#FC4C02', 'stop-opacity': '.38' }));
    rg.appendChild(svg('stop', { offset: '1', 'stop-color': '#FC4C02', 'stop-opacity': '0' }));
    defs.appendChild(rg);
    var flt = svg('filter', { id: uid + 'f', x: '-200%', y: '-200%', width: '500%', height: '500%' });
    flt.appendChild(svg('feGaussianBlur', { stdDeviation: '4', result: 'b' }));
    var fm = svg('feMerge', {}); fm.appendChild(svg('feMergeNode', { 'in': 'b' })); fm.appendChild(svg('feMergeNode', { 'in': 'SourceGraphic' })); flt.appendChild(fm);
    defs.appendChild(flt); bg.appendChild(defs);
    var seed = 20260914;
    function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
    var stars = svg('g', {});
    for (var s = 0; s < 90; s++) stars.appendChild(svg('circle', { cx: (rnd() * 1200).toFixed(1), cy: (rnd() * 760).toFixed(1), r: (0.4 + rnd() * 1.1).toFixed(2), fill: '#ECEAF6', opacity: (0.08 + rnd() * 0.35).toFixed(2) }));
    bg.appendChild(stars);
    [[590, 372, ''], [500, 290, 'em-dash em-rev'], [380, 220, ''], [260, 160, 'em-dash']].forEach(function (r) { bg.appendChild(svg('ellipse', { 'class': 'em-ring ' + r[2], cx: 600, cy: 380, rx: r[0], ry: r[1] })); });
    bg.appendChild(svg('circle', { 'class': 'em-glow', cx: 600, cy: 380, r: 250, fill: 'url(#' + uid + 'g)' }));
    var links = {};
    NODES.forEach(function (n) { var l = svg('line', { 'class': 'em-link' + (n.human ? ' em-human' : ''), x1: 600, y1: 380, x2: n.x, y2: n.y }); links[n.id] = l; bg.appendChild(l); });
    var pulse = svg('g', { opacity: '0' });
    var halo = svg('circle', { r: 9, fill: '#FC4C02', opacity: '.18' }), t2 = svg('circle', { r: 3, fill: '#FF7A3D', opacity: '.35' }), t1 = svg('circle', { r: 4, fill: '#FF7A3D', opacity: '.6' }), head = svg('circle', { r: 5.5, fill: '#FFB48F', filter: 'url(#' + uid + 'f)' });
    [halo, t2, t1, head].forEach(function (c) { pulse.appendChild(c); });
    bg.appendChild(pulse);
    stage.appendChild(bg);

    var byId = {};
    NODES.forEach(function (n) {
      var b = el('button', 'em-node' + (n.human ? ' em-humann' : '')); b.type = 'button';
      b.setAttribute('data-node', n.id); b.setAttribute('aria-pressed', 'false');
      b.style.setProperty('--x', (n.x / 12).toFixed(3) + '%'); b.style.setProperty('--y', (n.y / 7.6).toFixed(3) + '%');
      b.appendChild(el('span', 'em-pin' + (n.setup ? ' em-setup' : '')));
      if (n.human) b.appendChild(el('span', 'em-tag', n.id === 'buyer' ? L.human : L.loop));
      else { var bar = el('span', 'em-bar'); bar.appendChild(el('i')); bar.appendChild(el('i')); bar.appendChild(el('i')); b.appendChild(bar); }
      b.appendChild(el('span', 'em-label', L.n[n.id][0]));
      b.appendChild(el('span', 'em-sub', L.n[n.id][1]));
      byId[n.id] = b; stage.appendChild(b);
    });
    var brain = el('button', 'em-brain'); brain.type = 'button'; brain.setAttribute('data-node', 'ana'); brain.setAttribute('aria-pressed', 'false');
    var bh = el('span', 'em-bhead'); bh.appendChild(el('span', 'em-btitle', L.brain)); bh.appendChild(el('span', 'em-live', L.live)); brain.appendChild(bh);
    brain.appendChild(el('span', 'em-bname', 'ANA'));
    brain.appendChild(el('span', 'em-bnote', L.note));
    [[L.r1, L.r1t], [L.r2, L.r2t]].forEach(function (r) { var row = el('span', 'em-brow'); row.appendChild(el('span', 'em-rl', r[0])); row.appendChild(el('span', 'em-rt', r[1])); brain.appendChild(row); });
    var orch = el('span', 'em-brow em-orch'); orch.appendChild(el('span', 'em-rl', L.orch));
    var dotsBox = el('span', 'em-dots'); for (var d = 0; d < SEQ.length; d++) dotsBox.appendChild(el('i'));
    orch.appendChild(dotsBox);
    var nowLabel = el('span', 'em-now'); orch.appendChild(nowLabel);
    brain.appendChild(orch);
    byId.ana = brain; stage.appendChild(brain);
    wrap.appendChild(stage);
    wrap.appendChild(el('p', 'em-foot', L.foot));
    var legend = el('div', 'em-legend'); legend.setAttribute('aria-hidden', 'true');
    ['', 'em-or', 'em-hum', 'em-dot', 'em-dot em-am'].forEach(function (c, i) { var sp = el('span'); sp.appendChild(el('i', c)); sp.appendChild(document.createTextNode(L.legend[i])); legend.appendChild(sp); });
    wrap.appendChild(legend);
    var caption = null;
    if (root.getAttribute('data-caption') !== '0') {
      caption = el('div', 'em-caption'); caption.setAttribute('aria-live', 'polite');
      wrap.appendChild(caption);
    }
    root.appendChild(wrap);

    function nowText(id) {
      while (nowLabel.firstChild) nowLabel.removeChild(nowLabel.firstChild);
      var b = el('b', null, id ? L.now : L.all); nowLabel.appendChild(b);
      nowLabel.appendChild(document.createTextNode(' · ' + (id === 'buyer' ? L.buyerToAna : id ? L.n[id][0].toUpperCase() : L.allText)));
    }
    function select(id, fromUser) {
      Object.keys(byId).forEach(function (k) { byId[k].setAttribute('aria-pressed', k === id ? 'true' : 'false'); });
      if (caption) {
        while (caption.firstChild) caption.removeChild(caption.firstChild);
        caption.appendChild(el('strong', null, L.n[id][0]));
        caption.appendChild(el('p', null, L.d[id]));
        if (!fromUser) caption.appendChild(el('p', 'em-hint', L.tap));
      }
      if (fromUser) selectHandlers.forEach(function (fn) { try { fn(id); } catch (e) { /* host handler */ } });
    }
    Object.keys(byId).forEach(function (k) { byId[k].addEventListener('click', function () { select(k, true); }); });
    select('ana', false);
    nowText(null);

    var state = { root: root, lang: lang, stop: false };
    maps.push(state);
    if (reduce) return;
    var dots = dotsBox.children, STEP = 1600, TRAVEL = 900, C = [600, 380], cur = -1, hit = false, t0 = null, onScreen = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { onScreen = e[0].isIntersecting; }).observe(stage);
    function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
    function put(c, from, to, p) { p = Math.max(0, Math.min(1, p)); c.setAttribute('cx', (from[0] + (to[0] - from[0]) * p).toFixed(1)); c.setAttribute('cy', (from[1] + (to[1] - from[1]) * p).toFixed(1)); }
    function ping(n) { n.classList.remove('em-ping'); void n.offsetWidth; n.classList.add('em-ping'); }
    function frame(now) {
      if (state.stop) return;
      if (t0 === null) t0 = now;
      if (onScreen) {
        var t = Math.max(0, now - t0) % (STEP * SEQ.length);
        var i = Math.floor(t / STEP), local = t - i * STEP, id = SEQ[i];
        if (i !== cur) {
          cur = i; hit = false;
          SEQ.forEach(function (k) { byId[k].classList.remove('em-on'); links[k].classList.remove('em-lon'); });
          byId[id].classList.add('em-on'); links[id].classList.add('em-lon');
          for (var j = 0; j < dots.length; j++) dots[j].className = j < i ? 'em-done' : j === i ? 'em-cur' : '';
          nowText(id);
        }
        var n = NODES[NODES.map(function (x) { return x.id; }).indexOf(id)];
        var to = [n.x, n.y], from = C;
        if (id === 'buyer') { from = to; to = C; }
        var p = local / TRAVEL;
        put(head, from, to, ease(p)); put(halo, from, to, ease(p)); put(t1, from, to, ease(p - 0.07)); put(t2, from, to, ease(p - 0.14));
        pulse.setAttribute('opacity', p < 1 ? '1' : Math.max(0, 1 - (local - TRAVEL) / 250).toFixed(2));
        if (p >= 1 && !hit) { hit = true; ping(id === 'buyer' ? brain : byId[id]); }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function init() { Array.prototype.forEach.call(document.querySelectorAll('[data-ecomap]'), build); }

  window.EcosystemMap = {
    setLang: function (lang) {
      var old = maps.slice(); maps = [];
      old.forEach(function (m) { m.stop = true; m.root.setAttribute('data-lang', lang === 'es' ? 'es' : 'en'); build(m.root); });
    },
    onSelect: function (fn) { if (typeof fn === 'function') selectHandlers.push(fn); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
