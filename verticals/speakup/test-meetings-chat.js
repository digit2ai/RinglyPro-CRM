/* AutoDev — the meetings chat, driven in a real browser.
 *
 * The server half is proven by sit-meeting-chat.js. This proves what only a browser can:
 * the reply visibly streams (text on screen before the answer is finished), the chips send,
 * Copy copies, Transfer shows a receipt that links to the job, an offline reply is labelled,
 * the input is pinned to the bottom of a phone, History links into a meeting, the language
 * toggle relabels the screen without touching what was said, and nothing on it fails contrast.
 *
 * The API is a local stub; each POST /chat streams NDJSON with gaps between pieces.
 *
 *   node verticals/speakup/test-meetings-chat.js
 *
 * SKIPS LOUDLY without puppeteer rather than reporting a pass it did not earn.
 */
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) {
  console.log('SKIPPED: puppeteer is not installed, so the meetings chat was NOT verified in a browser.');
  process.exit(0);
}
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };
const MEETING = { id: 5, title: 'Weekly review', created_at: '2026-09-17T15:00:00Z', date_label: 'Thursday, September 17, 2026 at 11:00 AM', transcript: 'We agreed to add a task list.', has_transcript: true };

let store = [], nextId = 100, lastQ = null, factoryPosts = [], deletes = 0;
const server = http.createServer((req, res) => {
  const url = req.url;
  const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (url.indexOf('/api/') >= 0) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      const b = body ? JSON.parse(body) : {};
      if (/\/meetings\?/.test(url) || /\/meetings$/.test(url.split('?')[0])) {
        lastQ = new URL('http://x' + url).searchParams.get('q');
        return json(200, { meetings: [{ id: 5, title: 'Weekly review', created_at: MEETING.created_at, has_transcript: true },
          { id: 4, title: 'Kickoff', created_at: '2026-09-10T15:00:00Z', has_transcript: false }], page: 1, total: 2, has_more: false });
      }
      if (/\/meetings\/5\/chat$/.test(url) && req.method === 'GET') return json(200, { messages: store });
      if (/\/meetings\/5\/chat$/.test(url) && req.method === 'DELETE') { deletes++; const n = store.length; store = []; return json(200, { ok: true, removed: n }); }
      if (/\/meetings\/5$/.test(url)) return json(200, { meeting: MEETING, model: { configured: true } });
      if (/\/meetings\/5\/factory$/.test(url)) {
        factoryPosts.push(b);
        const receipt = { id: nextId++, role: 'assistant', kind: 'transfer', content: 'Transferred to the Factory as job #42.', job_id: 42, factory_ref: 'job:42', composed_by: 'system' };
        store.push(receipt);
        return json(200, { ok: true, job_id: 42, messages: [receipt] });
      }
      if (/\/meetings\/5\/chat$/.test(url) && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
        const user = { id: nextId++, role: 'user', kind: 'text', content: b.message };
        store.push(user);
        res.write(JSON.stringify({ type: 'user', message: user }) + '\n');
        const offline = /offline/.test(b.message);
        const text = offline ? 'No model: the AI is not available (no key). Here is the transcript to read:\n\nWe agreed to add a task list.'
          : 'Summary: the team agreed to add a task list, and to review it next week.';
        if (!offline) {
          for (const piece of text.match(/.{1,14}/g)) { res.write(JSON.stringify({ type: 'delta', text: piece }) + '\n'); await new Promise(r => setTimeout(r, 120)); }
        }
        const done = { id: nextId++, role: 'assistant', kind: 'text', content: text, composed_by: offline ? 'offline' : 'claude-sonnet-5', offline };
        store.push(done);
        res.write(JSON.stringify({ type: 'done', message: done }) + '\n');
        res.write(JSON.stringify({ type: 'end' }) + '\n');
        return res.end();
      }
      return json(200, { success: true, user: { email: 'owner@example.invalid' }, recordings: [] });
    });
    return;
  }
  let p = url.split('?')[0].replace(/^\/speakup\/?/, '') || 'app.html';
  if (['meetings', 'history', 'settings'].includes(p)) p += '.html';
  const f = path.join(DIR, p);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' });
  res.end(fs.readFileSync(f));
});

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

