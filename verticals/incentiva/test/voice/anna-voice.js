/* Anna by voice, end to end against the LIVE site on a phone-sized screen (owner request 2026-09-21).
   The orb sends typed text through the same ask() path as recognised speech, so a scripted caller
   (hesitations, "what did you say?", numbers in words, corrections) exercises the real brain.
   Run: SCRIPT=en.json | en-flexible.json | es.json (LANG2=es) node verticals/incentiva/test/voice/anna-voice.js
   It prints each turn, the page actions and the question on screen. It creates a search, never a lead. */
const puppeteer = require('puppeteer');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const LANG = process.env.LANG2 || 'en';
const SCRIPT = JSON.parse(require('fs').readFileSync(require('path').resolve(__dirname, process.env.SCRIPT || 'en.json'), 'utf8'));
(async () => {
  const b = await puppeteer.launch({ headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  // A phone with no mic permission in headless: the orb speaks and takes the typed transcript, the same ask() path speech uses.
  await p.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator, 'mediaDevices', { get: () => undefined }); } catch (e) {} HTMLMediaElement.prototype.play = function () { setTimeout(() => this.dispatchEvent(new Event('ended')), 50); return Promise.resolve(); }; });
  const turns = [];
  p.on('response', async (r) => { if (r.url().includes('/api/voice-agent/chat')) { try { const j = await r.json(); turns.push(j); } catch (e) {} } });
  await p.goto('https://buyersline.app/' + (LANG === 'es' ? '?lang=es' : ''), { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1500);
  await p.evaluate(() => { const l = document.querySelector('[data-el="launch"]'); l && l.click(); });
  await sleep(2500);
  const state = () => p.evaluate(() => {
    const t = document.querySelector('#blChat'); const cur = t && t.querySelector('.mch-turn');
    return { q: cur ? cur.innerText.replace(/\s+/g, ' ').slice(0, 140) : '', report: /report=/.test(location.href) };
  });
  for (const said of SCRIPT) {
    const n = turns.length;
    await p.evaluate((s) => { const i = document.querySelector('[data-el="input"]'); i.value = s; document.querySelector('[data-el="send"]').click(); }, said);
    const t0 = Date.now(); while (turns.length === n && Date.now() - t0 < 45000) await sleep(300);
    await sleep(1800);
    const last = turns[turns.length - 1] || {};
    const st = await state();
    console.log('\nCALLER: ' + said + '\nANNA  : ' + (last.reply || '(no reply)').replace(/\n+/g, ' ') + '\n  [' + (last.source || '?') + '] actions=' + JSON.stringify((last.actions || []).map(a => a.name + ':' + JSON.stringify(a.input))) + '\n  screen: ' + st.q + (st.report ? '  <REPORT CREATED>' : ''));
  }
  const wish = await p.evaluate(() => { const r = document.querySelector('#blReport'); return r && !r.hidden ? r.innerText.split('Purchasing power')[0].replace(/\s+/g, ' ') : null; });
  console.log('\nREPORT WISH LIST: ' + wish);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
