#!/usr/bin/env node
/* grupolabora.com checks, zero keys. Pass a base URL to also probe the live domain:
 *   node scripts/test-grupolabora.js [https://grupolabora.com] */
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); };
const P = (f) => fs.readFileSync(path.join(__dirname, '../public/grupolabora', f), 'utf8');
for (const f of ['index.html', 'pymes/index.html', 'pymes/calculadora/index.html']) {
  const h = P(f);
  ok(!/D2S|d2s|Synthex|synthexsai/.test(h), f + ': no D2S/Synthex name left');
  ok(!/#00F2FE|#6366F1/i.test(h), f + ': no Synthex cyan/indigo left');
}
const idx = P('index.html'), deck = P('pymes/index.html');
ok(/data-theme="light"/.test(idx), 'landing defaults to the light theme of the PDF');
ok(/#02427F/i.test(idx) && /#159F79/i.test(idx), 'landing uses Labora blue and green');
ok(/src="logo\.png"/.test(idx) && /src="\.\.\/logo\.png"/.test(deck), 'Labora logo in nav and deck');
ok(/data-agent="labora"/.test(idx), 'Lina runs the labora persona');
ok(/brand: 'labora'/.test(idx) && /data-brand="labora"/.test(deck), 'bookings carry brand labora');
ok(/brand=labora/.test(idx), 'embedded brain relabelled for Labora');
for (const f of ['icon-512.png', 'apple-touch-icon.png', 'logo.png', 'og.jpg', 'pymes/og.jpg']) ok(fs.existsSync(path.join(__dirname, '../public/grupolabora', f)), f + ' exists');
const va = require('../src/config/voice-agents.js'); const a = va.getAgent('labora');
ok(a.id === 'labora' && !/D2S|Synthex/.test(JSON.stringify(a)), 'labora persona exists and is rebranded');
ok((a.tools.definiciones || []).filter((d) => /brand=labora/.test(d.ruta)).length === 2, 'Lina books with brand=labora');
const lina = fs.readFileSync(path.join(__dirname, '../src/routes/synthex-lina.js'), 'utf8');
ok(/b === 'labora'\) \? b/.test(lina) && /labora: 'labora_lina:'/.test(lina), 'booking route accepts labora');
const app = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
ok(app.indexOf("LABORA_HOSTS") > 0 && app.indexOf("LABORA_HOSTS") < app.indexOf("LEVELUP MEDIA MARKETING DOMAIN"), 'host handler registered with the brand domains');
(async () => {
  const base = process.argv[2];
  if (base) {
    const r = (u, o) => fetch(base + u, { redirect: 'manual', ...o });
    let x = await r('/'); const t = await x.text();
    ok(x.status === 200 && /<title>Labora/.test(t), 'live: root is the Labora landing');
    x = await r('/pymes/'); ok(x.status === 200 && /Labora/.test(await x.text()), 'live: deck');
    x = await r('/admin'); const a2 = await x.text(); ok(x.status === 404 && !/RinglyPro/.test(a2), 'live: unknown path is a Labora 404, never the CRM');
    x = await r('/icon-512.png'); ok(x.status === 200, 'live: icon');
    x = await r('/api/synthex-lina/public/slots?brand=labora'); ok(x.status === 200, 'live: booking slots pass through');
    x = await fetch(base.replace('://', '://www.') + '/', { redirect: 'manual' }); ok(x.status === 301, 'live: www 301s to apex');
  } else console.log('(live checks skipped: pass https://grupolabora.com to run them)');
  console.log(`${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
})();
