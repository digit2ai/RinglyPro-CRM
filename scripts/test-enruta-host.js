#!/usr/bin/env node
'use strict';
/**
 * Enrutamiento por host de enruta.digit2ai.com.
 *
 * Lo que protege: que una ruta que ENRUTA no reclama termine en su propio 404
 * y NO en el CRM. Dejar caer el resto sirve el CRM entero en el dominio de la
 * marca — es como jobmd.io/admin acabó devolviendo el login de otro producto.
 *
 *   node scripts/test-enruta-host.js
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
require('dotenv').config();
const http = require('http');
const app = require('../src/app');

const HOST = 'enruta.digit2ai.com';
let pasa = 0, falla = 0;
const ok = (n, c, extra = '') => { c ? (pasa++, console.log('  ok   ', n, extra)) : (falla++, console.log('  FALLA', n, extra)); };

const srv = http.createServer(app);
srv.listen(0, async () => {
  const port = srv.address().port;
  const pedir = (ruta, host = HOST) => new Promise((r) => {
    http.get({ port, path: ruta, headers: { host } }, (res) => {
      let b = ''; res.on('data', (c) => (b += c));
      res.on('end', () => r({ s: res.statusCode, loc: res.headers.location, b }));
    }).on('error', (e) => r({ s: 0, b: e.message }));
  });

  console.log('\n== enruta.digit2ai.com ==');
  const raiz = await pedir('/');
  ok('la raíz sirve el tablero de ENRUTA', raiz.s === 200 && /ENRUTA/.test(raiz.b), `-> ${raiz.s}`);
  ok('la raíz monta el orbe de voz', /data-voice-orb/.test(raiz.b) && /data-agent="enruta"/.test(raiz.b));

  const salud = await pedir('/health');
  ok('/health responde el de ENRUTA', salud.s === 200 && /Vehicle Document Management/.test(salud.b), `-> ${salud.s}`);

  // Se juzga el ENRUTAMIENTO, no la base: en local DATABASE_URL puede no tener
  // las tablas enruta_*, y entonces el router responde su propio error. Lo que
  // importa es que conteste ENRUTA y no el 404 del CRM.
  const api = await pedir('/enruta/api/dashboard/stats');
  ok('la API absoluta del tablero llega al router de ENRUTA',
     /"success"/.test(api.b) && !/Endpoint not found/.test(api.b),
     `-> ${api.s}${api.s !== 200 ? ' (sin tablas enruta_* en esta base, el enrutamiento sí llegó)' : ''}`);

  // El orbe deduce su origen del src de su propio script: si estas tres no
  // pasan derecho, la voz se queda muda en este dominio.
  ok('el script del orbe pasa derecho', (await pedir('/embed/voice-orb.js')).s === 200);
  const cfg = await pedir('/api/voice-agent/config?agent=enruta&lang=es');
  ok('el cerebro del orbe pasa derecho', cfg.s === 200 && /"voice":"dalia"/.test(cfg.b), `-> ${cfg.s}`);

  console.log('\n-- lo ajeno no puede filtrarse --');
  for (const ruta of ['/admin', '/dashboard', '/login', '/lawncopilot', '/api/auth/login', '/voice/laura/contexto']) {
    const r = await pedir(ruta);
    ok(`${ruta} -> 404 de ENRUTA`, r.s === 404 && /enRuta/.test(r.b), `-> ${r.s}`);
  }

  const robots = await pedir('/robots.txt');
  ok('robots.txt prohíbe indexar el dominio', robots.s === 200 && /Disallow: \//.test(robots.b));

  const www = await pedir('/', 'www.enruta.digit2ai.com');
  ok('www redirige al apex', www.s === 301 && www.loc === 'https://enruta.digit2ai.com/', `-> ${www.s}`);

  console.log('\n-- el host compartido no cambia --');
  const crm = await pedir('/enruta/health', 'aiagent.ringlypro.com');
  ok('aiagent.ringlypro.com/enruta/health sigue igual', crm.s === 200 && /Vehicle Document/.test(crm.b), `-> ${crm.s}`);
  const crmRaiz = await pedir('/health', 'aiagent.ringlypro.com');
  ok('aiagent.ringlypro.com/health NO lo secuestra ENRUTA', crmRaiz.s === 200 && !/Vehicle Document/.test(crmRaiz.b), `-> ${crmRaiz.s}`);

  srv.close();
  console.log(`\n=== ${pasa} ok, ${falla} fallas ===`);
  process.exit(falla ? 1 : 0);
});
