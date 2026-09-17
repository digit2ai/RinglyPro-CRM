#!/usr/bin/env node
'use strict';
/**
 * Host routing for autodev.digit2ai.com (SpeakUp, the AI Factory).
 *
 * WHAT THIS PROTECTS. Before the handler existed, this host had DNS pointed at
 * Render and no code claiming it, so every request fell through to the CRM:
 * autodev.digit2ai.com/login answered with the RinglyPro CRM sign-in — an
 * unrelated product, with a different user table, on a Digit2AI address. The
 * owner typed their SpeakUp password into it and got "Invalid email or
 * password", which is the jobmd.io/admin lesson happening a second time.
 *
 * So the assertions are: an unclaimed path ends in AutoDev's own 404 and NEVER
 * in the CRM, the root reaches SpeakUp, and the root REDIRECTS rather than
 * rewrites — every asset is an absolute /speakup/... path and the manifest
 * declares scope /speakup/, so serving the app at this host's root would
 * install a PWA whose scope excludes the page that installed it.
 *
 *   node scripts/test-autodev-host.js
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
require('dotenv').config();
const http = require('http');
const app = require('../src/app');

const HOST = 'autodev.digit2ai.com';
let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log('  ok  ', n, extra)) : (fail++, console.log('  FAIL', n, extra)); };

const srv = http.createServer(app);
srv.listen(0, async () => {
  const port = srv.address().port;
  const get = (path, host = HOST) => new Promise((r) => {
    http.get({ port, path, headers: { host } }, (res) => {
      let b = ''; res.on('data', (c) => (b += c));
      res.on('end', () => r({ s: res.statusCode, loc: res.headers.location, b }));
    }).on('error', (e) => r({ s: 0, b: e.message }));
  });

  console.log('\n== autodev.digit2ai.com ==');

  const root = await get('/');
  ok('the root redirects into SpeakUp', root.s === 302 && root.loc === '/speakup/', `-> ${root.s} ${root.loc || ''}`);
  ok('the root does NOT rewrite (a rewrite would break the PWA scope)', root.s !== 200);

  const deep = await get('/?job=460');
  ok('a deep link carries its query through', deep.loc === '/speakup/?job=460', `-> ${deep.loc || ''}`);

  // The app is login-only, so the honest expectation is a redirect to its OWN
  // login, never the CRM's.
  const app_ = await get('/speakup/');
  ok('/speakup/ reaches the vertical', app_.s === 302 || app_.s === 200, `-> ${app_.s}`);
  ok('and it points at SpeakUp\'s login, not the CRM\'s',
     app_.s !== 302 || String(app_.loc).startsWith('/speakup/'), `-> ${app_.loc || 'n/a'}`);

  const login = await get('/speakup/login');
  ok('/speakup/login serves SpeakUp', login.s === 200 && !/RinglyPro/i.test(login.b), `-> ${login.s}`);

  const health = await get('/health');
  ok('/health answers SpeakUp\'s, not the CRM\'s', health.s === 200 && !/"service":"ringlypro/i.test(health.b), `-> ${health.s}`);

  // THE ONE THAT MATTERS. This exact path is what served the CRM login.
  const crmLogin = await get('/login');
  ok('/login is AutoDev\'s 404, NOT the CRM sign-in',
     crmLogin.s === 404 && !/RinglyPro/i.test(crmLogin.b) && /AutoDev/.test(crmLogin.b), `-> ${crmLogin.s}`);

  for (const stray of ['/admin', '/dashboard', '/api/auth/login', '/aiastore/', '/lawncopilot/']) {
    const r = await get(stray);
    ok(`${stray} ends in AutoDev's 404, not the CRM`, r.s === 404 && /AutoDev/.test(r.b), `-> ${r.s}`);
  }

  const robots = await get('/robots.txt');
  ok('the whole host is out of every index', robots.s === 200 && /Disallow: \/\s*$/.test(robots.b.trim()));

  const fav = await get('/favicon.ico');
  ok('a root favicon request gets the app\'s mark', fav.s === 302 && fav.loc === '/speakup/favicon.svg', `-> ${fav.loc || fav.s}`);

  const www = await get('/speakup/', 'www.autodev.digit2ai.com');
  ok('www 301s to the apex', www.s === 301 && www.loc === 'https://autodev.digit2ai.com/speakup/', `-> ${www.loc || www.s}`);

  // The handler must not leak onto any other host.
  const crm = await get('/login', 'aiagent.ringlypro.com');
  ok('the CRM host is untouched', crm.s !== 404 || !/AutoDev/.test(crm.b), `-> ${crm.s}`);

  srv.close();
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
});
