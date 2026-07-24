/* Lawn Co-Pilot — mobile dashboard simulator
 *
 * An interactive phone on the landing page showing what the owner actually
 * opens between jobs. Five tabs, ten screens, real navigation.
 *
 * HONESTY: this is a PREVIEW with sample data, and it says so on the frame and
 * in the copy. It is not wired to a live account and must never be presented
 * as one — the live proof is the estimator in the hero and the demo tenant.
 */
(function () {
  'use strict';

  var root = document.getElementById('sim');
  if (!root) return;

  var money = function (c) { return '$' + (c / 100).toFixed(2); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ── Sample data. Clearly a demo, and internally consistent so the numbers
       across screens agree the way they would in the real app. ───────────── */
  var DATA = {
    today: [
      { id: 1, time: '8:00', name: 'D. Whitfield', addr: '1240 Palm Grove Dr', sqft: 6970, price: 5900, crew: 'Crew A', status: 'done' },
      { id: 2, time: '9:10', name: 'M. Alvarez', addr: '88 Riverbend Ct', sqft: 4820, price: 4500, crew: 'Crew A', status: 'done' },
      { id: 3, time: '10:25', name: 'T. Okafor', addr: '3117 Cypress Ln', sqft: 9140, price: 7200, crew: 'Crew A', status: 'now' },
      { id: 4, time: '11:40', name: 'S. Bell', addr: '629 Willow Bend', sqft: 5310, price: 4900, crew: 'Crew B', status: 'next' },
      { id: 5, time: '1:15', name: 'R. Nguyen', addr: '204 Kestrel Way', sqft: 7480, price: 6300, crew: 'Crew B', status: 'next' }
    ],
    requests: [
      { id: 'r1', kind: 'quote', who: 'K. Marsh', what: 'Quote needs your OK — flagged low confidence', meta: '11,200 sq ft · $88 biweekly' },
      { id: 'r2', kind: 'lead', who: 'J. Reyes', what: 'New lead from your Google listing', meta: 'Quoted $54 · not booked yet' },
      { id: 'r3', kind: 'special', who: 'D. Whitfield', what: 'Special request: hedges before the 4th', meta: 'Asked the receptionist at 9:41pm' },
      { id: 'r4', kind: 'refund', who: 'P. Iyer', what: 'Refund waiting for approval', meta: '$45 · rained out, crew did not attend' }
    ],
    invoices: [
      { id: 'LC-2026-00184', who: 'D. Whitfield', amt: 5900, status: 'paid' },
      { id: 'LC-2026-00183', who: 'M. Alvarez', amt: 4500, status: 'paid' },
      { id: 'LC-2026-00181', who: 'S. Bell', amt: 4900, status: 'open' },
      { id: 'LC-2026-00177', who: 'P. Iyer', amt: 4500, status: 'failed' }
    ],
    crew: [
      { name: 'Luis M.', role: 'Crew A lead', in: '6:52a', hrs: 32.5, status: 'on' },
      { name: 'Danny R.', role: 'Crew A', in: '6:55a', hrs: 31.0, status: 'on' },
      { name: 'Tomas P.', role: 'Crew B lead', in: '7:04a', hrs: 38.2, status: 'on' },
      { name: 'Wes K.', role: 'Crew B', in: null, hrs: 12.0, status: 'off' }
    ],
    staff: [
      { emp: 'Receptionist', did: '14 calls answered · 3 after 6pm', n: 14 },
      { emp: 'Estimator', did: '9 properties measured and priced', n: 9 },
      { emp: 'Dispatcher', did: '2 routes sequenced · 1 reschedule', n: 3 },
      { emp: 'Bookkeeper', did: '5 invoices sent · 4 collected', n: 9 },
      { emp: 'Crew Manager', did: '3 clocked in · 1 cert expiring', n: 4 },
      { emp: 'Marketer', did: '5 review requests sent', n: 5 },
      { emp: 'Controller', did: '1 underpriced customer flagged', n: 1 }
    ]
  };

  /* ── Screens ─────────────────────────────────────────────────────────── */
  var SCREENS = {};

  SCREENS.today = function () {
    var done = DATA.today.filter(function (j) { return j.status === 'done'; }).length;
    return head('Today', 'Thursday · Crew A and B') +
      '<div class="sim-strip">' +
        stat(done + '/' + DATA.today.length, 'Jobs done') +
        stat('$28.80', 'Billed today') +
        stat('34 min', 'Drive saved') +
      '</div>' +
      DATA.today.map(function (j) {
        var badge = j.status === 'done' ? '<span class="sim-pill sim-pill--done">Done</span>'
          : j.status === 'now' ? '<span class="sim-pill sim-pill--now">On site</span>'
          : '<span class="sim-pill">Next</span>';
        return '<button class="sim-row" data-go="job" data-id="' + j.id + '">' +
          '<span class="sim-row__t">' + esc(j.time) + '</span>' +
          '<span class="sim-row__m"><b>' + esc(j.name) + '</b><i>' + esc(j.addr) + '</i></span>' +
          badge + '</button>';
      }).join('') +
      '<div class="sim-note">Tap a job to open it</div>';
  };

  SCREENS.job = function (id) {
    var j = DATA.today.filter(function (x) { return x.id === Number(id); })[0] || DATA.today[2];
    return head(j.name, j.addr, 'today') +
      '<div class="sim-map"><span class="sim-map__tag">Measured</span>' +
        '<div class="sim-map__fig"><b>' + j.sqft.toLocaleString() + '</b><span>sq ft of lawn</span></div></div>' +
      kv('Service', 'Mow, edge, trim, blow') +
      kv('Crew', j.crew) +
      kv('Arrival', j.time + ' – ' + (parseInt(j.time) + 2) + ':00') +
      kv('Price', money(j.price)) +
      '<div class="sim-note2">Gate code on file · Dog in back yard</div>' +
      '<div class="sim-actions"><button class="sim-btn">Mark done</button>' +
      '<button class="sim-btn sim-btn--ghost">Message customer</button></div>' +
      '<div class="sim-note">Marking done invoices it automatically</div>';
  };

  SCREENS.money = function () {
    return head('Money', 'This week') +
      '<div class="sim-strip">' +
        stat('$1,284', 'Collected') +
        stat('$94', 'Outstanding') +
        stat('On', 'Autopay') +
      '</div>' +
      DATA.invoices.map(function (i) {
        var cls = i.status === 'paid' ? 'sim-pill--done' : i.status === 'failed' ? 'sim-pill--warn' : '';
        return '<button class="sim-row" data-go="invoice">' +
          '<span class="sim-row__m"><b>' + esc(i.who) + '</b><i>' + esc(i.id) + '</i></span>' +
          '<span class="sim-row__r">' + money(i.amt) + '</span>' +
          '<span class="sim-pill ' + cls + '">' + esc(i.status) + '</span></button>';
      }).join('') +
      '<div class="sim-note">One card failed. It is already being retried.</div>';
  };

  SCREENS.invoice = function () {
    return head('LC-2026-00177', 'P. Iyer · card declined', 'money') +
      kv('Service', 'Mow, edge, trim · Jul 18') +
      kv('Amount', '$45.00') +
      kv('Attempts', '2 of 3 · next retry Friday') +
      '<div class="sim-note2">The Bookkeeper is handling this. Service is not paused.</div>' +
      '<div class="sim-actions"><button class="sim-btn">Retry now</button>' +
      '<button class="sim-btn sim-btn--ghost">Text payment link</button></div>';
  };

  SCREENS.requests = function () {
    return head('Requests', DATA.requests.length + ' waiting on you') +
      DATA.requests.map(function (r) {
        var tag = { quote: 'Quote', lead: 'Lead', special: 'Request', refund: 'Approve' }[r.kind];
        var cls = r.kind === 'refund' ? 'sim-pill--warn' : r.kind === 'lead' ? 'sim-pill--done' : '';
        return '<button class="sim-row sim-row--stack" data-go="' + (r.kind === 'refund' ? 'approve' : 'requests') + '">' +
          '<span class="sim-row__m"><b>' + esc(r.who) + '</b><i>' + esc(r.what) + '</i>' +
          '<i class="sim-dim">' + esc(r.meta) + '</i></span>' +
          '<span class="sim-pill ' + cls + '">' + tag + '</span></button>';
      }).join('') +
      '<div class="sim-note">Everything the AI could not decide alone lands here</div>';
  };

  SCREENS.approve = function () {
    return head('Refund approval', 'P. Iyer · $45.00', 'requests') +
      kv('Reason', 'Rained out, crew did not attend') +
      kv('Requested by', 'The Bookkeeper') +
      kv('Original charge', 'Jul 18 · $45.00') +
      '<div class="sim-note2">Nothing that moves money backwards happens without you.</div>' +
      '<div class="sim-actions"><button class="sim-btn">Approve refund</button>' +
      '<button class="sim-btn sim-btn--ghost">Decline</button></div>';
  };

  SCREENS.crew = function () {
    var on = DATA.crew.filter(function (c) { return c.status === 'on'; }).length;
    return head('Crew', on + ' clocked in now') +
      DATA.crew.map(function (c) {
        return '<div class="sim-row sim-row--static">' +
          '<span class="sim-row__m"><b>' + esc(c.name) + '</b><i>' + esc(c.role) + '</i></span>' +
          '<span class="sim-row__r">' + c.hrs + 'h</span>' +
          '<span class="sim-pill ' + (c.status === 'on' ? 'sim-pill--done' : '') + '">' +
          (c.status === 'on' ? 'In ' + c.in : 'Off') + '</span></div>';
      }).join('') +
      '<div class="sim-note2">Tomas P. — pesticide licence expires in 19 days</div>' +
      '<div class="sim-actions"><button class="sim-btn" data-go="payroll">Payroll: 1 draft</button></div>';
  };

  SCREENS.payroll = function () {
    return head('Pay run', 'Jul 14 – Jul 27 · draft', 'crew') +
      '<div class="sim-strip">' + stat('113.7h', 'Hours') + stat('$2,614', 'Gross') + stat('4', 'People') + '</div>' +
      kv('From', 'Approved clock-ins only') +
      kv('Overtime', '6.2h · Tomas P.') +
      '<div class="sim-warn">DRAFT — not filed. No payroll provider is connected, so no taxes have been withheld or remitted.</div>' +
      '<div class="sim-actions"><button class="sim-btn">Approve pay run</button></div>';
  };

  SCREENS.routes = function () {
    return head('Routes', 'Today · 2 crews') +
      '<div class="sim-strip">' + stat('34 min', 'Saved') + stat('11.2 mi', 'Driving') + stat('5', 'Stops') + '</div>' +
      '<div class="sim-route">' +
        DATA.today.map(function (j, i) {
          return '<div class="sim-stop"><span class="sim-stop__n">' + (i + 1) + '</span>' +
            '<span class="sim-row__m"><b>' + esc(j.addr) + '</b><i>' + esc(j.crew) + ' · ' + esc(j.time) + '</i></span></div>';
        }).join('') +
      '</div>' +
      '<div class="sim-note2">Sequenced west to east. 34 minutes less driving than booking order.</div>';
  };

  SCREENS.ai = function () {
    return head('AI staff', 'What they did today') +
      DATA.staff.map(function (s) {
        return '<div class="sim-row sim-row--static">' +
          '<span class="sim-dot"></span>' +
          '<span class="sim-row__m"><b>' + esc(s.emp) + '</b><i>' + esc(s.did) + '</i></span></div>';
      }).join('') +
      '<div class="sim-note2">Every action is logged. Switch any employee off anytime.</div>' +
      '<div class="sim-actions"><button class="sim-btn sim-btn--ghost" data-go="routes">See routes</button></div>';
  };

  /* ── Chrome ──────────────────────────────────────────────────────────── */
  function head(title, sub, back) {
    return '<div class="sim-head">' +
      (back ? '<button class="sim-back" data-go="' + back + '" aria-label="Back">&#8249;</button>' : '') +
      '<div><b>' + esc(title) + '</b><i>' + esc(sub) + '</i></div></div>';
  }
  function stat(v, l) { return '<div><b>' + esc(v) + '</b><span>' + esc(l) + '</span></div>'; }
  function kv(k, v) {
    return '<div class="sim-kv"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>';
  }

  var TABS = [
    ['today', 'Today', 'M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z'],
    ['money', 'Money', 'M3 7h18v11H3zM3 11h18'],
    ['requests', 'Inbox', 'M21 15a2 2 0 01-2 2H8l-5 4V5a2 2 0 012-2h14a2 2 0 012 2z'],
    ['crew', 'Crew', 'M16 21v-2a4 4 0 00-8 0v2M12 11a4 4 0 100-8 4 4 0 000 8z'],
    ['ai', 'AI', 'M12 2a5 5 0 015 5v3a5 5 0 01-10 0V7a5 5 0 015-5zM4 21a8 8 0 0116 0']
  ];

  // Which tab each sub-screen belongs under, so the tab bar stays correct.
  var PARENT = { job: 'today', invoice: 'money', approve: 'requests', payroll: 'crew', routes: 'ai' };

  var current = 'today';

  function render(screen, id) {
    current = screen;
    var body = (SCREENS[screen] || SCREENS.today)(id);
    var activeTab = PARENT[screen] || screen;

    root.querySelector('.sim-screen').innerHTML = body;
    root.querySelector('.sim-screen').scrollTop = 0;

    Array.prototype.forEach.call(root.querySelectorAll('.sim-tab'), function (t) {
      t.classList.toggle('is-on', t.getAttribute('data-tab') === activeTab);
    });
  }

  root.innerHTML =
    '<div class="sim-phone">' +
      '<div class="sim-notch"></div>' +
      '<div class="sim-status"><span>9:41</span><span class="sim-status__r">Lawn Monster</span></div>' +
      '<div class="sim-screen"></div>' +
      '<nav class="sim-tabs">' +
        TABS.map(function (t) {
          return '<button class="sim-tab" data-tab="' + t[0] + '" data-go="' + t[0] + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round"><path d="' + t[2] + '"/></svg>' +
            '<span>' + t[1] + '</span></button>';
        }).join('') +
      '</nav>' +
    '</div>' +
    '<p class="sim-caption">Preview with sample data. The live estimator is at the top of this page.</p>';

  root.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-go]');
    if (!btn) return;
    e.preventDefault();
    render(btn.getAttribute('data-go'), btn.getAttribute('data-id'));
  });

  render('today');
})();
