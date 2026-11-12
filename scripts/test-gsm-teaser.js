// Global System Monitor teaser: page + simulator in Chrome at 1440 and 390. Zero keys; TTS and booking stubbed.
const path = require('path'), http = require('http'), fs = require('fs');
let puppeteer; try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP: puppeteer not installed — browser checks NOT run'); process.exit(0); }
const PUB = path.join(__dirname, '..', 'public');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/api/tts/edge') { res.writeHead(500); return res.end(); }
  if (u.startsWith('/api/synthex-lina/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true,"days":[]}'); }
  let f = path.join(PUB, u.endsWith('/') ? u + 'index.html' : u);
  if (!f.startsWith(PUB) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const ext = path.extname(f); res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[ext] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => srv.listen(0, r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/global-system-monitor/';
  const html = fs.readFileSync(path.join(PUB, 'global-system-monitor/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(PUB, 'global-system-monitor/app.js'), 'utf8');
  ok(!/\$\s?\d|USD|US\$|precio|costo de|cotizaci/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), 'no price on the page');
  ok(!/US\$|USD|\$\s?\d/.test(js), 'no price in narration/app');
  ok(/data-brand="synthex"/.test(html) && /#00F2FE/.test(fs.readFileSync(path.join(PUB, 'global-system-monitor/style.css'), 'utf8')), 'synthex theme + booking');
  ok(/voice: 'dalia'/.test(js), 'Dalia voice');
  ok(!/[\u{1F300}-\u{1FAFF}]/u.test(html + js), 'no emojis');

  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const p = await br.newPage(); await p.setViewport({ width: w, height: h });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(base, { waitUntil: 'networkidle0' });
    await p.click('#introSkip');
    const n = await p.$$eval('.slide', s => s.length);
    ok(n === 12, w + ': 12 slides');
    for (let i = 0; i < n; i++) {
      const r = await p.evaluate(() => ({ ov: document.documentElement.scrollWidth - window.innerWidth, on: document.querySelectorAll('.slide.on').length }));
      ok(r.ov <= 1, w + ': slide ' + (i + 1) + ' no sideways scroll (' + r.ov + ')');
      ok(r.on === 1, w + ': one slide visible');
      if (w > 820) {
        const cl = await p.evaluate(() => { const s = document.querySelector('.slide.on'); const kids = [...s.querySelectorAll('h1,h2,.lead,.win,.card,.pipe,.list,.grid2,.grid3,.grid4')]; const r = s.getBoundingClientRect(); return kids.every(k => { const b = k.getBoundingClientRect(); return b.bottom <= r.bottom + 1; }); });
        ok(cl, w + ': slide ' + (i + 1) + ' content fits');
      }
      if (i < n - 1) await p.click('#next');
    }
    await p.screenshot({ path: '/private/tmp/claude-501/gsm-' + w + '-last.png' });
    const small = await p.evaluate(() => [...document.querySelectorAll('.dock button')].filter(b => b.offsetParent && (b.getBoundingClientRect().height < 44)).length);
    ok(small === 0, w + ': dock buttons >= 44px');
    // simulator
    await p.click('#toSim');
    ok(await p.$eval('#sim', e => !e.hidden), w + ': simulator opens');
    await p.click('[data-tab="evid"]'); await p.click('#doIngest');
    const cl = await p.$eval('#simBody', e => e.textContent);
    ok(/5 documentos/.test(cl) && /2 orígenes independientes/.test(cl) && /3 copias no cuentan/.test(cl), w + ': dedupe counts origins, not copies');
    await p.click('[data-tab="review"]');
    const before = await p.$$eval('#simBody .rev', r => r.length);
    ok(before === 4, w + ': 4 proposals pending');
    // approve without justification must fail
    await p.click('[data-approve="P-104"]');
    ok(/justificación/.test(await p.$eval('#simBody [data-prop="P-104"] [data-msg]', e => e.textContent)), w + ': approval needs justification');
    ok(await p.$$eval('#simBody .rev', r => r.length) === 4, w + ': nothing approved without justification');
    ok(/Confianza sugerida A/.test(await p.$eval('#simBody [data-prop="P-104"]', e => e.textContent)), w + ': official primary → A');
    // high impact needs confirmation
    await p.type('#simBody [data-prop="P-102"] [data-f="just"]', 'Boletín oficial con unidad y periodo conservados.');
    await p.click('[data-approve="P-102"]');
    ok(/alto impacto/.test(await p.$eval('#simBody [data-prop="P-102"] [data-msg]', e => e.textContent)), w + ': high impact needs confirmation');
    await p.type('#simBody [data-prop="P-104"] [data-f="just"]', 'Comunicado oficial y despacho independiente coinciden.');
    await p.click('[data-approve="P-104"]');
    ok(await p.$$eval('#simBody .rev', r => r.length) === 3, w + ': approved with justification');
    // injection does not change H2
    await p.click('[data-tab="hyp"]'); await p.click('[data-hyp="H2"]');
    ok(/EN EVALUACIÓN/.test(await p.$eval('#simBody .hyphead', e => e.textContent)), w + ': injected instruction did not change H2');
    await p.click('[data-tab="audit"]');
    ok(/Aprobó observación/.test(await p.$eval('#simBody', e => e.textContent)) && /Analista \(tú\)/.test(await p.$eval('#simBody', e => e.textContent)), w + ': audit records who approved');
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(ov <= 1, w + ': simulator no sideways scroll (' + ov + ')');
    await p.click('[data-tab="panel"]');
    await p.screenshot({ path: '/private/tmp/claude-501/gsm-' + w + '-sim.png', fullPage: false });
    ok(errs.length === 0, w + ': no page errors ' + errs.join(' | '));
    await p.close();
  }
  await br.close(); srv.close();
  console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
