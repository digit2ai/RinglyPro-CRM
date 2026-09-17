/* AutoDev — what the factory screen shows when it opens, driven in a real browser.
 *
 * THERE IS NO EMPTY PAGE, AND CLEAR CANNOT STRAND A LIVE PLAN.
 *
 * The owner kept landing on an empty screen — five grey steps with none active, a Clear
 * button with nothing to clear, a dark pane holding one sentence — while a plan was still
 * waiting for them on the server. The cause was Clear. It was drawn on every screen,
 * including beside Cancel on a live plan, and there it did two bad things: it hid the plan
 * (the empty page), and it nulled planJob, so the next message skipped the correction path
 * and started a SECOND job underneath the unread plan. "No new job under a plan waiting to
 * be read" is enforced in console.js, and Clear was the way around it.
 *
 * Each scenario serves its own set of jobs, because what the screen should show depends
 * entirely on what is in progress.
 *
 *   node verticals/speakup/test-console-flow.js
 *
 * SKIPS LOUDLY without puppeteer rather than reporting a pass it did not earn.
 */
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) {
  console.log('SKIPPED: puppeteer is not installed, so the factory screen flow was NOT verified in a browser.');
  process.exit(0);
}
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };

const PLAN = { id: 42, status: 'WAITING_APPROVAL', terminal: false, title: 'Change the logo', project_name: 'AutoDev',
  plan_hash: 'h42', plan_md: 'x', revisions: [], composed_by: 'heuristic',
  plan: { what_changes: ['The logo reads VoiceUp'], what_stays: ['Everything else'], how_you_know: ['You see it'],
    decisions: [], watch_out: [], scope_plain: 'small' } };
const DONE = { id: 41, status: 'DEPLOYED', terminal: true, title: 'An older change', project_name: 'AutoDev', plan_hash: 'h41', revisions: [] };

let scenario = { jobs: [] };
let newJobCalls = 0;

const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0].replace(/^\/speakup\/?/, '') || 'app.html';
  if (req.url.indexOf('/api/') >= 0) {
    let body = {};
    const byId = (id) => (id === 42 ? PLAN : DONE);
    if (/\/factory\/overview/.test(req.url)) {
      body = { operator: true, jobs: scenario.jobs, recordings: [], readiness: { ready: true, blockers: [] } };
    } else if (/\/factory\/command/.test(req.url) && req.method === 'POST') {
      // Anything reaching this endpoint while a plan is waiting is the second-job defect.
      newJobCalls++;
      body = { intent: 'PREPARE_IMPLEMENTATION', reply: 'new job', card: { job_id: 99 } };
    } else if (/\/factory\/jobs\/(\d+)\/events/.test(req.url)) {
      const j = byId(+RegExp.$1);
      body = { status: j.status, terminal: j.terminal, pr_number: null, pr_url: null, events: [{ id: 1, kind: 'status', text: j.status }] };
    } else if (/\/factory\/jobs\/(\d+)\/revise/.test(req.url)) {
      body = { job: PLAN, diff: { added: [], removed: [], changed: [] } };
    } else if (/\/factory\/jobs\/(\d+)/.test(req.url)) {
      body = { job: byId(+RegExp.$1) };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(body));
  }
  const f = path.join(DIR, p);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' });
  res.end(fs.readFileSync(f));
});

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m); } };

server.listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port + '/speakup/';
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });

  const state = (page) => page.evaluate(() => {
    const shown = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';
    return {
      idle: document.body.classList.contains('idle'),
      bar: shown('bar'), out: shown('out'), plan: shown('plan'),
      clear: !!document.getElementById('clearBtn'), cancel: !!document.getElementById('cancelBtn'),
      pane: document.getElementById('out').textContent.trim(),
      placeholder: document.getElementById('cmd').placeholder
    };
  });
  const open = async (jobs, width) => {
    scenario = { jobs }; newJobCalls = 0;
    const page = await browser.newPage();
    await page.setViewport({ width: width, height: 844 });
    // A clean profile: a dismissed-job watermark left by an earlier scenario would change
    // what startup restores, and read as the behaviour under test.
    await page.evaluateOnNewDocument(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
    await page.goto(base, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 700));
    return page;
  };

  try {
    for (const width of [390, 1280]) {
      const w = width + 'px';

      // ── 1. nothing in progress ───────────────────────────────────────────────
      let page = await open([], width);
      let s = await state(page);
      ok(s.idle, `${w} nothing in progress: the screen is idle`);
      ok(!s.bar && !s.out, `${w} nothing in progress: no row of grey steps and no dark pane are drawn`);
      ok(!s.clear, `${w} nothing in progress: no Clear button with nothing to clear`);
      ok(s.pane === '', `${w} nothing in progress: no INFO paragraph`);
      await page.close();

      // ── 2. a plan is waiting: land directly on it ────────────────────────────
      page = await open([PLAN], width);
      s = await state(page);
      ok(!s.idle && s.plan, `${w} a plan is waiting: you land directly on it`);
      ok(s.bar, `${w} a plan is waiting: the step bar is drawn`);
      ok(s.cancel, `${w} a plan is waiting: Cancel is offered`);
      // THE DEFECT. Clear beside Cancel on a live plan is what stranded it.
      ok(!s.clear, `${w} a plan is waiting: Clear is NOT offered`);
      ok(/approved|aprobado/i.test(s.placeholder), `${w} a plan is waiting: the box is a conversation about the plan`);

      // ── 3. typing on a waiting plan corrects it, never starts a second job ───
      await page.type('#cmd', 'change the logo to VoiceUp');
      await page.click('#send');
      await new Promise((r) => setTimeout(r, 700));
      s = await state(page);
      ok(newJobCalls === 0, `${w} a correction on a waiting plan starts no new job (${newJobCalls} calls)`);
      ok(s.plan, `${w} the plan is still on screen after the correction`);
      await page.close();

      // ── 4. a finished job: Clear is offered, and lands on the clean idle screen
      page = await open([DONE], width);
      s = await state(page);
      ok(!s.idle && s.bar, `${w} a finished job is shown`);
      ok(s.clear, `${w} a finished job: Clear IS offered`);
      await page.click('#clearBtn');
      await new Promise((r) => setTimeout(r, 400));
      s = await state(page);
      ok(s.idle && !s.bar && !s.out, `${w} after Clear: the clean idle screen, not an empty page`);

      // ── 5. from idle, sending leaves idle straight away ──────────────────────
      await page.type('#cmd', 'add a footer');
      await page.click('#send');
      await new Promise((r) => setTimeout(r, 600));
      s = await state(page);
      ok(!s.idle && s.out, `${w} from idle, sending brings the work area back`);
      await page.close();
    }
  } catch (e) {
    fail++; console.log('ERROR ' + e.message);
  }
  await browser.close();
  server.close();
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
});
