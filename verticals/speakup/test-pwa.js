'use strict';
/**
 * AutoDev on a phone: installable, honest offline, and nothing too small to tap.
 *
 * Two halves. The FILE half needs no browser: the manifest, the worker's shell and the
 * version strings each page actually requests. The BROWSER half drives every screen at three
 * phone widths and MEASURES what renders — tap targets, horizontal overflow, text size, and
 * the input font size that makes iOS zoom the page on focus. It skips LOUDLY without
 * puppeteer rather than reporting a pass it did not earn.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m); } };
const PUB = path.join(__dirname, 'public');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const PAGES = ['app.html', 'meetings.html', 'history.html', 'settings.html', 'login.html', 'claude-code.html'];

// ── the manifest ─────────────────────────────────────────────────────────────
const man = JSON.parse(read('manifest.webmanifest'));
ok(man.id === '/speakup/' && man.scope === '/speakup/', 'the manifest is scoped to the app, and its id is stable');
ok(String(man.start_url).startsWith('/speakup/'), 'start_url is inside the scope, so the installed app opens the app');
ok(man.display === 'standalone' && man.theme_color && man.background_color, 'it installs as an app, with its own colours');
ok((man.icons || []).some(i => i.sizes === '512x512' && /maskable/.test(i.purpose || '')), 'a 512px maskable icon exists');
for (const i of man.icons || []) ok(fs.existsSync(path.join(PUB, i.src.replace('/speakup/', ''))), 'the icon file exists: ' + i.src);
ok((man.shortcuts || []).length >= 2, 'home-screen shortcuts reach both screens');

// ── the worker ───────────────────────────────────────────────────────────────
// Comments explain the rule; the CODE is what is asserted (the file says the word "addAll"
// while explaining why it does not use it — the first version of this check failed on that).
const sw = read('sw.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(/const CACHE = 'speakup-v\d+'/.test(sw), 'the cache carries a version to bump');
ok(/SHELL\.map\(\(u\) => c\.add\(u\)/.test(sw) && !/addAll/.test(sw), 'shell entries are cached one by one: one 404 cannot leave the app with no worker');
ok(/if \(url\.pathname\.includes\('\/api\/'\)\) return;/.test(sw), 'the worker never caches the API: a status from cache would be a lie');
ok(/caches\.match\('\/speakup\/offline\.html'\)/.test(sw), 'a navigation with nothing cached lands on a page that says so');
ok(/offline\.html/.test(sw) && fs.existsSync(path.join(PUB, 'offline.html')), 'and that page is in the shell');

// Every versioned asset a page asks for must be the version the worker cached.
const shellUrls = (sw.match(/'\/speakup\/[^']+'/g) || []).map(s => s.replace(/'/g, ''));
const asked = {};
for (const p of PAGES) {
  for (const m of read(p).matchAll(/\/speakup\/([\w.-]+)\?v=(\d+)/g)) {
    const file = m[1], v = m[2];
    if (asked[file] && asked[file].v !== v) ok(false, `${file} is requested as v${asked[file].v} in ${asked[file].page} and v${v} in ${p}`);
    asked[file] = { v, page: p };
  }
}
for (const file of Object.keys(asked)) {
  const want = '/speakup/' + file + '?v=' + asked[file].v;
  ok(shellUrls.includes(want) || !shellUrls.some(u => u.startsWith('/speakup/' + file)), 'the worker caches the same version the pages ask for: ' + file);
}

// ── installing ───────────────────────────────────────────────────────────────
const install = read('install.js');
for (const p of PAGES) ok(read(p).includes('install.js'), 'the install offer is on every screen: ' + p);
ok(/beforeinstallprompt/.test(install) && /deferred\.prompt\(\)/.test(install), 'where the browser offers an install, the bar actually installs');
ok(/iPad\|iPhone\|iPod/.test(install) && /Add to Home Screen/.test(install), 'and iPhone Safari, which fires no event, gets the wording instead');
ok(/display-mode: standalone/.test(install), 'nothing is offered inside the installed app');
ok(/14 \* 24 \* 3600 \* 1000/.test(install), 'a "not now" is remembered for two weeks');

// ── the browser half ─────────────────────────────────────────────────────────
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) {
  console.log('\nSKIPPED: puppeteer is not installed, so the phone layout was NOT measured in a browser.');
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
}

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };
const JOB = { id: 42, status: 'WAITING_APPROVAL', terminal: false, title: 'Show a visible test line on the sandbox page', project_name: 'AutoDev', plan_hash: 'h', revisions: [], pr_number: 7, pr_url: 'https://example.com/pull/7',
  plan: { workflow: ['Open the existing sandbox page', 'Put the words under the title', 'Check it on a phone'], what_changes: ['The words appear'], what_stays: ['Everything else'], how_you_know: ['You see it'], decisions: [], watch_out: [], scope_plain: 'the sandbox page' } };
const CCRUN = { id: 3, repo_full_name: 'digit2ai/RinglyPro-CRM', base_branch: 'main', work_branch: 'cc/3-add-a-tab', brief: 'Add a Claude Code tab to the header',
  source: 'manual', status: 'running', pr_url: null, cost_usd: 0.42, tokens_in: 1200, tokens_out: 300, turns: 6, started_at: new Date().toISOString(), terminal: false };
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0].replace(/^\/speakup\/?/, '') || 'app.html';
  if (req.url.indexOf('/api/') >= 0) {
    let body = {};
    if (/claude-code\/config/.test(req.url)) body = { model: 'claude-sonnet-5', max_turns: 200, cost_cap_usd: 10, auto_merge: false, max_concurrent: 3, github: true, anthropic_key: true, sdk: true, allowed_owners: ['digit2ai'] };
    else if (/claude-code\/repos/.test(req.url)) body = { configured: true, allowed_owners: ['digit2ai'], repos: [{ id: 1, repo_full_name: 'digit2ai/RinglyPro-CRM', default_branch: 'main', has_architect_skill: true }] };
    else if (/claude-code\/runs\/\d+\/stream/.test(req.url)) { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); return res.end('data: {"kind":"end"}\n\n'); }
    else if (/claude-code\/runs\/\d+/.test(req.url)) body = { run: CCRUN, events: [{ id: 1, kind: 'system', payload: { status: 'running' } }, { id: 2, kind: 'assistant', payload: { text: 'Reading the header.' } }] };
    else if (/claude-code\/runs/.test(req.url)) body = { runs: [CCRUN] };
    else if (/overview/.test(req.url)) body = { operator: true, jobs: [JOB], recordings: [], readiness: { ready: true, blockers: [] } };
    else if (/factory\/projects/.test(req.url)) body = { projects: [{ key: 'ringlypro', name: 'RinglyPro CRM' }, { key: 'speakup', name: 'AutoDev' }] };
    else if (/factory\/rules/.test(req.url)) body = { rules: 'Be brief.', default_rules: 'Be brief.', is_default: true };
    else if (/events/.test(req.url)) body = { status: JOB.status, terminal: false, events: [{ id: 1, kind: 'status', text: 'WAITING_APPROVAL' }] };
    else if (/jobs\/\d+/.test(req.url)) body = { job: JOB };
    else if (/auth\/me/.test(req.url)) body = { user: { email: 'owner@example.com' } };
    else if (/factory\/health/.test(req.url)) body = { model: { configured: true, subscription: { available: true }, working: { chat: 'subscription:claude-sonnet-5' } } };
    else if (/meetings/.test(req.url)) body = { meetings: [{ id: 5, title: 'Weekly review with the team', date_label: 'Tuesday, September 15, 2026', excerpt: 'we agreed to ship' }], has_more: false, messages: [] };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(body));
  }
  // /claude-code/runs/<id> is one page, like every run page: the id is read from the path
  // by the script, so the harness maps it the way the server does.
  const file = path.join(PUB, p.includes('.') ? p : p + '.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'text/plain' });
  res.end(fs.readFileSync(file));
});

server.listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port + '/speakup/';
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  try {
    for (const width of [360, 390, 414]) {
      for (const name of ['', 'meetings', 'history', 'settings', 'login', 'claude-code']) {
        const page = await browser.newPage();
        await page.setViewport({ width, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
        await page.goto(base + name, { waitUntil: 'networkidle0' });
        await new Promise((r) => setTimeout(r, 600));
        try { await page.click('#burger'); await new Promise((r) => setTimeout(r, 250)); } catch (e) {}
        const r = await page.evaluate(() => {
          const out = { overflow: document.documentElement.scrollWidth > window.innerWidth + 1, small: [], tiny: [], zoomy: [] };
          const vis = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden'; };
          for (const el of document.querySelectorAll('a,button,select,summary,input,textarea,[role=button]')) {
            if (!vis(el)) continue;
            const b = el.getBoundingClientRect();
            if (!b.width || !b.height) continue;
            const id = el.id || el.className || el.tagName;
            if (b.height < 44 || b.width < 44) out.small.push(id + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
            if (/INPUT|TEXTAREA|SELECT/.test(el.tagName) && parseFloat(getComputedStyle(el).fontSize) < 16) out.zoomy.push(id);
          }
          for (const el of document.querySelectorAll('body *')) {
            if (el.children.length || !el.textContent.trim() || !vis(el)) continue;
            if (parseFloat(getComputedStyle(el).fontSize) < 12) out.tiny.push((el.id || el.className || el.tagName));
          }
          return out;
        });
        const label = `${width}px /${name || 'factory'}`;
        ok(!r.overflow, `${label}: the page never scrolls sideways`);
        ok(!r.small.length, `${label}: every control is at least 44px (${[...new Set(r.small)].slice(0, 4).join(', ') || 'none under'})`);
        ok(!r.zoomy.length, `${label}: no input under 16px, so iPhone does not zoom on focus (${[...new Set(r.zoomy)].join(', ') || 'none'})`);
        ok(!r.tiny.length, `${label}: no text under 12px (${[...new Set(r.tiny)].slice(0, 4).join(', ') || 'none'})`);
        await page.close();
      }
    }
    // The install bar: offered, dismissable, and never inside the installed app.
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(base, { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt');
      e.prompt = () => { window.__prompted = true; };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    await new Promise((r) => setTimeout(r, 200));
    const barBox = await page.evaluate(() => {
      const b = document.getElementById('installBar');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { text: b.textContent, right: r.right, width: r.width, buttons: [...b.querySelectorAll('button')].map(x => x.getBoundingClientRect().height) };
    });
    ok(barBox && /AutoDev/.test(barBox.text), 'the install bar is offered when the browser says it can install');
    ok(barBox && barBox.right <= 390 + 1, 'and it stays on screen');
    ok(barBox && barBox.buttons.every(h => h >= 40), 'its buttons are real targets');
    await page.click('#installYes');
    await new Promise((r) => setTimeout(r, 200));
    const after = await page.evaluate(() => ({ prompted: !!window.__prompted, bar: !!document.getElementById('installBar'), stored: !!localStorage.getItem('speakup_install_dismissed') }));
    ok(after.prompted, 'tapping Install actually asks the browser to install');
    ok(!after.bar && after.stored, 'and the bar goes away, remembered');
    await page.close();

    const inApp = await browser.newPage();
    await inApp.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true });
    await inApp.evaluateOnNewDocument(() => {
      try { localStorage.clear(); } catch (e) {}
      const mm = window.matchMedia;
      window.matchMedia = (q) => (/standalone/.test(q) ? { matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} } : mm(q));
    });
    await inApp.goto(base, { waitUntil: 'networkidle0' });
    await inApp.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')));
    await new Promise((r) => setTimeout(r, 300));
    ok(!(await inApp.evaluate(() => !!document.getElementById('installBar'))), 'inside the installed app nothing is offered');
    ok(await inApp.evaluate(() => document.documentElement.getAttribute('data-standalone') === '1'), 'and the page knows it is the installed app');
    await inApp.close();
  } catch (e) {
    fail++; console.log('ERROR ' + e.message);
  }
  await browser.close();
  server.close();
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
});
