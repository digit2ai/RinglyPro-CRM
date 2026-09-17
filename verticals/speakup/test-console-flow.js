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
  plan: { workflow: ['Read the current header', 'Change the logo text', 'Check it on a phone'], what_changes: ['The logo reads VoiceUp'], what_stays: ['Everything else'], how_you_know: ['You see it'],
    decisions: [], watch_out: [], scope_plain: 'small' } };
const RUNNING = { id: 43, status: 'PLANNING', terminal: false, title: 'Working', project_name: 'AutoDev', plan_hash: null, revisions: [] };
const DONE = { id: 41, status: 'DEPLOYED', terminal: true, title: 'An older change', project_name: 'AutoDev', plan_hash: 'h41', revisions: [] };

let scenario = { jobs: [] };
let newJobCalls = 0;
let researchCalls = 0;

const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0].replace(/^\/speakup\/?/, '') || 'app.html';
  if (/\/factory\/research/.test(req.url)) {
    // The live answer: one line per tool, the answer in pieces, then the final text.
    researchCalls++;
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    const lines = [{ type: 'start' }, { type: 'tool', kind: 'tool', text: 'fetch https://api.github.com/repos/x/y/commits' },
      { type: 'delta', text: 'The latest commit is ' }, { type: 'delta', text: 'abc123.' }, { type: 'done', text: 'The latest commit is abc123.\nIt fixed Close.' }, { type: 'end' }];
    let i = 0;
    const tick = () => { if (i < lines.length) { res.write(JSON.stringify(lines[i++]) + '\n'); setTimeout(tick, 120); } else res.end(); };
    return tick();
  }
  if (req.url.indexOf('/api/') >= 0 && /\/factory\/command/.test(req.url) && scenario.research) {
    newJobCalls++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ intent: 'ASK', reply: '', card: { type: 'research' }, client_action: 'research' }));
  }
  if (req.url.indexOf('/api/') >= 0) {
    let body = {};
    const byId = (id) => (id === 42 ? PLAN : (id === 43 ? RUNNING : DONE));
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
      sendOn: getComputedStyle(document.getElementById('send')).display !== 'none' && !document.getElementById('send').disabled,
      prog: getComputedStyle(document.getElementById('prog')).display !== 'none',
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
      ok(s.sendOn && !s.prog, `${w} a plan is waiting: the box can be used, no progress bar`);
      // THE CARD IS A SHORT NUMBERED WORKFLOW. The long version is one tap away, closed.
      const card = await page.evaluate(() => {
        const steps = [...document.querySelectorAll('#plan ol.pflow li')].map(li => li.textContent.trim());
        const more = document.querySelector('#plan details.more');
        const visible = document.getElementById('plan').innerText;
        return { steps, more: !!more, moreOpen: !!(more && more.open), detailShown: /Everything else/.test(visible), words: visible.split(/\s+/).length };
      });
      ok(card.steps.length === 3 && card.steps[0] === 'Read the current header', `${w} the plan reads as a numbered workflow of titles`);
      ok(card.more && !card.moreOpen && !card.detailShown, `${w} the long detail is folded away, not on screen`);
      ok(card.words < 120, `${w} the whole card is short enough to actually read (${card.words} words)`);
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
      ok(s.sendOn && !s.prog, `${w} a finished job: the box is usable again`);
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

      // ── 5b. while a job is running: no send button, a moving bar instead ─────
      page = await open([{ id: 43, status: 'PLANNING', terminal: false, title: 'Working', project_name: 'AutoDev' }], width);
      let sw = await state(page);
      ok(!sw.sendOn && sw.prog, `${w} while the job is planning: the send button is gone and a progress bar shows`);
      ok(await page.evaluate(() => { const r = document.getElementById('prog').getBoundingClientRect(); return r.width > 40 && r.height > 4; }),
        `${w} the progress bar is actually visible`);
      // A LIVE WORD AND A CLOCK: a bar alone could be a stuck animation.
      const w1 = await page.evaluate(() => document.getElementById('workw').textContent);
      ok(/\w+…\s+\d+s/.test(w1), `${w} a word and a clock say work is in flight: "${w1}"`);
      await new Promise((r) => setTimeout(r, 5200));
      const w2 = await page.evaluate(() => document.getElementById('workw').textContent);
      const secs = (t) => parseInt((t.match(/(\d+)s/) || [0, 0])[1], 10);
      ok(secs(w2) > secs(w1), `${w} the clock counts up (${w1} -> ${w2})`);
      ok(w2.split('…')[0] !== w1.split('…')[0], `${w} the word changes while it works`);
      ok(await page.evaluate(() => typeof window.onbeforeunload === 'function' || !!window.__hasUnloadGuard ||
        (window.dispatchEvent(Object.assign(new Event('beforeunload', { cancelable: true }), {})) === false)),
        `${w} closing the tab while a job runs asks first`);
      await page.close();
      page = await open([{ id: 41, status: 'DEPLOYED', terminal: true, title: 'An older change', project_name: 'AutoDev' }], width);
      ok((await page.evaluate(() => document.getElementById('workw').textContent)) === '', `${w} with nothing running there is no word`);
      await page.close();

      // ── 5c. a finished job says so ONCE, and the bar stops ───────────────────
      // Coming back to the tab used to start a second poller: the same pull request link was
      // printed five times and the bar kept sliding after "Deployed".
      page = await open([{ id: 41, status: 'DEPLOYED', terminal: true, title: 'An older change', project_name: 'AutoDev' }], width);
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await new Promise((r) => setTimeout(r, 250));
      }
      const fin = await page.evaluate(() => ({
        links: (document.getElementById('out').textContent.match(/for you to look at/g) || []).length,
        word: document.getElementById('workw').textContent,
        prog: getComputedStyle(document.getElementById('prog')).display !== 'none' }));
      ok(fin.links <= 1, `${w} a finished job announces itself once, not once per look (${fin.links})`);
      ok(fin.word === '' && !fin.prog, `${w} and the bar and the clock stop when it is finished`);
      await page.close();

      // ── 6. a question is answered live, like Claude ─────────────────────────
      page = await open([], width);
      scenario.research = true; researchCalls = 0;
      await page.type('#cmd', 'what was the latest commit');
      await page.click('#send');
      await new Promise((r) => setTimeout(r, 450));
      const during = await state(page);
      ok(!during.sendOn && during.prog, `${w} while the answer is being written: the bar, not the send button`);
      const mid = await page.evaluate(() => document.getElementById('out').textContent);
      await new Promise((r) => setTimeout(r, 1200));
      const end = await page.evaluate(() => ({ text: document.getElementById('out').textContent, answers: [...document.querySelectorAll('#out .ln')].filter(l => /ANSWER/.test(l.textContent)).length,
        ws: getComputedStyle(document.querySelector('#out .say')).whiteSpace }));
      ok(researchCalls === 1, `${w} a question opens the live research stream`);
      ok(/TOOL/.test(mid) && /api\.github\.com/.test(mid), `${w} what it is looking at shows while it works`);
      ok(/It fixed Close\./.test(end.text) && end.answers === 1, `${w} the final answer replaces the streamed text, shown once`);
      ok(end.ws === 'pre-wrap', `${w} a multi-line answer keeps its lines`);
      const after = await state(page);
      ok(after.sendOn && !after.prog, `${w} once the answer is finished you can write again`);
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
