'use strict';
// node scripts/test-neohaul-host.js [https://neohaul.digit2ai.com] — sin argumento prueba el handler en proceso.
const http = require('http');
const express = require('express');
const fs = require('fs');
let pass = 0, fail = 0; const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + n); };
(async () => {
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const a = src.indexOf('const NEOHAUL_HOSTS'), b = src.indexOf('return neohaul404(res);\n});', a) + 'return neohaul404(res);\n});'.length;
  const app = express();
  new Function('app', src.slice(a, b))(app);
  app.use((req, res) => res.status(299).send('next:' + req.url));
  const srv = app.listen(0); const port = srv.address().port;
  const get = (p, host) => new Promise((r) => http.get({ port, path: p, headers: { host } }, (x) => { let d = ''; x.on('data', (c) => d += c); x.on('end', () => r({ s: x.statusCode, l: x.headers.location, d })); }));
  const H = 'neohaul.digit2ai.com';
  let r = await get('/', H); ok('raíz redirige a /neohaul/', r.s === 302 && r.l === '/neohaul/');
  r = await get('/neohaul/api/v1/salud', H); ok('/neohaul/* pasa a la app', r.s === 299);
  r = await get('/embed/voice-orb.js', H); ok('el orbe pasa', r.s === 299);
  r = await get('/api/tts/edge', H); ok('la voz pasa', r.s === 299);
  r = await get('/login', H); ok('una ruta ajena es el 404 de NeoHaul, no el CRM', r.s === 404 && r.d.includes('NeoHaul'));
  r = await get('/admin', H); ok('/admin tampoco cae al CRM', r.s === 404);
  r = await get('//evil.example/x', H); ok('sin redirección abierta', r.s === 404 || (r.l || '').startsWith('/neohaul'));
  r = await get('/x', 'www.neohaul.digit2ai.com'); ok('www va al dominio sin www', r.s === 301 && r.l === 'https://neohaul.digit2ai.com/x');
  r = await get('/login', 'aiagent.ringlypro.com'); ok('otro host no se toca', r.s === 299);
  r = await get('/robots.txt', H); ok('robots: no indexar', r.d.includes('Disallow: /'));
  srv.close();
  console.log(`\nNeoHaul host: ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
})();
