#!/usr/bin/env node
'use strict';
// planea.vip -> planea.ai: apagado sin la variable; encendido redirige GET/HEAD con 301
// conservando ruta y query, y NUNCA un POST. planea.ai sirve la app.
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
require('dotenv').config();
process.env.PLANEA_VIP_REDIRECT = 'off';
const http = require('http');
const app = require('../src/app');
let pasa = 0, falla = 0;
const ok = (n, c, x = '') => { c ? (pasa++, console.log('  ok   ', n)) : (falla++, console.log('  FALLA', n, x)); };
const srv = http.createServer(app);
srv.listen(0, async () => {
  const port = srv.address().port;
  const pedir = (ruta, host, method = 'GET') => new Promise((r) => {
    const q = http.request({ port, path: ruta, method, headers: { host, 'content-type': 'application/json' } }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => r({ s: res.statusCode, loc: res.headers.location, b }));
    }); q.on('error', (e) => r({ s: 0, b: e.message })); if (method === 'POST') q.write('{}'); q.end();
  });
  let r = await pedir('/login', 'planea.vip');
  ok('con PLANEA_VIP_REDIRECT=off, planea.vip sigue sirviendo la app', r.s === 200, r.s);
  process.env.PLANEA_VIP_REDIRECT = 'https://planea.ai';
  r = await pedir('/planea/portal/inicio?x=1', 'planea.vip');
  ok('con la variable, una página redirige 301 a planea.ai con ruta y query', r.s === 301 && r.loc === 'https://planea.ai/planea/portal/inicio?x=1', r.s + ' ' + r.loc);
  r = await pedir('/', 'www.planea.vip');
  ok('www.planea.vip también redirige', r.s === 301 && r.loc === 'https://planea.ai/', r.loc);
  r = await pedir('/planea/api/v1/auth/login', 'planea.vip', 'POST');
  ok('un POST no se redirige (perdería el cuerpo)', r.s !== 301 && r.s !== 302, r.s);
  process.env.PLANEA_VIP_REDIRECT = 'javascript:alert(1)';
  r = await pedir('/login', 'planea.vip');
  ok('un valor que no es https://dominio no redirige', r.s === 200, r.s);
  delete process.env.PLANEA_VIP_REDIRECT;
  r = await pedir('/score', 'planea.vip');
  ok('sin la variable, el valor por defecto ya es planea.ai', r.s === 301 && r.loc === 'https://planea.ai/score', r.loc);
  r = await pedir('/login', 'planea.ai');
  ok('planea.ai sirve la app (login)', r.s === 200 && /Planea/.test(r.b), r.s);
  console.log(`PLANEA VIP REDIRECT: ${pasa}/${pasa + falla}`);
  srv.close(); process.exit(falla ? 1 : 0);
});