server.listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port + '/speakup/';
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  try {
    for (const [label, w, h] of [['phone 390', 390, 844], ['desktop 1280', 1280, 900]]) {
      store = []; factoryPosts = [];
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h });
      await page.evaluateOnNewDocument(() => {
        try { localStorage.clear(); localStorage.setItem('speakup_lang', 'en'); } catch (e) {}
        window.__copied = null;
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true });
      });

      // ── no meeting open: the recorder, and a chat that cannot be used yet ───────
      await page.goto(base + 'meetings?new=1', { waitUntil: 'networkidle0' });
      let s = await page.evaluate(() => ({
        rec: !document.getElementById('recCard').hidden, meet: !document.getElementById('meetCard').hidden,
        msgDisabled: document.getElementById('msg').disabled, chipsOn: [...document.querySelectorAll('.chip')].filter(c => !c.disabled).length,
        oldList: !!document.getElementById('listCard') || !!document.getElementById('intelCard'), note: document.getElementById('thread').textContent }));
      ok(s.rec && !s.meet, `${label} new meeting: the record control is shown`);
      ok(s.msgDisabled && s.chipsOn === 0, `${label} new meeting: the chat waits for a meeting`);
      ok(!s.oldList, `${label} the history list and the checklist are gone from this screen`);
      ok(/History/.test(s.note), `${label} the empty screen points to History`);

      // ── a meeting open ───────────────────────────────────────────────────────────
      await page.goto(base + 'meetings?id=5', { waitUntil: 'networkidle0' });
      s = await page.evaluate(() => ({
        title: document.getElementById('mTitle').textContent, date: document.getElementById('mDate').textContent,
        rec: !document.getElementById('recCard').hidden, chips: [...document.querySelectorAll('.chip')].map(c => c.textContent), chipsOn: [...document.querySelectorAll('.chip')].filter(c => !c.disabled).length }));
      ok(s.title === 'Weekly review' && /2026/.test(s.date), `${label} the meeting header shows its title and date`);
      ok(!s.rec, `${label} with a meeting open the screen is the header and the chat`);
      ok(s.chips.length === 7 && s.chipsOn === 7 && s.chips.includes('Summary') && s.chips.includes('Build prompt'), `${label} seven starter chips, all usable`);
      // Measured, not the attribute: .btn{display:inline-flex} once beat [hidden] and left Clear on screen.
      ok(await page.$eval('#clearBtn', b => getComputedStyle(b).display === 'none'), `${label} Clear is not on screen when there is nothing to clear`);
      // Close forgets the meeting, so opening the screen again does not bring it back.
      await page.click('#closeBtn'); await sleep(300);
      s = await page.evaluate(() => ({ card: getComputedStyle(document.getElementById('meetCard')).display, rec: getComputedStyle(document.getElementById('recCard')).display, stored: localStorage.getItem('speakup_active_meeting'), url: location.search }));
      ok(s.card === 'none' && s.rec !== 'none' && s.stored === null && !/id=/.test(s.url), `${label} Close takes the meeting off screen and forgets it`);
      await page.goto(base + 'meetings', { waitUntil: 'networkidle0' });
      ok(await page.$eval('#meetCard', c => getComputedStyle(c).display === 'none'), `${label} after Close, reopening the screen does not reopen the meeting`);
      await page.goto(base + 'meetings?id=5', { waitUntil: 'networkidle0' });

      // ── a chip sends; the reply streams ────────────────────────────────────────
      await page.click('.chip');
      await sleep(450);
      const mid = await page.evaluate(() => { const b = document.querySelectorAll('.msg.assistant .body'); return b.length ? b[b.length - 1].textContent : ''; });
      await sleep(1600);
      const fin = await page.evaluate(() => { const b = document.querySelectorAll('.msg.assistant .body'); return b.length ? b[b.length - 1].textContent : ''; });
      ok(mid.length > 0 && mid.length < fin.length, `${label} the answer appears while it is still being written (${mid.length} then ${fin.length} characters)`);
      ok(/Summary: the team agreed/.test(fin), `${label} the full answer lands`);
      ok(await page.evaluate(() => document.querySelector('.msg.user').textContent === 'Give me a summary of the meeting.'), `${label} the chip sent its sentence`);
      const acts = await page.evaluate(() => [...document.querySelectorAll('.msg.assistant .mact .btn')].map(b => ({ t: b.textContent, h: b.getBoundingClientRect().height })));
      ok(acts.some(a => a.t === 'Copy') && acts.some(a => a.t === 'Transfer to Factory'), `${label} every answer has Copy and Transfer to Factory`);
      if (w <= 820) ok(acts.every(a => a.h >= 44), `${label} those buttons are 44px targets on a phone`);

      // ── Copy ───────────────────────────────────────────────────────────────────
      await page.click('[data-copy]');
      await sleep(150);
      ok((await page.evaluate(() => window.__copied)) === fin, `${label} Copy puts the whole answer on the clipboard`);

      // ── typed refinement ───────────────────────────────────────────────────────
      await page.type('#msg', 'make it shorter');
      await page.click('#send');
      await sleep(2200);
      ok((await page.$$eval('.msg.user', els => els.length)) === 2, `${label} a typed follow-up is sent`);

      // ── Transfer to Factory ────────────────────────────────────────────────────
      const firstAnswerId = await page.$eval('[data-transfer]', el => +el.getAttribute('data-transfer'));
      await page.click('[data-transfer]');
      await sleep(500);
      const receipt = await page.evaluate(() => { const r = document.querySelector('.msg.transfer'); const a = r && r.querySelector('a'); return r ? { text: r.textContent, href: a && a.getAttribute('href') } : null; });
      ok(receipt && /job #42/.test(receipt.text) && receipt.href === '/speakup/?job=42', `${label} the transfer receipt links to the Factory job`);
      ok(factoryPosts.length === 1 && factoryPosts[0].message_id === firstAnswerId, `${label} the button transfers that answer, by id`);

      // ── offline reply is labelled ──────────────────────────────────────────────
      await page.type('#msg', 'offline please');
      await page.click('#send');
      await sleep(600);
      ok(await page.evaluate(() => { const t = document.querySelectorAll('.msg.assistant .tag.off'); return t.length === 1 && /No model/.test(t[0].textContent); }),
        `${label} a reply written without a model carries a "No model" label`);

      // ── layout: the input is pinned, the thread scrolls, nothing overflows ─────
      const lay = await page.evaluate(() => {
        const f = document.querySelector('footer').getBoundingClientRect(), t = document.getElementById('thread');
        return { footBottom: Math.round(f.bottom), vh: innerHeight, threadScrolls: getComputedStyle(t).overflowY, over: document.documentElement.scrollWidth > innerWidth + 1,
          docScroll: document.documentElement.scrollHeight > innerHeight + 1 };
      });
      ok(Math.abs(lay.footBottom - lay.vh) <= 1, `${label} the input is pinned to the bottom (${lay.footBottom} of ${lay.vh})`);
      ok(lay.threadScrolls === 'auto' && !lay.docScroll, `${label} the conversation scrolls inside the screen, not the page`);
      ok(!lay.over, `${label} no horizontal overflow`);

      // ── contrast: every text node against what is painted behind it ────────────
      const bad = await page.evaluate(() => {
        const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2]].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); };
        const cr = (a, b) => { const L = lum(a), M = lum(b); return (Math.max(L, M) + 0.05) / (Math.min(L, M) + 0.05); };
        const behind = (el) => { const stack = []; let n = el;
          while (n && n !== document.documentElement) { const bg = getComputedStyle(n).backgroundColor; const m = bg.match(/[\d.]+/g); if (m && (m.length < 4 || +m[3] > 0)) stack.push(bg); n = n.parentElement; }
          stack.push(getComputedStyle(document.body).backgroundColor);
          let out = [31, 41, 55];
          for (let i = stack.length - 1; i >= 0; i--) { const m = stack[i].match(/[\d.]+/g).map(Number); const a = m.length > 3 ? m[3] : 1; out = [0, 1, 2].map(k => Math.round(m[k] * a + out[k] * (1 - a))); }
          return 'rgb(' + out.join(',') + ')'; };
        const out = [];
        document.querySelectorAll('*').forEach((el) => {
          const t = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' ');
          if (!t) return; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
          const st = getComputedStyle(el); if (st.visibility === 'hidden' || +st.opacity === 0 || el.disabled || el.closest('[disabled]')) return;
          const size = parseFloat(st.fontSize), need = (size >= 24 || (size >= 18.66 && +st.fontWeight >= 700)) ? 3 : 4.5;
          const ratio = cr(st.color, behind(el));
          if (ratio < need) out.push(ratio.toFixed(2) + ':1 "' + t.slice(0, 30) + '"');
        });
        return out;
      });
      ok(bad.length === 0, `${label} no text fails contrast (${bad.join('; ') || 'none'})`);

      // ── Clear: two taps, then the conversation is gone ──────────────────────────
      ok(!(await page.$eval('#clearBtn', b => b.hidden)), `${label} Clear appears once there is a conversation`);
      const clearBox = await page.$eval('#clearBtn', b => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height }; });
      if (w <= 820) ok(clearBox.h >= 44 && clearBox.w >= 44, `${label} Clear is a 44px touch target (${Math.round(clearBox.w)}x${Math.round(clearBox.h)})`);
      const before = deletes;
      await page.click('#clearBtn');
      await sleep(150);
      ok(deletes === before && /again/i.test(await page.$eval('#clearBtn', b => b.textContent)), `${label} one tap only arms it — nothing is deleted yet`);
      await sleep(4300);
      ok(/^Clear$/.test(await page.$eval('#clearBtn', b => b.textContent)) && deletes === before, `${label} left alone, it disarms itself`);
      await page.click('#clearBtn'); await sleep(150); await page.click('#clearBtn'); await sleep(500);
      const afterClear = await page.evaluate(() => ({ n: document.querySelectorAll('.msg').length, hidden: getComputedStyle(document.getElementById('clearBtn')).display === 'none', note: document.getElementById('thread').textContent }));
      ok(deletes === before + 1 && afterClear.n === 0 && afterClear.hidden, `${label} a second tap clears it on the server and empties the screen`);
      await page.reload({ waitUntil: 'networkidle0' }); await sleep(400);
      ok((await page.evaluate(() => document.querySelectorAll('.msg').length)) === 0, `${label} and it stays cleared after a reload`);
      // Put a message back for the language check below.
      await page.type('#msg', 'hello again'); await page.click('#send'); await sleep(2200);

      // ── language: the screen relabels, what was said does not change ───────────
      const said = await page.$$eval('.msg .body', els => els.map(e => e.textContent));
      await page.evaluate(() => document.getElementById('langBtn').click());
      await sleep(300);
      const es = await page.evaluate(() => ({ chips: [...document.querySelectorAll('.chip')].map(c => c.textContent), copy: document.querySelector('[data-copy]').textContent, nav: document.getElementById('navHistory').textContent }));
      ok(es.chips.includes('Resumen') && es.copy === 'Copiar' && es.nav === 'Historial', `${label} Spanish relabels the chips, the buttons and the menu`);
      ok(JSON.stringify(await page.$$eval('.msg .body', els => els.map(e => e.textContent))) === JSON.stringify(said), `${label} and leaves every message exactly as it was written`);
      await page.close();
    }

    // ── History ────────────────────────────────────────────────────────────────
    const hp = await browser.newPage();
    await hp.setViewport({ width: 390, height: 844 });
    await hp.goto(base + 'history', { waitUntil: 'networkidle0' });
    const links = await hp.$$eval('.meet', els => els.map(e => e.getAttribute('href')));
    ok(links.length === 2 && links[0] === '/speakup/meetings?id=5', 'History lists meetings, each opening it on the meetings screen');
    await hp.type('#q', 'weekly');
    await sleep(600);
    ok(lastQ === 'weekly', 'History search asks the server');
    await hp.click('.meet');
    await hp.waitForSelector('#mTitle');
    await sleep(500);
    ok((await hp.$eval('#mTitle', el => el.textContent)) === 'Weekly review', 'choosing a meeting in History opens it as the active meeting');
    await hp.close();
  } catch (e) {
    fail++; console.log('ERROR ' + e.stack);
  }
  await browser.close();
  server.close();
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
});
