// GSM proposal: Stripe amounts fixed server-side, 30/70 split, subscription for hypercare, page renders. Zero keys.
const path = require('path'), fs = require('fs'), http = require('http'), express = require('express');
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_for_sit';
const route = require('../src/routes/gsm-proposal');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const calls = [];
route._setStripe({ checkout: { sessions: { create: async (o) => { calls.push(o); return { url: 'https://checkout.stripe.test/x' }; } } } });

(async () => {
  const P = route._PRICES;
  ok(P.deposit_cents === Math.round(P.development_cents * 0.3), 'deposit is 30%');
  ok(P.deposit_cents + P.balance_cents === P.development_cents, 'split adds up');
  ok(P.development_cents === 124 * 11900, 'development = 124 h x USD 119');
  const app = express(); app.use('/api/gsm-proposal', route);
  const srv = app.listen(0); const port = srv.address().port;
  const post = (body, host) => new Promise(r => { const d = JSON.stringify(body); const q = http.request({ port, path: '/api/gsm-proposal/checkout', method: 'POST', headers: { 'content-type': 'application/json', host: host || 'synthexsai.com' } }, s => { let b = ''; s.on('data', c => b += c); s.on('end', () => r({ code: s.statusCode, body: JSON.parse(b) })); }); q.end(d); });
  let r = await post({ item: 'deposit', amount: 1 });
  ok(r.code === 200 && r.body.url, 'deposit checkout opens');
  ok(calls[0].mode === 'payment' && calls[0].line_items[0].price_data.unit_amount === 442680, 'deposit amount from server, not body');
  r = await post({ item: 'balance' }); ok(calls[1].line_items[0].price_data.unit_amount === 1032920 && calls[1].mode === 'payment', 'balance 70%');
  r = await post({ item: 'hypercare' });
  ok(calls[2].mode === 'subscription' && calls[2].line_items[0].price_data.recurring.interval === 'month' && calls[2].line_items[0].price_data.unit_amount === 119000, 'hypercare monthly subscription');
  r = await post({ item: '__proto__' }); ok(r.code === 400, 'prototype key refused');
  r = await post({ item: 'free' }); ok(r.code === 400, 'unknown item refused');
  await post({ item: 'deposit' }, 'evil.example');
  ok(calls[calls.length - 1].success_url.startsWith('https://synthexsai.com/global-system-monitor/propuesta/'), 'return host never echoed');
  srv.close();
  const html = fs.readFileSync(path.join(__dirname, '../public/global-system-monitor/propuesta/index.html'), 'utf8');
  ok(/Synthex SAI/.test(html) && /124 h/.test(html) && /4,426\.80/.test(html) && /10,329\.20/.test(html) && /1,190/.test(html), 'figures on page match server');
  ok(!/[\u{1F300}-\u{1FAFF}]/u.test(html), 'no emojis');
  const app2 = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  ok(/'\/api\/gsm-proposal\/checkout'/.test(app2) && /propuesta\/index\.html/.test(app2), 'served on synthexsai.com');
  let pup; try { pup = require('puppeteer'); } catch (e) { console.log('SKIP browser checks (no puppeteer)'); }
  if (pup) {
    const st = http.createServer((q, s) => { const u = q.url.split('?')[0]; if (u.startsWith('/api/')) { s.writeHead(200, { 'content-type': 'application/json' }); return s.end('{"ok":true,"payments_enabled":true}'); } const f = path.join(__dirname, '../public', u.endsWith('/') ? u + 'index.html' : u); if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': f.endsWith('.png') ? 'image/png' : 'text/html' }); fs.createReadStream(f).pipe(s); }).listen(0);
    const br = await pup.launch({ headless: 'new', args: ['--no-sandbox'] });
    for (const w of [1440, 390]) {
      const p = await br.newPage(); await p.setViewport({ width: w, height: 900 }); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto('http://127.0.0.1:' + st.address().port + '/global-system-monitor/propuesta/', { waitUntil: 'networkidle0' });
      ok(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, w + ': no sideways scroll');
      ok(await p.$$eval('[data-pay]', b => b.length === 3 && b.every(x => !x.disabled && x.getBoundingClientRect().height >= 44)), w + ': 3 pay buttons, 44px');
      ok(errs.length === 0, w + ': no errors');
      await p.screenshot({ path: '/private/tmp/claude-501/prop-' + w + '.png', fullPage: true }); await p.close();
    }
    await br.close(); st.close();
  }
  console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
