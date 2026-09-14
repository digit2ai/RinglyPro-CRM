/* BuyersLine workflow circuit. The page ships with every step readable (the
   resting state). This script draws the path that hands the search between the
   three lanes, and, while the strip is on screen, moves a signal along it and
   lights each step. Reduced motion = the path is drawn, nothing moves. */
(function () {
  'use strict';
  var root = document.getElementById('flow');
  if (!root) return;
  var track = root.querySelector('.flow-track');
  var svg = root.querySelector('.flow-circuit');
  var scroller = root.querySelector('.flow-scroll');
  var steps = Array.prototype.slice.call(root.querySelectorAll('.flow-step'));
  if (!track || !svg || !steps.length) return;
  var NS = 'http://www.w3.org/2000/svg';
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var STEP_MS = 1500, TRAVEL_MS = 900, HOLD_MS = 2400, TAIL = 90;
  var base, progress, tail, comet, total = 0, stops = [], cur = 0;
  var i = -1, timer = null, raf = null, visible = false;

  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function centers() {
    var t = track.getBoundingClientRect();
    return steps.map(function (s) {
      var r = s.querySelector('.flow-node').getBoundingClientRect();
      return { x: r.left + r.width / 2 - t.left, y: r.top + r.height / 2 - t.top };
    });
  }

  // Smooth S-curves: leave each node horizontally, arrive at the next horizontally.
  function pathFor(pts, upto) {
    var d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
    for (var k = 1; k <= upto; k++) {
      var a = pts[k - 1], b = pts[k], mx = (a.x + b.x) / 2;
      d += ' C' + mx.toFixed(1) + ' ' + a.y.toFixed(1) + ' ' + mx.toFixed(1) + ' ' + b.y.toFixed(1) + ' ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1);
    }
    return d;
  }

  function build() {
    var pts = centers();
    var w = track.clientWidth, h = svg.getBoundingClientRect().height || 186;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var defs = el('defs', {});
    var g = el('linearGradient', { id: 'blFlowGrad', gradientUnits: 'userSpaceOnUse', x1: pts[0].x, y1: 0, x2: pts[pts.length - 1].x, y2: 0 });
    [['0', '#E8E6F2'], ['0.3', '#FF7A3D'], ['0.62', '#FF7A3D'], ['1', '#4ADE9A']].forEach(function (s) { g.appendChild(el('stop', { offset: s[0], 'stop-color': s[1] })); });
    defs.appendChild(g);
    svg.appendChild(defs);

    var d = pathFor(pts, pts.length - 1);
    base = el('path', { d: d, 'class': 'c-base' });
    progress = el('path', { d: d, 'class': 'c-progress', stroke: 'url(#blFlowGrad)' });
    tail = el('path', { d: d, 'class': 'c-tail', stroke: 'url(#blFlowGrad)' });
    comet = el('circle', { r: 4.5, 'class': 'c-comet' });
    svg.appendChild(base); svg.appendChild(progress); svg.appendChild(tail); svg.appendChild(comet);

    total = progress.getTotalLength();
    // Arc length at each node, measured on the same curve the signal rides.
    stops = pts.map(function (p, k) {
      if (!k) return 0;
      var probe = el('path', { d: pathFor(pts, k) });
      svg.appendChild(probe);
      var len = probe.getTotalLength();
      svg.removeChild(probe);
      return len;
    });
    progress.style.strokeDasharray = total + ' ' + total;
    tail.style.strokeDasharray = TAIL + ' ' + (total + TAIL);
    if (reduce) { draw(total, false); } else { draw(i < 0 ? 0 : stops[i], i >= 0); }
  }

  function draw(len, showComet) {
    cur = len;
    progress.style.strokeDashoffset = String(total - len);
    tail.style.strokeDashoffset = String(TAIL - len);
    tail.style.opacity = showComet && len > 1 ? '.9' : '0';
    var p = progress.getPointAtLength(Math.max(0, Math.min(len, total)));
    comet.setAttribute('cx', p.x); comet.setAttribute('cy', p.y);
    comet.style.opacity = showComet ? '1' : '0';
  }

  function travel(to, done) {
    cancelAnimationFrame(raf);
    var from = cur, t0 = null;
    function frame(ts) {
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / TRAVEL_MS);
      var e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      draw(from + (to - from) * e, true);
      if (k < 1) raf = requestAnimationFrame(frame); else if (done) done();
    }
    raf = requestAnimationFrame(frame);
  }

  function mark() {
    steps.forEach(function (s, k) {
      s.classList.toggle('is-done', k < i);
      s.classList.toggle('is-active', k === i);
    });
    // On a phone the circuit scrolls sideways: keep the active step centered without moving the page.
    if (i >= 0 && scroller && scroller.scrollWidth > scroller.clientWidth + 4) {
      var node = steps[i];
      scroller.scrollTo({ left: Math.max(0, node.offsetLeft + track.offsetLeft - (scroller.clientWidth - node.offsetWidth) / 2), behavior: 'smooth' });
    }
  }

  function tick() {
    if (!visible) { timer = null; return; }
    if (i >= steps.length - 1) {
      timer = setTimeout(function () {
        i = -1; mark(); draw(0, false);
        timer = setTimeout(tick, 700);
      }, HOLD_MS);
      return;
    }
    i += 1;
    travel(stops[i], mark);
    if (i === 0) mark();
    timer = setTimeout(tick, STEP_MS);
  }

  build();
  if (reduce) {
    window.addEventListener('resize', build);
    return;
  }

  root.classList.add('is-animated');
  function start() { if (!timer) timer = setTimeout(tick, 350); }
  function stop() { clearTimeout(timer); timer = null; cancelAnimationFrame(raf); }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start(); else stop();
    }, { threshold: 0.3 }).observe(root);
  } else { visible = true; start(); }

  var rt = null;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(build, 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (visible) start(); });
})();
