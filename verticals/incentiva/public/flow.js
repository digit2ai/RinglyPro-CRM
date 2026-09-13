/* BuyersLine workflow strip. The page ships with every step visible (the
   resting state); this script only adds the travelling highlight, and only
   while the strip is on screen. Reduced motion = no animation at all. */
(function () {
  'use strict';
  var root = document.getElementById('flow');
  if (!root) return;
  var steps = Array.prototype.slice.call(root.querySelectorAll('.flow-step'));
  var fill = root.querySelector('.flow-fill');
  var line = root.querySelector('.flow-line');
  var runner = root.querySelector('.flow-runner');
  var scroller = root.querySelector('.flow-scroll');
  if (!steps.length || !fill || !runner) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var STEP_MS = 1400, HOLD_MS = 2200;
  var i = -1, timer = null, visible = false;

  function center(el) {
    var track = root.querySelector('.flow-track').getBoundingClientRect();
    var r = el.querySelector('.flow-node').getBoundingClientRect();
    return (r.left + r.width / 2 - track.left) / track.width * 100;
  }

  function paint() {
    // The line runs exactly from the first node center to the last; the fill is a share of it.
    var first = center(steps[0]), last = center(steps[steps.length - 1]);
    if (line) { line.style.left = first + '%'; line.style.right = (100 - last) + '%'; }
    steps.forEach(function (s, k) {
      s.classList.toggle('is-done', k < i);
      s.classList.toggle('is-active', k === i);
    });
    if (i < 0) { fill.style.width = '0%'; runner.style.left = center(steps[0]) + '%'; return; }
    var pos = center(steps[i]);
    fill.style.width = ((pos - first) / Math.max(last - first, 1) * 100) + '%';
    runner.style.left = pos + '%';
    // On a phone the strip scrolls sideways: keep the active step in view without moving the page.
    if (scroller && scroller.scrollWidth > scroller.clientWidth + 4) {
      var node = steps[i];
      var target = node.offsetLeft - (scroller.clientWidth - node.offsetWidth) / 2;
      scroller.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }
  }

  function tick() {
    if (!visible) { timer = null; return; }
    if (i >= steps.length - 1) {
      timer = setTimeout(function () { i = -1; paint(); timer = setTimeout(tick, 600); }, HOLD_MS);
      return;
    }
    i += 1;
    paint();
    timer = setTimeout(tick, STEP_MS);
  }

  root.classList.add('is-animated');
  i = -1; paint();

  function start() { if (!timer) timer = setTimeout(tick, 400); }
  function stop() { clearTimeout(timer); timer = null; }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start(); else stop();
    }, { threshold: 0.35 }).observe(root);
  } else { visible = true; start(); }

  window.addEventListener('resize', function () { if (i >= 0) paint(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (visible) start(); });
})();
